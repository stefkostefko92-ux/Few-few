<?php
/**
 * Тестове на входа в админ панела — ЯДРО (вход, сесия, втори фактор).
 *
 *   php tests/admin-auth.test.php          (от cs-revolution/; нужни: PHP ≥ 8.1 с sodium или argon2)
 *
 * Пуска истинския код: командата server/cs-admin.php (настройка, смяна на паролата, отписване) и
 * api/ през вградения сървър на PHP. Нищо не се мокира; времето за изтичане се проверява, като
 * тестът сам „състарява“ записите във файловете на сесиите.
 *
 * Критерии за приемане (всеки е поне един тест отдолу):
 *  К1  Вход = имейл + парола + 6-цифрен код от приложение (или неизползван резервен код).
 *      Грешен имейл и грешна парола дават ЕДИН И СЪЩ отговор (401 invalid_credentials).
 *  К2  Без файл с данни за вход входът е невъзможен (fail-closed), админ крайните точки дават 401.
 *  К3  Успешният вход слага бисквитка __Host-cs_admin: HttpOnly, Secure, SameSite=Strict, Path=/;
 *      на сървъра се пази само SHA-256 на стойността ѝ.
 *  К4  Админ крайните точки приемат само валидна сесия; старият заглавен ред X-CS-Token не дава
 *      достъп, дори CS_ADMIN_TOKEN да е зададен.
 *  К5  Сесията изтича след 30 мин бездействие и след 8 ч общо; „Изход“ я убива веднага.
 *  К6  Заявки, които променят нещо (POST), без заглавен ред X-CS-Admin: 1 → 403; чужд Origin → 403.
 *      Админ крайните точки искат X-CS-Admin: 1 и за GET (поддомейн на същия сайт не може да ги
 *      задейства само с бисквитката); без бисквитка отговорът е 401.
 *  К7  Налучкване: след 5 грешни опита от един адрес → 429 с Retry-After; докато трае, дори
 *      верните данни не минават. Паралелните опити не дават повече от 5 проверки.
 *  К8  Кодът от приложението е RFC 6238 (SHA-1, 6 цифри, 30 s, ±1 стъпка) и не може да се ползва
 *      повторно.
 *  К9  Всеки резервен код работи веднъж.
 *  К10 Предизвикателството след паролата изтича за 5 минути и е за еднократна употреба.
 *  К11 cs-admin setup: парола ≥ 14 знака, въведена два пъти; ключ за приложението + проверка с код
 *      преди запис; 10 резервни кода, показани веднъж; файлът не е достъпен за всички (0640/0600);
 *      пази само хешове.
 *  К12 cs-admin password сменя само паролата и изписва всички сесии; cs-admin revoke изписва всички;
 *      cs-admin recovery дава нови резервни кодове и обезсилва старите; status не показва тайни.
 *  К13 Библиотеката api/_admin.php не е входна точка (404 при пряка заявка).
 *  К14 Изгубено или повредено състояние (admin_state.json) не връща използвани резервни кодове:
 *      резервните кодове спират (отказ), докато cs-admin recovery не издаде нови; кодът от
 *      приложението продължава да работи; status казва какво да се направи. Смяната на паролата
 *      пази отбелязаните като използвани. Записът е атомарен (без остатъчни временни файлове).
 *  К15 Потокът със запитванията (SSE) е вързан за сесията: след изход или revoke билетът дава 401,
 *      а вече отвореният поток се затваря.
 *  К16 cs-admin ползва същите CS_LOG_DIR / CS_ADMIN_CREDENTIALS като PHP-FPM: взема ги от pool-а,
 *      а при разминаване отказва, вместо да „изпише“ грешна папка.
 */
declare(strict_types=1);

$ROOT = dirname(__DIR__);
$TMP  = sys_get_temp_dir() . '/cs-admin-test-' . bin2hex(random_bytes(4));
$WEB  = $TMP . '/web';
$LOGS = $TMP . '/logs';
$CRED = $TMP . '/etc/admin.json';
@mkdir($WEB . '/api', 0755, true);
@mkdir($LOGS, 0750, true);
@mkdir(dirname($CRED), 0750, true);
foreach (glob($ROOT . '/api/*.php') as $f) copy($f, $WEB . '/api/' . basename($f));

