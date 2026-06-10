<?php
/**
 * Carbon Stealth — AI Terminal Proxy
 * Proxies the website AI terminal to the Anthropic Messages API.
 * The API key stays server-side — the browser must NEVER call
 * api.anthropic.com directly (no key = guaranteed 401; embedded key = leaked key).
 *
 * Setup: set ANTHROPIC_API_KEY in the PHP-FPM environment
 * (e.g. /etc/php/8.3/fpm/pool.d/www.conf: env[ANTHROPIC_API_KEY] = sk-ant-...)
 */

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$apiKey = getenv('ANTHROPIC_API_KEY') ?: '';
if ($apiKey === '') {
    http_response_code(503);
    echo json_encode(['error' => 'AI terminal is not configured']);
    exit;
}

// ─── Per-IP rate limit: 20 requests / 10 minutes ───
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$bucket = __DIR__ . '/logs/ai-rate-' . md5($ip) . '.json';
$now = time();
$hits = [];
if (is_file($bucket)) {
    $hits = json_decode((string)file_get_contents($bucket), true) ?: [];
    $hits = array_values(array_filter($hits, fn($t) => $t > $now - 600));
}
if (count($hits) >= 20) {
    http_response_code(429);
    echo json_encode(['error' => 'Rate limit exceeded. Try again in a few minutes.']);
    exit;
}
$hits[] = $now;
@file_put_contents($bucket, json_encode($hits));

// ─── Input ───
$body = json_decode((string)file_get_contents('php://input'), true);
$msg = trim((string)($body['message'] ?? ''));
if ($msg === '' || mb_strlen($msg) > 2000) {
    http_response_code(400);
    echo json_encode(['error' => 'message required (max 2000 chars)']);
    exit;
}

// System prompt lives server-side so visitors can't rewrite it
$system = "You are the AI brain embedded in Carbon Stealth VCC's website (carbonstealth.eu). "
    . "Carbon Stealth is a digital solutions agency registered in Bulgaria (EIK: BG208725180) based in Bobov Dol, Bulgaria. "
    . "CEO & Founder: Stefan Kostadinov. Services: web development (React, Node.js, from €800), e-commerce (from €1,200), "
    . "custom software (from €2,000), ERP systems (from €5,000), mobile apps (from €3,000), SEO/GEO/AEO (from €500/mo), "
    . "managed cloud hosting (from €29/mo). Real projects: Nexus Dominion (browser MMO, React+Node+PostgreSQL+Redis), "
    . "Panev Ascensori (Italian elevator manufacturer e-commerce, ERP in production), OU Nikola Vaptsarov (school website), "
    . "Gaming Portal, CS Anticheat v4.0 (FiveM, 40+ detection modules), Treti Mart. "
    . "Languages: Italian, English, Bulgarian. Contact: info@carbonstealth.eu, IT +39 379 296 9699, BG +359 877 414 874, free quote within 24h. "
    . "Be direct, technically sharp, brutalist. Keep answers SHORT (2-5 sentences). Reply in the language the user writes in. Never break character.";

$payload = json_encode([
    'model' => 'claude-opus-4-8',
    'max_tokens' => 1000,
    'system' => $system,
    'messages' => [['role' => 'user', 'content' => $msg]],
], JSON_UNESCAPED_UNICODE);

$ch = curl_init('https://api.anthropic.com/v1/messages');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'x-api-key: ' . $apiKey,
        'anthropic-version: 2023-06-01',
    ],
]);
$resp = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($resp === false || $status >= 500) {
    http_response_code(502);
    echo json_encode(['error' => 'AI service temporarily unavailable']);
    exit;
}

$data = json_decode($resp, true);
if ($status !== 200 || !isset($data['content'][0]['text'])) {
    // Don't leak upstream error details (they can include request internals)
    http_response_code(502);
    echo json_encode(['error' => 'AI service error']);
    exit;
}

echo json_encode(['text' => $data['content'][0]['text']], JSON_UNESCAPED_UNICODE);
