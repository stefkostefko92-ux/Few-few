<?php
/**
 * Carbon Stealth VCC — входът в админ панела: данни за вход, сесии, код от приложение (TOTP).
 *
 * МОДЕЛ НА СИГУРНОСТ
 *  - Данните за вход са във файл ИЗВЪН сайта (CS_ADMIN_CREDENTIALS, по подразбиране
 *    /etc/carbonstealth/admin.json, root:www-data 0640). Пише ги само командата cs-admin като root;
 *    уеб процесът само ги чете — пробив в уеб слоя не може да смени паролата или ключа.
 *    Във файла: имейл, хеш на паролата (Argon2id), ключ за TOTP, хешове на резервните кодове.
 *  - Вход на две стъпки: имейл + парола → еднократно предизвикателство (5 мин) → 6-цифрен код
 *    (RFC 6238, ±1 стъпка, без повторно използване) или неизползван резервен код.
 *  - Сесия: 256-битова случайна стойност в бисквитка __Host-cs_admin (HttpOnly, Secure,
 *    SameSite=Strict, Path=/). На сървъра — само SHA-256 на стойността. 30 мин без действие или
 *    8 ч общо → изтича. „Изход“ и cs-admin revoke я убиват веднага.
 *  - Подвижното състояние (сесии, предизвикателства, последната стъпка на кода, използваните
 *    резервни кодове) е в cs_log_dir() (0600, nginx го отказва). Пише се атомарно (временен файл +
 *    rename) под отделна ключалка (*.lock).
 *  - Резервните кодове важат само докато състоянието носи „котвата“ им (хеш на списъка), записана от
 *    cs-admin setup/recovery. Изгубено или повредено състояние → няма котва → резервните кодове спират
 *    (отказ), вместо използваните да оживеят отново. Поправка: sudo cs-admin recovery.
 *  - Няма файл с данни → вход е невъзможен (fail-closed).
 */

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