$ENV = [
    'CS_ADMIN_CREDENTIALS' => $CRED,
    'CS_LOG_DIR'           => $LOGS,
    'CS_ADMIN_TOKEN'       => 'old-token-should-never-work-0123456789',
    'CS_FPM_POOL_GLOB'     => $TMP . '/no-pool/*.conf',   // pool-овете на машината не влизат в теста
    'PHP_CLI_SERVER_WORKERS' => '8',                       // паралелни заявки (К7) и отворен поток (К15)
    'PATH'                 => getenv('PATH') ?: '/usr/bin:/bin',
];
$EMAIL = 'admin@carbonstealth.eu';
$PASS  = 'Тест-парола-за-админа-2026!';
$PASS2 = 'Втора-парола-след-смяната-77';

$pass = 0; $fail = 0;
function ok(bool $c, string $name): void {
    global $pass, $fail;
    if ($c) { $pass++; echo "  ✓ $name\n"; } else { $fail++; echo "  ✗ $name\n"; }
}
function section(string $s): void { echo "\n$s\n"; }

// ── TOTP, написан наново тук (независим от кода под тест) ─────────────────────
function t_b32dec(string $s): string {
    $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $s = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s));
    $bits = ''; foreach (str_split($s) as $ch) $bits .= str_pad(decbin(strpos($a, $ch)), 5, '0', STR_PAD_LEFT);
    $out = ''; foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $out .= chr(bindec($b));
    return $out;
}
function t_totp(string $b32, int $step): string {
    $h = hash_hmac('sha1', pack('N2', 0, $step), t_b32dec($b32), true);
    $o = ord($h[19]) & 0xf;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}

// ── командата cs-admin, подавана като от терминал (без TTY: редовете идват от stdin) ──
/** @param callable|null $react  получава натрупания изход и връща ред за stdin или null */
function cli(array $args, array $lines, ?callable $react = null, int $timeout = 30, array $env = []): array {
    global $ROOT, $ENV;
    $cmd = array_merge([PHP_BINARY, $ROOT . '/server/cs-admin.php'], $args);
    $e = $ENV; foreach ($env as $k => $v) { if ($v === null) unset($e[$k]); else $e[$k] = $v; }
    $p = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $ROOT, $e);
    stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
    foreach ($lines as $l) fwrite($pipes[0], $l . "\n");
    $out = ''; $err = ''; $t0 = microtime(true); $reacted = false;
    while (true) {
        $out .= (string)stream_get_contents($pipes[1]); $err .= (string)stream_get_contents($pipes[2]);
        if ($react && !$reacted) { $r = $react($out); if ($r !== null) { foreach ((array)$r as $l) fwrite($pipes[0], $l . "\n"); $reacted = true; fclose($pipes[0]); } }
        $st = proc_get_status($p);
        if (!$st['running']) { $out .= (string)stream_get_contents($pipes[1]); $err .= (string)stream_get_contents($pipes[2]); break; }
        if (microtime(true) - $t0 > $timeout) { proc_terminate($p); break; }
        usleep(20000);
    }
    if (!$reacted && is_resource($pipes[0])) @fclose($pipes[0]);
    $code = $st['exitcode'] ?? -1;
    proc_close($p);
    return [$code, $out, $err];
}
function parse_secret(string $out): ?string {
    return preg_match('/Ключ за ръчно въвеждане:\s*([A-Z2-7 ]{16,})/u', $out, $m) ? str_replace(' ', '', trim($m[1])) : null;
}
function parse_recovery(string $out): array {
    preg_match_all('/^\s*\d+\.\s+([a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})\s*$/m', $out, $m);
    return $m[1];
}

// ── вграденият сървър на PHP ──────────────────────────────────────────────────
$PORT = 0;
$SERVER = null;
function server_start(): void {
    global $SERVER, $PORT, $WEB, $ENV;
    $s = stream_socket_server('tcp://127.0.0.1:0'); $PORT = (int)explode(':', stream_socket_get_name($s, false))[1]; fclose($s);
    $SERVER = proc_open([PHP_BINARY, '-S', "127.0.0.1:$PORT", '-t', $WEB], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pp, $WEB, $ENV);
    for ($i = 0; $i < 100; $i++) { $c = @fsockopen('127.0.0.1', $PORT); if ($c) { fclose($c); return; } usleep(50000); }
    fwrite(STDERR, "сървърът не тръгна\n"); exit(2);
}
function server_stop(): void { global $SERVER; if ($SERVER) { proc_terminate($SERVER); proc_close($SERVER); } }
register_shutdown_function(function () { global $TMP; server_stop(); exec('rm -rf ' . escapeshellarg($TMP)); });

