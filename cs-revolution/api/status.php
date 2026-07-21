<?php
/**
 * Carbon Stealth VCC — PUBLIC status endpoint (status.php)
 * ---------------------------------------------------------------------------
 * A "living proof" of reliability that leaks NOTHING sensitive.
 *
 * SRE DESIGN (status-page canon: report SYMPTOM / availability, not raw
 * internal resource metrics):
 *   - overall availability            : operational | degraded | down
 *   - per-service up/down + latency   : server-side curl to a FIXED allowlist
 *                                        of OUR own domains. No user input at
 *                                        all → zero SSRF surface.
 *   - SSL validity + days to expiry   : main domain only (PHP-native TLS probe)
 *   - availability %                  : honestly measured from a rolling sample
 *                                        store (NOT fabricated); + sample count
 *   - system uptime (days)            : from /proc/uptime (real)
 *   - last checked timestamp
 *
 * DELIBERATELY NOT EXPOSED (that is internal, admin-only in monitor.php):
 *   IP addresses, access logs, referrers, visitor counts, CPU load, memory,
 *   disk, bandwidth, process list, docker, kernel/OS, server IP, TLS cipher.
 *   Those are CAUSES / capacity data, not user-facing symptoms.
 *
 * ROBUSTNESS:
 *   - display_errors OFF → a warning can never corrupt the JSON body.
 *   - file-cache 60s → the endpoint does NOT curl on every request (anti-abuse).
 *   - fail-closed: on any error it still returns valid JSON.
 */

ini_set('display_errors', '0');
error_reporting(0);

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=60');
header('Referrer-Policy: no-referrer');

// ── FIXED allowlist — OUR domains only. Hard-coded. No user input. ──────────
// Mirrors the `sites` array in src/App.jsx. Editing THIS array is the only way
// to change what is probed → the SSRF attack surface is exactly zero.
$SERVICES = [
    ['name' => 'carbonstealth.eu',            'label' => 'Carbon Stealth',   'url' => 'https://carbonstealth.eu'],
    ['name' => 'ouvaptsarov.com',             'label' => 'OU Vaptsarov',     'url' => 'https://ouvaptsarov.com'],
    ['name' => 'nexus.carbonstealth.eu',      'label' => 'Nexus Dominion',   'url' => 'https://nexus.carbonstealth.eu'],
    ['name' => 'tretimart.carbonstealth.eu',  'label' => 'Treti Mart',       'url' => 'https://tretimart.carbonstealth.eu'],
    ['name' => 'erp.carbonstealth.eu',        'label' => 'ERP Ascensori',    'url' => 'https://erp.carbonstealth.eu'],
];

$MAIN_DOMAIN     = 'carbonstealth.eu';
$LATENCY_DEGRADE = 2000;  // ms — reachable but slow → degraded
$PROBE_TIMEOUT   = 6;     // s  — short, per-service hard cap
$CACHE_TTL       = 60;    // s  — anti-abuse file cache

$CACHE_FILE = sys_get_temp_dir() . '/cs_status_cache.json';
$STATE_FILE = sys_get_temp_dir() . '/cs_status_avail.json'; // rolling availability samples

// ── 1) Serve fresh cache verbatim (no probing) ─────────────────────────────
if (is_file($CACHE_FILE) && (time() - (int) @filemtime($CACHE_FILE)) < $CACHE_TTL) {
    $cached = @file_get_contents($CACHE_FILE);
    if ($cached !== false && $cached !== '') {
        header('X-Cache: HIT');
        echo $cached;
        exit;
    }
}
header('X-Cache: MISS');

// ── 1b) Single-flight: only ONE process probes per TTL window. Concurrent
// callers hitting an expired cache serve the last result instead of each firing
// 6 outbound probes (anti-amplification / cache-stampede guard). ───────────────
$LOCK_FP  = @fopen(sys_get_temp_dir() . '/cs_status.lock', 'c');
$haveLock = $LOCK_FP && @flock($LOCK_FP, LOCK_EX | LOCK_NB);
if ($LOCK_FP && !$haveLock) {
    $stale = @file_get_contents($CACHE_FILE);
    if ($stale !== false && $stale !== '') { header('X-Cache: STALE'); echo $stale; exit; }
    // No cache yet — block until the in-flight prober finishes, then serve it.
    if (@flock($LOCK_FP, LOCK_EX)) {
        $haveLock = true;
        $fresh = @file_get_contents($CACHE_FILE);
        if ($fresh !== false && $fresh !== '') { @flock($LOCK_FP, LOCK_UN); header('X-Cache: STALE'); echo $fresh; exit; }
        // Still nothing (rare) — keep the lock and probe ourselves.
    }
}

