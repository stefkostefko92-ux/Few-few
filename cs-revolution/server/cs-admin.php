#!/usr/bin/env php
<?php
/**
 * cs-admin — входът в админ панела на carbonstealth.eu, само от терминала на сървъра.
 *
 *   sudo cs-admin setup      първа настройка: парола (два пъти, скрито) + приложение за кодове + резервни кодове
 *   sudo cs-admin password   нова парола (кодът от приложението остава), изписва всички сесии
 *   sudo cs-admin recovery   10 нови резервни кода (старите спират да важат)
 *   sudo cs-admin revoke     изписва всички сесии (напр. при изгубен телефон или лаптоп)
 *   sudo cs-admin status     какво е настроено — без тайни
 *
 * deploy-all.sh го слага в /usr/local/lib/cs-admin/ заедно с api/_auth.php и api/_admin.php и прави
 * /usr/local/sbin/cs-admin. Паролата никога не минава през аргументи, история или лог: чете се от
 * терминала без ехо. Данните за вход се пишат атомарно, root:www-data 0640 (уебът само ги чете).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

// ── същите папки като PHP-FPM ────────────────────────────────────────────────────
// sudo чисти средата, а pool-ът на PHP-FPM може да задава CS_LOG_DIR / CS_ADMIN_CREDENTIALS. Ако
// командата ползва други пътища, revoke „изписва“ празна папка и казва „готово“. Затова: взимаме
// стойността от pool-а; при разминаване с изрично зададената или между pool-овете — отказ.
function pool_env(string $name): array {
    $vals = [];
    foreach (glob((string)(getenv('CS_FPM_POOL_GLOB') ?: '/etc/php/*/fpm/pool.d/www.conf')) ?: [] as $f) {
        $t = @file_get_contents($f);
        if (!is_string($t)) continue;
        if (preg_match_all('/^[ \t]*env\[' . preg_quote($name, '/') . '\][ \t]*=[ \t]*"?([^"\r\n]*?)"?[ \t]*$/m', $t, $m)) {
            foreach ($m[1] as $v) if (trim($v) !== '') $vals[$f] = rtrim(trim($v), '/');
        }
    }
    return $vals;
}
foreach (['CS_LOG_DIR', 'CS_ADMIN_CREDENTIALS'] as $name) {
    $explicit = getenv($name);
    $explicit = (is_string($explicit) && $explicit !== '') ? rtrim($explicit, '/') : null;
    $pool = pool_env($name);
    $distinct = array_values(array_unique($pool));
    if (count($distinct) > 1) {
        fwrite(STDERR, "✗ pool-овете на PHP-FPM задават различни $name (" . implode(', ', array_map(fn($f, $v) => "$f: $v", array_keys($pool), $pool))
            . ") — пусни командата с изрично зададена: sudo env $name=<път> cs-admin …\n");
        exit(4);
    }
    if (count($distinct) === 1) {
        if ($explicit !== null && $explicit !== $distinct[0]) {
            fwrite(STDERR, "✗ $name тук е $explicit, а PHP-FPM ползва {$distinct[0]} — нищо не е направено (иначе ще пипна грешните файлове)\n");
            exit(4);
        }
        putenv("$name=" . $distinct[0]);
    }
}
if (!getenv('CS_LOG_DIR')) {
    // по подразбиране — папката, която ползва PHP-FPM в сайта (api/logs), за да се изписват истинските сесии
    putenv('CS_LOG_DIR=' . rtrim((string)(getenv('CS_WEBROOT') ?: '/var/www/carbonstealth.eu'), '/') . '/api/logs');
}
if (!is_dir((string)getenv('CS_LOG_DIR'))) {
    fwrite(STDERR, '✗ папката за състоянието ' . getenv('CS_LOG_DIR') . " я няма — първо деплой на сайта (deploy-all.sh)\n");
    exit(4);
}

// ── библиотеката: до командата (инсталирана) или в api/ (от репото) ─────────────
$lib = is_file(__DIR__ . '/_admin.php') ? __DIR__ : dirname(__DIR__) . '/api';
require $lib . '/_auth.php';

const MIN_LEN = 14;
const DEFAULT_EMAIL = 'admin@carbonstealth.eu';

function say(string $s = ''): void { fwrite(STDOUT, $s . "\n"); }
function fail(string $s, int $code = 1): void { fwrite(STDERR, "✗ $s\n"); exit($code); }

function ask(string $prompt, bool $hidden = false): string {
    fwrite(STDOUT, $prompt);
    $tty = function_exists('stream_isatty') && stream_isatty(STDIN);
    if ($hidden && $tty) shell_exec('stty -echo 2>/dev/null');
    $line = fgets(STDIN);
    if ($hidden && $tty) { shell_exec('stty echo 2>/dev/null'); fwrite(STDOUT, "\n"); }
    if ($line === false) fail('няма вход от терминала');
    return rtrim($line, "\r\n");
}

