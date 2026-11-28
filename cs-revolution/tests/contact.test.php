<?php
/**
 * Тестове на формата за контакт — ЯДРО (лични данни). B2B квалификация (доклад SEO/GEO/AEO, 22.11.2026, §9).
 *
 *   php tests/contact.test.php          (от cs-revolution/)
 *
 * Критерии за приемане:
 *  Ф1  Нови НЕЗАДЪЛЖИТЕЛНИ полета: company (до 200 знака), country ∈ {IT, BG, EU, WORLD},
 *      solution ∈ {web, ecommerce, erp, software, app, seo, other}, budget ∈ {lt5k, 5-15k, 15-50k, gt50k, tbd}.
 *      Стойност извън списъка → празно (не 400, за да не чупи стар клиент). HTML/тагове се махат.
 *  Ф2  Задължителните правила са непроменени: без име / с грешен имейл / без съобщение → 400.
 *  Ф3  Логът пази новите полета; ред в стария формат (6 полета) се чете както досега;
 *      „ | “, CR и LF в която и да е стойност не могат да създадат или да изместят поле/ред.
 *  Ф4  ?action=log (само с админ сесия) връща company, country, solution, budget (празни за стари редове).
 *  Ф5  Писмото до нас съдържа новите полета, екранирани (HTML); авто-отговорът към посетителя
 *      не съдържа нищо, написано от посетителя.
 *  Ф6  Библиотеката api/_contact.php не е входна точка (404 при пряка заявка).
 */
declare(strict_types=1);

$ROOT = dirname(__DIR__);
$TMP  = sys_get_temp_dir() . '/cs-contact-test-' . bin2hex(random_bytes(4));
$WEB  = $TMP . '/web';
$LOGS = $TMP . '/logs';
@mkdir($WEB . '/api', 0755, true);
@mkdir($LOGS, 0750, true);
foreach (glob($ROOT . '/api/*.php') as $f) copy($f, $WEB . '/api/' . basename($f));
$ENV = ['CS_LOG_DIR' => $LOGS, 'CS_ADMIN_CREDENTIALS' => $TMP . '/none.json', 'PATH' => getenv('PATH') ?: '/usr/bin:/bin'];

$pass = 0; $fail = 0;
function ok(bool $c, string $name): void { global $pass, $fail; if ($c) { $pass++; echo "  ✓ $name\n"; } else { $fail++; echo "  ✗ $name\n"; } }
function section(string $s): void { echo "\n$s\n"; }

// ── чистите функции ───────────────────────────────────────────────────────────
putenv('CS_LOG_DIR=' . $LOGS);
require $ROOT . '/api/_auth.php';
require $ROOT . '/api/_contact.php';

section('Ф1 · новите полета');
$f = cs_contact_fields(['name' => 'Ana', 'email' => 'a@b.it', 'message' => 'Ciao mondo', 'company' => '  <b>Acme</b> S.r.l. ',
    'country' => 'IT', 'solution' => 'erp', 'budget' => '15-50k']);
ok($f['company'] === 'Acme S.r.l.' && $f['country'] === 'IT' && $f['solution'] === 'erp' && $f['budget'] === '15-50k', 'валидните стойности минават, таговете се махат');
$f = cs_contact_fields(['name' => 'Ana', 'email' => 'a@b.it', 'message' => 'Ciao mondo', 'country' => 'Narnia', 'solution' => '<script>', 'budget' => '1M']);
ok($f['country'] === '' && $f['solution'] === '' && $f['budget'] === '', 'стойност извън списъка → празно');
$f = cs_contact_fields(['name' => 'Ana', 'email' => 'a@b.it', 'message' => 'Ciao mondo', 'company' => str_repeat('Я', 300)]);
ok(mb_strlen($f['company'], 'UTF-8') === 200, 'фирмата се реже до 200 знака (кирилицата не се чупи)');
$f = cs_contact_fields(['name' => 'Ana', 'email' => 'a@b.it', 'message' => 'Ciao mondo']);
ok($f['company'] === '' && $f['country'] === '' && $f['solution'] === '' && $f['budget'] === '', 'без новите полета → празни, без грешка');
ok(cs_contact_invalid(cs_contact_fields(['name' => 'Ana', 'email' => 'a@b.it', 'message' => 'Ciao mondo', 'solution' => 'bogus'])) === null, 'невалидно незадължително поле не е грешка');

