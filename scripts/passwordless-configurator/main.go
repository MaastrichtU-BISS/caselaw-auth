package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	browserFlow = "caselaw-browser-passwordless-email-first"
	formsFlow   = "Case Law email-first forms"
	methodsFlow = "Case Law email-first methods"
	otpAlias    = "caselaw-email-first-otp"
	magicAlias  = "caselaw-email-first-magic-link"
)

var otpConfig = map[string]string{
	"ext-magic-create-nonexistent-user": "false",
}

var magicLinkConfig = map[string]string{
	"ext-magic-create-nonexistent-user": "false",
	"ext-magic-update-profile-action":   "false",
	"ext-magic-update-password-action":  "false",
	"ext-magic-allow-token-reuse":       "false",
	"ext-magic-token-life-span":         "600",
}

var pendingMarkerAttribute = map[string]any{
	"name":        "caselaw.pending-email-otp",
	"displayName": "Pending email OTP provenance",
	"permissions": map[string]any{
		"view": []string{"admin"},
		"edit": []string{"admin"},
	},
	"multivalued": false,
}

var citationsAPIClient = map[string]any{
	"clientId":                  "citations-api",
	"name":                      "Citations API documentation",
	"description":               "Public browser client for the Citations API documentation and account UI.",
	"enabled":                   true,
	"protocol":                  "openid-connect",
	"publicClient":              true,
	"standardFlowEnabled":       true,
	"directAccessGrantsEnabled": false,
	"serviceAccountsEnabled":    false,
	"redirectUris": []string{
		"http://localhost:3000/auth/callback",
		"https://demo-api.caselawexplorer.tech/auth/callback",
		"https://api.caselawexplorer.tech/auth/callback",
	},
	"webOrigins": []string{
		"http://localhost:3000",
		"https://demo-api.caselawexplorer.tech",
		"https://api.caselawexplorer.tech",
	},
	"attributes": map[string]string{
		"post.logout.redirect.uris":  "+",
		"pkce.code.challenge.method": "S256",
	},
}

type installer struct {
	baseURL         string
	realm           string
	adminRealm      string
	adminUser       string
	adminPassword   string
	token           string
	adminPath       string
	client          *http.Client
	createdFlowID   string
	createdClientID string
	originalProfile map[string]any
	estateMode      bool
}

type expectedExecution struct {
	providerID         string
	displayName        string
	requirement        string
	authenticationFlow bool
}

func main() {
	i, err := newInstaller()
	if err != nil {
		fatal(err)
	}

	if err := i.waitForAdminToken(); err != nil {
		fatal(err)
	}

	if err := i.run(); err != nil {
		i.rollback()
		fatal(err)
	}

	fmt.Printf("Bound %s to %s on %s.\n", browserFlow, i.realm, i.baseURL)
	fmt.Printf("The realm now creates and authenticates users through verified email OTP or magic links in %s.\n", i.realm)
}

func newInstaller() (*installer, error) {
	baseURL := strings.TrimRight(envOr("KEYCLOAK_URL", "http://127.0.0.1:8080"), "/")
	realm := envOr("KEYCLOAK_REALM", "caselaw")
	adminRealm := envOr("KEYCLOAK_ADMIN_REALM", "master")
	adminUser := firstEnv("KEYCLOAK_ADMIN", "KC_BOOTSTRAP_ADMIN_USERNAME")
	adminPassword := firstEnv("KEYCLOAK_ADMIN_PASSWORD", "KC_BOOTSTRAP_ADMIN_PASSWORD")
	if adminUser == "" || adminPassword == "" {
		return nil, errors.New("set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD")
	}

	return &installer{
		baseURL:       baseURL,
		realm:         realm,
		adminRealm:    adminRealm,
		adminUser:     adminUser,
		adminPassword: adminPassword,
		estateMode:    envBool("CASELAW_PASSWORDLESS_ESTATE_MODE", realm == "caselaw"),
		adminPath:     "/admin/realms/" + url.PathEscape(realm),
		client:        &http.Client{Timeout: 30 * time.Second},
	}, nil
}