/** @return array{0:int,1:array,2:string,3:mixed} статус, заглавни редове, тяло, JSON */
function http(string $method, string $path, array $headers = [], $body = null): array {
    global $PORT;
    $h = array_merge(['Connection: close'], $headers);
    if (is_array($body)) { $body = json_encode($body); $h[] = 'Content-Type: application/json'; }
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $h), 'content' => $body ?? '', 'ignore_errors' => true, 'timeout' => 20]]);
    $resp = @file_get_contents("http://127.0.0.1:$PORT$path", false, $ctx);
    $hdrs = $http_response_header ?? [];
    $status = preg_match('#^HTTP/\S+\s+(\d+)#', $hdrs[0] ?? '', $m) ? (int)$m[1] : 0;
    return [$status, $hdrs, (string)$resp, json_decode((string)$resp, true)];
}
function cookie_from(array $hdrs): ?string {
    foreach ($hdrs as $l) if (preg_match('/^Set-Cookie:\s*__Host-cs_admin=([^;]*)/i', $l, $m)) return $m[1];
    return null;
}
function set_cookie_line(array $hdrs): string {
    foreach ($hdrs as $l) if (stripos($l, 'Set-Cookie: __Host-cs_admin=') === 0) return $l;
    return '';
}
const A = 'X-CS-Admin: 1';
function login(string $email, string $pw): array { return http('POST', '/api/admin-auth.php?action=login', [A], ['email' => $email, 'password' => $pw]); }
function verify(string $ch, string $code): array { return http('POST', '/api/admin-auth.php?action=verify', [A], ['challenge' => $ch, 'code' => $code]); }
function me(?string $cookie): array { return http('GET', '/api/admin-auth.php?action=me', $cookie ? ["Cookie: __Host-cs_admin=$cookie"] : []); }
function reset_throttle(): void { global $LOGS; @unlink("$LOGS/auth_throttle.json"); }
function json_file(string $f): array { $d = json_decode((string)@file_get_contents($f), true); return is_array($d) ? $d : []; }
function step_now(): int { return intdiv(time(), 30); }
/** Сурова GET заявка: връща [статус, отворения сокет] — за поток, който не свършва сам (SSE). */
function raw_open(string $path, array $headers = []) {
    global $PORT;
    $fp = @fsockopen('127.0.0.1', $PORT, $en, $es, 5);
    if (!$fp) return [0, null];
    fwrite($fp, "GET $path HTTP/1.1\r\nHost: 127.0.0.1:$PORT\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers)) . "Connection: close\r\n\r\n");
    stream_set_timeout($fp, 5);
    $line = (string)fgets($fp);
    return [preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m) ? (int)$m[1] : 0, $fp];
}
/** Чете до края на потока или до $sec секунди; връща [прочетеното, свърши ли]. */
function raw_drain($fp, int $sec): array {
    $buf = ''; $t0 = microtime(true);
    stream_set_blocking($fp, false);
    while (microtime(true) - $t0 < $sec) {
        $chunk = fread($fp, 8192);
        if ($chunk !== false && $chunk !== '') $buf .= $chunk;
        if (feof($fp)) { fclose($fp); return [$buf, true]; }
        usleep(50000);
    }
    fclose($fp);
    return [$buf, false];
}
/** Паралелни POST заявки за вход (curl_multi) — броят отговорите по статус. */
function parallel_logins(int $n, string $email): array {
    global $PORT;
    $mh = curl_multi_init(); $hs = [];
    for ($i = 0; $i < $n; $i++) {
        $h = curl_init("http://127.0.0.1:$PORT/api/admin-auth.php?action=login");
        curl_setopt_array($h, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30, CURLOPT_PROXY => '',
            CURLOPT_HTTPHEADER => [A, 'Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['email' => $email, 'password' => "паралелна-грешна-$i"])]);
        curl_multi_add_handle($mh, $h); $hs[] = $h;
    }
    do { curl_multi_exec($mh, $run); curl_multi_select($mh, 0.2); } while ($run > 0);
    $count = [];
    foreach ($hs as $h) { $c = (int)curl_getinfo($h, CURLINFO_RESPONSE_CODE); $count[$c] = ($count[$c] ?? 0) + 1; curl_multi_remove_handle($mh, $h); curl_close($h); }
    curl_multi_close($mh);
    ksort($count);
    return $count;
}
function sign_in(string $email, string $pw, string $code): string {
    [, , , $j] = login($email, $pw);
    [, $h] = verify((string)($j['challenge'] ?? ''), $code);
    return (string)cookie_from($h);
}

// ══════════════════════════════════════════════════════════════════════════════
section('К11 · cs-admin setup');
[$c] = cli(['setup'], ['kratka', 'kratka']);
ok($c !== 0 && !file_exists($CRED), 'парола под 14 знака → отказ, нищо не е записано');
[$c] = cli(['setup'], [$PASS, $PASS . 'x']);
ok($c !== 0 && !file_exists($CRED), 'двете въвеждания не съвпадат → отказ, нищо не е записано');
[$c, $o] = cli(['setup'], [$PASS, $PASS], function ($o) { return strpos($o, 'Код от приложението') !== false ? ['000000', '111111', '222222'] : null; });
ok($c !== 0 && !file_exists($CRED), 'три грешни кода при настройката → отказ, нищо не е записано');

$SECRET = null;
[$c, $o, $e] = cli(['setup'], [$PASS, $PASS], function ($o) use (&$SECRET) {
    if (strpos($o, 'Код от приложението') === false) return null;
    $SECRET = parse_secret($o);
    return $SECRET ? [t_totp($SECRET, step_now())] : ['x'];
});
$RECOVERY = parse_recovery($o);
ok($c === 0 && is_file($CRED), 'вярна парола и верен код → данните са записани' . ($c !== 0 ? " (изход $c: " . trim($e . $o) . ')' : ''));
ok(is_string($SECRET) && strlen($SECRET) >= 32, 'показва ключ за приложението (≥ 160 бита)');
ok(strpos($o, 'otpauth://totp/') !== false, 'показва и адрес otpauth:// за QR кода');
ok(count($RECOVERY) === 10 && count(array_unique($RECOVERY)) === 10, 'показва 10 различни резервни кода');
$perm = is_file($CRED) ? (fileperms($CRED) & 0777) : 0777;
ok(($perm & 0007) === 0 && in_array($perm, [0640, 0600], true), 'файлът не е достъпен за всички (' . decoct($perm) . ')');
$raw = (string)@file_get_contents($CRED);
ok($raw !== '' && strpos($raw, $PASS) === false && strpos($raw, $RECOVERY[0] ?? '§') === false && strpos($raw, str_replace('-', '', $RECOVERY[0] ?? '§')) === false,
   'във файла няма паролата и резервните кодове в чист вид');
$cred = json_file($CRED);
ok(($cred['email'] ?? '') === $EMAIL, 'имейлът по подразбиране е admin@carbonstealth.eu');
ok(isset($cred['password_hash']) && password_get_info($cred['password_hash'])['algo'] !== null && password_get_info($cred['password_hash'])['algo'] !== 0,
   'паролата е пазена като хеш (' . (password_get_info($cred['password_hash'] ?? '')['algoName'] ?? '?') . ')');
[$c, $o] = cli(['status'], []);
ok($c === 0 && strpos($o, $EMAIL) !== false && strpos($o, (string)$SECRET) === false && strpos($o, '$argon2') === false && strpos($o, '$2y$') === false,
   'status показва имейла, без тайни');

// ══════════════════════════════════════════════════════════════════════════════
server_start();

section('К13 · библиотеката не е входна точка');
[$s, , $b] = http('GET', '/api/_admin.php');
ok($s === 404 && trim($b) === '', 'GET /api/_admin.php → 404 без съдържание');

section('К1 · вход с имейл и парола');
reset_throttle();
[$s1, , , $j1] = login($EMAIL, 'грешна-парола-1234567');
[$s2, , , $j2] = login('someone@example.com', $PASS);
ok($s1 === 401 && ($j1['error'] ?? '') === 'invalid_credentials', 'грешна парола → 401 invalid_credentials');
ok($s2 === 401 && $j2 == $j1, 'грешен имейл → същият отговор като при грешна парола');
[$s, $h, , $j] = login('  ADMIN@carbonstealth.eu ', $PASS);
ok($s === 200 && ($j['step'] ?? '') === 'totp' && preg_match('/^[0-9a-f]{64}$/', (string)($j['challenge'] ?? '')), 'верни данни → иска се код (стъпка totp), имейлът без значение от главни букви и интервали');
ok(cookie_from($h) === null, 'след паролата още няма сесия');
$CH = (string)($j['challenge'] ?? '');

section('К8, К3 · кодът от приложението и бисквитката');
[$s, , , $j] = verify($CH, '000000' === t_totp((string)$SECRET, step_now()) ? '111111' : '000000');
ok($s === 401 && ($j['error'] ?? '') === 'invalid_code', 'грешен код → 401 invalid_code');
$STEP = step_now();
[$s, $h, , $j] = verify($CH, t_totp((string)$SECRET, $STEP));
$COOKIE = cookie_from($h);
$line = set_cookie_line($h);
ok($s === 200 && ($j['email'] ?? '') === $EMAIL && $COOKIE !== null && strlen($COOKIE) >= 40, 'верен код → 200 и сесия');
ok(stripos($line, 'HttpOnly') !== false && stripos($line, 'Secure') !== false && stripos($line, 'SameSite=Strict') !== false && stripos($line, 'Path=/') !== false
   && stripos($line, 'Domain=') === false, 'бисквитката е HttpOnly, Secure, SameSite=Strict, Path=/, без Domain');
$sess = json_file("$LOGS/admin_sessions.json");
ok($COOKIE !== null && isset($sess[hash('sha256', $COOKIE)]) && strpos((string)@file_get_contents("$LOGS/admin_sessions.json"), (string)$COOKIE) === false,
   'на сървъра е само SHA-256 на бисквитката');
[$s] = verify($CH, t_totp((string)$SECRET, $STEP));
ok($s === 401, 'К10: същото предизвикателство не става втори път');

section('К4 · кой има достъп до админ крайните точки');
[$s, , , $j] = me($COOKIE);
ok($s === 200 && ($j['email'] ?? '') === $EMAIL, 'me с бисквитката → 200');
[$s] = me(null);
ok($s === 401, 'me без бисквитка → 401');
[$s, , , $j] = http('GET', '/api/admin-data.php?action=get&key=tasks', ["Cookie: __Host-cs_admin=$COOKIE", A]);
ok($s === 200 && ($j['ok'] ?? false) === true, 'admin-data с бисквитката → 200');
[$s] = http('GET', '/api/admin-data.php?action=get&key=tasks');
ok($s === 401, 'admin-data без бисквитка → 401');
[$s] = http('GET', '/api/admin-data.php?action=get&key=tasks', ['X-CS-Token: old-token-should-never-work-0123456789', A]);
ok($s === 401, 'старият X-CS-Token вече не дава достъп (дори CS_ADMIN_TOKEN да е зададен)');
[$s] = http('GET', '/api/admin-data.php?action=get&key=tasks', ['Cookie: __Host-cs_admin=' . str_repeat('A', 43), A]);
ok($s === 401, 'измислена бисквитка → 401');

section('К6 · заявки, които променят нещо');
[$s, , , $j] = http('POST', '/api/admin-data.php?action=set&key=tasks', ["Cookie: __Host-cs_admin=$COOKIE"], [['t' => 'x']]);
ok($s === 403 && ($j['error'] ?? '') === 'csrf', 'POST без X-CS-Admin → 403 csrf');
[$s, , , $j] = http('POST', '/api/admin-data.php?action=set&key=tasks', ["Cookie: __Host-cs_admin=$COOKIE", A], [['t' => 'x']]);
ok($s === 200 && ($j['ok'] ?? false) === true, 'POST с X-CS-Admin и сесия → 200');
[$s] = http('POST', '/api/admin-auth.php?action=login', [], ['email' => $EMAIL, 'password' => $PASS]);
ok($s === 403, 'вход без X-CS-Admin → 403');
[$s] = http('POST', '/api/admin-auth.php?action=login', [A, 'Origin: https://evil.example'], ['email' => $EMAIL, 'password' => $PASS]);
ok($s === 403, 'вход от чужд Origin → 403');
[$s] = http('GET', '/api/admin-auth.php?action=login');
ok($s === 405 || $s === 403, 'вход с GET → отказ');
[$s, , , $j] = http('GET', '/api/admin-data.php?action=get&key=tasks', ["Cookie: __Host-cs_admin=$COOKIE"]);
ok($s === 403 && ($j['error'] ?? '') === 'csrf', 'GET с бисквитка, но без X-CS-Admin → 403 (поддомейн не може да го задейства)');
[$s] = http('GET', '/api/indexnow.php?action=bulk', ["Cookie: __Host-cs_admin=$COOKIE"]);
ok($s === 403, 'GET indexnow bulk само с бисквитката → 403');
[$s] = http('GET', '/api/monitor.php');
ok($s === 401, 'без бисквитка и без заглавен ред → 401 (проверката при деплой)');

section('К8 · повторно използване на код');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS);
[$s] = verify((string)($j['challenge'] ?? ''), t_totp((string)$SECRET, $STEP));
ok($s === 401, 'вече използваният код не става повторно');
[, , , $j] = login($EMAIL, $PASS);
[$s, $h] = verify((string)($j['challenge'] ?? ''), t_totp((string)$SECRET, $STEP + 1));
$COOKIE2 = cookie_from($h);
ok($s === 200 && $COOKIE2 !== null, 'кодът за следващата стъпка (±1) се приема');

section('К9 · резервни кодове');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS);
[$s, $h] = verify((string)($j['challenge'] ?? ''), strtoupper((string)($RECOVERY[0] ?? '')));
ok($s === 200 && cookie_from($h) !== null, 'резервен код (без значение от главни букви) → вход');
[, , , $j] = login($EMAIL, $PASS);
[$s] = verify((string)($j['challenge'] ?? ''), (string)($RECOVERY[0] ?? ''));
ok($s === 401, 'същият резервен код не става втори път');
[, , , $j] = login($EMAIL, $PASS);
[$s] = verify((string)($j['challenge'] ?? ''), str_replace('-', '', (string)($RECOVERY[1] ?? '')));
ok($s === 200, 'друг резервен код без тиретата → вход');