// ── 2) Probe each service in parallel (curl_multi) ─────────────────────────
/**
 * @return array{status:string,latency_ms:?int,http:int}
 * status ∈ up | degraded | down. A service is "up" on any HTTP response;
 * "degraded" on 5xx OR high latency; "down" only when unreachable/timeout.
 */
function cs_probe_all(array $services, int $timeout, int $degradeMs): array
{
    $out = [];
    if (!function_exists('curl_multi_init')) {
        // Extremely defensive fallback: mark unknown-as-down, still valid JSON.
        foreach ($services as $s) {
            $out[$s['name']] = ['status' => 'down', 'latency_ms' => null, 'http' => 0];
        }
        return $out;
    }

    $mh = curl_multi_init();
    $handles = [];
    foreach ($services as $s) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $s['url'],
            CURLOPT_NOBODY         => true,          // HEAD — we only need reachability
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT      => 'CarbonStealth-StatusProbe/1.0 (+https://carbonstealth.eu/status/)',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_PROTOCOLS      => defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 0,
            CURLOPT_REDIR_PROTOCOLS=> defined('CURLPROTO_HTTPS') ? CURLPROTO_HTTPS : 0,
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[$s['name']] = $ch;
    }

    $running = null;
    do {
        curl_multi_exec($mh, $running);
        if ($running) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running > 0);

    foreach ($handles as $name => $ch) {
        $errno = curl_errno($ch);
        $http  = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $ttMs  = (int) round((float) curl_getinfo($ch, CURLINFO_TOTAL_TIME) * 1000);

        if ($errno !== 0 || $http === 0) {
            $status  = 'down';
            $latency = null;
        } elseif ($http >= 500) {
            $status  = 'degraded';   // server responding but erroring (5xx)
            $latency = $ttMs;
        } elseif ($ttMs > $degradeMs) {
            $status  = 'degraded';   // reachable but slow
            $latency = $ttMs;
        } else {
            $status  = 'up';
            $latency = $ttMs;
        }

        $out[$name] = ['status' => $status, 'latency_ms' => $latency, 'http' => $http];
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);

    return $out;
}

// ── 3) SSL: days-to-expiry for the main domain (PHP-native, no shell) ──────
/** @return array{valid:bool,days:?int} */
function cs_ssl_info(string $host, int $port = 443): array
{
    $ctx = stream_context_create(['ssl' => [
        'capture_peer_cert' => true,
        'SNI_enabled'       => true,
        'verify_peer'       => false, // we only read notAfter; validity = not expired
        'verify_peer_name'  => false,
    ]]);
    $errno = 0; $errstr = '';
    $client = @stream_socket_client(
        "ssl://{$host}:{$port}", $errno, $errstr, 5,
        STREAM_CLIENT_CONNECT, $ctx
    );
    if (!$client) {
        return ['valid' => false, 'days' => null];
    }
    $params = stream_context_get_params($client);
    @fclose($client);
    $cert = $params['options']['ssl']['peer_certificate'] ?? null;
    if (!$cert || !function_exists('openssl_x509_parse')) {
        return ['valid' => false, 'days' => null];
    }
    $info = @openssl_x509_parse($cert);
    if (!$info || empty($info['validTo_time_t'])) {
        return ['valid' => false, 'days' => null];
    }
    $days = (int) floor(((int) $info['validTo_time_t'] - time()) / 86400);
    return ['valid' => $days > 0, 'days' => $days];
}

// ── 4) System uptime in days (real, from /proc/uptime) ─────────────────────
function cs_uptime_days(): ?float
{
    $raw = @file_get_contents('/proc/uptime');
    if ($raw === false || $raw === '') {
        return null;
    }
    $secs = (float) strtok(trim($raw), ' ');
    return $secs > 0 ? round($secs / 86400, 1) : null;
}

// ── 5) Rolling availability %, honestly measured from our own samples ──────
/**
 * Persists one sample per real (uncached) run: 1 if overall==operational else 0.
 * Prunes to a 30-day window. Returns [pct, sampleCount].
 * This is NOT a fabricated SLA number — it is our measured uptime since probing
 * began (capped at 30 days). Starts at 100% until the first non-operational run.
 * @return array{pct:?float,samples:int}
 */