func (i *installer) waitForAdminToken() error {
	timeoutSeconds := envInt("CASELAW_PASSWORDLESS_APPLY_TIMEOUT_SECONDS", 180)
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	endpoint := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", i.baseURL, url.PathEscape(i.adminRealm))
	values := url.Values{
		"grant_type": {"password"},
		"client_id":  {"admin-cli"},
		"username":   {i.adminUser},
		"password":   {i.adminPassword},
	}

	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(values.Encode()))
		if err != nil {
			return err
		}
		req.Header.Set("content-type", "application/x-www-form-urlencoded")
		response, err := i.client.Do(req)
		if err == nil {
			raw, readErr := io.ReadAll(io.LimitReader(response.Body, 1<<20))
			response.Body.Close()
			if readErr != nil {
				return readErr
			}
			if response.StatusCode == http.StatusOK {
				var payload struct {
					AccessToken string `json:"access_token"`
				}
				if err := json.Unmarshal(raw, &payload); err != nil {
					return fmt.Errorf("decode admin token: %w", err)
				}
				if payload.AccessToken == "" {
					return errors.New("Keycloak returned an empty admin token")
				}
				i.token = payload.AccessToken
				return nil
			}
			if response.StatusCode < 500 && response.StatusCode != http.StatusNotFound {
				return fmt.Errorf("could not get an admin token from %s (%d): %s", i.baseURL, response.StatusCode, strings.TrimSpace(string(raw)))
			}
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("Keycloak was not ready for realm configuration within %d seconds", timeoutSeconds)
		case <-time.After(2 * time.Second):
		}
	}
}

func (i *installer) run() error {
	if err := i.requireProvider("caselaw-email-identity"); err != nil {
		return err
	}
	if err := i.requireProvider("ext-email-otp"); err != nil {
		return err
	}
	if err := i.requireProvider("ext-magic-form"); err != nil {
		return err
	}

	flows, err := i.flows()
	if err != nil {
		return err
	}
	existing := findByString(flows, "alias", browserFlow)
	if existing != nil {
		if err := i.validateExistingFlow(); err != nil {
			return err
		}
		fmt.Printf("Validated existing %s flow.\n", browserFlow)
	} else {
		if err := i.createFlow(); err != nil {
			return err
		}
	}

	if i.estateMode {
		if err := i.ensureCitationsAPIClient(); err != nil {
			return err
		}
		if err := i.validateEstateClients(); err != nil {
			return err
		}
	} else {
		fmt.Printf("Skipped Case Law estate client reconciliation for realm %s.\n", i.realm)
	}
	if err := i.ensureNamesOptional(); err != nil {
		return err
	}

	if err := i.api(http.MethodPut, i.adminPath, map[string]any{
		"browserFlow":             browserFlow,
		"accessCodeLifespanLogin": 600,
		"registrationAllowed":     false,
	}, nil); err != nil {
		return err
	}

	var realm map[string]any
	if err := i.api(http.MethodGet, i.adminPath, nil, &realm); err != nil {
		return err
	}
	if stringField(realm, "browserFlow") != browserFlow {
		return fmt.Errorf("browser flow binding is %q, expected %q", stringField(realm, "browserFlow"), browserFlow)
	}
	if intField(realm, "accessCodeLifespanLogin") != 600 {
		return fmt.Errorf("login-action timeout is %d; expected 600 seconds", intField(realm, "accessCodeLifespanLogin"))
	}
	if boolField(realm, "registrationAllowed") {
		return errors.New("the separate password registration form is still enabled")
	}
	return nil
}