section('Ф3 · логът');
$evil = ['name' => "Mal | lory\r\nX", 'email' => 'm@x.it', 'phone' => "1 | 2", 'message' => "a | b\nc", 'company' => "Co | rp\nFAKE | ROW",
    'country' => 'BG', 'solution' => 'web', 'budget' => 'tbd', 'lang' => 'BG'];
$line = cs_contact_log_line(cs_contact_fields($evil), '2026-11-22T10:00:00+00:00');
ok(substr_count($line, "\n") === 1 && str_ends_with($line, "\n"), 'един ред, каквото и да има в полетата');
$p = cs_contact_log_parse(rtrim($line, "\n"));
ok(is_array($p) && $p['company'] === 'Co / rp FAKE / ROW' && $p['country'] === 'BG' && $p['solution'] === 'web' && $p['budget'] === 'tbd', '„ | “ и новите редове не изместват полетата');
ok(is_array($p) && $p['name'] === 'Mal / lory X' && $p['email'] === 'm@x.it' && str_starts_with($p['message'], 'a / b c'), 'останалите полета са на мястото си');
$old = '2026-10-01T09:00:00+02:00 | Mario Rossi | mario@rossi.it | +39 333 | IT | Vorrei un sito per la mia officina';
$p = cs_contact_log_parse($old);
ok(is_array($p) && $p['name'] === 'Mario Rossi' && $p['message'] === 'Vorrei un sito per la mia officina' && $p['company'] === '' && $p['budget'] === '', 'стар ред (6 полета) се чете както досега, новите са празни');
ok(cs_contact_log_parse('боклук без разделители') === null, 'невалиден ред → null');
// стар ред отпреди 25.09.2026 (съобщението записано сурово, с много „ | “) не бива да се чете като нов формат
$raw = '2026-08-01T09:00:00+02:00 | Ana | ana@x.it | 123 | IT | a | b | __proto__ | c | d';
$p = cs_contact_log_parse($raw);
ok(is_array($p) && $p['message'] === 'a | b | __proto__ | c | d' && $p['company'] === '' && $p['solution'] === '', 'стар ред с много „ | “ в съобщението остава съобщение, не фалшиви полета');

section('Ф5 · писмото');
[$html, $txt] = cs_contact_mail(cs_contact_fields(['name' => 'Ana', 'email' => 'a@b.it', 'message' => 'Ciao mondo', 'company' => 'A&B "Srl"',
    'country' => 'EU', 'solution' => 'ecommerce', 'budget' => 'gt50k', 'lang' => 'it']), '2026-11-22 10:00:00 UTC');
ok(strpos($html, 'A&amp;B &quot;Srl&quot;') !== false && strpos($html, 'A&B "Srl"') === false, 'фирмата е екранирана в HTML писмото');
ok(strpos($txt, 'A&B "Srl"') !== false, 'текстовото писмо е с истинския текст');
ok(strpos($html, 'E-commerce') !== false && strpos($html, 'over €50,000') !== false && strpos($html, 'Other EU country') !== false, 'типът, бюджетът и държавата са с четими етикети');
$src = (string)file_get_contents($ROOT . '/api/contact.php');
ok(preg_match('/\$ar\s*=\s*match\(\$lang\)\s*\{(.*?)\};/s', $src, $m) === 1 && !preg_match('/\$(name|company|message|email|phone|f)\b/', $m[1]), 'авто-отговорът не съдържа нищо от посетителя');

// ── целият път през вградения сървър ──────────────────────────────────────────
$s = stream_socket_server('tcp://127.0.0.1:0'); $PORT = (int)explode(':', stream_socket_get_name($s, false))[1]; fclose($s);
$SERVER = proc_open([PHP_BINARY, '-S', "127.0.0.1:$PORT", '-t', $WEB], [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pp, $WEB, $ENV);
for ($i = 0; $i < 100; $i++) { $c = @fsockopen('127.0.0.1', $PORT); if ($c) { fclose($c); break; } usleep(50000); }
register_shutdown_function(function () use ($SERVER, $TMP) { proc_terminate($SERVER); proc_close($SERVER); exec('rm -rf ' . escapeshellarg($TMP)); });
function http(string $method, string $path, array $headers = [], $body = null): array {
    global $PORT;
    $h = array_merge(['Connection: close'], $headers);
    if (is_array($body)) { $body = json_encode($body); $h[] = 'Content-Type: application/json'; }
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $h), 'content' => $body ?? '', 'ignore_errors' => true, 'timeout' => 30]]);
    $r = @file_get_contents("http://127.0.0.1:$PORT$path", false, $ctx);
    $st = preg_match('#^HTTP/\S+\s+(\d+)#', $http_response_header[0] ?? '', $mm) ? (int)$mm[1] : 0;
    return [$st, json_decode((string)$r, true), (string)$r];
}
function reset_rl(): void { global $LOGS; foreach (glob("$LOGS/rl_*.json") ?: [] as $x) @unlink($x); }

