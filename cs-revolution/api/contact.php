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
require_once __DIR__.'/_auth.php';

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
    cs_require_admin();
    $logDir = cs_log_dir();
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
// The whole read-modify-write is held under ONE exclusive lock. Locking only
// the write (LOCK_EX on file_put_contents) does not help: N concurrent requests
// all read count=0, all pass the check, and the limit collapses to 1.
$rlDir = cs_log_dir();
$ip = cs_client_ip();
$rlFile = $rlDir.'/rl_'.cs_ip_key($ip).'.json';
$rlOver = false;
$rlFp = @fopen($rlFile, 'c+');
if ($rlFp) {
    @flock($rlFp, LOCK_EX);
    $rlRaw  = stream_get_contents($rlFp);
    $rlData = $rlRaw !== '' ? json_decode($rlRaw, true) : null;
    if (!is_array($rlData)) $rlData = ['count'=>0,'reset'=>time()+3600];
    if (time() > ($rlData['reset'] ?? 0)) $rlData = ['count'=>0,'reset'=>time()+3600];
    if (($rlData['count'] ?? 0) >= 5) {
        $rlOver = true;
    } else {
        $rlData['count']++;
        ftruncate($rlFp, 0); rewind($rlFp);
        fwrite($rlFp, json_encode($rlData)); fflush($rlFp);
    }
    @flock($rlFp, LOCK_UN); fclose($rlFp); @chmod($rlFile, 0600);
}
if ($rlOver) {
    http_response_code(429);
    echo json_encode(['ok'=>false,'error'=>'Too many requests. Try again later.']);
    exit;
}

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

// reCAPTCHA v3 (enforced whenever a secret is configured).
// Previously the check sat behind `if ($token)`, so simply omitting the field
// skipped it — the entire anti-bot control was opt-in for the caller.
if (defined('RECAPTCHA_SECRET') && RECAPTCHA_SECRET !== '') {
    $token = (string)($data['recaptcha'] ?? '');
    if ($token === '') {
        http_response_code(403); echo json_encode(['ok'=>false,'error'=>'Bot detected']); exit;
    }
    $rcUrl = 'https://www.google.com/recaptcha/api/siteverify'
           . '?secret=' . urlencode(RECAPTCHA_SECRET)
           . '&response=' . urlencode($token);
    $rc = json_decode((string)@file_get_contents($rcUrl), true);
    if (!($rc['success'] ?? false) || ($rc['score'] ?? 0) < 0.3) {
        http_response_code(403); echo json_encode(['ok'=>false,'error'=>'Bot detected']); exit;
    }
}

// ── Build email ──
$ts = date('Y-m-d H:i:s T');
$ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200);
$langFlag = match($lang) { 'it'=>'IT', 'bg'=>'BG', default=>'EN' };
$nameH=cs_h($name); $emailH=cs_h($email); $phoneH=cs_h($phone); $messageH=cs_h($message); $uaH=cs_h($ua); $ipH=cs_h($ip);

$html = <<<H
<table style="width:100%;max-width:600px;font-family:monospace;background:#0a0a0a;color:#f5f5f0;padding:24px">
<tr><td>
  <div style="border-bottom:1px solid #00e5ff33;padding-bottom:12px;margin-bottom:16px">
    <strong style="color:#00e5ff;font-size:14px">CARBON STEALTH VCC — NEW CONTACT</strong>
  </div>
  <table style="width:100%;font-size:13px;line-height:2">
    <tr><td style="color:#999;width:90px">Name:</td><td><strong>$nameH</strong></td></tr>
    <tr><td style="color:#999">Email:</td><td><a href="mailto:$emailH" style="color:#00e5ff">$emailH</a></td></tr>
    <tr><td style="color:#999">Phone:</td><td>$phoneH</td></tr>
    <tr><td style="color:#999">Language:</td><td>$langFlag</td></tr>
  </table>
  <div style="margin-top:16px;padding:16px;background:#111;border-left:3px solid #00e5ff">
    <div style="color:#999;font-size:10px;margin-bottom:8px">MESSAGE:</div>
    <div style="white-space:pre-wrap">$messageH</div>
  </div>
  <div style="margin-top:16px;font-size:10px;color:#666">
    $ts · IP: $ipH · $uaH
  </div>
</td></tr></table>
H;

$txt = "CARBON STEALTH VCC — New Contact\n"
     . str_repeat("=", 50) . "\n"
     . "Name:     $name\nEmail:    $email\nPhone:    $phone\nLang:     $langFlag\n\n"
     . "Message:\n$message\n\n"
     . str_repeat("-", 50) . "\n"
     . "Date: $ts | IP: $ip";