func (i *installer) createFlow() error {
	if err := i.api(http.MethodPost, i.adminPath+"/authentication/flows", map[string]any{
		"alias":       browserFlow,
		"description": "Browser SSO with email OTP and single-use magic-link sign-in.",
		"providerId":  "basic-flow",
		"topLevel":    true,
		"builtIn":     false,
	}, nil); err != nil {
		return err
	}

	flows, err := i.flows()
	if err != nil {
		return err
	}
	created := findByString(flows, "alias", browserFlow)
	if created == nil || stringField(created, "id") == "" {
		return fmt.Errorf("Keycloak created %s without returning it", browserFlow)
	}
	i.createdFlowID = stringField(created, "id")

	if _, err := i.addExecution(browserFlow, "auth-cookie", "ALTERNATIVE"); err != nil {
		return err
	}
	if _, err := i.addExecution(browserFlow, "identity-provider-redirector", "ALTERNATIVE"); err != nil {
		return err
	}
	if err := i.addSubflow(browserFlow, formsFlow, "ALTERNATIVE", "Collect an email address, then let the user authenticate with a code or a link."); err != nil {
		return err
	}
	if _, err := i.addExecution(formsFlow, "caselaw-email-identity", "REQUIRED"); err != nil {
		return err
	}
	if err := i.addSubflow(formsFlow, methodsFlow, "REQUIRED", "Alternative passwordless methods available after the user supplies an email address."); err != nil {
		return err
	}

	otp, err := i.addExecution(methodsFlow, "ext-email-otp", "ALTERNATIVE")
	if err != nil {
		return err
	}
	if err := i.addExecutionConfig(stringField(otp, "id"), otpAlias, otpConfig); err != nil {
		return err
	}
	magic, err := i.addExecution(methodsFlow, "ext-magic-form", "ALTERNATIVE")
	if err != nil {
		return err
	}
	if err := i.addExecutionConfig(stringField(magic, "id"), magicAlias, magicLinkConfig); err != nil {
		return err
	}

	if err := i.validateExistingFlow(); err != nil {
		return err
	}
	fmt.Printf("Created and validated %s.\n", browserFlow)
	return nil
}

func (i *installer) requireProvider(providerID string) error {
	var description map[string]any
	path := i.adminPath + "/authentication/config-description/" + url.PathEscape(providerID)
	if err := i.api(http.MethodGet, path, nil, &description); err != nil {
		return fmt.Errorf("%s is not installed; deploy the provider image before applying the flow: %w", providerID, err)
	}
	if stringField(description, "providerId") != providerID {
		return fmt.Errorf("%s is not installed; deploy the provider image before applying the flow", providerID)
	}
	return nil
}

func (i *installer) ensureNamesOptional() error {
	path := i.adminPath + "/users/profile"
	var profile map[string]any
	if err := i.api(http.MethodGet, path, nil, &profile); err != nil {
		return err
	}
	attributes, ok := profile["attributes"].([]any)
	if !ok {
		return errors.New("the realm user profile has no attributes array; refusing to overwrite it")
	}

	names := map[string]map[string]any{}
	var marker map[string]any
	for _, value := range attributes {
		attribute, ok := value.(map[string]any)
		if !ok {
			return errors.New("the realm user profile contains a malformed attribute; refusing to overwrite it")
		}
		name := stringField(attribute, "name")
		if name == "caselaw.pending-email-otp" {
			if marker != nil {
				return errors.New("the realm user profile contains more than one caselaw.pending-email-otp attribute; refusing to overwrite drift")
			}
			marker = attribute
			continue
		}
		if name != "firstName" && name != "lastName" {
			continue
		}
		if names[name] != nil {
			return fmt.Errorf("the realm user profile contains more than one %s attribute; refusing to overwrite drift", name)
		}
		names[name] = attribute
	}
	if marker != nil {
		permissions, ok := marker["permissions"].(map[string]any)
		if !ok || !sameStringSlice(stringSlice(permissions["view"]), []string{"admin"}) ||
			!sameStringSlice(stringSlice(permissions["edit"]), []string{"admin"}) {
			return errors.New("caselaw.pending-email-otp has custom permissions; refusing to overwrite drift")
		}
	}
	for _, name := range []string{"firstName", "lastName"} {
		attribute := names[name]
		if attribute == nil {
			return fmt.Errorf("the realm user profile has no %s attribute; refusing to overwrite drift", name)
		}
		if !hasActiveRequirement(attribute["required"]) {
			continue
		}
		if !isDefaultNameRequirement(attribute["required"]) {
			return fmt.Errorf("%s has a custom user-profile requirement; refusing to overwrite drift", name)
		}
	}

	if !hasActiveRequirement(names["firstName"]["required"]) && !hasActiveRequirement(names["lastName"]["required"]) && marker != nil {
		fmt.Println("Validated that firstName and lastName are optional and cleanup provenance is admin-only.")
		return nil
	}

	updated, err := cloneMap(profile)
	if err != nil {
		return fmt.Errorf("clone realm user profile: %w", err)
	}
	for _, value := range updated["attributes"].([]any) {
		attribute := value.(map[string]any)
		name := stringField(attribute, "name")
		if name == "firstName" || name == "lastName" {
			delete(attribute, "required")
		}
	}
	if marker == nil {
		updated["attributes"] = append(updated["attributes"].([]any), pendingMarkerAttribute)
	}
	i.originalProfile = profile
	if err := i.api(http.MethodPut, path, updated, nil); err != nil {
		return err
	}

	var verified map[string]any
	if err := i.api(http.MethodGet, path, nil, &verified); err != nil {
		return err
	}
	for _, name := range []string{"firstName", "lastName"} {
		attribute := findProfileAttribute(verified, name)
		if attribute == nil || hasActiveRequirement(attribute["required"]) {
			return fmt.Errorf("%s is still required after updating the realm user profile", name)
		}
	}
	verifiedMarker := findProfileAttribute(verified, "caselaw.pending-email-otp")
	if verifiedMarker == nil {
		return errors.New("caselaw.pending-email-otp is missing after updating the realm user profile")
	}
	fmt.Println("Made firstName and lastName optional and registered admin-only cleanup provenance.")
	return nil
}

