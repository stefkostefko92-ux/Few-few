<?php
/**
 * ==============================================================
 *  PANEV ASCENSORI — Contact form handler (PHP)
 *  Endpoint: POST /contact.php
 *
 *  Validates input, sends email via PHP mail() / SMTP,
 *  and forwards to Node.js backend for database persistence.
 *
 *  Dependencies: PHP 8.1+, mail() or sendmail/postfix configured.
 * ==============================================================
 */

declare(strict_types=1);

// Force JSON output
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, no-cache, must-revalidate');

// Only POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// ──────────────────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────────────────
$TO_EMAIL        = 'info@panevascensori.it';
$FROM_EMAIL      = 'noreply@panevascensori.it';     // must match domain
$FROM_NAME       = 'Panev Ascensori — Sito Web';
$NODE_API_URL    = 'http://127.0.0.1:4102/api/contact';
$LOG_FILE        = '/var/log/panev-contact.log';

// ──────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────
function jsonResponse(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function sanitize(string $s, int $max = 500): string {
    $s = trim($s);
    $s = strip_tags($s);
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    // Remove any header injection attempts
    $s = preg_replace('/(content-type|bcc|cc|to|from|subject|reply-to):/i', '', $s);
    if (mb_strlen($s) > $max) {
        $s = mb_substr($s, 0, $max);
    }
    return $s;
}

// Strip every line break — for values placed into email headers (From/Reply-To),
// where any newline is a header-injection vector.
function sanitizeHeader(string $s, int $max = 200): string {
    return sanitize(str_replace(["\r", "\n"], ' ', $s), $max);
}

function validEmail(string $e): bool {
    return filter_var($e, FILTER_VALIDATE_EMAIL) !== false && mb_strlen($e) <= 254;
}

function clientIp(): string {
    foreach (['HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            $ip = explode(',', $_SERVER[$k])[0];
            return trim($ip);
        }
    }
    return 'unknown';
}

function logLine(string $msg): void {
    global $LOG_FILE;
    @file_put_contents(
        $LOG_FILE,
        '[' . date('c') . '] ' . $msg . "\n",
        FILE_APPEND | LOCK_EX
    );
}

// ──────────────────────────────────────────────────────────
//  Parse input — accept JSON or form-encoded
// ──────────────────────────────────────────────────────────
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$data = [];

if (stripos($contentType, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $decoded = json_decode($raw ?: '{}', true);
    if (!is_array($decoded)) {
        jsonResponse(400, ['error' => 'Invalid JSON payload']);
    }
    $data = $decoded;
} else {
    $data = $_POST;
}

// ──────────────────────────────────────────────────────────
//  Honeypot — silent reject if bots fill hidden field
// ──────────────────────────────────────────────────────────
if (!empty($data['website']) || !empty($data['url_field'])) {
    // Pretend success to confuse bots
    logLine('HONEYPOT triggered from ' . clientIp());
    jsonResponse(200, ['ok' => true, 'id' => 'hp_' . bin2hex(random_bytes(6))]);
}

// ──────────────────────────────────────────────────────────
//  Rate limiting — max 3 submissions per IP per hour
// ──────────────────────────────────────────────────────────
$rateFile = sys_get_temp_dir() . '/panev_rate_' . md5(clientIp()) . '.json';
$rateData = ['count' => 0, 'reset' => time() + 3600];
if (file_exists($rateFile)) {
    $existing = @json_decode(@file_get_contents($rateFile), true);
    if (is_array($existing) && $existing['reset'] > time()) {
        $rateData = $existing;
    }
}
if ($rateData['count'] >= 5) {
    jsonResponse(429, [
        'error' => 'Troppe richieste. Riprova tra 1 ora o chiama +39 346 305 4093.',
    ]);
}

// ──────────────────────────────────────────────────────────
//  Sanitize + validate required fields
// ──────────────────────────────────────────────────────────
// nome/servizio land in mail headers + Subject → strip line breaks to block header injection
$nome       = sanitizeHeader((string)($data['nome'] ?? ''), 100);
$email      = strtolower(sanitize((string)($data['email'] ?? ''), 254));
$tel        = sanitizeHeader((string)($data['tel'] ?? $data['telefono'] ?? ''), 50);
$azienda    = sanitize((string)($data['azienda'] ?? ''), 150);
$citta      = sanitize((string)($data['citta'] ?? ''), 100);
$servizio   = sanitizeHeader((string)($data['servizio'] ?? $data['oggetto'] ?? 'Richiesta generica'), 200);
$messaggio  = sanitize((string)($data['messaggio'] ?? $data['message'] ?? ''), 5000);
$privacy    = !empty($data['privacy']);
$source     = sanitize((string)($data['source'] ?? 'website'), 50);
$carrello   = isset($data['items']) && is_array($data['items']) ? $data['items'] : [];
$totale     = (float)($data['totale'] ?? $data['total'] ?? 0);

$errors = [];
if (mb_strlen($nome) < 2)       $errors['nome']      = 'Nome richiesto';
if (!validEmail($email))        $errors['email']     = 'Email non valida';
if (mb_strlen($messaggio) < 10) $errors['messaggio'] = 'Messaggio troppo corto (min 10 caratteri)';
if (!$privacy)                  $errors['privacy']   = 'Devi accettare la privacy policy';

if (!empty($errors)) {
    jsonResponse(422, ['error' => 'Campi mancanti', 'fields' => $errors]);
}

// Update rate limit
$rateData['count']++;
@file_put_contents($rateFile, json_encode($rateData), LOCK_EX);

// Unique ID
$msgId = 'msg_' . date('YmdHis') . '_' . bin2hex(random_bytes(4));

// ──────────────────────────────────────────────────────────
//  Forward to Node.js API for DB persistence (non-blocking)
// ──────────────────────────────────────────────────────────
$nodePayload = [
    'nome'      => $nome,
    'email'     => $email,
    'tel'       => $tel,
    'azienda'   => $azienda,
    'citta'     => $citta,
    'servizio'  => $servizio,
    'messaggio' => $messaggio,
    'privacy'   => true,
    'source'    => $source,
    'items'     => $carrello,
    'totale'    => $totale,
    'phpId'     => $msgId,
];
$ch = curl_init($NODE_API_URL);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($nodePayload),
    CURLOPT_TIMEOUT => 3,
    CURLOPT_CONNECTTIMEOUT => 2,
]);
$nodeResp = curl_exec($ch);
$nodeHttp = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($nodeHttp !== 200 && $nodeHttp !== 201) {
    logLine("Node API failed (HTTP $nodeHttp) for msg $msgId — continuing with email");
}

