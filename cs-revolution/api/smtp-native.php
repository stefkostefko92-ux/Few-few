<?php
/**
 * Carbon Stealth VCC — minimal native SMTP sender.
 * A dependency-free fallback for when PHPMailer/composer is not installed.
 * Speaks SMTP over SSL (465) or STARTTLS (587) with AUTH LOGIN — enough for
 * Gmail, register.it and any standard authenticated submission server.
 *
 * cs_smtp_send(array $o, string &$err = null): bool
 *   $o keys: host, port, secure('ssl'|'tls'), user, pass, from, from_name,
 *            to, reply_to, reply_name, subject, html, text
 */
if (!function_exists('cs_smtp_send')) {

function cs_smtp_send(array $o, string &$err = null): bool {
    $err = '';
    $host   = $o['host'] ?? '';
    $port   = (int)($o['port'] ?? 587);
    $secure = strtolower($o['secure'] ?? ($port === 465 ? 'ssl' : 'tls'));
    $user   = $o['user'] ?? '';
    $pass   = $o['pass'] ?? '';
    $from   = $o['from'] ?? $user;
    $to     = $o['to'] ?? '';
    if ($host === '' || $user === '' || $pass === '' || $to === '') { $err = 'missing smtp params'; return false; }

    $transport = ($secure === 'ssl') ? "ssl://$host" : $host;
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
    $fp = @stream_socket_client("$transport:$port", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) { $err = "connect failed: $errstr ($errno)"; return false; }
    stream_set_timeout($fp, 15);

    $read = function () use ($fp) {
        $data = '';
        while (($line = fgets($fp, 515)) !== false) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break; // last line of a multiline reply
        }
        return $data;
    };
    $cmd = function ($c) use ($fp, $read) { fwrite($fp, $c . "\r\n"); return $read(); };
    $code = function ($resp) { return (int)substr(ltrim($resp), 0, 3); };

    $ok = true;
    $fail = function ($stage, $resp) use (&$err, &$ok, $fp) {
        $err = "$stage: " . trim(substr($resp, 0, 200)); $ok = false;
        @fwrite($fp, "QUIT\r\n"); @fclose($fp);
    };

    if ($code($read()) !== 220) { $fail('greeting', 'no 220'); return false; }
    $ehloHost = preg_replace('/[^a-z0-9.\-]/i', '', gethostname() ?: 'localhost');
    $r = $cmd("EHLO $ehloHost"); if ($code($r) !== 250) { $fail('EHLO', $r); return false; }

    if ($secure === 'tls') {
        $r = $cmd('STARTTLS'); if ($code($r) !== 220) { $fail('STARTTLS', $r); return false; }
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        if (!@stream_socket_enable_crypto($fp, true, $crypto)) { $fail('TLS handshake', 'enable_crypto failed'); return false; }
        $r = $cmd("EHLO $ehloHost"); if ($code($r) !== 250) { $fail('EHLO(tls)', $r); return false; }
    }

    if ($code($cmd('AUTH LOGIN')) !== 334) { $fail('AUTH', 'server refused AUTH LOGIN'); return false; }
    if ($code($cmd(base64_encode($user))) !== 334) { $fail('AUTH user', 'user rejected'); return false; }
    $r = $cmd(base64_encode($pass)); if ($code($r) !== 235) { $fail('AUTH pass', $r); return false; }

    if ($code($cmd("MAIL FROM:<$from>")) !== 250) { $fail('MAIL FROM', 'rejected'); return false; }
    // Support multiple recipients (comma-separated)
    foreach (array_filter(array_map('trim', explode(',', $to))) as $rcpt) {
        $rc = $code($cmd("RCPT TO:<$rcpt>"));
        if ($rc !== 250 && $rc !== 251) { $fail('RCPT TO', "rcpt $rcpt rejected"); return false; }
    }
    if ($code($cmd('DATA')) !== 354) { $fail('DATA', 'rejected'); return false; }

    // ── Build MIME message ──
    $fromName = $o['from_name'] ?? 'Carbon Stealth VCC';
    $subject  = $o['subject'] ?? '';
    $html     = $o['html'] ?? '';
    $text     = $o['text'] ?? trim(strip_tags($html));
    $encName  = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $encSubj  = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $boundary = 'csb_' . bin2hex(random_bytes(8));
    $date     = date('r');
    $msgId    = '<' . bin2hex(random_bytes(12)) . '@' . ($o['host_domain'] ?? 'carbonstealth.eu') . '>';

    $h  = "Date: $date\r\n";
    $h .= "From: $encName <$from>\r\n";
    $h .= "To: <$to>\r\n";
    if (!empty($o['reply_to'])) {
        $rn = isset($o['reply_name']) ? '=?UTF-8?B?' . base64_encode($o['reply_name']) . '?= ' : '';
        $h .= "Reply-To: {$rn}<{$o['reply_to']}>\r\n";
    }
    $h .= "Message-ID: $msgId\r\n";
    $h .= "Subject: $encSubj\r\n";
    $h .= "MIME-Version: 1.0\r\n";
    $h .= "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";

    $body  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text)) . "\r\n";
    $body .= "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n";
    $body .= "--$boundary--\r\n";

    // Dot-stuffing for SMTP DATA
    $payload = preg_replace('/^\./m', '..', $h . "\r\n" . $body);
    fwrite($fp, $payload . "\r\n.\r\n");
    $r = $read();
    if ($code($r) !== 250) { $fail('send', $r); return false; }

    $cmd('QUIT'); @fclose($fp);
    return true;
}

}
