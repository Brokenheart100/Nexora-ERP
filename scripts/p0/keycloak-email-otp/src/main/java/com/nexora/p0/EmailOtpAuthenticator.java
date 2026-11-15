package com.nexora.p0;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailSenderProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.ModelDuplicateException;
import org.keycloak.models.RealmModel;
import org.keycloak.models.SingleUseObjectProvider;
import org.keycloak.models.UserModel;
import org.keycloak.protocol.oidc.OIDCLoginProtocol;

public final class EmailOtpAuthenticator implements Authenticator {
    private static final Logger LOG = Logger.getLogger(EmailOtpAuthenticator.class);
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String NOTE = "nexora.p0.email.challenge";
    private static final String GENERIC = "若该邮箱可用于登录，验证码已发送。请检查邮箱；频繁请求可能被限制。";
    private static final String INVALID = "验证码不可用，请重新发起登录。";
    private static final String EMAIL_ONLY = "nexora-email-only";
    private static final String REGISTER = "nexora-email-register";
    private final boolean onboarding;

    public EmailOtpAuthenticator() { this(false); }
    EmailOtpAuthenticator(boolean onboarding) { this.onboarding = onboarding; }

    private String mode(AuthenticationFlowContext context) {
        return context.getAuthenticationSession().getClientNote(OIDCLoginProtocol.LOGIN_HINT_PARAM);
    }

    private static int setting(String name, int fallback, int min, int max) {
        String value = System.getenv(name);
        int parsed = value == null ? fallback : Integer.parseInt(value);
        if (parsed < min || parsed > max) throw new IllegalStateException("Invalid OTP configuration: " + name);
        return parsed;
    }

