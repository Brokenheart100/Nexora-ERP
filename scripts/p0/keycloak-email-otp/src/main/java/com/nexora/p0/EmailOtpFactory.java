package com.nexora.p0;

import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

/** Independent P0 compatibility candidate, not a production authentication release. */
public class EmailOtpFactory implements AuthenticatorFactory {
    public String getId() { return "nexora-p0-email-otp"; }
    public String getDisplayType() { return "Nexora P0 Email OTP (probe)"; }
    public String getReferenceCategory() { return "email-otp"; }
    public String getHelpText() { return "P0 probe: single-attempt email challenge; not TOTP or MFA."; }
    public boolean isConfigurable() { return false; }
    public boolean isUserSetupAllowed() { return false; }
    public Requirement[] getRequirementChoices() { return new Requirement[] {Requirement.REQUIRED, Requirement.DISABLED}; }
    public List<ProviderConfigProperty> getConfigProperties() { return List.of(); }
    public Authenticator create(KeycloakSession session) { return new EmailOtpAuthenticator(); }
    public void init(Config.Scope config) { }
    public void postInit(KeycloakSessionFactory factory) { }
    public void close() { }
}