// ──────────────────────────────────────────────────────────
//  Build email (HTML) to admin
// ──────────────────────────────────────────────────────────
$isQuote = ($source === 'carrello' || $source === 'quote' || !empty($carrello));
$subject = $isQuote
    ? "🛒 Nuova Richiesta Preventivo · $nome"
    : "✉ Nuovo contatto dal sito · $servizio";

// Items HTML (if from cart)
$itemsHtml = '';
if (!empty($carrello)) {
    $itemsHtml .= '<h3 style="color:#162861;margin:24px 0 12px;font-family:Georgia,serif">Articoli richiesti</h3>';
    $itemsHtml .= '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e1e5eb">';
    $itemsHtml .= '<thead><tr style="background:#162861;color:#fff"><th style="padding:10px 12px;text-align:left;font-size:13px">Prodotto</th><th style="padding:10px 12px;text-align:left;font-size:13px">Codice</th><th style="padding:10px 12px;text-align:right;font-size:13px">Qty</th><th style="padding:10px 12px;text-align:right;font-size:13px">Prezzo</th><th style="padding:10px 12px;text-align:right;font-size:13px">Subtotale</th></tr></thead><tbody>';
    foreach ($carrello as $item) {
        $iname = htmlspecialchars($item['name'] ?? '—', ENT_QUOTES, 'UTF-8');
        $icode = htmlspecialchars($item['codice'] ?? $item['id'] ?? '', ENT_QUOTES, 'UTF-8');
        $iqty  = (int)($item['qty'] ?? 1);
        $iprice = (float)($item['price'] ?? 0);
        $isub  = $iqty * $iprice;
        $itemsHtml .= "<tr style='border-top:1px solid #e1e5eb'>";
        $itemsHtml .= "<td style='padding:10px 12px;font-size:13px'>$iname</td>";
        $itemsHtml .= "<td style='padding:10px 12px;font-family:monospace;font-size:12px;color:#6b7380'>$icode</td>";
        $itemsHtml .= "<td style='padding:10px 12px;text-align:right;font-size:13px'>$iqty</td>";
        $itemsHtml .= "<td style='padding:10px 12px;text-align:right;font-size:13px'>€" . number_format($iprice, 2, ',', '.') . "</td>";
        $itemsHtml .= "<td style='padding:10px 12px;text-align:right;font-weight:600;font-size:13px'>€" . number_format($isub, 2, ',', '.') . "</td>";
        $itemsHtml .= "</tr>";
    }
    $itemsHtml .= "</tbody><tfoot><tr style='background:#f5f7fa;font-weight:700'>";
    $itemsHtml .= "<td colspan='4' style='padding:12px;text-align:right;font-size:14px;color:#162861'>TOTALE (IVA esclusa)</td>";
    $itemsHtml .= "<td style='padding:12px;text-align:right;font-size:16px;color:#162861'>€" . number_format($totale, 2, ',', '.') . "</td>";
    $itemsHtml .= "</tr></tfoot></table>";
}

