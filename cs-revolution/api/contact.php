<?php
/**
 * Carbon Stealth VCC — Contact Form Handler v3
 * PHPMailer SMTP + native mail() fallback + file log fallback
 * Rate limiting, honeypot, CORS, auto-reply IT/EN/BG
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');

$allowed = ['https://carbonstealth.eu','https://www.carbonstealth.eu'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ── READ CONTACT LOG (GET ?action=log) ──
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'log') {
    $logDir = __DIR__.'/logs';
    $entries = [];
    $files = glob($logDir.'/contacts_*.log');
    if ($files) {
        rsort($files);
        foreach ($files as $f) {
            $lines = file($f, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);
            foreach (array_reverse($lines) as $line) {
                $parts = explode(' | ', $line, 6);
                if (count($parts) >= 4) {
                    $entries[] = ['date'=>trim($parts[0]),'name'=>trim($parts[1]),'email'=>trim($parts[2]),'phone'=>trim($parts[3]),'lang'=>trim($parts[4] ?? ''),'message'=>trim($parts[5] ?? '')];
                }
            }
        }
    }
    echo json_encode(['ok'=>true,'entries'=>array_slice($entries, 0, 100)]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['ok'=>false,'error'=>'Method not allowed']); exit; }

require_once __DIR__.'/config.php';

// ── Rate limiting (IP-based, 5 requests/hour) ──
$rlDir = __DIR__.'/logs';
if (!is_dir($rlDir)) @mkdir($rlDir, 0750, true);
$ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_X_REAL_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$ip = explode(',', $ip)[0];
$rlFile = $rlDir.'/rl_'.md5($ip).'.json';
$rlData = file_exists($rlFile) ? json_decode(file_get_contents($rlFile), true) : ['count'=>0,'reset'=>time()+3600];
if (time() > ($rlData['reset'] ?? 0)) $rlData = ['count'=>0,'reset'=>time()+3600];
if (($rlData['count'] ?? 0) >= 5) {
    http_response_code(429);
    echo json_encode(['ok'=>false,'error'=>'Too many requests. Try again later.']);
    exit;
}
$rlData['count']++;
@file_put_contents($rlFile, json_encode($rlData));

// ── Parse input ──
$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;

$name    = trim(strip_tags($data['name'] ?? ''));
$email   = trim(strip_tags($data['email'] ?? ''));
$phone   = trim(strip_tags($data['phone'] ?? ''));
$message = trim(strip_tags($data['message'] ?? ''));
$lang    = trim(strip_tags($data['lang'] ?? 'en'));
$gotcha  = trim($data['_gotcha'] ?? '');

// Honeypot
if ($gotcha !== '') { echo json_encode(['ok'=>true]); exit; }

// Validation
if ($name === '' || strlen($name) < 2 || strlen($name) > 200) {
    http_response_code(400); echo json_encode(['ok'=>false,'error'=>'Invalid name']); exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400); echo json_encode(['ok'=>false,'error'=>'Invalid email']); exit;
}
if ($message === '' || strlen($message) < 5 || strlen($message) > 5000) {
    http_response_code(400); echo json_encode(['ok'=>false,'error'=>'Invalid message']); exit;
}

// reCAPTCHA v3 (if configured)
if (defined('RECAPTCHA_SECRET') && RECAPTCHA_SECRET !== '') {
    $token = $data['recaptcha'] ?? '';
    if ($token) {
        $rc = json_decode(file_get_contents('https://www.google.com/recaptcha/api/siteverify?secret='.RECAPTCHA_SECRET.'&response='.$token), true);
        if (!($rc['success'] ?? false) || ($rc['score'] ?? 0) < 0.3) {
            http_response_code(403); echo json_encode(['ok'=>false,'error'=>'Bot detected']); exit;
        }
    }
}

// ── Build email ──
$ts = date('Y-m-d H:i:s T');
$ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200);
$langFlag = match($lang) { 'it'=>'IT', 'bg'=>'BG', default=>'EN' };

$html = <<<H
<table style="width:100%;max-width:600px;font-family:monospace;background:#0a0a0a;color:#f5f5f0;padding:24px">
<tr><td>
  <div style="border-bottom:1px solid #00e5ff33;padding-bottom:12px;margin-bottom:16px">
    <strong style="color:#00e5ff;font-size:14px">CARBON STEALTH VCC — NEW CONTACT</strong>
  </div>
  <table style="width:100%;font-size:13px;line-height:2">
    <tr><td style="color:#999;width:90px">Name:</td><td><strong>$name</strong></td></tr>
    <tr><td style="color:#999">Email:</td><td><a href="mailto:$email" style="color:#00e5ff">$email</a></td></tr>
    <tr><td style="color:#999">Phone:</td><td>$phone</td></tr>
    <tr><td style="color:#999">Language:</td><td>$langFlag</td></tr>
  </table>
  <div style="margin-top:16px;padding:16px;background:#111;border-left:3px solid #00e5ff">
    <div style="color:#999;font-size:10px;margin-bottom:8px">MESSAGE:</div>
    <div style="white-space:pre-wrap">$message</div>
  </div>
  <div style="margin-top:16px;font-size:10px;color:#666">
    $ts · IP: $ip · $ua
  </div>
</td></tr></table>
H;

$txt = "CARBON STEALTH VCC — New Contact\n"
     . str_repeat("=", 50) . "\n"
     . "Name:     $name\nEmail:    $email\nPhone:    $phone\nLang:     $langFlag\n\n"
     . "Message:\n$message\n\n"
     . str_repeat("-", 50) . "\n"
     . "Date: $ts | IP: $ip";

// Auto-reply per lingua
$ar = match($lang) {
    'it' => [
        'sub' => 'Messaggio ricevuto — risponderemo entro 24 ore',
        'body'=> "Ciao $name,\n\nAbbiamo ricevuto la tua richiesta.\nIl team ti rispondera entro 24 ore lavorative.\n\nPer urgenze:\nIT: +39 379 296 9699 (WhatsApp)\nBG: +359 877 414 874\nEmail: info@carbonstealth.eu\n\nCordiali saluti,\nCarbon Stealth VCC\nhttps://carbonstealth.eu",
    ],
    'bg' => [
        'sub' => 'Съобщението е получено — ще отговорим до 24 часа',
        'body'=> "Здравейте $name,\n\nПолучихме вашето съобщение.\nЩе отговорим в рамките на 24 работни часа.\n\nЗа спешни въпроси:\nIT: +39 379 296 9699 (WhatsApp)\nBG: +359 877 414 874\nEmail: info@carbonstealth.eu\n\nС уважение,\nCarbon Stealth VCC\nhttps://carbonstealth.eu",
    ],
    default => [
        'sub' => 'Message received — we will reply within 24 hours',
        'body'=> "Hi $name,\n\nWe received your message.\nOur team will reply within 24 business hours.\n\nFor urgent matters:\nIT: +39 379 296 9699 (WhatsApp)\nBG: +359 877 414 874\nEmail: info@carbonstealth.eu\n\nBest regards,\nCarbon Stealth VCC\nhttps://carbonstealth.eu",
    ],
};

// ── SEND ──
$sent = false;
$subj = "New contact: $name — $langFlag";

// Attempt 1: PHPMailer SMTP
$hasPM = file_exists(__DIR__.'/../vendor/autoload.php');
if ($hasPM) {
    require __DIR__.'/../vendor/autoload.php';
    try {
        $m = new \PHPMailer\PHPMailer\PHPMailer(true);
        $m->isSMTP();
        $m->Host       = SMTP_HOST;
        $m->SMTPAuth   = true;
        $m->Username   = SMTP_USER;
        $m->Password   = SMTP_PASS;
        $m->SMTPSecure = (SMTP_SECURE==='ssl') ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $m->Port       = SMTP_PORT;
        $m->SMTPDebug  = SMTP_DEBUG;
        $m->CharSet    = 'UTF-8';
        $m->setFrom(SMTP_FROM, SMTP_FROM_NAME);
        $m->addReplyTo($email, $name);
        $m->addAddress(SMTP_TO);
        $m->Subject = $subj;
        $m->isHTML(true);
        $m->Body    = $html;
        $m->AltBody = $txt;
        $m->send();
        $sent = true;
        // Auto-reply
        $m->clearAddresses(); $m->clearReplyTos();
        $m->addAddress($email, $name);
        $m->setFrom(SMTP_FROM, SMTP_FROM_NAME);
        $m->Subject = $ar['sub'];
        $m->isHTML(false);
        $m->Body = $ar['body'];
        @$m->send();
    } catch (\Exception $e) { /* fallback below */ }
}

// Attempt 2: PHP native mail()
if (!$sent) {
    $hd = "From: ".SMTP_FROM_NAME." <".SMTP_FROM.">\r\nReply-To: $name <$email>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n";
    $sent = @mail(SMTP_TO, $subj, $html, $hd);
    if ($sent) @mail($email, $ar['sub'], $ar['body'], "From: ".SMTP_FROM_NAME." <".SMTP_FROM.">\r\nContent-Type: text/plain; charset=UTF-8\r\n");
}

// Attempt 3: Log to file (never lose a message)
$logEntry = date('c')." | $name | $email | $phone | $langFlag | ".substr($message,0,200)."\n";
@file_put_contents($rlDir.'/contacts_'.date('Y-m').'.log', $logEntry, FILE_APPEND|LOCK_EX);

if ($sent) {
    echo json_encode(['ok'=>true,'message'=>'sent']);
} else {
    echo json_encode(['ok'=>true,'message'=>'logged']);
    // Still return ok — message was logged, we'll see it
}