section('К10 · предизвикателството изтича');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS);
$st = json_file("$LOGS/admin_state.json");
foreach (($st['challenges'] ?? []) as $k => $v) $st['challenges'][$k]['exp'] = time() - 1;
file_put_contents("$LOGS/admin_state.json", json_encode($st));
[$s, , , $jj] = verify((string)($j['challenge'] ?? ''), t_totp((string)$SECRET, step_now() + 1));
ok($s === 401 && ($jj['error'] ?? '') === 'challenge_expired', 'след 5 минути → 401 challenge_expired');

section('К5 · изтичане и изход');
$sf = "$LOGS/admin_sessions.json";
$sess = json_file($sf); $k = hash('sha256', (string)$COOKIE2);
$sess[$k]['last_seen'] = time() - 1801; file_put_contents($sf, json_encode($sess));
[$s] = me($COOKIE2);
ok($s === 401, '30 минути бездействие → сесията е изтекла');
$sess = json_file($sf); $k = hash('sha256', (string)$COOKIE);
$sess[$k]['created'] = time() - 8 * 3600 - 1; $sess[$k]['last_seen'] = time(); file_put_contents($sf, json_encode($sess));
[$s] = me($COOKIE);
ok($s === 401, 'над 8 часа от входа → сесията е изтекла, дори да е активна');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS);
[, $h] = verify((string)($j['challenge'] ?? ''), (string)($RECOVERY[2] ?? ''));
$C3 = (string)cookie_from($h);
[$s, $h] = http('POST', '/api/admin-auth.php?action=logout', ["Cookie: __Host-cs_admin=$C3", A]);
ok($s === 200 && stripos(set_cookie_line($h), 'Max-Age=0') !== false, 'изход → 200 и бисквитката се трие');
[$s] = me($C3);
ok($s === 401, 'след изход старата бисквитка не става');

