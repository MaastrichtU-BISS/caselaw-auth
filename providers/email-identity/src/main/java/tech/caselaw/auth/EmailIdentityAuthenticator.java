package tech.caselaw.auth;

import static org.keycloak.services.validation.Validation.FIELD_USERNAME;

import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.authenticators.browser.AbstractUsernameFormAuthenticator;
import org.keycloak.authentication.authenticators.util.AuthenticatorUtils;
import org.keycloak.events.Details;
import org.keycloak.events.Errors;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ModelDuplicateException;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.KeycloakModelUtils;
import org.keycloak.services.managers.AuthenticationManager;
import org.keycloak.services.messages.Messages;
import org.keycloak.utils.EmailValidationUtil;

final class EmailIdentityAuthenticator extends AbstractUsernameFormAuthenticator {
  @Override
  public void authenticate(AuthenticationFlowContext context) {
    if (context.getUser() != null) {
      context.success();
      return;
    }
    context.challenge(context.form().setExecution(context.getExecution().getId()).createLoginUsername());
  }

  @Override
  public void action(AuthenticationFlowContext context) {
    MultivaluedMap<String, String> formData =
        context.getHttpRequest().getDecodedFormParameters();
    String email = formData.getFirst(AuthenticationManager.FORM_USERNAME);
    email = email == null ? null : email.trim();

    if (email == null || !EmailValidationUtil.isValidEmail(email)) {
      reject(context, formData, Messages.INVALID_EMAIL);
      return;
    }

    context.getEvent().detail(Details.USERNAME, email);
    context
        .getAuthenticationSession()
        .setAuthNote(AbstractUsernameFormAuthenticator.ATTEMPTED_USERNAME, email);

    UserModel user;
    try {
      user =
          KeycloakModelUtils.findUserByNameOrEmail(
              context.getSession(), context.getRealm(), email);
      if (user == null) {
        user = context.getSession().users().addUser(context.getRealm(), null, email, true, false);
        user.setEmail(email);
        user.setEmailVerified(false);
        user.setEnabled(true);
      }
    } catch (ModelDuplicateException duplicate) {
      // A concurrent request may have created the same email between lookup and
      // insertion. Resolve it once more instead of creating a second identity.
      user =
          KeycloakModelUtils.findUserByNameOrEmail(
              context.getSession(), context.getRealm(), email);
      if (user == null) {
        reject(context, formData, Messages.INVALID_EMAIL);
        return;
      }
    }

    if (user.getEmail() == null || !EmailValidationUtil.isValidEmail(user.getEmail())) {
      reject(context, formData, Messages.INVALID_EMAIL);
      return;
    }
    if (!enabledUser(context, user)) {
      return;
    }

    AuthenticatorUtils.processRememberMe(context, formData);
    context.setUser(user);
    context.success();
  }

  private void reject(
      AuthenticationFlowContext context,
      MultivaluedMap<String, String> formData,
      String message) {
    context.getEvent().error(Errors.INVALID_EMAIL);
    Response response =
        context
            .form()
            .setExecution(context.getExecution().getId())
            .setFormData(formData)
            .addError(new org.keycloak.models.utils.FormMessage(FIELD_USERNAME, message))
            .createLoginUsername();
    context.failureChallenge(AuthenticationFlowError.INVALID_USER, response);
  }

  @Override
  public boolean requiresUser() {
    return false;
  }

  @Override
  public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
    return true;
  }

  @Override
  public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {}
}