    private static String digest(String value) {
        String secret = System.getenv("NEXORA_OTP_HMAC_KEY");
        if (secret == null || secret.length() < 32) throw new IllegalStateException("OTP HMAC key is required");
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException error) { throw new IllegalStateException(error); }
    }

    private String binding(AuthenticationFlowContext context) {
        var auth = context.getAuthenticationSession();
        return digest(context.getRealm().getId() + ":" + auth.getParentSession().getId() + ":" + auth.getTabId());
    }

    private void show(AuthenticationFlowContext context, boolean codeStage, String message) {
        var page = context.form().setAttribute("codeStage", codeStage)
                .setAttribute("registration", onboarding && REGISTER.equals(mode(context)))
                .setAttribute("probeMessage", message)
                .createForm(onboarding ? "nexora-email-otp.ftl" : "email-otp.ftl");
        if (onboarding) context.forceChallenge(page);
        else context.challenge(page);
    }

    public void authenticate(AuthenticationFlowContext context) {
        if (onboarding && !"nexora-email-login".equals(mode(context)) && !REGISTER.equals(mode(context))) {
            context.attempted();
            return;
        }
        show(context, context.getAuthenticationSession().getAuthNote(NOTE) != null, GENERIC);
    }

    public void action(AuthenticationFlowContext context) {
        var form = context.getHttpRequest().getDecodedFormParameters();
        var auth = context.getAuthenticationSession();
        var store = context.getSession().singleUseObjects();
        if (form.containsKey("restart")) {
            String old = auth.getAuthNote(NOTE);
            if (old != null) store.remove(old);
            auth.removeAuthNote(NOTE);
            context.resetFlow();
            return;
        }
        if (auth.getAuthNote(NOTE) == null) {
            issue(context, store, form.getFirst("email"));
            return;
        }
        String key = auth.getAuthNote(NOTE);
        // Atomic removal must precede comparison/success. Even a wrong attempt consumes
        // this challenge; no read/validate/remove race and no unlimited guessing loop.
        Map<String, String> record = store.remove(key);
        String code = form.getFirst("code");
        boolean valid = record != null && code != null && code.matches("[0-9]{6}")
                && record.get("binding").equals(binding(context))
                && Long.parseLong(record.get("expiresAt")) > Instant.now().getEpochSecond()
                && MessageDigest.isEqual(record.get("hash").getBytes(StandardCharsets.US_ASCII),
                        digest(key + ":" + record.get("email") + ":" + code).getBytes(StandardCharsets.US_ASCII));
        boolean register = onboarding && REGISTER.equals(mode(context));
        UserModel user = valid ? (register ? register(context, record.get("email"))
                : context.getSession().users().getUserById(context.getRealm(), record.get("userId"))) : null;
        if (!eligible(user) || user.getEmail() == null
                || !user.getEmail().equalsIgnoreCase(record.get("email"))) {
            show(context, true, INVALID);
            return;
        }
        auth.removeAuthNote(NOTE);
        user.setEmailVerified(true);
        context.setUser(user);
        context.success();
    }

    private void issue(AuthenticationFlowContext context, SingleUseObjectProvider store, String submitted) {
        // No submitted email is echoed into the form or logs. Unknown/disabled/failure
        // paths use the same UI and HTTP status, but this is not a timing-side-channel proof.
        String email = submitted == null ? "" : submitted.strip().toLowerCase(Locale.ROOT);
        String key = "nexora:p0:otp:" + UUID.randomUUID();
        context.getAuthenticationSession().setAuthNote(NOTE, key);
        boolean syntax = email.length() <= 254 && email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+");
        if (!syntax || !ipBudget(context, store) || !store.putIfAbsent("nexora:p0:send:"
                + context.getRealm().getId() + ":" + digest(email), setting("NEXORA_OTP_COOLDOWN_SECONDS", 60, 1, 3600))) {
            show(context, true, GENERIC);
            return;
        }
        var user = context.getSession().users().getUserByEmail(context.getRealm(), email);
        String code = String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
        int ttl = setting("NEXORA_OTP_TTL_SECONDS", 300, 1, 600);
        boolean register = onboarding && REGISTER.equals(mode(context));
        boolean delivered = register ? user == null : eligible(user);
        if (delivered) {
            try {
                context.getSession().getProvider(EmailSenderProvider.class).send(context.getRealm().getSmtpConfig(),
                        email, onboarding ? "Nexora 验证码" : "Nexora P0 login code",
                        "Code: " + code + "\nValid for " + ttl + " seconds.", null);
            } catch (EmailException error) {
                delivered = false;
                LOG.warn("NEXORA_P0_OTP_MAIL_FAILED");
            }
        }
        // Keycloak enlists put() in its transaction and forbids a second pending
        // put for the same key. Write exactly once after the SMTP outcome is known.
        // Crash/rollback after delivery leaves an unusable code, never a bypass.
        store.put(key, ttl, Map.of("hash", digest(key + ":" + email + ":" + code),
                "email", email, "userId", delivered && user != null ? user.getId() : "", "binding", binding(context),
                "expiresAt", delivered ? Long.toString(Instant.now().getEpochSecond() + ttl) : "0"));
        show(context, true, GENERIC);
    }

    private boolean eligible(UserModel user) {
        return user != null && user.isEnabled() && (!onboarding
                || ("true".equals(user.getFirstAttribute(EMAIL_ONLY))
                    && !user.credentialManager().isConfiguredFor("password")
                    && !user.credentialManager().isConfiguredFor("otp")));
    }

    private UserModel register(AuthenticationFlowContext context, String email) {
        var users = context.getSession().users();
        var realm = context.getRealm();
        if (users.getUserByEmail(realm, email) != null || users.getUserByUsername(realm, email) != null) return null;
        try {
            var user = users.addUser(realm, email);
            user.setEmail(email);
            user.setSingleAttribute(EMAIL_ONLY, "true");
            user.setEnabled(true);
            return user;
        } catch (ModelDuplicateException duplicate) {
            return null;
        }
    }

    private boolean ipBudget(AuthenticationFlowContext context, SingleUseObjectProvider store) {
        int budget = setting("NEXORA_OTP_IP_BUDGET", 30, 1, 100);
        String prefix = "nexora:p0:ip:" + context.getRealm().getId() + ":"
                + digest(context.getConnection().getRemoteAddr()) + ":" + Instant.now().getEpochSecond() / 60 + ":";
        for (int slot = 0; slot < budget; slot++) if (store.putIfAbsent(prefix + slot, 120)) return true;
        return false;
    }

    public boolean requiresUser() { return false; }
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) { return true; }
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) { }
    public void close() { }
}