section('К5 · „Излез от всички устройства“ от панела');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS);
[, $h] = verify((string)($j['challenge'] ?? ''), (string)($RECOVERY[6] ?? ''));
$CA = (string)cookie_from($h);
[, , , $j] = login($EMAIL, $PASS);
[, $h] = verify((string)($j['challenge'] ?? ''), (string)($RECOVERY[7] ?? ''));
$CB = (string)cookie_from($h);
[$s] = http('POST', '/api/admin-auth.php?action=logout_all', ["Cookie: __Host-cs_admin=$CA"]);
ok($s === 403, 'без X-CS-Admin → 403');
[$s] = http('POST', '/api/admin-auth.php?action=logout_all', [A]);
ok($s === 401, 'без сесия → 401');
[$s] = http('POST', '/api/admin-auth.php?action=logout_all', ["Cookie: __Host-cs_admin=$CA", A]);
[$sa] = me($CA); [$sb] = me($CB);
ok($s === 200 && $sa === 401 && $sb === 401, 'с сесия → всички сесии (и на другото устройство) са изписани');

section('К12 · cs-admin revoke / password / recovery');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS);
[, $h] = verify((string)($j['challenge'] ?? ''), (string)($RECOVERY[3] ?? ''));
$C4 = (string)cookie_from($h);
[$c] = cli(['revoke'], []);
[$s] = me($C4);
ok($c === 0 && $s === 401, 'revoke изписва всички сесии');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS);
[, $h] = verify((string)($j['challenge'] ?? ''), (string)($RECOVERY[4] ?? ''));
$C5 = (string)cookie_from($h);
$SECRET_BEFORE = (string)(json_file($CRED)['totp_secret'] ?? '');
$REC_BEFORE = json_file($CRED)['recovery'] ?? [];
[$c] = cli(['password'], [$PASS2, $PASS2]);
[$cs] = cli(['password'], ['kratka', 'kratka']);
ok($cs !== 0 && (json_file($CRED)['password_hash'] ?? '') !== '' && password_verify($PASS2, (string)json_file($CRED)['password_hash']), 'password с кратка парола → отказ, остава последната вярна');
[$s] = me($C5);
ok($c === 0 && $s === 401, 'password сменя паролата и изписва всички сесии');
reset_throttle();
[$s] = login($EMAIL, $PASS);
ok($s === 401, 'старата парола вече не става');
[$s, , , $j] = login($EMAIL, $PASS2);
ok($s === 200 && ($j['step'] ?? '') === 'totp', 'новата парола става, кодът от приложението е същият');
$cj = json_file($CRED);
ok($SECRET_BEFORE !== '' && ($cj['totp_secret'] ?? '') === $SECRET_BEFORE && ($cj['recovery'] ?? null) === $REC_BEFORE, 'ключът за приложението и резервните кодове са запазени при смяната');
[$c, $o] = cli(['recovery'], []);
$NEWREC = parse_recovery($o);
ok($c === 0 && count($NEWREC) === 10, 'recovery показва 10 нови кода');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS2);
[$s] = verify((string)($j['challenge'] ?? ''), (string)($RECOVERY[5] ?? ''));
ok($s === 401, 'старите резервни кодове вече не стават');
[$s] = verify((string)($j['challenge'] ?? ''), (string)($NEWREC[0] ?? ''));
ok($s === 200, 'новите резервни кодове стават');

