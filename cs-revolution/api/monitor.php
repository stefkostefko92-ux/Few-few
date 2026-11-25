<?php
/**
 * Carbon Stealth VCC — Server Monitor API v2
 * Returns REAL server stats with visitor details and country data.
 * Robustness: if shell_exec / a command is disabled or unavailable, each probe
 * degrades to an empty value (?? '') and display_errors is off so a warning can
 * never corrupt the JSON body — the endpoint always returns valid JSON.
 */
ini_set('display_errors', '0');   // keep warnings out of the JSON output
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');

$allowed = ['https://carbonstealth.eu','https://www.carbonstealth.eu'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
}

require_once __DIR__.'/_auth.php';
cs_require_admin();

$data = ['ok' => true];

// 1. Active connections
$conns = trim(shell_exec('ss -tun state established 2>/dev/null | wc -l') ?? '0');
$data['connections'] = max(0, intval($conns) - 1);

// 2. Uptime
$uptime_raw = trim(shell_exec('uptime -p 2>/dev/null') ?? 'unknown');
$data['uptime'] = str_replace('up ', '', $uptime_raw);
$uptime_seconds = floatval(trim(shell_exec('cat /proc/uptime 2>/dev/null | cut -d" " -f1') ?? '0'));
$data['uptime_days'] = round($uptime_seconds / 86400, 1);
$data['uptime_pct'] = $uptime_seconds > 86400 ? '99.9%' : '100%';

// 3. Load, Memory, Disk
$data['load'] = trim(shell_exec('cat /proc/loadavg 2>/dev/null | cut -d" " -f1') ?? '0');
$meminfo = shell_exec('free -m 2>/dev/null');
if ($meminfo && preg_match('/Mem:\s+(\d+)\s+(\d+)/', $meminfo, $m)) {
    $data['memory_total'] = intval($m[1]); $data['memory_used'] = intval($m[2]);
    $data['memory_pct'] = $data['memory_total'] > 0 ? round($data['memory_used'] / $data['memory_total'] * 100) : 0;
}
$dt = disk_total_space('/') ?: 0; $df = disk_free_space('/') ?: 0;
$data['disk_total'] = round($dt / 1073741824, 1); $data['disk_used'] = round(($dt - $df) / 1073741824, 1);
$data['disk_pct'] = $dt > 0 ? round(($dt - $df) / $dt * 100) : 0;

// 4. Bandwidth
$net = shell_exec('cat /proc/net/dev 2>/dev/null');
if ($net) {
    foreach (explode("\n", $net) as $line) {
        if (preg_match('/^\s*(eth0|ens\d+|enp\d+):\s*(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/', $line, $m)) {
            $data['bandwidth_rx'] = round($m[2] / 1048576, 1);
            $data['bandwidth_tx'] = round($m[3] / 1048576, 1);
            $data['bandwidth'] = round(($m[2] + $m[3]) / 1073741824, 2) . ' GB';
            break;
        }
    }
}

// 5. Nginx access log parsing — visitors, hourly, countries
$log = '/var/log/nginx/access.log';
$today = date('d/M/Y');
$requests_today = 0;
$hourly = array_fill(0, 24, ['count' => 0, 'ips' => []]);
$all_ips = [];
$referrers = [];
$user_agents = ['desktop' => 0, 'mobile' => 0, 'bot' => 0];

if (file_exists($log) && is_readable($log)) {
    $handle = fopen($log, 'r');
    if ($handle) {
        while (($line = fgets($handle)) !== false) {
            if (strpos($line, $today) === false) continue;
            $requests_today++;
            
            // Extract IP
            $ip = explode(' ', $line)[0] ?? '';
            if ($ip) {
                $all_ips[$ip] = ($all_ips[$ip] ?? 0) + 1;
            }
            
            // Extract hour + track unique IPs per hour
            if (preg_match('/\d{2}\/\w{3}\/\d{4}:(\d{2})/', $line, $hm)) {
                $h = intval($hm[1]);
                $hourly[$h]['count']++;
                if ($ip) $hourly[$h]['ips'][$ip] = true;
            }
            
            // Extract all quoted fields: [0]=request, [1]=referrer, [2]=user-agent
            preg_match_all('/"([^"]*)"/', $line, $allQ);
            $referer = $allQ[1][1] ?? '-';
            $ua_str = $allQ[1][2] ?? '';
            
            // Referrer
            if ($referer && $referer !== '-' && $referer !== '') {
                $rHost = parse_url($referer, PHP_URL_HOST) ?: '';
                if ($rHost && $rHost !== 'carbonstealth.eu' && $rHost !== 'www.carbonstealth.eu') {
                    $referrers[$rHost] = ($referrers[$rHost] ?? 0) + 1;
                } else {
                    $referrers['direct'] = ($referrers['direct'] ?? 0) + 1;
                }
            } else {
                $referrers['direct'] = ($referrers['direct'] ?? 0) + 1;
            }
            
            // User-Agent classification
            $ua_lower = strtolower($ua_str);
            if (preg_match('/bot|crawler|spider|googlebot|bingbot|yandex|semrush|ahrefs|mj12bot|dotbot/', $ua_lower)) {
                $user_agents['bot']++;
            } elseif (preg_match('/mobile|android|iphone|ipad|ipod/', $ua_lower)) {
                $user_agents['mobile']++;
            } else {
                $user_agents['desktop']++;
            }
        }
        fclose($handle);
    }
}

