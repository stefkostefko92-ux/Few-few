<?php
/**
 * Carbon Stealth — IndexNow submission endpoint
 * Instant indexing for Bing, Yandex, Seznam, Naver
 * https://www.indexnow.org/documentation
 *
 * Usage:
 *   /api/indexnow.php?action=submit&url=https://carbonstealth.eu/blog/new-post/
 *   /api/indexnow.php?action=bulk (submits all URLs from sitemap.xml)
 *   /api/indexnow.php?action=status (returns last submission log)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: https://carbonstealth.eu');

// IndexNow key - generated once and hosted at https://carbonstealth.eu/{key}.txt
// Key must be 8-128 chars, hex only
define('INDEXNOW_KEY', 'cs26a9f3b7d1e4c8592f0a7b3d8e5c1f64');
define('HOST', 'carbonstealth.eu');
define('KEY_LOCATION', 'https://carbonstealth.eu/' . INDEXNOW_KEY . '.txt');
require_once __DIR__.'/_auth.php';

function jsonOut($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function submitUrls($urls) {
    if (empty($urls)) return ['ok' => false, 'error' => 'No URLs'];
    $urls = array_slice(array_values($urls), 0, 10000); // IndexNow max: 10000 per request

    $payload = json_encode([
        'host' => HOST,
        'key' => INDEXNOW_KEY,
        'keyLocation' => KEY_LOCATION,
        'urlList' => $urls,
    ]);

    $results = [];
    // Submit to multiple endpoints for redundancy
    $endpoints = [
        'https://api.indexnow.org/indexnow',
        'https://www.bing.com/indexnow',
        'https://yandex.com/indexnow',
    ];

    foreach ($endpoints as $endpoint) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $endpoint,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json; charset=utf-8',
                'Host: ' . parse_url($endpoint, PHP_URL_HOST),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_USERAGENT => 'CarbonStealthIndexNow/1.0',
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        $host = parse_url($endpoint, PHP_URL_HOST);
        $results[$host] = [
            'http_code' => $httpCode,
            'success' => ($httpCode >= 200 && $httpCode < 300),
            'response' => substr($response ?: $err, 0, 300),
        ];
    }

    // Log submission
    $logPath = __DIR__ . '/logs/indexnow.log';
    if (!file_exists(dirname($logPath))) @mkdir(dirname($logPath), 0755, true);
    @file_put_contents($logPath, json_encode([
        'ts' => date('c'),
        'url_count' => count($urls),
        'urls' => array_slice($urls, 0, 20), // log only first 20 for brevity
        'results' => $results,
    ]) . "\n", FILE_APPEND | LOCK_EX);

    return ['ok' => true, 'submitted' => count($urls), 'endpoints' => $results];
}

$action = $_GET['action'] ?? 'submit';
$input = json_decode(file_get_contents('php://input'), true) ?: [];

// === SUBMIT single URL ===
if ($action === 'submit') {
    cs_require_admin();
    $url = $_GET['url'] ?? $input['url'] ?? '';
    if (!$url) jsonOut(['ok' => false, 'error' => 'URL required'], 400);
    if (!filter_var($url, FILTER_VALIDATE_URL)) jsonOut(['ok' => false, 'error' => 'Invalid URL'], 400);
    if (strpos($url, 'https://' . HOST) !== 0) jsonOut(['ok' => false, 'error' => 'URL must be on ' . HOST], 400);

    jsonOut(submitUrls([$url]));
}

// === BULK: submit all sitemap URLs ===
if ($action === 'bulk') {
    cs_require_admin();

    // Read sitemaps straight from the local webroot (api/ lives in webroot/api/).
    // This avoids a self-HTTP round-trip that can fail on loopback/SSL/DNS and
    // is the #1 cause of "Submit All" errors. HTTP fetch is only a fallback.
    $webroot = realpath(__DIR__ . '/..') ?: dirname(__DIR__);
    $readLocal = function ($file) use ($webroot) {
        $p = $webroot . '/' . ltrim($file, '/');
        return (is_file($p) && is_readable($p)) ? (file_get_contents($p) ?: '') : '';
    };
    $fetch = function ($url) {
        $ch = curl_init();
        curl_setopt_array($ch, [CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => true]);
        $out = curl_exec($ch); curl_close($ch);
        return $out ?: '';
    };

    // 1. Read the sitemap index to discover every child sitemap file name.
    $childFiles = [];
    $idx = $readLocal('sitemap.xml');
    if (!$idx) $idx = $fetch('https://' . HOST . '/sitemap.xml');
    if ($idx && preg_match_all('#<loc>[^<]*/([^/<]+\.xml)</loc>#', $idx, $mi)) {
        $childFiles = $mi[1];
    }
    if (empty($childFiles)) { // fallback: known cluster file names
        foreach (['pages', 'blog', 'geo', 'comparisons', 'glossary', 'industries', 'servicecity', 'tools', 'casestudies', 'images'] as $n) {
            $childFiles[] = 'sitemap-' . $n . '.xml';
        }
    }

    // 2. Collect every <loc> that points at a real page (skip nested .xml links).
    $allUrls = [];
    foreach (array_unique($childFiles) as $file) {
        $xml = $readLocal($file);
        if (!$xml) $xml = $fetch('https://' . HOST . '/' . $file);
        if ($xml && preg_match_all('#<loc>([^<]+)</loc>#', $xml, $m)) {
            foreach ($m[1] as $u) {
                if (substr($u, -4) !== '.xml') $allUrls[] = html_entity_decode($u, ENT_QUOTES);
            }
        }
    }

    $allUrls = array_values(array_unique($allUrls));
    if (empty($allUrls)) {
        jsonOut(['ok' => false, 'error' => 'No URLs found. Checked webroot: ' . $webroot . ' — is sitemap.xml deployed there?'], 500);
    }

    $res = submitUrls($allUrls);
    // Surface a hard failure when every search engine rejected the batch.
    $anyOk = false;
    foreach ($res['endpoints'] ?? [] as $e) { if (!empty($e['success'])) $anyOk = true; }
    if (!$anyOk) {
        $res['ok'] = false;
        $res['error'] = 'All IndexNow endpoints rejected the submission (check key file at ' . KEY_LOCATION . ').';
    }
    jsonOut($res);
}

// === STATUS: get submission history ===
if ($action === 'status') {
    cs_require_admin();

    $logPath = __DIR__ . '/logs/indexnow.log';
    if (!file_exists($logPath)) jsonOut(['ok' => true, 'submissions' => []]);

    $lines = array_slice(file($logPath), -20);
    $submissions = array_map(function($l) { return json_decode($l, true); }, $lines);
    $submissions = array_filter($submissions);

    jsonOut(['ok' => true, 'submissions' => array_reverse($submissions)]);
}

// === KEY: return the IndexNow key (for /{key}.txt verification) ===
if ($action === 'key') {
    header('Content-Type: text/plain');
    echo INDEXNOW_KEY;
    exit;
}

jsonOut(['ok' => false, 'error' => 'Unknown action. Use: submit, bulk, status, key'], 404);
