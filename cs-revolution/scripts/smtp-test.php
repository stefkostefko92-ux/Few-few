<?php
/**
 * SMTP smoke test — run ON THE SERVER after `composer install` + setting env.
 *
 *   CS_SMTP_PASS='...' php scripts/smtp-test.php you@example.com
 *
 * (or, if env is already set in the shell/pool)
 *   php scripts/smtp-test.php you@example.com
 *
 * Prints the full SMTP conversation (SMTPDebug=2) so any register.it /
 * Hetzner issue is visible. Sends to the address you pass, or SMTP_TO.
 */
declare(strict_types=1);

$root = dirname(__DIR__);
require $root.'/api/config.php';

if (!file_exists($root.'/vendor/autoload.php')) {
    fwrite(STDERR, "ERROR: vendor/autoload.php missing — run `composer install` first.\n");
    exit(1);
}
require $root.'/vendor/autoload.php';

$to = $argv[1] ?? SMTP_TO;
fwrite(STDOUT, "Host={".SMTP_HOST."} Port=".SMTP_PORT." Secure=".SMTP_SECURE." User=".SMTP_USER."\n");
fwrite(STDOUT, "Pass set: ".(SMTP_PASS !== '' ? 'yes' : 'NO — set env[CS_SMTP_PASS]')."\n");
fwrite(STDOUT, "Sending test to: $to\n\n");

try {
    $m = new \PHPMailer\PHPMailer\PHPMailer(true);
    $m->isSMTP();
    $m->Host       = SMTP_HOST;
    $m->SMTPAuth   = true;
    $m->Username   = SMTP_USER;
    $m->Password   = SMTP_PASS;
    $m->SMTPSecure = (SMTP_SECURE === 'ssl')
        ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
        : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    $m->Port      = SMTP_PORT;
    $m->SMTPDebug = 2; // verbose
    $m->Timeout   = 15;
    $m->CharSet   = 'UTF-8';
    $m->setFrom(SMTP_FROM, SMTP_FROM_NAME);
    $m->addAddress($to);
    $m->Subject = 'Carbon Stealth — SMTP test '.date('H:i:s');
    $m->Body    = "If you can read this, register.it SMTP works from this server.\n".date('c');
    $m->send();
    fwrite(STDOUT, "\n✅ SENT OK to $to\n");
    exit(0);
} catch (\Throwable $e) {
    fwrite(STDERR, "\n❌ FAILED: ".$e->getMessage()."\n");
    exit(2);
}
