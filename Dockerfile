ARG KEYCLOAK_VERSION=26.7.0
ARG MAGIC_LINK_VERSION=0.75

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
COPY realm/caselaw-realm.json /opt/keycloak/data/import/caselaw-realm.json
COPY themes /opt/keycloak/themes
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized", "--import-realm"]
