<?php
/**
 * Carbon Stealth — THE MONUMENT
 * Every visitor permanently adds one crystal shard to a collective,
 * ever-growing structure. Stores only an anonymous 12-hex behavioral
 * seed + timestamp — no PII, no cookies, GDPR-clean.
 *
 *   GET  /api/monument.php          -> {ok, count, seeds:[last 1200]}
 *   POST /api/monument.php {seed}   -> {ok, count, index}
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__.'/_auth.php';
$dataFile = cs_log_dir() . '/monument.dat';
$dir = dirname($dataFile);
if (!is_dir($dir)) @mkdir($dir, 0755, true);

function countLines($file) {
    if (!is_file($file)) return 0;
    $n = 0; $h = fopen($file, 'rb');
    while (!feof($h)) $n += substr_count(fread($h, 65536), "\n");
    fclose($h);
    return $n;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $count = countLines($dataFile);
    $seeds = [];
    if ($count > 0) {
        // return only the most recent shards; the renderer caps anyway
        $lines = file($dataFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach (array_slice($lines, -1200) as $l) {
            $seeds[] = substr($l, 0, 12);
        }
    }
    echo json_encode(['ok' => true, 'count' => $count, 'seeds' => $seeds]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'GET or POST only']);
    exit;
}

$body = json_decode((string)file_get_contents('php://input'), true);
$seed = strtolower(trim((string)($body['seed'] ?? '')));
if (!preg_match('/^[0-9a-f]{12}$/', $seed)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid seed']);
    exit;
}

// One shard per IP per 12 hours — the monument grows by real visits, not reloads
$gate = $dir . '/monument-ip-' . cs_ip_key();
if (is_file($gate) && (time() - (int)filemtime($gate)) < 43200) {
    echo json_encode(['ok' => true, 'count' => countLines($dataFile), 'index' => -1, 'dedup' => true]);
    exit;
}
@touch($gate);

$fh = fopen($dataFile, 'ab');
if ($fh && flock($fh, LOCK_EX)) {
    fwrite($fh, $seed . ',' . time() . "\n");
    flock($fh, LOCK_UN);
    fclose($fh);
}

$count = countLines($dataFile);
echo json_encode(['ok' => true, 'count' => $count, 'index' => $count - 1]);
