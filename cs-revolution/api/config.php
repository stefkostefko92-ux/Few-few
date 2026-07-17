<?php
/**
 * Carbon Stealth VCC — SMTP Configuration
 * =========================================
 * Env-driven (secrets NEVER in the repo). Set these in the PHP-FPM pool:
 *   env[CS_SMTP_PASS] = <mailbox / SMTP-account password>
 * Optionally override host/port/user/from/to via env[CS_SMTP_*].
 *
 * Defaults target REGISTER.IT authenticated SMTP:
 *   Host   authsmtp.securemail.pro
 *   Port   465 (SSL, recommended)  — or 587 (STARTTLS)  → set CS_SMTP_SECURE=tls
 *   User   full mailbox address (info@carbonstealth.eu)
 *
 * Why 465/587 and not 25: Hetzner blocks outbound port 25 by default
 * (anti-spam), so mail()/direct-MX fails. Authenticated submission on
 * 465/465-SSL or 587/STARTTLS to register.it is NOT blocked — this is the
 * reliable path. See docs/CONTACT-SMTP-SETUP.md.
 *
 * NOTE: register.it may require activating "SMTP autenticato" for the mailbox
 * (https://www.register.it/assistenza/soluzione-invii-email/).
 */

if (!function_exists('cs_env')) {
    function cs_env(string $key, string $default = ''): string {
        $v = getenv($key);
        return ($v === false || $v === '') ? $default : $v;
    }
}

define('SMTP_HOST',      cs_env('CS_SMTP_HOST',   'authsmtp.securemail.pro'));
define('SMTP_PORT',      (int) cs_env('CS_SMTP_PORT', '465'));
define('SMTP_SECURE',    cs_env('CS_SMTP_SECURE', 'ssl'));   // 'ssl' for 465, 'tls' for 587
define('SMTP_USER',      cs_env('CS_SMTP_USER',   'info@carbonstealth.eu'));
define('SMTP_PASS',      cs_env('CS_SMTP_PASS',   ''));       // ← set env[CS_SMTP_PASS] on the server
define('SMTP_FROM',      cs_env('CS_SMTP_FROM',   'info@carbonstealth.eu'));
define('SMTP_FROM_NAME', cs_env('CS_SMTP_FROM_NAME', 'Carbon Stealth VCC'));
define('SMTP_TO',        cs_env('CS_SMTP_TO',     'info@carbonstealth.eu'));
define('SMTP_DEBUG',     (int) cs_env('CS_SMTP_DEBUG', '0')); // 2 = verbose SMTP debug

// reCAPTCHA v3 (optional — leave empty to disable)
define('RECAPTCHA_SECRET', cs_env('CS_RECAPTCHA_SECRET', ''));
