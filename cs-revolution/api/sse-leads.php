<?php
/**
 * Carbon Stealth — Server-Sent Events for real-time lead notifications
 * Watches /api/logs/leads.log for new entries and pushes them to the admin panel
 *
 * Usage: new EventSource('/api/sse-leads.php?key=CS@dmin2026!')
 */

require_once __DIR__.'/_auth.php';
cs_require_admin();

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache');
header('Connection: keep-alive');
header('Access-Control-Allow-Origin: https://carbonstealth.eu');
header('X-Accel-Buffering: no'); // Nginx: disable buffering

// Flush padding for proxies
echo str_repeat(' ', 2048) . "\n";
ob_flush();
flush();

$logPath = cs_log_dir() . '/leads.log';
$lastSize = file_exists($logPath) ? filesize($logPath) : 0;
$lastCheck = time();
$keepAliveInterval = 15; // seconds

// Send initial heartbeat
echo "event: connected\ndata: " . json_encode(['ts' => date('c'), 'status' => 'listening']) . "\n\n";
ob_flush();
flush();

// Watch for new leads (poll every 2 seconds, max 5 minutes connection)
$startTime = time();
$maxRuntime = 300; // 5 minutes max

while (time() - $startTime < $maxRuntime) {
    if (connection_aborted()) break;

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
                    ob_flush();
                    flush();
                }
            }
            $lastSize = $currentSize;
        }
    }

    // Send keepalive every 15s to prevent proxy timeout
    if (time() - $lastCheck >= $keepAliveInterval) {
        echo "event: heartbeat\ndata: " . json_encode(['ts' => date('c')]) . "\n\n";
        ob_flush();
        flush();
        $lastCheck = time();
    }

    sleep(2);
}

// Connection cleanup
echo "event: timeout\ndata: " . json_encode(['message' => 'Connection timeout, reconnect']) . "\n\n";
ob_flush();
flush();