$safeFields = [
    'Nome'       => $nome,
    'Email'      => $email,
    'Telefono'   => $tel ?: '—',
    'Azienda'    => $azienda ?: '—',
    'Città'      => $citta ?: '—',
    'Servizio'   => $servizio,
    'ID msg'     => $msgId,
    'IP'         => clientIp(),
    'Data/ora'   => date('d/m/Y H:i:s'),
    'Fonte'      => $source,
];
$fieldsHtml = '';
foreach ($safeFields as $k => $v) {
    $v = htmlspecialchars($v, ENT_QUOTES, 'UTF-8');
    $fieldsHtml .= "<tr><td style='padding:8px 12px;color:#6b7380;font-size:13px;width:140px'>$k</td>";
    $fieldsHtml .= "<td style='padding:8px 12px;font-size:13px;font-weight:500'>$v</td></tr>";
}

$msgSafe = nl2br(htmlspecialchars($messaggio, ENT_QUOTES, 'UTF-8'));

$htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"><title>$subject</title></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f1419">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fa;padding:30px 0">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(22,40,97,0.1)">

<tr><td style="background:#162861;padding:28px 32px">
<div style="color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:6px">Panev Ascensori · Nuovo messaggio</div>
<h1 style="color:#fff;margin:0;font-size:22px;font-weight:500;font-family:Georgia,serif">$subject</h1>
</td></tr>

<tr><td style="padding:28px 32px">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e1e5eb;border-radius:4px">
$fieldsHtml
</table>

<h3 style="color:#162861;margin:24px 0 12px;font-family:Georgia,serif;font-weight:500;font-size:16px">Messaggio</h3>
<div style="background:#f5f7fa;border-left:3px solid #162861;padding:16px 20px;font-size:14px;line-height:1.6;color:#2a313a;white-space:pre-wrap">$msgSafe</div>

$itemsHtml

<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e1e5eb;display:flex;gap:10px;flex-wrap:wrap">
<a href="mailto:$email?subject=Re: $servizio" style="display:inline-block;padding:10px 22px;background:#162861;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600">✉ Rispondi</a>
<a href="tel:$tel" style="display:inline-block;padding:10px 22px;background:#fff;color:#162861;border:1.5px solid #162861;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600">📞 Chiama</a>
</div>
</td></tr>

<tr><td style="background:#f5f7fa;padding:16px 32px;text-align:center;color:#6b7380;font-size:11px">
Questo messaggio è stato inviato automaticamente dal form su <a href="https://www.panevascensori.it" style="color:#162861;text-decoration:none">panevascensori.it</a><br>
Panev Ascensori SAS · P.IVA IT09346970966 · Vittuone (MI)
</td></tr>
</table>
</td></tr></table>
</body></html>
HTML;

// Plain text fallback
$textBody = "PANEV ASCENSORI — Nuovo messaggio dal sito\n";
$textBody .= str_repeat('=', 50) . "\n\n";
foreach ($safeFields as $k => $v) {
    $textBody .= sprintf("%-12s %s\n", $k . ':', $v);
}
$textBody .= "\nMessaggio:\n$messaggio\n";
if (!empty($carrello)) {
    $textBody .= "\n--- Articoli richiesti ---\n";
    foreach ($carrello as $item) {
        $textBody .= sprintf(
            "- %s (%s) x%d @ €%s = €%s\n",
            $item['name'] ?? '',
            $item['codice'] ?? '',
            (int)($item['qty'] ?? 1),
            number_format((float)($item['price'] ?? 0), 2, ',', '.'),
            number_format((float)($item['price'] ?? 0) * (int)($item['qty'] ?? 1), 2, ',', '.')
        );
    }
    $textBody .= sprintf("\nTOTALE: €%s (IVA esclusa)\n", number_format($totale, 2, ',', '.'));
}

// ──────────────────────────────────────────────────────────
//  Send email to admin
// ──────────────────────────────────────────────────────────
$boundary = 'panev_' . md5(uniqid((string)time()));
$headers  = "MIME-Version: 1.0\r\n";
$headers .= "From: $FROM_NAME <$FROM_EMAIL>\r\n";
$headers .= "Reply-To: $nome <$email>\r\n";
$headers .= "Return-Path: $FROM_EMAIL\r\n";
$headers .= "X-Mailer: PanevContactForm/1.0\r\n";
$headers .= "Message-ID: <$msgId@panevascensori.it>\r\n";
$headers .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

$body  = "--$boundary\r\n";
$body .= "Content-Type: text/plain; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
$body .= $textBody . "\r\n\r\n";
$body .= "--$boundary\r\n";
$body .= "Content-Type: text/html; charset=UTF-8\r\n";
$body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
$body .= $htmlBody . "\r\n";
$body .= "--$boundary--";