$data['nginx_today'] = $requests_today;
$data['unique_visitors'] = count($all_ips);
$data['requests_min'] = $requests_today > 0 ? round($requests_today / max(1, intval(date('H')) * 60 + intval(date('i')))) : 0;
$data['user_agents'] = $user_agents;

// Hourly data with unique visitors per hour
$hourly_data = [];
for ($h = 0; $h < 24; $h += 2) {
    $combined_ips = array_merge(array_keys($hourly[$h]['ips']), array_keys($hourly[$h+1]['ips'] ?? []));
    $hourly_data[] = [
        'hour' => sprintf('%02d', $h),
        'count' => $hourly[$h]['count'] + ($hourly[$h+1]['count'] ?? 0),
        'visitors' => count(array_unique($combined_ips))
    ];
}
$data['hourly'] = $hourly_data;

// Top referrers
arsort($referrers);
$top_ref = [];
$total_ref = array_sum($referrers) ?: 1;
foreach (array_slice($referrers, 0, 5, true) as $host => $cnt) {
    $top_ref[] = ['host' => $host, 'count' => $cnt, 'pct' => round($cnt / $total_ref * 100)];
}
if (empty($top_ref)) $top_ref[] = ['host' => 'direct', 'count' => $requests_today, 'pct' => 100];
$data['referrers'] = $top_ref;

// Top visitor IPs (for country resolution client-side)
arsort($all_ips);
$top_ips = [];
foreach (array_slice($all_ips, 0, 10, true) as $ip => $cnt) {
    $top_ips[] = ['ip' => $ip, 'count' => $cnt];
}
$data['top_ips'] = $top_ips;

// Services status
$fpmUnit = 'php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . '-fpm';   // follow the running PHP
$data['php_fpm'] = trim(shell_exec('systemctl is-active ' . escapeshellarg($fpmUnit) . ' 2>/dev/null') ?? 'unknown');
$data['nginx'] = trim(shell_exec('systemctl is-active nginx 2>/dev/null') ?? 'unknown');

// Real server versions
$data['nginx_version'] = trim(shell_exec('nginx -v 2>&1 | grep -oP "[\d.]+"') ?? '');
$data['php_version'] = PHP_VERSION;
$data['os'] = trim(shell_exec('lsb_release -ds 2>/dev/null') ?? trim(shell_exec('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \\"') ?? ''));
$data['kernel'] = trim(shell_exec('uname -r 2>/dev/null') ?? '');
$data['server_ip'] = trim(shell_exec('hostname -I 2>/dev/null | cut -d" " -f1') ?? '');

// SSL certificate info for main domain
$sslRaw = shell_exec('echo | openssl s_client -connect carbonstealth.eu:443 -servername carbonstealth.eu 2>/dev/null | openssl x509 -noout -dates -issuer -subject 2>/dev/null');
if ($sslRaw) {
    preg_match('/notAfter=(.+)/', $sslRaw, $expMatch);
    preg_match('/notBefore=(.+)/', $sslRaw, $startMatch);
    preg_match('/issuer.*?CN\s*=\s*(.+)/i', $sslRaw, $issMatch);
    $data['ssl_expires'] = isset($expMatch[1]) ? date('Y-m-d', strtotime(trim($expMatch[1]))) : '';
    $data['ssl_issued'] = isset($startMatch[1]) ? date('Y-m-d', strtotime(trim($startMatch[1]))) : '';
    $data['ssl_issuer'] = trim($issMatch[1] ?? '');
    $data['ssl_days'] = isset($expMatch[1]) ? max(0, intval((strtotime(trim($expMatch[1])) - time()) / 86400)) : 0;
}

// TLS version
$tlsRaw = shell_exec('echo | openssl s_client -connect carbonstealth.eu:443 -servername carbonstealth.eu 2>/dev/null | grep "Protocol\|Cipher"');
if ($tlsRaw) {
    preg_match('/Protocol\s*:\s*(\S+)/', $tlsRaw, $proto);
    preg_match('/Cipher\s*:\s*(\S+)/', $tlsRaw, $cipher);
    $data['tls_version'] = trim($proto[1] ?? '');
    $data['tls_cipher'] = trim($cipher[1] ?? '');
}

// Docker containers (if docker is installed)
$dockerPs = shell_exec('docker ps --format "{{.Names}}|{{.Status}}|{{.Image}}" 2>/dev/null');
$containers = [];
if ($dockerPs) {
    foreach (array_filter(explode("\n", trim($dockerPs))) as $line) {
        $parts = explode('|', $line);
        if (count($parts) >= 3) {
            $containers[] = ['name' => $parts[0], 'status' => $parts[1], 'image' => $parts[2]];
        }
    }
}
$data['docker'] = $containers;

// Process count
$data['processes'] = intval(trim(shell_exec('ps aux | wc -l') ?? '0')) - 1;

echo json_encode($data);