section('К15 · потокът със запитванията е вързан за сесията');
reset_throttle();
$CS = sign_in($EMAIL, $PASS2, (string)($NEWREC[1] ?? ''));
[$s, , , $j] = http('GET', '/api/sse-ticket.php', ["Cookie: __Host-cs_admin=$CS", A]);
$TK = (string)($j['ticket'] ?? '');
ok($s === 200 && $TK !== '', 'билет за потока със сесия → 200');
[$s, $fp] = raw_open('/api/sse-leads.php?ticket=' . $TK);
ok($s === 200, 'потокът се отваря с билета');
[$c] = cli(['revoke'], []);
[$buf, $closed] = $fp ? raw_drain($fp, 10) : ['', false];
ok($c === 0 && $closed && strpos($buf, 'revoked') !== false, 'след revoke отвореният поток се затваря (event: revoked)');
[$s, $fp] = raw_open('/api/sse-leads.php?ticket=' . $TK); if ($fp) fclose($fp);
ok($s === 401, 'след revoke билетът → 401');
reset_throttle();
$CS = sign_in($EMAIL, $PASS2, (string)($NEWREC[2] ?? ''));
[, , , $j] = http('GET', '/api/sse-ticket.php', ["Cookie: __Host-cs_admin=$CS", A]);
$TK = (string)($j['ticket'] ?? '');
http('POST', '/api/admin-auth.php?action=logout', ["Cookie: __Host-cs_admin=$CS", A]);
[$s, $fp] = raw_open('/api/sse-leads.php?ticket=' . $TK); if ($fp) fclose($fp);
ok($TK !== '' && $s === 401, 'след „Изход“ билетът → 401');

