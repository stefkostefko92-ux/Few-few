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

// Defence in depth: these files are libraries, never entry points. If one is
// requested directly over HTTP (a misconfigured or replaced nginx, a future
// vhost edit), refuse instead of trusting the web server to have blocked it.
if (isset($_SERVER['SCRIPT_FILENAME']) &&
    realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}


if (!function_exists('cs_env')) {
    function cs_env(string $key, string $default = ''): string {
        $v = getenv($key);
        return ($v === false || $v === '') ? $default : $v;
    }
}

// Local overrides written by the admin panel (git-ignored, may hold the password).
$cs_local = @include __DIR__ . '/smtp-local.php';
if (!is_array($cs_local)) $cs_local = [];
if (!function_exists('cs_cfg')) {
    // Precedence: admin-panel local file → PHP-FPM env → default.
    function cs_cfg(array $local, string $localKey, string $envKey, string $default): string {
        if (isset($local[$localKey]) && $local[$localKey] !== '') return (string)$local[$localKey];
        $v = getenv($envKey);
        return ($v === false || $v === '') ? $default : $v;
    }
}

define('SMTP_HOST',      cs_cfg($cs_local, 'host',   'CS_SMTP_HOST',   'authsmtp.securemail.pro'));
define('SMTP_PORT',      (int) cs_cfg($cs_local, 'port', 'CS_SMTP_PORT', '465'));
define('SMTP_SECURE',    cs_cfg($cs_local, 'secure', 'CS_SMTP_SECURE', 'ssl'));   // 'ssl' for 465, 'tls' for 587
define('SMTP_USER',      cs_cfg($cs_local, 'user',   'CS_SMTP_USER',   'info@carbonstealth.eu'));
define('SMTP_PASS',      cs_cfg($cs_local, 'pass',   'CS_SMTP_PASS',   ''));       // ← env[CS_SMTP_PASS] or admin panel
define('SMTP_FROM',      cs_cfg($cs_local, 'user',   'CS_SMTP_FROM',   SMTP_USER));
define('SMTP_FROM_NAME', cs_env('CS_SMTP_FROM_NAME', 'Carbon Stealth VCC'));
define('SMTP_TO',        cs_cfg($cs_local, 'to',     'CS_SMTP_TO',     'info@carbonstealth.eu'));
define('SMTP_DEBUG',     (int) cs_env('CS_SMTP_DEBUG', '0')); // 2 = verbose SMTP debug

// reCAPTCHA v3 (optional — leave empty to disable)
define('RECAPTCHA_SECRET', cs_env('CS_RECAPTCHA_SECRET', ''));
