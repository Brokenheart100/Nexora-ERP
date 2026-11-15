package com.nexora.p0;

import org.keycloak.authentication.Authenticator;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;

public final class EmailOnboardingFactory extends EmailOtpFactory {
    @Override public String getId() { return "nexora-email-onboarding"; }
    @Override public String getDisplayType() { return "Nexora email registration and sign-in"; }
    @Override public String getHelpText() { return "Verifies an email code before registering or signing in an email-only account."; }
    @Override public Requirement[] getRequirementChoices() { return new Requirement[] {Requirement.ALTERNATIVE, Requirement.DISABLED}; }
    @Override public Authenticator create(KeycloakSession session) { return new EmailOtpAuthenticator(true); }
}
