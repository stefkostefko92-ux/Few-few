<?php
/**
 * Carbon Stealth VCC — shared server-side helpers
 * Central place for: admin authorization, safe client IP, log directory,
 * header-safe strings, SSRF-safe host validation.
 *
 * SECURITY MODEL
 *  - The admin token lives ONLY in the PHP-FPM environment (CS_ADMIN_TOKEN),
 *    never in the JS bundle. Set it in the pool config:
 *      env[CS_ADMIN_TOKEN] = <long-random-string>
 *  - Sensitive endpoints call cs_require_admin(). If CS_ADMIN_TOKEN is not
 *    set, access is DENIED (fail-closed) — secure by default.
 *  - Logs/PII are written to CS_LOG_DIR (default: a private dir outside the
 *    webroot if writable, else api/logs which nginx must deny).
 */

// Defence in depth: these files are libraries, never entry points. If one is
// requested directly over HTTP (a misconfigured or replaced nginx, a future
// vhost edit), refuse instead of trusting the web server to have blocked it.
if (isset($_SERVER['SCRIPT_FILENAME']) &&
    realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}


if (!function_exists('cs_admin_token')) {

    function cs_admin_token(): string {
        $t = getenv('CS_ADMIN_TOKEN');
        return is_string($t) ? trim($t) : '';
    }

    /**
     * Token presented by the caller — HEADER ONLY (X-CS-Token).
     *
     * Query-string auth (?token=/?key=) was removed on purpose: a token in the
     * URL leaks into nginx access logs, browser history and Referer headers,
     * and `?key=` collided with admin-data.php's own data-key parameter. The
     * admin panel has always sent the header (see csAuthFetch in src/App.jsx).
     */
    function cs_presented_token(): string {
        return trim((string)($_SERVER['HTTP_X_CS_TOKEN'] ?? ''));
    }

    /** Returns true if the caller is an authorized admin (constant-time compare). */
    function cs_is_admin(): bool {
        $expected = cs_admin_token();
        if ($expected === '') return false;            // fail-closed: no token configured
        $given = cs_presented_token();
        if ($given === '') return false;
        return hash_equals($expected, $given);
    }

    /**
     * Hard gate for admin-only endpoints. Emits 401 JSON and exits on failure.
     * Brute-force hardened: every failed attempt is throttled and recorded, and
     * a locked-out caller is refused (429) BEFORE the token is even compared.
     */
    function cs_require_admin(): void {
        $lock = cs_auth_lock_remaining();
        if ($lock > 0) {
            http_response_code(429);
            header('Retry-After: ' . $lock);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['ok' => false, 'error' => 'too_many_attempts', 'retry_after' => $lock]);
            exit;
        }
        if (cs_is_admin()) { cs_auth_record_success(); return; }
        cs_auth_record_failure();
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'unauthorized']);
        exit;
    }

    /** Real client IP — REMOTE_ADDR only (X-Forwarded-* is attacker-spoofable). */
    function cs_client_ip(): string {
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    // ── Brute-force defence for the admin gate ───────────────────────────────
    // Layered on purpose:
    //  1. per-IP progressive lockout (exponential: a guesser gets slower fast),
    //  2. a GLOBAL failure counter over a sliding window, so a distributed
    //     attack from many IPs against one token still trips a slow-mode,
    //  3. a mandatory delay on every failure (caps attempts/sec even before a
    //     lockout applies, and masks any residual timing signal),
    //  4. an append-only auth log so fail2ban can ban at the firewall.
    // State lives in one JSON file under cs_log_dir(), keyed by the HASHED ip
    // (cs_ip_key) so no raw IP is stored — GDPR data minimisation.

    function cs_auth_state_file(): string { return cs_log_dir() . '/auth_throttle.json'; }

    /** Read-modify-write the throttle state under a single exclusive lock. */
    function cs_auth_with_state(callable $fn) {
        $f  = cs_auth_state_file();
        $fp = @fopen($f, 'c+');
        if (!$fp) return $fn(['ips' => [], 'global' => []], false);
        @flock($fp, LOCK_EX);
        $raw = stream_get_contents($fp);
        $st  = $raw !== '' ? json_decode($raw, true) : null;
        if (!is_array($st)) $st = [];
        if (!isset($st['ips']) || !is_array($st['ips']))       $st['ips'] = [];
        if (!isset($st['global']) || !is_array($st['global'])) $st['global'] = [];

        $now = time();
        // prune: per-IP entries idle for >24h, and global stamps older than 10 min
        foreach ($st['ips'] as $k => $v) {
            $last = (int)($v['last'] ?? 0);
            if ($now - $last > 86400 && (int)($v['until'] ?? 0) < $now) unset($st['ips'][$k]);
        }
        $st['global'] = array_values(array_filter($st['global'], static function ($t) use ($now) {
            return $now - (int)$t <= 600;
        }));
        if (count($st['ips']) > 5000) $st['ips'] = array_slice($st['ips'], -2000, null, true); // bound the file

        $out = $fn($st, true);
        if (is_array($out)) {
            ftruncate($fp, 0); rewind($fp);
            fwrite($fp, json_encode($out));
            fflush($fp);
        }
        @flock($fp, LOCK_UN); fclose($fp); @chmod($f, 0600);
        return $out;
    }

    /** Seconds this caller must still wait, or 0 if allowed to try. */
    function cs_auth_lock_remaining(): int {
        $key = cs_ip_key();
        $now = time();
        $rem = 0;
        cs_auth_with_state(function ($st) use ($key, $now, &$rem) {
            $until = (int)($st['ips'][$key]['until'] ?? 0);
            if ($until > $now) $rem = $until - $now;
            // NOTE: the distributed-attack response deliberately lives in
            // cs_auth_record_failure(), NOT here. This function runs BEFORE the
            // token is compared, so blocking here during a spray would lock out
            // the real admin too — handing an attacker a cheap DoS. Instead a
            // spray makes every WRONG answer much more expensive, while a
            // correct token still gets through instantly.
            return null; // read-only
        });
        return $rem;
    }

    /** Escalating lockout for a given failure count. */
    function cs_auth_lock_seconds(int $fails): int {
        if ($fails < 5)   return 0;      // room for honest typos
        if ($fails < 10)  return 60;
        if ($fails < 20)  return 300;
        if ($fails < 50)  return 1800;
        return 86400;
    }

    function cs_auth_record_failure(): void {
        $key = cs_ip_key();
        $now = time();
        $spraying = false;
        cs_auth_with_state(function ($st) use ($key, $now, &$spraying) {
            $cur   = $st['ips'][$key] ?? ['fails' => 0, 'until' => 0, 'last' => 0];
            $fails = (int)($cur['fails'] ?? 0) + 1;
            $st['global'][] = $now;
            // Under a distributed spray (>100 failures from all sources in 10
            // min) a *single* wrong answer is already suspicious: lock this
            // source immediately instead of granting it the usual 5 free tries.
            $spraying = count($st['global']) > 100;
            $lock = $spraying ? max(60, cs_auth_lock_seconds($fails)) : cs_auth_lock_seconds($fails);
            $st['ips'][$key] = [
                'fails' => $fails,
                'until' => $lock > 0 ? $now + $lock : 0,
                'last'  => $now,
            ];
            return $st;
        });
        // Append-only signal for fail2ban (real IP, security legitimate interest,
        // short retention — rotate this file; see deploy/security/).
        $flog = cs_log_dir() . '/auth_failures.log';
        $new  = !file_exists($flog);
        @file_put_contents(
            $flog,
            gmdate('c') . ' ip=' . cs_client_ip() . ' uri=' . cs_hdr_safe((string)($_SERVER['REQUEST_URI'] ?? '')) . "\n",
            FILE_APPEND | LOCK_EX
        );
        if ($new) @chmod($flog, 0600);   // contains raw IPs — never world-readable
        // Constant floor + jitter: caps attempts/sec and masks timing.
        usleep(300000 + random_int(0, 200000)); // 300–500 ms
    }

    function cs_auth_record_success(): void {
        $key = cs_ip_key();
        cs_auth_with_state(function ($st) use ($key) {
            unset($st['ips'][$key]);   // clean slate after a good login
            return $st;
        });
    }

    /**
     * Keyed, irreversible pseudonym for an IP (GDPR-friendly rate-limit key).
     * If CS_IP_SALT is unset we derive a per-install secret once and store it
     * 0600 outside the webroot, instead of falling back to a shared constant a
     * attacker could reproduce to correlate or pre-compute rate-limit keys.
     */
    function cs_ip_key(string $ip = ''): string {
        if ($ip === '') $ip = cs_client_ip();
        static $secret = null;
        if ($secret === null) {
            $secret = (string)(getenv('CS_IP_SALT') ?: '');
            if ($secret === '') {
                $f = cs_log_dir() . '/.ip_salt';
                $secret = is_readable($f) ? trim((string)@file_get_contents($f)) : '';
                if ($secret === '') {
                    $secret = bin2hex(random_bytes(32));
                    @file_put_contents($f, $secret, LOCK_EX);
                    @chmod($f, 0600);
                }
            }
        }
        return substr(hash_hmac('sha256', $ip, $secret), 0, 24);
    }

    /** Private dir for PII/logs. Prefer CS_LOG_DIR (outside webroot). */
    function cs_log_dir(): string {
        $d = getenv('CS_LOG_DIR');
        if (is_string($d) && $d !== '') {
            if (!is_dir($d)) @mkdir($d, 0750, true);
            if (is_dir($d) && is_writable($d)) return rtrim($d, '/');
        }
        $fallback = __DIR__ . '/logs';
        if (!is_dir($fallback)) @mkdir($fallback, 0750, true);
        return $fallback;
    }

    /** Strip CR/LF — use on ANY value placed into a mail header or subject. */
    function cs_hdr_safe(string $s): string {
        return trim(str_replace(["\r", "\n", "\0"], '', $s));
    }

    /** HTML-escape for safe interpolation into HTML email bodies. */
    function cs_h(string $s): string {
        return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /**
     * SSRF-safe check: resolve a hostname and require EVERY resolved address
     * to be a public, routable unicast IP. Returns the validated IPs or [].
     */
    function cs_resolve_public(string $host): array {
        $host = strtolower(trim($host, " \t.[]"));
        if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.internal') || str_ends_with($host, '.local')) {
            return [];
        }
        $ips = [];
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $ips = [$host];
        } else {
            $recs = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
            foreach ($recs as $r) {
                if (!empty($r['ip']))   $ips[] = $r['ip'];
                if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
            }
            if (!$ips) {
                $a = @gethostbynamel($host);
                if ($a) $ips = $a;
            }
        }
        if (!$ips) return [];
        foreach ($ips as $ip) {
            if (!filter_var($ip, FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return []; // any private/reserved/link-local hit → reject the whole host
            }
        }
        return array_values(array_unique($ips));
    }
}