section('Ф6 · библиотеката не е входна точка');
[$st, , $b] = http('GET', '/api/_contact.php');
ok($st === 404 && trim($b) === '', 'GET /api/_contact.php → 404 без съдържание');

section('Ф2 · задължителните полета');
reset_rl();
[$st] = http('POST', '/api/contact.php', [], ['name' => '', 'email' => 'a@b.it', 'message' => 'Ciao mondo']);
ok($st === 400, 'без име → 400');
[$st] = http('POST', '/api/contact.php', [], ['name' => 'Ana', 'email' => 'not-an-email', 'message' => 'Ciao mondo']);
ok($st === 400, 'грешен имейл → 400');
[$st] = http('POST', '/api/contact.php', [], ['name' => 'Ana', 'email' => 'a@b.it', 'message' => '']);
ok($st === 400, 'без съобщение → 400');

section('Ф1, Ф3 · изпращане с новите полета');
reset_rl();
[$st, $j] = http('POST', '/api/contact.php', [], ['name' => 'Luca Bianchi', 'email' => 'luca@impianti.it', 'phone' => '+39 02 123', 'lang' => 'it',
    'message' => 'Ci serve un gestionale per i sopralluoghi', 'company' => 'Bianchi Ascensori S.r.l.', 'country' => 'IT', 'solution' => 'erp', 'budget' => '15-50k', '_gotcha' => '']);
ok($st === 200 && ($j['ok'] ?? false) === true, 'POST с новите полета → 200');
$log = implode('', array_map('file_get_contents', glob("$LOGS/contacts_*.log") ?: []));
ok(strpos($log, 'Bianchi Ascensori S.r.l.') !== false && strpos($log, ' | erp | ') !== false && strpos($log, ' | 15-50k | ') !== false, 'логът пази фирмата, типа и бюджета');
file_put_contents(glob("$LOGS/contacts_*.log")[0], "2026-10-01T09:00:00+02:00 | Mario Rossi | mario@rossi.it | +39 333 | IT | Vorrei un sito\n", FILE_APPEND);

section('Ф4 · ?action=log с админ сесия');
[$st] = http('GET', '/api/contact.php?action=log');
ok($st === 401, 'без сесия → 401');
$tok = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
file_put_contents("$LOGS/admin_sessions.json", json_encode([hash('sha256', $tok) => ['email' => 'admin@carbonstealth.eu', 'created' => time(), 'last_seen' => time()]]));
[$st, $j] = http('GET', '/api/contact.php?action=log', ["Cookie: __Host-cs_admin=$tok", 'X-CS-Admin: 1']);
$e = $j['entries'] ?? [];
$new = array_values(array_filter($e, fn($x) => ($x['name'] ?? '') === 'Luca Bianchi'));
$old = array_values(array_filter($e, fn($x) => ($x['name'] ?? '') === 'Mario Rossi'));
ok($st === 200 && count($new) === 1 && $new[0]['company'] === 'Bianchi Ascensori S.r.l.' && $new[0]['country'] === 'IT' && $new[0]['solution'] === 'erp' && $new[0]['budget'] === '15-50k', 'новият запис идва с фирмата, държавата, типа и бюджета');
ok(count($old) === 1 && $old[0]['message'] === 'Vorrei un sito' && $old[0]['company'] === '', 'старият запис идва както досега, с празни нови полета');

echo "\n" . ($fail === 0 ? "ВСИЧКО МИНАВА" : "ПАДАТ: $fail") . " · минават $pass\n";
exit($fail === 0 ? 0 : 1);