func (i *installer) flows() ([]map[string]any, error) {
	var flows []map[string]any
	err := i.api(http.MethodGet, i.adminPath+"/authentication/flows", nil, &flows)
	return flows, err
}

func (i *installer) executions(flowAlias string) ([]map[string]any, error) {
	var all []map[string]any
	path := i.adminPath + "/authentication/flows/" + url.PathEscape(flowAlias) + "/executions"
	if err := i.api(http.MethodGet, path, nil, &all); err != nil {
		return nil, err
	}
	direct := make([]map[string]any, 0, len(all))
	for _, execution := range all {
		if intField(execution, "level") == 0 {
			direct = append(direct, execution)
		}
	}
	return direct, nil
}

func (i *installer) addExecution(flowAlias, providerID, requirement string) (map[string]any, error) {
	path := i.adminPath + "/authentication/flows/" + url.PathEscape(flowAlias) + "/executions/execution"
	if err := i.api(http.MethodPost, path, map[string]string{"provider": providerID}, nil); err != nil {
		return nil, err
	}
	executions, err := i.executions(flowAlias)
	if err != nil {
		return nil, err
	}
	execution := findByString(executions, "providerId", providerID)
	if execution == nil {
		return nil, fmt.Errorf("could not find %s after adding it to %s", providerID, flowAlias)
	}
	if err := i.setRequirement(flowAlias, execution, requirement); err != nil {
		return nil, err
	}
	execution["requirement"] = requirement
	return execution, nil
}

func (i *installer) addSubflow(parentAlias, alias, requirement, description string) error {
	path := i.adminPath + "/authentication/flows/" + url.PathEscape(parentAlias) + "/executions/flow"
	if err := i.api(http.MethodPost, path, map[string]string{
		"alias": alias, "type": "basic-flow", "provider": "basic-flow", "description": description,
	}, nil); err != nil {
		return err
	}
	executions, err := i.executions(parentAlias)
	if err != nil {
		return err
	}
	execution := findSubflow(executions, alias)
	if execution == nil {
		return fmt.Errorf("could not find %s after adding it to %s", alias, parentAlias)
	}
	return i.setRequirement(parentAlias, execution, requirement)
}

func (i *installer) setRequirement(flowAlias string, execution map[string]any, requirement string) error {
	execution["requirement"] = requirement
	path := i.adminPath + "/authentication/flows/" + url.PathEscape(flowAlias) + "/executions"
	return i.api(http.MethodPut, path, execution, nil)
}