// ── Short-lived SSE tickets ──────────────────────────────────────
// EventSource can't send headers, so instead of putting the admin token in
// the URL (which leaks into access logs), the admin panel exchanges its token
// for a short-lived opaque ticket and connects with that.
if (!function_exists('cs_issue_sse_ticket')) {
    function cs_sse_ticket_file(): string { return cs_log_dir() . '/sse_tickets.json'; }

    function cs_issue_sse_ticket(int $ttl = 120): string {
        $f = cs_sse_ticket_file();
        $t = json_decode((string)@file_get_contents($f), true);
        if (!is_array($t)) $t = [];
        $now = time();
        foreach ($t as $k => $exp) { if ((int)$exp < $now) unset($t[$k]); } // prune expired
        $ticket = bin2hex(random_bytes(16));
        $t[$ticket] = $now + $ttl;
        @file_put_contents($f, json_encode($t), LOCK_EX);
        @chmod($f, 0600);
        return $ticket;
    }

    // Valid until expiry (multi-use within TTL so EventSource auto-reconnect works).
    function cs_check_sse_ticket(string $ticket): bool {
        if ($ticket === '' || strlen($ticket) > 64 || !ctype_xdigit($ticket)) return false;
        $t = json_decode((string)@file_get_contents(cs_sse_ticket_file()), true);
        return is_array($t) && isset($t[$ticket]) && (int)$t[$ticket] >= time();
    }
}