// Auto-reply per lingua.
// SECURITY: the body must contain NO attacker-controlled text. This mail is
// sent, over our authenticated SMTP, to whatever address the (public,
// unauthenticated) form supplied — so echoing $name back would let anyone
// send arbitrary wording from info@carbonstealth.eu to any victim, with
// valid SPF/DKIM. Fixed greeting only.
$ar = match($lang) {
    'it' => [
        'sub' => 'Messaggio ricevuto — risponderemo entro 24 ore',
        'body'=> "Ciao,\n\nAbbiamo ricevuto la tua richiesta.\nIl team ti rispondera entro 24 ore lavorative.\n\nPer urgenze:\nIT: +39 379 296 9699 (WhatsApp)\nBG: +359 877 414 874\nEmail: info@carbonstealth.eu\n\nCordiali saluti,\nCarbon Stealth VCC\nhttps://carbonstealth.eu",
    ],
    'bg' => [
        'sub' => 'Съобщението е получено — ще отговорим до 24 часа',
        'body'=> "Здравейте,\n\nПолучихме вашето съобщение.\nЩе отговорим в рамките на 24 работни часа.\n\nЗа спешни въпроси:\nIT: +39 379 296 9699 (WhatsApp)\nBG: +359 877 414 874\nEmail: info@carbonstealth.eu\n\nС уважение,\nCarbon Stealth VCC\nhttps://carbonstealth.eu",
    ],
    default => [
        'sub' => 'Message received — we will reply within 24 hours',
        'body'=> "Hi,\n\nWe received your message.\nOur team will reply within 24 business hours.\n\nFor urgent matters:\nIT: +39 379 296 9699 (WhatsApp)\nBG: +359 877 414 874\nEmail: info@carbonstealth.eu\n\nBest regards,\nCarbon Stealth VCC\nhttps://carbonstealth.eu",
    ],
};

// ── SEND ──
$sent = false;
// cs_hdr_safe strips CR/LF/NUL: strip_tags does NOT, so a name containing
// "\r\nBcc: victim@x" would inject a header on the mail() fallback path.
$subj = cs_hdr_safe("New contact: $name — $langFlag");

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

// Attempt 1.5: native SMTP client (works without PHPMailer/composer)
if (!$sent && SMTP_PASS !== '') {
    require_once __DIR__.'/smtp-native.php';
    $smtpErr = '';
    $sent = cs_smtp_send([
        'host'=>SMTP_HOST,'port'=>SMTP_PORT,'secure'=>SMTP_SECURE,
        'user'=>SMTP_USER,'pass'=>SMTP_PASS,'from'=>SMTP_FROM,'from_name'=>SMTP_FROM_NAME,
        'to'=>SMTP_TO,'reply_to'=>$email,'reply_name'=>$name,
        'subject'=>$subj,'html'=>$html,'text'=>$txt,
    ], $smtpErr);
    if ($sent) {
        // Auto-reply to the visitor
        cs_smtp_send([
            'host'=>SMTP_HOST,'port'=>SMTP_PORT,'secure'=>SMTP_SECURE,
            'user'=>SMTP_USER,'pass'=>SMTP_PASS,'from'=>SMTP_FROM,'from_name'=>SMTP_FROM_NAME,
            'to'=>$email,'subject'=>$ar['sub'],
            'html'=>nl2br(htmlspecialchars($ar['body'])),'text'=>$ar['body'],
        ], $smtpErr2);
    } elseif (SMTP_DEBUG) {
        error_log('cs_smtp_send failed: '.$smtpErr);
    }
}

// Attempt 2: PHP native mail()
if (!$sent) {
    $hdName = cs_hdr_safe($name); $hdEmail = cs_hdr_safe($email);
    $hd = "From: ".SMTP_FROM_NAME." <".SMTP_FROM.">\r\nReply-To: $hdName <$hdEmail>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n";
    $sent = @mail(SMTP_TO, $subj, $html, $hd);
    if ($sent) @mail($email, $ar['sub'], $ar['body'], "From: ".SMTP_FROM_NAME." <".SMTP_FROM.">\r\nContent-Type: text/plain; charset=UTF-8\r\n");
}

// Attempt 3: Log to file (never lose a message)
$logEntry = date('c')." | $name | $email | $phone | $langFlag | ".substr($message,0,200)."\n";
$cLog = cs_log_dir().'/contacts_'.date('Y-m').'.log';
$cNew = !file_exists($cLog);
@file_put_contents($cLog, $logEntry, FILE_APPEND|LOCK_EX);
if ($cNew) @chmod($cLog, 0600);   // name/email/phone/message/IP — owner only

if ($sent) {
    echo json_encode(['ok'=>true,'message'=>'sent']);
} else {
    echo json_encode(['ok'=>true,'message'=>'logged']);
    // Still return ok — message was logged, we'll see it
}