section('К14 · изгубено или повредено състояние');
$SF = "$LOGS/admin_state.json";
reset_throttle();
ok(sign_in($EMAIL, $PASS2, (string)($NEWREC[3] ?? '')) !== '', 'резервен код → вход (преди повредата)');
file_put_contents($SF, '{"chal');                       // отрязан запис (пълен диск, срив)
reset_throttle();
[, , , $j] = login($EMAIL, $PASS2);
[$s] = verify((string)($j['challenge'] ?? ''), (string)($NEWREC[3] ?? ''));
ok($s === 401, 'повредено състояние: използваният резервен код НЕ става отново');
[$s] = verify((string)($j['challenge'] ?? ''), (string)($NEWREC[4] ?? ''));
ok($s === 401, 'повредено състояние: и неизползваните резервни кодове са спрени');
[$s] = verify((string)($j['challenge'] ?? ''), t_totp((string)$SECRET, step_now()));
ok($s === 200, 'кодът от приложението продължава да работи');
@unlink($SF);                                            // миграция без api/logs
reset_throttle();
[, , , $j] = login($EMAIL, $PASS2);
[$s] = verify((string)($j['challenge'] ?? ''), (string)($NEWREC[5] ?? ''));
ok($s === 401, 'липсващо състояние: резервните кодове са спрени');
[$c, $o] = cli(['status'], []);
ok($c === 0 && strpos($o, 'cs-admin recovery') !== false, 'status казва да се пусне cs-admin recovery');
[$c, $o] = cli(['recovery'], []);
$REC3 = parse_recovery($o);
reset_throttle();
ok($c === 0 && sign_in($EMAIL, $PASS2, (string)($REC3[0] ?? '')) !== '', 'след cs-admin recovery новите кодове работят');
[$c] = cli(['password'], [$PASS2, $PASS2]);
reset_throttle();
[, , , $j] = login($EMAIL, $PASS2);
[$s] = verify((string)($j['challenge'] ?? ''), (string)($REC3[0] ?? ''));
ok($c === 0 && $s === 401, 'смяната на паролата пази отбелязаните като използвани');
$st = json_decode((string)@file_get_contents($SF), true);
ok((glob("$LOGS/*.tmp") ?: []) === [] && (glob("$LOGS/.*.tmp") ?: []) === [] && is_array($st), 'състоянието е валиден JSON, без остатъчни временни файлове');

