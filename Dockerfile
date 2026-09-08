ARG KEYCLOAK_VERSION=26.7.0
ARG MAGIC_LINK_VERSION=0.75

FROM golang:1.25.0-alpine AS configurator
WORKDIR /src
COPY scripts/passwordless-configurator/main.go ./main.go
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
    -o /out/caselaw-passwordless-configurator ./main.go

FROM maven:3.9.11-eclipse-temurin-21-alpine AS email-identity-provider
ARG KEYCLOAK_VERSION
WORKDIR /src
COPY providers/email-identity/pom.xml ./pom.xml
COPY providers/email-identity/src ./src
RUN mvn -B -DskipTests -Dkeycloak.version="${KEYCLOAK_VERSION}" package

FROM curlimages/curl:8.11.1 AS provider
ARG MAGIC_LINK_VERSION
RUN curl -fsSL \
    "https://repo1.maven.org/maven2/io/phasetwo/keycloak/keycloak-magic-link/${MAGIC_LINK_VERSION}/keycloak-magic-link-${MAGIC_LINK_VERSION}.jar" \
    -o /tmp/keycloak-magic-link.jar

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION} AS builder
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
COPY --from=provider /tmp/keycloak-magic-link.jar /opt/keycloak/providers/keycloak-magic-link.jar
COPY --from=email-identity-provider /src/target/caselaw-email-identity-1.1.0.jar /opt/keycloak/providers/caselaw-email-identity.jar
COPY realm/caselaw-realm.json /opt/keycloak/data/import/caselaw-realm.json
COPY themes /opt/keycloak/themes
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
COPY --from=configurator /out/caselaw-passwordless-configurator /opt/keycloak/bin/caselaw-passwordless-configurator
COPY --chmod=0755 scripts/keycloak-entrypoint.sh /opt/keycloak/bin/caselaw-entrypoint.sh
ENTRYPOINT ["/opt/keycloak/bin/caselaw-entrypoint.sh"]
CMD ["start", "--optimized", "--import-realm"]