if (!function_exists('cs_admin_credentials_path')) {

    define('CS_ADMIN_IDLE', 1800);          // 30 мин без действие
    define('CS_ADMIN_ABSOLUTE', 28800);     // 8 ч от входа
    define('CS_ADMIN_CHALLENGE', 300);      // 5 мин между паролата и кода
    define('CS_ADMIN_COOKIE', '__Host-cs_admin');
    define('CS_ADMIN_MAX_SESSIONS', 10);

    function cs_admin_credentials_path(): string {
        $p = getenv('CS_ADMIN_CREDENTIALS');
        return (is_string($p) && $p !== '') ? $p : '/etc/carbonstealth/admin.json';
    }

    /** Данните за вход или null (няма файл, не се чете, повреден) — тогава вход няма. */
    function cs_admin_load_credentials(): ?array {
        $raw = @file_get_contents(cs_admin_credentials_path());
        if (!is_string($raw) || $raw === '') return null;
        $c = json_decode($raw, true);
        if (!is_array($c)) return null;
        foreach (['email', 'password_hash', 'totp_secret'] as $k) {
            if (!isset($c[$k]) || !is_string($c[$k]) || $c[$k] === '') return null;
        }
        if (!isset($c['recovery']) || !is_array($c['recovery'])) $c['recovery'] = [];
        return $c;
    }

    function cs_admin_norm_email(string $e): string { return strtolower(trim($e)); }

    // ── TOTP (RFC 6238 / RFC 4226): SHA-1, 6 цифри, 30 s ─────────────────────
    function cs_b32_encode(string $bin): string {
        $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = '';
        foreach (str_split($bin) as $ch) $bits .= str_pad(decbin(ord($ch)), 8, '0', STR_PAD_LEFT);
        $out = '';
        foreach (str_split($bits, 5) as $chunk) $out .= $a[bindec(str_pad($chunk, 5, '0', STR_PAD_RIGHT))];
        return $out;
    }

    function cs_b32_decode(string $s): string {
        $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $s = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s));
        $bits = '';
        foreach (str_split($s) as $ch) {
            $i = strpos($a, $ch);
            if ($i === false) return '';
            $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 8) as $b) if (strlen($b) === 8) $out .= chr(bindec($b));
        return $out;
    }

    function cs_totp_code(string $secretB32, int $step): string {
        $key = cs_b32_decode($secretB32);
        $h = hash_hmac('sha1', pack('N2', ($step >> 32) & 0xffffffff, $step & 0xffffffff), $key, true);
        $o = ord($h[19]) & 0x0f;
        $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
        return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Стъпката, на която кодът е верен (текущата ±$window), или -1. Сравнението е с hash_equals,
     * за да не издава по времето колко цифри съвпадат.
     */
    function cs_totp_match(string $secretB32, string $code, int $now, int $window = 1): int {
        if (!preg_match('/^\d{6}$/', $code)) return -1;
        $cur = intdiv($now, 30);
        $hit = -1;
        for ($d = -$window; $d <= $window; $d++) {
            if (hash_equals(cs_totp_code($secretB32, $cur + $d), $code)) $hit = $cur + $d;
        }
        return $hit;
    }

    function cs_totp_new_secret(): string { return cs_b32_encode(random_bytes(20)); }

    /** Резервен код във вида, в който се хешира: малки букви, без тирета и интервали. */
    function cs_recovery_norm(string $c): string { return strtolower(preg_replace('/[^A-Za-z0-9]/', '', $c)); }

    function cs_recovery_new(): string {
        $a = 'abcdefghjkmnpqrstuvwxyz23456789'; $s = '';   // без 0/o, 1/l/i — четат се грешно
        for ($i = 0; $i < 12; $i++) $s .= $a[random_int(0, strlen($a) - 1)];
        return substr($s, 0, 4) . '-' . substr($s, 4, 4) . '-' . substr($s, 8, 4);
    }

    function cs_admin_hash(string $secret): string {
        return defined('PASSWORD_ARGON2ID')
            ? password_hash($secret, PASSWORD_ARGON2ID)
            : password_hash($secret, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    // ── файлове с подвижно състояние (флок, атомарно четене-промяна-запис) ──────
    function cs_admin_sessions_file(): string { return cs_log_dir() . '/admin_sessions.json'; }
    function cs_admin_state_file(): string    { return cs_log_dir() . '/admin_state.json'; }

    /** Когато пише root (cs-admin), файлът става на собственика на папката — иначе PHP-FPM не може да го пипне. */
    function cs_admin_own_like_dir(string $file): void {
        if (!function_exists('posix_geteuid') || posix_geteuid() !== 0 || !file_exists($file)) return;
        $d = dirname($file);
        @chown($file, (int)fileowner($d)); @chgrp($file, (int)filegroup($d));
    }

    /**
     * Четене-промяна-запис под изключителна ключалка (отделен файл *.lock, за да оцелее rename).
     * $fn получава масива (празен, ако файлът липсва или е повреден) и връща новия или null = без запис.
     * Записът е атомарен: временен файл в същата папка → rename. Без ключалка — $fn([]) без запис
     * (за всички извикващи това значи „няма сесия“/„изтекло предизвикателство“, т.е. затворено).
     */
    function cs_admin_locked(string $file, callable $fn) {
        $lock = $file . '.lock';
        $old = umask(0077);
        $lp = @fopen($lock, 'c');
        umask($old);
        if (!$lp) return $fn([]);
        cs_admin_own_like_dir($lock);
        @flock($lp, LOCK_EX);
        $raw = @file_get_contents($file);
        $d = (is_string($raw) && $raw !== '') ? json_decode($raw, true) : [];
        if (!is_array($d)) $d = [];
        $out = $fn($d);
        if (is_array($out)) {
            $tmp = dirname($file) . '/.' . basename($file) . '.' . bin2hex(random_bytes(6)) . '.tmp';
            $old = umask(0077);
            $ok = @file_put_contents($tmp, json_encode($out, JSON_UNESCAPED_SLASHES)) !== false;
            umask($old);
            if ($ok) { @chmod($tmp, 0600); cs_admin_own_like_dir($tmp); $ok = @rename($tmp, $file); }
            if (!$ok) @unlink($tmp);
        }
        @flock($lp, LOCK_UN); fclose($lp);
        return $out;
    }

    /** Чете JSON файл със състояние без ключалка (записът е атомарен, затова е цял или стар). */
    function cs_admin_read(string $file): array {
        $d = json_decode((string)@file_get_contents($file), true);
        return is_array($d) ? $d : [];
    }

    /** „Котвата“ на резервните кодове: хеш на списъка им във файла с данни за вход. */
    function cs_admin_recovery_anchor(array $cred): string {
        return hash('sha256', 'cs-recovery-v1|' . implode("\n", array_map('strval', (array)($cred['recovery'] ?? []))));
    }

    /** Резервните кодове важат ли (състоянието носи котвата им)? */
    function cs_admin_recovery_active(array $cred): bool {
        return hash_equals(cs_admin_recovery_anchor($cred), (string)(cs_admin_read(cs_admin_state_file())['anchor'] ?? ''));
    }

    /**
     * cs-admin setup/recovery: нов списък резервни кодове → нова котва, нищо използвано. При нов ключ
     * за приложението (setup) отпадат и последната стъпка на стария ключ, и висящите предизвикателства.
     */
    function cs_admin_state_reset(array $cred, bool $newSecret): void {
        cs_admin_locked(cs_admin_state_file(), function ($st) use ($cred, $newSecret) {
            $st['anchor'] = cs_admin_recovery_anchor($cred);
            $st['recovery_used'] = [];
            if ($newSecret) { unset($st['totp_last_step']); $st['challenges'] = []; }
            return $st;
        });
    }

    // ── сесии ──────────────────────────────────────────────────────────────────
    function cs_admin_session_create(string $email): string {
        $tok = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $key = hash('sha256', $tok);
        $now = time();
        cs_admin_locked(cs_admin_sessions_file(), function ($s) use ($key, $email, $now) {
            foreach ($s as $k => $v) if (!cs_admin_session_alive($v, $now)) unset($s[$k]);
            if (count($s) >= CS_ADMIN_MAX_SESSIONS) {           // най-старите излизат първи
                uasort($s, static function ($a, $b) { return ((int)($a['created'] ?? 0)) <=> ((int)($b['created'] ?? 0)); });
                $s = array_slice($s, count($s) - CS_ADMIN_MAX_SESSIONS + 1, null, true);
            }
            $s[$key] = ['email' => $email, 'created' => $now, 'last_seen' => $now];
            return $s;
        });
        return $tok;
    }

    function cs_admin_session_alive(array $v, int $now): bool {
        return ($now - (int)($v['last_seen'] ?? 0)) <= CS_ADMIN_IDLE
            && ($now - (int)($v['created'] ?? 0)) <= CS_ADMIN_ABSOLUTE;
    }

    function cs_admin_cookie_value(): string {
        $v = (string)($_COOKIE[CS_ADMIN_COOKIE] ?? '');
        return preg_match('/^[A-Za-z0-9_-]{40,64}$/', $v) ? $v : '';
    }

    /** Текущата сесия (и я „подновява“ най-много веднъж в минута) или null. */
    function cs_admin_session_current(): ?array {
        $tok = cs_admin_cookie_value();
        if ($tok === '') return null;
        $key = hash('sha256', $tok);
        $now = time();
        $found = null;
        cs_admin_locked(cs_admin_sessions_file(), function ($s) use ($key, $now, &$found) {
            if (!isset($s[$key]) || !is_array($s[$key])) return null;
            if (!cs_admin_session_alive($s[$key], $now)) { unset($s[$key]); return $s; }
            $found = $s[$key];
            if ($now - (int)$s[$key]['last_seen'] >= 60) { $s[$key]['last_seen'] = $now; return $s; }
            return null;
        });
        return $found;
    }

    /** „Изход“: сесията изчезва — и билетите за потока, вързани за нея, спират (те проверяват сесията). */
    function cs_admin_session_destroy(): void {
        $key = cs_admin_session_key();
        if ($key !== '') {
            cs_admin_locked(cs_admin_sessions_file(), function ($s) use ($key) { unset($s[$key]); return $s; });
        }
    }

    /** Ключът (SHA-256 на бисквитката) на текущата заявка или ''. */
    function cs_admin_session_key(): string {
        $tok = cs_admin_cookie_value();
        return $tok === '' ? '' : hash('sha256', $tok);
    }

    /** Жива ли е сесията с този ключ — само чете, не подновява (за потока със запитванията). */
    function cs_admin_session_key_alive(string $key): bool {
        if ($key === '') return false;
        $s = cs_admin_read(cs_admin_sessions_file());
        return isset($s[$key]) && is_array($s[$key]) && cs_admin_session_alive($s[$key], time());
    }

    /** Изписва всички (cs-admin revoke / смяна на паролата / „Излез от всички устройства“). */
    function cs_admin_sessions_revoke_all(): void {
        cs_admin_locked(cs_admin_sessions_file(), function () { return []; });
        @unlink(cs_admin_sessions_file());
        if (function_exists('cs_sse_ticket_file')) @unlink(cs_sse_ticket_file());   // и билетите за потока
    }

    function cs_admin_set_cookie(string $value, int $maxAge): void {
        if ($maxAge <= 0) {   // триене: един ред с Max-Age=0 (setcookie би сложил и дата в миналото)
            header('Set-Cookie: ' . CS_ADMIN_COOKIE . '=deleted; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict', false);
            return;
        }
        setcookie(CS_ADMIN_COOKIE, $value, [
            'expires'  => time() + $maxAge,
            'path'     => '/',
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
    }

    // ── предизвикателството между паролата и кода ─────────────────────────────
    function cs_admin_challenge_create(): string {
        $ch = bin2hex(random_bytes(32));
        $key = hash('sha256', $ch); $ipk = cs_ip_key(); $now = time();
        cs_admin_locked(cs_admin_state_file(), function ($st) use ($key, $ipk, $now) {
            $c = is_array($st['challenges'] ?? null) ? $st['challenges'] : [];
            foreach ($c as $k => $v) if ((int)($v['exp'] ?? 0) < $now) unset($c[$k]);
            if (count($c) > 50) $c = array_slice($c, -50, null, true);
            $c[$key] = ['exp' => $now + CS_ADMIN_CHALLENGE, 'ipk' => $ipk, 'tries' => 0];
            $st['challenges'] = $c;
            return $st;
        });
        return $ch;
    }

    /**
     * Проверява предизвикателство + код. Връща 'ok', 'challenge_expired' или 'invalid_code'.
     * При 'ok' предизвикателството се изразходва, стъпката на кода се запомня (без повторно
     * използване), а резервният код се отбелязва като използван — всичко под една ключалка.
     */
    function cs_admin_challenge_verify(string $ch, string $code, array $cred): string {
        if (!preg_match('/^[0-9a-f]{64}$/', $ch)) return 'challenge_expired';
        $key = hash('sha256', $ch); $ipk = cs_ip_key(); $now = time();
        $code = trim($code);
        $result = 'invalid_code';
        cs_admin_locked(cs_admin_state_file(), function ($st) use ($key, $ipk, $now, $code, $cred, &$result) {
            $c = $st['challenges'][$key] ?? null;
            if (!is_array($c) || (int)($c['exp'] ?? 0) < $now || !hash_equals((string)($c['ipk'] ?? ''), $ipk)) {
                unset($st['challenges'][$key]);
                $result = 'challenge_expired';
                return $st;
            }
            $ok = false;
            if (preg_match('/^\d{6}$/', $code)) {
                $step = cs_totp_match($cred['totp_secret'], $code, $now);
                if ($step >= 0 && $step > (int)($st['totp_last_step'] ?? -1)) { $ok = true; $st['totp_last_step'] = $step; }
            } else {
                $norm = cs_recovery_norm($code);
                $used = is_array($st['recovery_used'] ?? null) ? $st['recovery_used'] : [];
                // Без котвата (изгубено/повредено състояние) не знаем кои кодове са използвани → отказ.
                $anchored = hash_equals(cs_admin_recovery_anchor($cred), (string)($st['anchor'] ?? ''));
                if ($anchored && strlen($norm) === 12) {
                    foreach ($cred['recovery'] as $h) {
                        if (!is_string($h) || in_array($h, $used, true)) continue;
                        if (password_verify($norm, $h)) { $ok = true; $used[] = $h; break; }
                    }
                }
                $st['recovery_used'] = $used;
            }
            if ($ok) {
                unset($st['challenges'][$key]);
                $result = 'ok';
            } else {
                $st['challenges'][$key]['tries'] = (int)($c['tries'] ?? 0) + 1;
                if ($st['challenges'][$key]['tries'] >= 5) unset($st['challenges'][$key]);   // нов вход с паролата
            }
            return $st;
        });
        return $result;
    }

    /** Колко резервни кода още не са използвани (за cs-admin status); 0, ако са спрени. */
    function cs_admin_recovery_left(array $cred): int {
        if (!cs_admin_recovery_active($cred)) return 0;
        $st = cs_admin_read(cs_admin_state_file());
        $used = is_array($st['recovery_used'] ?? null) ? $st['recovery_used'] : [];
        return count(array_filter($cred['recovery'], static function ($h) use ($used) { return !in_array($h, $used, true); }));
    }

    /** Заявката идва от нашия собствен адрес (или няма Origin — заявка от същия сайт или curl). */
    function cs_admin_same_origin(): bool {
        $o = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($o === '') return true;
        $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';   // nginx: fastcgi_param HTTPS
        $self = ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? '');
        return hash_equals(strtolower($self), strtolower($o));
    }
}
