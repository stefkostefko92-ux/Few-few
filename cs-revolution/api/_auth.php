<?php
/**
 * Carbon Stealth VCC — shared server-side helpers
 * Central place for: admin authorization, safe client IP, log directory,
 * header-safe strings, SSRF-safe host validation.
 *
 * SECURITY MODEL
 *  - Admin access = a session from api/admin-auth.php (email + password + TOTP code, see
 *    api/_admin.php). The old shared token (CS_ADMIN_TOKEN / X-CS-Token) is GONE: it is not
 *    read anywhere, so leaving it in the pool config grants nothing.
 *  - Sensitive endpoints call cs_require_admin(): a valid session, and for anything that
 *    changes state (POST…) also the X-CS-Admin: 1 header + same Origin (CSRF). No credentials
 *    file on the server → nobody can log in (fail-closed).
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

// API responses are data, never search results: keep every endpoint that includes this
// file out of Google/Bing indexes (crawling stays allowed, so the SPA still renders for bots).
if (!headers_sent()) header('X-Robots-Tag: noindex, nofollow');


if (!function_exists('cs_is_admin')) {

    /** True if the caller holds a valid admin session (see api/_admin.php). */
    function cs_is_admin(): bool {
        return cs_admin_session_current() !== null;
    }

    function cs_json_exit(int $code, array $body): void {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($body);
        exit;
    }

    /**
     * Every admin request — GET included — must carry X-CS-Admin: 1 and come from our own Origin.
     * SameSite=Strict does NOT stop a sibling subdomain (*.carbonstealth.eu is the same site), and a
     * plain <img>/<a> can't add a custom header, so the header is what makes a request "ours".
     */
    function cs_admin_csrf_ok(): bool {
        return ((string)($_SERVER['HTTP_X_CS_ADMIN'] ?? '')) === '1' && cs_admin_same_origin();
    }

    /**
     * Hard gate for admin-only endpoints: no cookie → 401; cookie without the CSRF header → 403;
     * then a valid session (401 otherwise). Credential guessing is throttled where credentials are
     * actually checked — api/admin-auth.php; a missing/expired session here is not a guess (the
     * cookie is 256 random bits), so it does not count towards the lockout: a panel that keeps
     * polling after its session expired must not lock the admin out of the login form.
     */
    function cs_require_admin(): void {
        if (cs_admin_cookie_value() === '') cs_json_exit(401, ['ok' => false, 'error' => 'unauthorized']);
        if (!cs_admin_csrf_ok()) cs_json_exit(403, ['ok' => false, 'error' => 'csrf']);
        if (cs_is_admin()) return;
        cs_json_exit(401, ['ok' => false, 'error' => 'unauthorized']);
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

    /**
     * Check the lockout AND book this attempt as a failure in ONE locked step (no TOCTOU: N parallel
     * guesses can't all see "not locked" before the first one is counted). Returns the seconds the
     * caller must still wait (attempt refused, nothing booked) or 0 (attempt booked — call
     * cs_auth_release_attempt() if it turns out right, cs_auth_failed() if wrong).
     *
     * The distributed-spray response (lock a source after a single wrong answer) is applied while
     * booking, but a booked attempt that is CORRECT is released/cleared at once — so a spray makes
     * every wrong answer expensive while the real admin still gets through.
     */
    function cs_auth_reserve_attempt(): int {
        $key = cs_ip_key();
        $now = time();
        $rem = 0;
        cs_auth_with_state(function ($st) use ($key, $now, &$rem) {
            $cur   = $st['ips'][$key] ?? ['fails' => 0, 'until' => 0, 'last' => 0];
            $until = (int)($cur['until'] ?? 0);
            if ($until > $now) { $rem = $until - $now; return null; }   // locked: refuse, book nothing
            $fails = (int)($cur['fails'] ?? 0) + 1;
            $st['global'][] = $now;
            // Under a distributed spray (>100 attempts from all sources in 10 min) a *single*
            // wrong answer is already suspicious: lock this source instead of granting 5 tries.
            $spraying = count($st['global']) > 100;
            $lock = $spraying ? max(60, cs_auth_lock_seconds($fails)) : cs_auth_lock_seconds($fails);
            $st['ips'][$key] = ['fails' => $fails, 'until' => $lock > 0 ? $now + $lock : 0, 'last' => $now];
            return $st;
        });
        return $rem;
    }

    /** A booked attempt was right (e.g. the password step): un-book it, lifting the lock it set. */
    function cs_auth_release_attempt(): void {
        $key = cs_ip_key();
        cs_auth_with_state(function ($st) use ($key) {
            if (!isset($st['ips'][$key])) return null;
            $fails = max(0, (int)($st['ips'][$key]['fails'] ?? 0) - 1);
            $st['ips'][$key]['fails'] = $fails;
            if (cs_auth_lock_seconds($fails) === 0) $st['ips'][$key]['until'] = 0;
            array_pop($st['global']);
            return $st;
        });
    }

    /** Escalating lockout for a given failure count. */
    function cs_auth_lock_seconds(int $fails): int {
        if ($fails < 5)   return 0;      // room for honest typos
        if ($fails < 10)  return 60;
        if ($fails < 20)  return 300;
        if ($fails < 50)  return 1800;
        return 86400;
    }

    /** A booked attempt was wrong: it is already counted — log it for fail2ban and slow down. */
    function cs_auth_failed(): void {
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
// EventSource can't send headers, so instead of anything session-like in the URL (it would leak
// into access logs), the admin panel exchanges its session for a short-lived opaque ticket. The
// ticket is BOUND to that session: it works only while the session lives, so "Изход", "Излез от
// всички устройства" and `cs-admin revoke` stop it (and the open stream) at once.
if (!function_exists('cs_issue_sse_ticket')) {
    function cs_sse_ticket_file(): string { return cs_log_dir() . '/sse_tickets.json'; }

    /** Call only after cs_require_admin(): binds the ticket to the caller's session. */
    function cs_issue_sse_ticket(int $ttl = 120): string {
        $ticket = bin2hex(random_bytes(16));
        $sk = cs_admin_session_key();
        $now = time();
        cs_admin_locked(cs_sse_ticket_file(), function ($t) use ($ticket, $sk, $now, $ttl) {
            foreach ($t as $k => $v) if (!is_array($v) || (int)($v['exp'] ?? 0) < $now) unset($t[$k]);   // prune
            $t[$ticket] = ['exp' => $now + $ttl, 'sk' => $sk];
            return $t;
        });
        return $ticket;
    }

    /**
     * The session key the ticket is bound to, or '' (unknown, expired, or its session is gone).
     * Multi-use within the TTL so EventSource auto-reconnect works.
     */
    function cs_check_sse_ticket(string $ticket): string {
        if ($ticket === '' || strlen($ticket) > 64 || !ctype_xdigit($ticket)) return '';
        $t = cs_admin_read(cs_sse_ticket_file());
        $v = $t[$ticket] ?? null;
        if (!is_array($v) || (int)($v['exp'] ?? 0) < time()) return '';
        $sk = (string)($v['sk'] ?? '');
        return cs_admin_session_key_alive($sk) ? $sk : '';
    }
}

require_once __DIR__ . '/_admin.php';