func (i *installer) addExecutionConfig(executionID, alias string, config map[string]string) error {
	path := i.adminPath + "/authentication/executions/" + url.PathEscape(executionID) + "/config"
	return i.api(http.MethodPost, path, map[string]any{"alias": alias, "config": config}, nil)
}

func (i *installer) validateExistingFlow() error {
	if _, err := i.expectFlow(browserFlow, []expectedExecution{
		{providerID: "auth-cookie", requirement: "ALTERNATIVE"},
		{providerID: "identity-provider-redirector", requirement: "ALTERNATIVE"},
		{displayName: formsFlow, requirement: "ALTERNATIVE", authenticationFlow: true},
	}); err != nil {
		return err
	}
	if _, err := i.expectFlow(formsFlow, []expectedExecution{
		{providerID: "caselaw-email-identity", requirement: "REQUIRED"},
		{displayName: methodsFlow, requirement: "REQUIRED", authenticationFlow: true},
	}); err != nil {
		return err
	}
	methods, err := i.expectFlow(methodsFlow, []expectedExecution{
		{providerID: "ext-email-otp", requirement: "ALTERNATIVE"},
		{providerID: "ext-magic-form", requirement: "ALTERNATIVE"},
	})
	if err != nil {
		return err
	}
	if err := i.expectConfig(methods[0], otpAlias, otpConfig); err != nil {
		return err
	}
	return i.expectConfig(methods[1], magicAlias, magicLinkConfig)
}

func (i *installer) expectFlow(alias string, expected []expectedExecution) ([]map[string]any, error) {
	actual, err := i.executions(alias)
	if err != nil {
		return nil, err
	}
	if len(actual) != len(expected) {
		return nil, fmt.Errorf("%s has %d direct executions; expected %d; refusing to overwrite drift", alias, len(actual), len(expected))
	}
	for index, wanted := range expected {
		found := actual[index]
		if wanted.providerID != "" && stringField(found, "providerId") != wanted.providerID {
			return nil, driftError(alias, index, "providerId", stringField(found, "providerId"), wanted.providerID)
		}
		if wanted.displayName != "" && stringField(found, "displayName") != wanted.displayName {
			return nil, driftError(alias, index, "displayName", stringField(found, "displayName"), wanted.displayName)
		}
		if stringField(found, "requirement") != wanted.requirement {
			return nil, driftError(alias, index, "requirement", stringField(found, "requirement"), wanted.requirement)
		}
		if boolField(found, "authenticationFlow") != wanted.authenticationFlow {
			return nil, driftError(alias, index, "authenticationFlow", boolField(found, "authenticationFlow"), wanted.authenticationFlow)
		}
	}
	return actual, nil
}

func (i *installer) expectConfig(execution map[string]any, alias string, expected map[string]string) error {
	configID := stringField(execution, "authenticationConfig")
	if configID == "" {
		return fmt.Errorf("%s has no authenticator configuration", stringField(execution, "providerId"))
	}
	var actual map[string]any
	path := i.adminPath + "/authentication/config/" + url.PathEscape(configID)
	if err := i.api(http.MethodGet, path, nil, &actual); err != nil {
		return err
	}
	config := mapStringString(actual["config"])
	if stringField(actual, "alias") != alias || !sameStringMap(config, expected) {
		return fmt.Errorf("%s configuration has drifted; refusing to overwrite it", stringField(execution, "providerId"))
	}
	return nil
}