section('К16 · cs-admin и PHP-FPM ползват едни и същи папки');
$POOLD = $TMP . '/pool'; @mkdir($POOLD, 0755, true);
file_put_contents("$POOLD/www.conf", "[www]\nenv[CS_LOG_DIR] = $TMP/other-logs\n");
[$c, $o, $e] = cli(['revoke'], [], null, 30, ['CS_FPM_POOL_GLOB' => "$POOLD/*.conf"]);
ok($c !== 0 && strpos($e . $o, 'CS_LOG_DIR') !== false, 'pool-ът ползва друга папка → revoke отказва, вместо да изпише грешната');
file_put_contents("$POOLD/www.conf", "[www]\nenv[CS_LOG_DIR] = $LOGS\nenv[CS_ADMIN_CREDENTIALS] = \"$CRED\"\n");
reset_throttle();
$C = sign_in($EMAIL, $PASS2, (string)($REC3[1] ?? ''));
[$c] = cli(['revoke'], [], null, 30, ['CS_FPM_POOL_GLOB' => "$POOLD/*.conf", 'CS_LOG_DIR' => null, 'CS_ADMIN_CREDENTIALS' => null]);
[$s] = me($C);
ok($c === 0 && $C !== '' && $s === 401, 'без изрични променливи cs-admin взема папките от pool-а и изписва истинските сесии');

section('К7 · налучкване');
reset_throttle();
for ($i = 0; $i < 5; $i++) login($EMAIL, "грешна-парола-номер-$i");
[$s, $h, , $j] = login($EMAIL, $PASS2);
$ra = 0; foreach ($h as $l) if (preg_match('/^Retry-After:\s*(\d+)/i', $l, $m)) $ra = (int)$m[1];
ok($s === 429 && ($j['error'] ?? '') === 'too_many_attempts' && $ra > 0, 'след 5 грешни опита → 429 с Retry-After, дори с верните данни');
reset_throttle();
[, , , $j] = login($EMAIL, $PASS2);
for ($i = 0; $i < 5; $i++) verify((string)($j['challenge'] ?? ''), sprintf('%06d', $i));
[$s] = verify((string)($j['challenge'] ?? ''), t_totp((string)$SECRET, step_now() + 1));
ok($s === 429 || $s === 401, 'грешните кодове също се броят за налучкване');
reset_throttle();
if (function_exists('curl_multi_init')) {
    $cnt = parallel_logins(12, $EMAIL);
    ok(($cnt[401] ?? 0) <= 5 && ($cnt[401] ?? 0) + ($cnt[429] ?? 0) === 12, 'паралелни опити: най-много 5 проверки, останалите 429 (' . json_encode($cnt) . ')');
} else {
    echo "  – ПРОПУСНАТО: паралелните опити (няма разширение curl)\n";
}

section('К2 · без настройка няма вход');
reset_throttle();
rename($CRED, $CRED . '.bak');
[$s] = login($EMAIL, $PASS2);
ok($s === 401, 'без файл с данни → 401 и за верните данни');
rename($CRED . '.bak', $CRED);

section('К8 · RFC 6238 (библиотеката)');
putenv('CS_LOG_DIR=' . $LOGS);
require $ROOT . '/api/_auth.php';
$rfc = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // „12345678901234567890“
$vec = [59 => '287082', 1111111109 => '081804', 1111111111 => '050471', 1234567890 => '005924', 2000000000 => '279037', 20000000000 => '353130'];
$all = true; foreach ($vec as $t => $want) if (!function_exists('cs_totp_code') || cs_totp_code($rfc, intdiv($t, 30)) !== $want) $all = false;
ok($all, 'кодовете съвпадат с примерите от RFC 6238');

echo "\n" . ($fail === 0 ? "ВСИЧКО МИНАВА" : "ПАДАТ: $fail") . " · минават $pass\n";
exit($fail === 0 ? 0 : 1);
