<?php
/**
 * Carbon Stealth VCC — SMTP Configuration
 * =========================================
 * 
 * OPZIONE A — Gmail:
 *   1. Vai su myaccount.google.com/apppasswords
 *   2. Crea "App Password" per "Mail"
 *   3. SMTP_HOST = smtp.gmail.com, PORT = 587
 *
 * OPZIONE B — Brevo/Mailgun/SendGrid (alta deliverability)
 */

define('SMTP_HOST',      'smtp.gmail.com');
define('SMTP_PORT',      587);
define('SMTP_SECURE',    'tls');
define('SMTP_USER',      'info@carbonstealth.eu');
define('SMTP_PASS',      'LA_TUA_APP_PASSWORD');    // ← CAMBIA!
define('SMTP_FROM',      'info@carbonstealth.eu');
define('SMTP_FROM_NAME', 'Carbon Stealth VCC');
define('SMTP_TO',        'info@carbonstealth.eu');
define('SMTP_DEBUG',     0);

// reCAPTCHA v3 (opzionale — lascia vuoto per disabilitare)
define('RECAPTCHA_SECRET', '');