func (i *installer) ensureCitationsAPIClient() error {
	matches, err := i.clientsByClientID("citations-api")
	if err != nil {
		return err
	}
	if len(matches) == 0 {
		if err := i.api(http.MethodPost, i.adminPath+"/clients", citationsAPIClient, nil); err != nil {
			return err
		}
		created, err := i.findClient("citations-api")
		if err != nil {
			return err
		}
		if created != nil {
			i.createdClientID = stringField(created, "id")
		}
		fmt.Println("Created the public citations-api UI client.")
		return nil
	}

	existing := matches[0]
	missingRedirect := false
	for _, wanted := range citationsAPIClient["redirectUris"].([]string) {
		if !contains(stringSlice(existing["redirectUris"]), wanted) {
			missingRedirect = true
		}
	}
	if !boolField(existing, "publicClient") || !boolField(existing, "standardFlowEnabled") ||
		boolField(existing, "directAccessGrantsEnabled") || boolField(existing, "serviceAccountsEnabled") || missingRedirect {
		return errors.New("the existing citations-api client has an unsafe or incomplete configuration; refusing to overwrite it")
	}
	fmt.Println("Validated the public citations-api UI client.")
	return nil
}

func (i *installer) validateEstateClients() error {
	interactive := map[string][]string{
		"caselaw-frontend": {
			"https://app.caselawexplorer.tech/auth/callback",
			"https://demo-app.caselawexplorer.tech/auth/callback",
		},
		"caselaw-access":       {"https://access.caselawexplorer.tech/auth/callback"},
		"caselaw-db-workbench": {"https://demo-db.caselawexplorer.tech/auth/callback"},
		"citations-api": {
			"https://demo-api.caselawexplorer.tech/auth/callback",
			"https://api.caselawexplorer.tech/auth/callback",
		},
	}

	clientIDs := make([]string, 0, len(interactive))
	for clientID := range interactive {
		clientIDs = append(clientIDs, clientID)
	}
	sort.Strings(clientIDs)

	for _, clientID := range clientIDs {
		client, err := i.findClient(clientID)
		if err != nil {
			return err
		}
		if client == nil {
			return fmt.Errorf("interactive Case Law client %s is missing", clientID)
		}
		callbacksCovered := true
		for _, callback := range interactive[clientID] {
			covered := false
			for _, registered := range stringSlice(client["redirectUris"]) {
				if redirectMatches(registered, callback) {
					covered = true
					break
				}
			}
			callbacksCovered = callbacksCovered && covered
		}
		attributes := mapStringString(client["attributes"])
		if !boolField(client, "publicClient") || !boolField(client, "standardFlowEnabled") ||
			boolField(client, "directAccessGrantsEnabled") || boolField(client, "serviceAccountsEnabled") ||
			attributes["pkce.code.challenge.method"] != "S256" || attributes["post.logout.redirect.uris"] != "+" || !callbacksCovered {
			return fmt.Errorf("interactive Case Law client %s is unsafe or missing a production callback", clientID)
		}
	}

	machine, err := i.findClient("caselaw-api")
	if err != nil {
		return err
	}
	if machine == nil || boolField(machine, "publicClient") || boolField(machine, "standardFlowEnabled") ||
		boolField(machine, "directAccessGrantsEnabled") || !boolField(machine, "serviceAccountsEnabled") || len(stringSlice(machine["redirectUris"])) > 0 {
		return errors.New("machine client caselaw-api is missing or has been made browser-interactive")
	}
	fmt.Println("Validated all Case Law interactive clients and the separate machine client.")
	return nil
}

func (i *installer) clientsByClientID(clientID string) ([]map[string]any, error) {
	var clients []map[string]any
	path := i.adminPath + "/clients?clientId=" + url.QueryEscape(clientID)
	err := i.api(http.MethodGet, path, nil, &clients)
	return clients, err
}

func (i *installer) findClient(clientID string) (map[string]any, error) {
	clients, err := i.clientsByClientID(clientID)
	if err != nil {
		return nil, err
	}
	for _, client := range clients {
		if stringField(client, "clientId") == clientID {
			return client, nil
		}
	}
	return nil, nil
}

func (i *installer) rollback() {
	if i.createdFlowID != "" {
		_ = i.api(http.MethodDelete, i.adminPath+"/authentication/flows/"+url.PathEscape(i.createdFlowID), nil, nil)
	}
	if i.createdClientID != "" {
		_ = i.api(http.MethodDelete, i.adminPath+"/clients/"+url.PathEscape(i.createdClientID), nil, nil)
	}
	if i.originalProfile != nil {
		_ = i.api(http.MethodPut, i.adminPath+"/users/profile", i.originalProfile, nil)
	}
}

