<?php
/**
 * Carbon Stealth — admin data store (campaigns / clients / tasks).
 * Server-backed persistence for the admin panel collections that used to
 * live only in the browser's localStorage. Admin-gated; stored as private
 * JSON files in CS_LOG_DIR.
 *
 *   GET  /api/admin-data.php?action=get&key=clients      -> {ok, data:[...]}
 *   POST /api/admin-data.php?action=set&key=clients      (body: JSON array)
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require_once __DIR__ . '/_auth.php';
cs_require_admin();

function ad_out($d, int $code = 200): void { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }

$ALLOWED = ['campaigns', 'clients', 'tasks'];
$key = preg_replace('/[^a-z]/', '', (string)($_GET['key'] ?? ''));
if (!in_array($key, $ALLOWED, true)) ad_out(['ok' => false, 'error' => 'Unknown key'], 400);

$file   = cs_log_dir() . '/data_' . $key . '.json';
$action = $_GET['action'] ?? 'get';

if ($action === 'get') {
    $d = json_decode((string)@file_get_contents($file), true);
    ad_out(['ok' => true, 'data' => is_array($d) ? array_values($d) : []]);
}

if ($action === 'set') {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 512 * 1024) ad_out(['ok' => false, 'error' => 'Payload too large'], 413);
    $body = json_decode($raw, true);
    if (!is_array($body)) ad_out(['ok' => false, 'error' => 'JSON array required'], 400);
    if (count($body) > 2000) ad_out(['ok' => false, 'error' => 'Too many items'], 400);
    if (@file_put_contents($file, json_encode(array_values($body), JSON_UNESCAPED_UNICODE), LOCK_EX) === false) {
        ad_out(['ok' => false, 'error' => 'Cannot write. Check permissions.'], 500);
    }
    @chmod($file, 0600);
    ad_out(['ok' => true, 'count' => count($body)]);
}

ad_out(['ok' => false, 'error' => 'Unknown action'], 400);
