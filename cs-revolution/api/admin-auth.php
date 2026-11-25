<?php
/**
 * Carbon Stealth VCC — вход в админ панела.
 *
 *   POST ?action=login   {email, password}   → {ok, step:"totp", challenge}   | 401 invalid_credentials
 *   POST ?action=verify  {challenge, code}   → {ok, email} + бисквитка сесия   | 401 invalid_code / challenge_expired
 *   POST ?action=logout                      → {ok} и бисквитката се трие
 *   POST ?action=logout_all                  → {ok} изписва всички сесии (всички устройства); иска сесия
 *   GET  ?action=me                          → {ok, email, idle_timeout}      | 401
 *
 * POST изисква X-CS-Admin: 1 и нашия Origin (CSRF). Всяка грешна парола или грешен код се брои
 * към заключването на адреса (api/_auth.php: 5 опита → 60 s, после по-дълго; fail2ban лог);
 * опитът се брои ПРЕДИ проверката (под една ключалка), а верният се връща.
 * Грешен имейл и грешна парола дават един и същ отговор и отнемат едно и също време.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

require_once __DIR__ . '/_auth.php';

$action = (string)($_GET['action'] ?? '');
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($action === 'me') {
    $s = cs_admin_session_current();
    if ($s === null) cs_json_exit(401, ['ok' => false, 'error' => 'unauthorized']);
    cs_json_exit(200, ['ok' => true, 'email' => (string)$s['email'], 'idle_timeout' => CS_ADMIN_IDLE,
        'expires_at' => (int)$s['created'] + CS_ADMIN_ABSOLUTE]);
}

if (!in_array($action, ['login', 'verify', 'logout', 'logout_all'], true)) cs_json_exit(400, ['ok' => false, 'error' => 'unknown_action']);
if ($method !== 'POST') { header('Allow: POST'); cs_json_exit(405, ['ok' => false, 'error' => 'method_not_allowed']); }
if (!cs_admin_csrf_ok()) cs_json_exit(403, ['ok' => false, 'error' => 'csrf']);

if ($action === 'logout_all') {
    if (cs_admin_session_current() === null) cs_json_exit(401, ['ok' => false, 'error' => 'unauthorized']);
    cs_admin_sessions_revoke_all();
    cs_admin_set_cookie('', 0);
    cs_json_exit(200, ['ok' => true]);
}

if ($action === 'logout') {
    cs_admin_session_destroy();
    cs_admin_set_cookie('', 0);
    cs_json_exit(200, ['ok' => true]);
}

$raw = (string)file_get_contents('php://input', false, null, 0, 8192);
$in = json_decode($raw, true);
if (!is_array($in)) cs_json_exit(400, ['ok' => false, 'error' => 'bad_request']);

// Заключеният адрес се отказва ПРЕДИ проверката — дори верните данни не минават, докато трае.
// Проверката и броенето на опита са една стъпка под една ключалка: паралелни опити не могат да
// „видят“ отключено, преди първият да е преброен. Верният опит се „връща“ веднага.
$lock = cs_auth_reserve_attempt();
if ($lock > 0) {
    header('Retry-After: ' . $lock);
    cs_json_exit(429, ['ok' => false, 'error' => 'too_many_attempts', 'retry_after' => $lock]);
}

$cred = cs_admin_load_credentials();

if ($action === 'login') {
    $email = cs_admin_norm_email((string)($in['email'] ?? ''));
    $pw    = (string)($in['password'] ?? '');
    if (strlen($pw) > 1024) $pw = '';
    // Едно и също време за грешен имейл и грешна парола: паролата се проверява срещу истинския хеш
    // винаги, преди да погледнем имейла (без настройка няма акаунт и няма какво да издадем).
    $hash  = is_array($cred) ? (string)$cred['password_hash'] : '';
    $pwOk  = $hash !== '' && $pw !== '' && password_verify($pw, $hash);
    $emOk  = $cred !== null && hash_equals(cs_admin_norm_email((string)$cred['email']), $email);
    if (!$pwOk || !$emOk) {
        cs_auth_failed();
        cs_json_exit(401, ['ok' => false, 'error' => 'invalid_credentials']);
    }
    cs_auth_release_attempt();   // вярна парола: не е налучкване (броячът се нулира чак след кода)
    cs_json_exit(200, ['ok' => true, 'step' => 'totp', 'challenge' => cs_admin_challenge_create()]);
}

// verify
if ($cred === null) { cs_auth_failed(); cs_json_exit(401, ['ok' => false, 'error' => 'challenge_expired']); }
$r = cs_admin_challenge_verify((string)($in['challenge'] ?? ''), (string)($in['code'] ?? ''), $cred);
if ($r !== 'ok') {
    cs_auth_failed();
    cs_json_exit(401, ['ok' => false, 'error' => $r]);
}
cs_auth_record_success();
$tok = cs_admin_session_create((string)$cred['email']);
cs_admin_set_cookie($tok, CS_ADMIN_ABSOLUTE);
cs_json_exit(200, ['ok' => true, 'email' => (string)$cred['email'], 'idle_timeout' => CS_ADMIN_IDLE]);