func (i *installer) api(method, path string, body any, output any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, i.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+i.token)
	if body != nil {
		req.Header.Set("content-type", "application/json")
	}
	response, err := i.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("%s %s failed (%d): %s", method, path, response.StatusCode, strings.TrimSpace(string(raw)))
	}
	if output != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, output); err != nil {
			return fmt.Errorf("decode %s %s response: %w", method, path, err)
		}
	}
	return nil
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); value != "" {
			return value
		}
	}
	return ""
}

func envInt(name string, fallback int) int {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func envBool(name string, fallback bool) bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	if raw == "" {
		return fallback
	}
	return raw == "true" || raw == "1" || raw == "yes"
}

func findByString(items []map[string]any, key, value string) map[string]any {
	for _, item := range items {
		if stringField(item, key) == value {
			return item
		}
	}
	return nil
}

func findSubflow(items []map[string]any, alias string) map[string]any {
	for _, item := range items {
		if boolField(item, "authenticationFlow") && stringField(item, "displayName") == alias {
			return item
		}
	}
	return nil
}

func stringField(item map[string]any, key string) string {
	value, _ := item[key].(string)
	return value
}

func boolField(item map[string]any, key string) bool {
	value, _ := item[key].(bool)
	return value
}

func intField(item map[string]any, key string) int {
	switch value := item[key].(type) {
	case float64:
		return int(value)
	case int:
		return value
	case json.Number:
		result, _ := value.Int64()
		return int(result)
	default:
		return 0
	}
}

func stringSlice(value any) []string {
	switch values := value.(type) {
	case []string:
		return values
	case []any:
		result := make([]string, 0, len(values))
		for _, value := range values {
			if text, ok := value.(string); ok {
				result = append(result, text)
			}
		}
		return result
	default:
		return nil
	}
}

func mapStringString(value any) map[string]string {
	result := map[string]string{}
	switch values := value.(type) {
	case map[string]string:
		return values
	case map[string]any:
		for key, value := range values {
			if text, ok := value.(string); ok {
				result[key] = text
			}
		}
	}
	return result
}

func findProfileAttribute(profile map[string]any, wanted string) map[string]any {
	attributes, _ := profile["attributes"].([]any)
	for _, value := range attributes {
		attribute, _ := value.(map[string]any)
		if stringField(attribute, "name") == wanted {
			return attribute
		}
	}
	return nil
}

func hasActiveRequirement(value any) bool {
	requirement, ok := value.(map[string]any)
	if !ok {
		return false
	}
	return len(stringSlice(requirement["roles"])) > 0 || len(stringSlice(requirement["scopes"])) > 0
}

func isDefaultNameRequirement(value any) bool {
	requirement, ok := value.(map[string]any)
	if !ok {
		return false
	}
	for key := range requirement {
		if key != "roles" && key != "scopes" {
			return false
		}
	}
	roles := stringSlice(requirement["roles"])
	return len(roles) == 1 && roles[0] == "user" && len(stringSlice(requirement["scopes"])) == 0
}

func cloneMap(source map[string]any) (map[string]any, error) {
	encoded, err := json.Marshal(source)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err := json.Unmarshal(encoded, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func sameStringMap(left, right map[string]string) bool {
	if len(left) != len(right) {
		return false
	}
	for key, value := range right {
		if left[key] != value {
			return false
		}
	}
	return true
}

func sameStringSlice(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index, value := range right {
		if left[index] != value {
			return false
		}
	}
	return true
}

func redirectMatches(registered, callback string) bool {
	pattern := "^" + strings.ReplaceAll(regexp.QuoteMeta(registered), `\*`, ".*") + "$"
	matched, _ := regexp.MatchString(pattern, callback)
	return matched
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func driftError(alias string, index int, key string, actual, expected any) error {
	return fmt.Errorf("%s execution %d has %s=%v; expected %v; refusing to overwrite drift", alias, index+1, key, actual, expected)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "Case Law passwordless configuration failed:", err)
	os.Exit(1)
}