function cs_availability(string $stateFile, string $overall): array
{
    $now    = time();
    $window = 30 * 86400;
    // Hold ONE lock across the whole read-modify-write so concurrent requests
    // can't both read the same state, append, and clobber each other (lost
    // samples). fopen('c+') creates-or-opens without truncating.
    $fp = @fopen($stateFile, 'c+');
    if ($fp) { @flock($fp, LOCK_EX); }
    $raw = $fp ? stream_get_contents($fp) : @file_get_contents($stateFile);
    $st  = ($raw !== false && $raw !== '') ? json_decode($raw, true) : null;
    if (!is_array($st)) {
        $st = [];
    }
    // prune old
    $st = array_values(array_filter($st, static function ($row) use ($now, $window) {
        return isset($row['t']) && ($now - (int) $row['t']) <= $window;
    }));
    // append current
    $st[] = ['t' => $now, 'ok' => $overall === 'operational' ? 1 : 0];
    // cap size hard (defensive against unbounded growth; 30d * every 60s ≈ 43k)
    if (count($st) > 50000) {
        $st = array_slice($st, -50000);
    }
    if ($fp) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($st));
        fflush($fp);
        @flock($fp, LOCK_UN);
        fclose($fp);
        @chmod($stateFile, 0600);
    }

    $total = count($st);
    if ($total === 0) {
        return ['pct' => null, 'samples' => 0];
    }
    $ok = 0;
    foreach ($st as $row) {
        $ok += (int) ($row['ok'] ?? 0);
    }
    return ['pct' => round($ok / $total * 100, 3), 'samples' => $total];
}

// ── 6) Assemble the public payload ─────────────────────────────────────────
$probes = cs_probe_all($SERVICES, $PROBE_TIMEOUT, $LATENCY_DEGRADE);

$services = [];
$counts   = ['up' => 0, 'degraded' => 0, 'down' => 0];
foreach ($SERVICES as $s) {
    $p = $probes[$s['name']] ?? ['status' => 'down', 'latency_ms' => null, 'http' => 0];
    $counts[$p['status']] = ($counts[$p['status']] ?? 0) + 1;
    $services[] = [
        'name'       => $s['name'],
        'label'      => $s['label'],
        'status'     => $p['status'],
        'latency_ms' => $p['latency_ms'],
    ];
}

// Overall symptom classification
if ($counts['down'] === count($SERVICES)) {
    $overall = 'down';
} elseif ($counts['down'] > 0 || $counts['degraded'] > 0) {
    $overall = 'degraded';
} else {
    $overall = 'operational';
}

$ssl   = cs_ssl_info($MAIN_DOMAIN);
$avail = cs_availability($STATE_FILE, $overall);

$payload = [
    'ok'           => true,
    'overall'      => $overall,             // operational | degraded | down
    'summary'      => [
        'total'    => count($SERVICES),
        'up'       => $counts['up'],
        'degraded' => $counts['degraded'],
        'down'     => $counts['down'],
    ],
    'services'     => $services,
    'ssl'          => [
        'domain' => $MAIN_DOMAIN,
        'valid'  => $ssl['valid'],
        'days'   => $ssl['days'],
    ],
    'availability' => [
        'pct'     => $avail['pct'],         // measured, honest
        'samples' => $avail['samples'],
        'window'  => '30d',
    ],
    'system_uptime_days' => cs_uptime_days(),
    'checked_at'         => gmdate('c'),    // ISO-8601 UTC
];

$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    // fail-closed: always valid JSON
    http_response_code(200);
    echo '{"ok":false,"error":"encode_failed"}';
    exit;
}

// ── 7) Write cache atomically, then emit ───────────────────────────────────
$tmp = $CACHE_FILE . '.' . getmypid() . '.tmp';
if (@file_put_contents($tmp, $json, LOCK_EX) !== false) {
    @chmod($tmp, 0644);
    @rename($tmp, $CACHE_FILE);
}

// release the single-flight lock so the next TTL window can probe
if (!empty($haveLock) && !empty($LOCK_FP)) { @flock($LOCK_FP, LOCK_UN); @fclose($LOCK_FP); }

echo $json;