function ask_new_password(string $email): string {
    $p1 = ask('Нова парола (поне ' . MIN_LEN . ' знака, не се вижда докато пишеш): ', true);
    $p2 = ask('Още веднъж: ', true);
    if (!hash_equals($p1, $p2)) fail('двете въвеждания не съвпадат — нищо не е променено');
    $n = mb_strlen($p1, 'UTF-8');
    if ($n < MIN_LEN) fail('паролата е под ' . MIN_LEN . ' знака — нищо не е променено');
    if (strlen($p1) > 1024) fail('паролата е твърде дълга — нищо не е променено');
    if (cs_admin_norm_email($p1) === cs_admin_norm_email($email)) fail('паролата не може да е имейлът — нищо не е променено');
    if (count(array_unique(preg_split('//u', $p1, -1, PREG_SPLIT_NO_EMPTY))) < 5) fail('паролата е твърде проста (под 5 различни знака) — нищо не е променено');
    return $p1;
}

function write_credentials(array $c): void {
    $path = cs_admin_credentials_path();
    $dir  = dirname($path);
    $root = function_exists('posix_geteuid') && posix_geteuid() === 0;
    $grp  = ($root && function_exists('posix_getgrnam')) ? posix_getgrnam('www-data') : false;
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0750, true)) fail("не мога да създам $dir");
        if ($grp) @chgrp($dir, 'www-data');
    }
    $tmp = $dir . '/.admin.' . bin2hex(random_bytes(6)) . '.tmp';
    $old = umask(0077);
    $ok  = @file_put_contents($tmp, json_encode($c, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n", LOCK_EX);
    umask($old);
    if ($ok === false) { @unlink($tmp); fail("не мога да пиша в $dir"); }
    if ($grp) { @chgrp($tmp, 'www-data'); @chmod($tmp, 0640); } else { @chmod($tmp, 0600); }
    if (!@rename($tmp, $path)) { @unlink($tmp); fail("не мога да запиша $path"); }
    if (!$grp) say('  (не съм root или няма група www-data: файлът е 0600 — PHP-FPM трябва да може да го чете)');
}

function new_recovery(): array {
    $plain = []; $hashes = [];
    for ($i = 0; $i < 10; $i++) { $c = cs_recovery_new(); $plain[] = $c; $hashes[] = cs_admin_hash(cs_recovery_norm($c)); }
    return [$plain, $hashes];
}

function print_recovery(array $plain): void {
    say();
    say('Резервни кодове — всеки работи веднъж, вместо кода от приложението (напр. при изгубен телефон).');
    say('Запиши ги на сигурно място ИЗВЪН компютъра. Показват се само сега:');
    foreach ($plain as $i => $c) say(sprintf('  %2d. %s', $i + 1, $c));
    say();
}

function show_totp(string $email, string $secret): void {
    $label = rawurlencode('Carbon Stealth') . ':' . rawurlencode($email);
    $uri = "otpauth://totp/$label?secret=$secret&issuer=" . rawurlencode('Carbon Stealth') . '&algorithm=SHA1&digits=6&period=30';
    say();
    say('Приложение за кодове (Google Authenticator, Microsoft Authenticator, Authy, 1Password…):');
    say('  Добави акаунт → Сканирай QR кода. Ако няма QR — „Въведи ключ“ и препиши ключа отдолу.');
    $qr = trim((string)shell_exec('command -v qrencode 2>/dev/null'));
    if ($qr !== '') {
        $p = proc_open([$qr, '-t', 'ANSIUTF8', '-m', '2'], [0 => ['pipe', 'r'], 1 => STDOUT, 2 => ['file', '/dev/null', 'w']], $pipes);
        if (is_resource($p)) { fwrite($pipes[0], $uri); fclose($pipes[0]); proc_close($p); }
    } else {
        say('  (за QR в терминала: sudo apt install qrencode)');
    }
    say('Ключ за ръчно въвеждане: ' . trim(chunk_split($secret, 4, ' ')));
    say('Адрес (за QR от друго място): ' . $uri);
    say();
}

function confirm_totp(string $secret): void {
    for ($i = 0; $i < 3; $i++) {
        $code = preg_replace('/\s+/', '', ask('Код от приложението (6 цифри): '));
        if (cs_totp_match($secret, (string)$code, time()) >= 0) { say('  ✓ кодът е верен'); return; }
        say('  ✗ грешен код — провери часовника на телефона и опитай пак');
    }
    fail('три грешни кода — нищо не е записано');
}

function sessions_alive(): int {
    $s = json_decode((string)@file_get_contents(cs_admin_sessions_file()), true);
    if (!is_array($s)) return 0;
    $n = 0; foreach ($s as $v) if (is_array($v) && cs_admin_session_alive($v, time())) $n++;
    return $n;
}

$cmd  = $argv[1] ?? 'help';
$args = array_slice($argv, 2);
$opt  = static function (string $name) use ($args) { $i = array_search($name, $args, true); return $i === false ? null : ($args[$i + 1] ?? ''); };
$cred = cs_admin_load_credentials();

switch ($cmd) {
    case 'setup': {
        if ($cred !== null && !in_array('--force', $args, true)) {
            fail('входът вече е настроен (' . $cred['email'] . '). За нова парола: cs-admin password; за нови резервни кодове: cs-admin recovery; '
                . 'за изцяло нова настройка с нов ключ за приложението: cs-admin setup --force');
        }
        $email = cs_admin_norm_email((string)($opt('--email') ?? DEFAULT_EMAIL));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('невалиден имейл');
        say("Настройка на входа в админ панела на carbonstealth.eu за $email");
        $pw = ask_new_password($email);
        $secret = cs_totp_new_secret();
        show_totp($email, $secret);
        confirm_totp($secret);
        [$plain, $hashes] = new_recovery();
        $new = ['version' => 1, 'email' => $email, 'password_hash' => cs_admin_hash($pw), 'totp_secret' => $secret,
            'recovery' => $hashes, 'updated_at' => gmdate('c')];
        write_credentials($new);
        cs_admin_sessions_revoke_all();
        cs_admin_state_reset($new, true);    // котва за новите резервни кодове; нов ключ → нищо от стария
        print_recovery($plain);
        say('✓ Готово. Вход: https://carbonstealth.eu/admin/ — имейл, парола, после кода от приложението.');
        exit(0);
    }
    case 'password': {
        if ($cred === null) fail('входът още не е настроен: sudo cs-admin setup');
        say('Нова парола за ' . $cred['email'] . ' (кодът от приложението и резервните кодове остават).');
        $pw = ask_new_password((string)$cred['email']);
        $cred['password_hash'] = cs_admin_hash($pw);
        $cred['updated_at'] = gmdate('c');
        write_credentials($cred);
        cs_admin_sessions_revoke_all();
        say('✓ Паролата е сменена. Всички отворени сесии са изписани.');
        exit(0);
    }
    case 'recovery': {
        if ($cred === null) fail('входът още не е настроен: sudo cs-admin setup');
        [$plain, $hashes] = new_recovery();
        $cred['recovery'] = $hashes;
        $cred['updated_at'] = gmdate('c');
        write_credentials($cred);
        cs_admin_state_reset($cred, false);  // нова котва: новите кодове важат, старите — не
        print_recovery($plain);
        say('✓ Старите резервни кодове вече не важат.');
        exit(0);
    }
    case 'revoke': {
        cs_admin_sessions_revoke_all();
        say('✓ Всички сесии са изписани — всеки трябва да влезе наново.');
        exit(0);
    }
    case 'status': {
        say('Файл с данните за вход: ' . cs_admin_credentials_path());
        if ($cred === null) { say('  НЕ Е НАСТРОЕН — вход в панела няма. Настройка: sudo cs-admin setup'); exit(3); }
        $perm = substr(sprintf('%o', fileperms(cs_admin_credentials_path())), -4);
        say('  имейл: ' . $cred['email']);
        say('  последна промяна: ' . ($cred['updated_at'] ?? '?'));
        say('  права на файла: ' . $perm);
        if (cs_admin_recovery_active($cred)) {
            say('  неизползвани резервни кодове: ' . cs_admin_recovery_left($cred) . ' от ' . count($cred['recovery']));
        } else {
            say('  ! резервните кодове са СПРЕНИ: състоянието (' . cs_admin_state_file() . ') е изгубено или повредено,');
            say('    затова не се знае кои са използвани. Кодът от приложението работи. Нови кодове: sudo cs-admin recovery');
        }
        say('  активни сесии: ' . sessions_alive());
        exit(0);
    }
    default:
        say('cs-admin — входът в админ панела на carbonstealth.eu');
        say('  sudo cs-admin setup       първа настройка (парола + приложение за кодове + резервни кодове)');
        say('  sudo cs-admin password    нова парола (изписва всички сесии)');
        say('  sudo cs-admin recovery    нови резервни кодове');
        say('  sudo cs-admin revoke      изписва всички сесии');
        say('  sudo cs-admin status      какво е настроено, без тайни');
        exit($cmd === 'help' || $cmd === '--help' ? 0 : 2);
}
