<?php
/**
 * Carbon Stealth — Server-Sent Events for real-time lead notifications
 * Watches /api/logs/leads.log for new entries and pushes them to the admin panel
 *
 * Usage: fetch a ticket from /api/sse-ticket.php (admin-gated), then
 *        new EventSource('/api/sse-leads.php?ticket=<ticket>')
 * Nothing session-like is placed in the URL (it would leak into access logs). The ticket is bound
 * to the admin session: the stream checks that session on every tick and ends with
 * `event: revoked` as soon as it is logged out or revoked.
 */

require_once __DIR__.'/_auth.php';
$sessionKey = cs_check_sse_ticket((string)($_GET['ticket'] ?? ''));
if ($sessionKey === '') {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'Invalid or expired ticket']);
    exit;
}

function sse_flush(): void {
    if (ob_get_level() > 0) @ob_flush();   // ob_flush() without a buffer would print a notice into the stream
    flush();
}

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('Access-Control-Allow-Origin: https://carbonstealth.eu');
header('X-Accel-Buffering: no'); // Nginx: disable buffering

// Flush padding for proxies
echo str_repeat(' ', 2048) . "\n";
sse_flush();

$logPath = cs_log_dir() . '/leads.log';
$lastSize = file_exists($logPath) ? filesize($logPath) : 0;
$lastCheck = time();
$keepAliveInterval = 15; // seconds

// Send initial heartbeat
echo "event: connected\ndata: " . json_encode(['ts' => date('c'), 'status' => 'listening']) . "\n\n";
sse_flush();

// Watch for new leads (poll every 2 seconds, max 5 minutes connection)
$startTime = time();
$maxRuntime = 300; // 5 minutes max

while (time() - $startTime < $maxRuntime) {
    if (connection_aborted()) break;
    // the admin logged out / was revoked → stop streaming leads (personal data) right away
    if (!cs_admin_session_key_alive($sessionKey)) {
        echo "event: revoked\ndata: " . json_encode(['message' => 'Session ended']) . "\n\n";
        sse_flush();
        exit;
    }

    if (file_exists($logPath)) {
        clearstatcache(true, $logPath);
        $currentSize = filesize($logPath);

        if ($currentSize > $lastSize) {
            // New data added — read the diff
            $fp = fopen($logPath, 'r');
            fseek($fp, $lastSize);
            $newData = fread($fp, $currentSize - $lastSize);
            fclose($fp);

            $lines = array_filter(explode("\n", trim($newData)));
            foreach ($lines as $line) {
                $lead = json_decode($line, true);
                if ($lead) {
                    echo "event: new_lead\ndata: " . json_encode($lead, JSON_UNESCAPED_UNICODE) . "\n\n";
                    sse_flush();
                }
            }
            $lastSize = $currentSize;
        }
    }

    // Send keepalive every 15s to prevent proxy timeout
    if (time() - $lastCheck >= $keepAliveInterval) {
        echo "event: heartbeat\ndata: " . json_encode(['ts' => date('c')]) . "\n\n";
        sse_flush();
        $lastCheck = time();
    }

    sleep(2);
}

// Connection cleanup
echo "event: timeout\ndata: " . json_encode(['message' => 'Connection timeout, reconnect']) . "\n\n";
sse_flush();
