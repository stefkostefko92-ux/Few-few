<?php
/**
 * Carbon Stealth — issue a short-lived SSE ticket for the leads stream.
 * Admin-gated (X-CS-Token header). The ticket is what the EventSource then
 * uses, so the admin token never travels in a URL / access log.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

require_once __DIR__ . '/_auth.php';
cs_require_admin();

echo json_encode(['ok' => true, 'ticket' => cs_issue_sse_ticket(), 'ttl' => 120]);