$mailOk = @mail($TO_EMAIL, $subject, $body, $headers, "-f$FROM_EMAIL");

// ──────────────────────────────────────────────────────────
//  Send confirmation to user
// ──────────────────────────────────────────────────────────
$userSubject = $isQuote
    ? 'Abbiamo ricevuto la tua richiesta di preventivo — Panev Ascensori'
    : 'Grazie per averci contattato — Panev Ascensori';

$userHtml = <<<HTML
<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f1419">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f7fa;padding:30px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgba(22,40,97,0.08)">

<tr><td style="background:#162861;padding:32px;text-align:center">
<div style="color:#fff;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:8px">Panev Ascensori</div>
<h1 style="color:#fff;margin:0;font-size:24px;font-weight:400;font-family:Georgia,serif">Grazie, $nome</h1>
</td></tr>

<tr><td style="padding:32px">
<p style="font-size:16px;line-height:1.6;color:#2a313a;margin:0 0 16px">
Abbiamo ricevuto la tua richiesta e ti risponderemo <strong>entro 2 ore lavorative</strong> (lunedì-venerdì 8:00-18:00).
</p>
<p style="font-size:15px;line-height:1.6;color:#6b7380;margin:0 0 24px">
Il nostro team sta già esaminando la tua richiesta relativa a:<br>
<strong style="color:#162861">$servizio</strong>
</p>

<div style="background:#f5f7fa;border-radius:6px;padding:18px 22px;margin:0 0 24px">
<div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#162861;margin-bottom:10px;font-weight:600">Il tuo riferimento</div>
<div style="font-family:monospace;font-size:14px;color:#0f1419">$msgId</div>
</div>

<h3 style="color:#162861;margin:24px 0 12px;font-family:Georgia,serif;font-weight:500;font-size:18px">Hai fretta?</h3>
<p style="font-size:14px;line-height:1.6;color:#6b7380;margin:0 0 16px">
Per richieste urgenti o pronto intervento:
</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px">
<tr><td style="padding:4px 0"><strong style="color:#162861">☎ Ufficio:</strong> <a href="tel:+393463054093" style="color:#162861">+39 346 305 4093</a> (lun-ven 8:00-18:00)</td></tr>
<tr><td style="padding:4px 0"><strong style="color:#162861">🚨 Emergenze 24/7:</strong> <a href="tel:+393926848978" style="color:#162861">+39 392 684 8978</a></td></tr>
<tr><td style="padding:4px 0"><strong style="color:#162861">✉ Email:</strong> <a href="mailto:info@panevascensori.it" style="color:#162861">info@panevascensori.it</a></td></tr>
</table>

<p style="font-size:14px;line-height:1.6;color:#6b7380;margin:24px 0 0;font-style:italic">
A presto,<br>
<strong style="color:#162861;font-style:normal">Team Panev Ascensori</strong>
</p>
</td></tr>

<tr><td style="background:#0d1a45;padding:20px 32px;text-align:center;color:rgba(255,255,255,0.7);font-size:11px;line-height:1.6">
Panev Ascensori SAS · P.IVA IT09346970966<br>
Via Madonna del Salvatore 6, 20010 Vittuone (MI) · Italia<br>
<a href="https://www.panevascensori.it" style="color:#fff;text-decoration:none">www.panevascensori.it</a>
</td></tr>

</table>
</td></tr></table>
</body></html>
HTML;

$userHeaders  = "MIME-Version: 1.0\r\n";
$userHeaders .= "From: Panev Ascensori <$FROM_EMAIL>\r\n";
$userHeaders .= "Reply-To: $TO_EMAIL\r\n";
$userHeaders .= "Content-Type: text/html; charset=UTF-8\r\n";
$userHeaders .= "X-Mailer: PanevContactForm/1.0\r\n";

@mail($email, $userSubject, $userHtml, $userHeaders, "-f$FROM_EMAIL");

// ──────────────────────────────────────────────────────────
//  Log + respond
// ──────────────────────────────────────────────────────────
logLine(sprintf(
    '[%s] %s <%s> [%s] msg=%s mailOk=%d nodeHttp=%d',
    $source,
    $nome,
    $email,
    $servizio,
    $msgId,
    $mailOk ? 1 : 0,
    $nodeHttp
));

jsonResponse(200, [
    'ok'       => true,
    'id'       => $msgId,
    'message'  => $isQuote
        ? 'Richiesta di preventivo ricevuta. Ti risponderemo entro 2 ore lavorative.'
        : 'Messaggio ricevuto. Ti risponderemo al più presto.',
    'mailSent' => $mailOk,
]);
