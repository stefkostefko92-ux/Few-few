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

if (!function_exists('cs_admin_token')) {

    function cs_admin_token(): string {
        $t = getenv('CS_ADMIN_TOKEN');
        return is_string($t) ? trim($t) : '';
    }

    /** Token presented by the caller: X-CS-Token header, then ?token=/?key=. */
    function cs_presented_token(): string {
        $h = $_SERVER['HTTP_X_CS_TOKEN'] ?? '';
        if ($h !== '') return trim($h);
        return trim((string)($_GET['token'] ?? $_GET['key'] ?? ''));
    }

    /** Returns true if the caller is an authorized admin (constant-time compare). */
    function cs_is_admin(): bool {
        $expected = cs_admin_token();
        if ($expected === '') return false;            // fail-closed: no token configured
        $given = cs_presented_token();
        if ($given === '') return false;
        return hash_equals($expected, $given);
    }

    /** Hard gate for admin-only endpoints. Emits 401 JSON and exits on failure. */
    function cs_require_admin(): void {
        if (cs_is_admin()) return;
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'unauthorized']);
        exit;
    }

    /** Real client IP — REMOTE_ADDR only (X-Forwarded-* is attacker-spoofable). */
    function cs_client_ip(): string {
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    /** Keyed, irreversible pseudonym for an IP (GDPR-friendly rate-limit key). */
    function cs_ip_key(string $ip = ''): string {
        if ($ip === '') $ip = cs_client_ip();
        $secret = getenv('CS_IP_SALT') ?: 'cs-static-salt-change-me';
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
