<?php
/**
 * Carbon Stealth — Email Templates
 * Auto-response for lead submissions + admin notification
 */

function getLeadAutoResponse($name, $testedUrl, $lang = 'it') {
    $firstName = explode(' ', trim($name))[0] ?: 'there';
    
    $templates = [
        'it' => [
            'subject' => 'Carbon Stealth — Abbiamo ricevuto la tua richiesta',
            'body' => "
<div style=\"font-family:'Inter Tight',-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0c;color:#f0f0eb\">
<div style=\"padding:32px;border-bottom:2px solid #00e5ff\">
<img src=\"https://carbonstealth.eu/logo.png\" alt=\"Carbon Stealth\" style=\"height:36px;margin-bottom:16px\">
<h1 style=\"font-size:24px;font-weight:900;margin:0 0 8px;color:#fff\">Ciao {$firstName}!</h1>
<p style=\"color:#aaa;margin:0;font-size:15px;line-height:1.6\">Abbiamo ricevuto la tua richiesta di consulenza gratuita. Il nostro team la sta già analizzando.</p>
</div>
<div style=\"padding:32px\">
<div style=\"background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:20px;margin-bottom:24px\">
<div style=\"color:#00e5ff;font-size:11px;letter-spacing:2px;font-weight:700;margin-bottom:8px\">COSA SUCCEDE ORA</div>
<ol style=\"color:#ccc;line-height:1.8;margin:0;padding-left:20px\">
<li>Un nostro specialista analizzerà i risultati del tuo scan</li>
<li>Prepareremo un <strong style=\"color:#fff\">piano d'azione personalizzato</strong></li>
<li>Ti contatteremo entro <strong style=\"color:#00e5ff\">24 ore</strong> per la consulenza gratuita di 15 minuti</li>
</ol>
</div>
" . ($testedUrl ? "<div style=\"background:#0e0e14;border-radius:8px;padding:16px;margin-bottom:24px\">
<div style=\"color:#666;font-size:11px;letter-spacing:1px;margin-bottom:4px\">SITO ANALIZZATO</div>
<a href=\"{$testedUrl}\" style=\"color:#00e5ff;text-decoration:none;font-weight:700\">{$testedUrl}</a>
</div>" : "") . "
<p style=\"color:#888;font-size:13px;line-height:1.6\">Nel frattempo, puoi esplorare il nostro <a href=\"https://carbonstealth.eu/portfolio/\" style=\"color:#00e5ff\">portfolio</a> o leggere il nostro <a href=\"https://carbonstealth.eu/blog/\" style=\"color:#00e5ff\">blog</a> su SEO e sviluppo web.</p>
</div>
<div style=\"padding:24px 32px;border-top:1px solid #1a1a22;text-align:center\">
<p style=\"color:#555;font-size:11px;margin:0\">Carbon Stealth VCC &middot; ul. Samuil 3, Bobov Dol 2670, Bulgaria &middot; EIK BG208725180</p>
<p style=\"margin:8px 0 0\"><a href=\"https://carbonstealth.eu\" style=\"color:#00e5ff;text-decoration:none;font-size:12px\">carbonstealth.eu</a></p>
</div>
</div>"
        ],
        'en' => [
            'subject' => 'Carbon Stealth — We received your request',
            'body' => "
<div style=\"font-family:'Inter Tight',-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0c;color:#f0f0eb\">
<div style=\"padding:32px;border-bottom:2px solid #00e5ff\">
<img src=\"https://carbonstealth.eu/logo.png\" alt=\"Carbon Stealth\" style=\"height:36px;margin-bottom:16px\">
<h1 style=\"font-size:24px;font-weight:900;margin:0 0 8px;color:#fff\">Hi {$firstName}!</h1>
<p style=\"color:#aaa;margin:0;font-size:15px;line-height:1.6\">We've received your free consultation request. Our team is already reviewing it.</p>
</div>
<div style=\"padding:32px\">
<div style=\"background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:20px;margin-bottom:24px\">
<div style=\"color:#00e5ff;font-size:11px;letter-spacing:2px;font-weight:700;margin-bottom:8px\">WHAT HAPPENS NEXT</div>
<ol style=\"color:#ccc;line-height:1.8;margin:0;padding-left:20px\">
<li>A specialist will analyze your scan results</li>
<li>We'll prepare a <strong style=\"color:#fff\">personalized action plan</strong></li>
<li>We'll contact you within <strong style=\"color:#00e5ff\">24 hours</strong> for your free 15-minute consultation</li>
</ol>
</div>
" . ($testedUrl ? "<div style=\"background:#0e0e14;border-radius:8px;padding:16px;margin-bottom:24px\">
<div style=\"color:#666;font-size:11px;letter-spacing:1px;margin-bottom:4px\">ANALYZED SITE</div>
<a href=\"{$testedUrl}\" style=\"color:#00e5ff;text-decoration:none;font-weight:700\">{$testedUrl}</a>
</div>" : "") . "
<p style=\"color:#888;font-size:13px;line-height:1.6\">Meanwhile, explore our <a href=\"https://carbonstealth.eu/en/portfolio/\" style=\"color:#00e5ff\">portfolio</a> or read our <a href=\"https://carbonstealth.eu/en/blog/\" style=\"color:#00e5ff\">blog</a> about SEO and web development.</p>
</div>
<div style=\"padding:24px 32px;border-top:1px solid #1a1a22;text-align:center\">
<p style=\"color:#555;font-size:11px;margin:0\">Carbon Stealth VCC &middot; ul. Samuil 3, Bobov Dol 2670, Bulgaria &middot; EIK BG208725180</p>
<p style=\"margin:8px 0 0\"><a href=\"https://carbonstealth.eu\" style=\"color:#00e5ff;text-decoration:none;font-size:12px\">carbonstealth.eu</a></p>
</div>
</div>"
        ],
        'bg' => [
            'subject' => 'Carbon Stealth — Получихме вашата заявка',
            'body' => "
<div style=\"font-family:'Inter Tight',-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0a0a0c;color:#f0f0eb\">
<div style=\"padding:32px;border-bottom:2px solid #00e5ff\">
<img src=\"https://carbonstealth.eu/logo.png\" alt=\"Carbon Stealth\" style=\"height:36px;margin-bottom:16px\">
<h1 style=\"font-size:24px;font-weight:900;margin:0 0 8px;color:#fff\">Здравей {$firstName}!</h1>
<p style=\"color:#aaa;margin:0;font-size:15px;line-height:1.6\">Получихме заявката ти за безплатна консултация. Екипът ни вече я анализира.</p>
</div>
<div style=\"padding:32px\">
<div style=\"background:rgba(0,229,255,0.08);border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:20px;margin-bottom:24px\">
<div style=\"color:#00e5ff;font-size:11px;letter-spacing:2px;font-weight:700;margin-bottom:8px\">КАКВО СЛЕДВА</div>
<ol style=\"color:#ccc;line-height:1.8;margin:0;padding-left:20px\">
<li>Наш специалист ще анализира резултатите от сканирането</li>
<li>Ще подготвим <strong style=\"color:#fff\">персонализиран план за действие</strong></li>
<li>Ще се свържем в рамките на <strong style=\"color:#00e5ff\">24 часа</strong> за безплатна 15-минутна консултация</li>
</ol>
</div>
" . ($testedUrl ? "<div style=\"background:#0e0e14;border-radius:8px;padding:16px;margin-bottom:24px\">
<div style=\"color:#666;font-size:11px;letter-spacing:1px;margin-bottom:4px\">АНАЛИЗИРАН САЙТ</div>
<a href=\"{$testedUrl}\" style=\"color:#00e5ff;text-decoration:none;font-weight:700\">{$testedUrl}</a>
</div>" : "") . "
<p style=\"color:#888;font-size:13px;line-height:1.6\">Междувременно разгледай нашето <a href=\"https://carbonstealth.eu/bg/portfolio/\" style=\"color:#00e5ff\">портфолио</a> или прочети нашия <a href=\"https://carbonstealth.eu/bg/blog/\" style=\"color:#00e5ff\">блог</a> за SEO и уеб разработка.</p>
</div>
<div style=\"padding:24px 32px;border-top:1px solid #1a1a22;text-align:center\">
<p style=\"color:#555;font-size:11px;margin:0\">Carbon Stealth VCC &middot; ул. Самуил 3, Бобов дол 2670, България &middot; ЕИК BG208725180</p>
<p style=\"margin:8px 0 0\"><a href=\"https://carbonstealth.eu\" style=\"color:#00e5ff;text-decoration:none;font-size:12px\">carbonstealth.eu</a></p>
</div>
</div>"
        ]
    ];
    
    return $templates[$lang] ?? $templates['en'];
}

function getAdminNotification($lead) {
    $subject = "🔔 New Lead from /test/ — " . ($lead['name'] ?: $lead['email']);
    $body = "
<div style=\"font-family:monospace;max-width:600px;margin:0 auto;background:#0a0a0c;color:#f0f0eb;padding:32px\">
<h1 style=\"color:#00e5ff;font-size:20px;margin:0 0 20px\">NEW LEAD FROM SITE ANALYZER</h1>
<table style=\"width:100%;border-collapse:collapse\">
<tr><td style=\"padding:8px;color:#666;border-bottom:1px solid #1a1a22\">Name</td><td style=\"padding:8px;color:#fff;font-weight:700;border-bottom:1px solid #1a1a22\">{$lead['name']}</td></tr>
<tr><td style=\"padding:8px;color:#666;border-bottom:1px solid #1a1a22\">Email</td><td style=\"padding:8px;color:#00e5ff;border-bottom:1px solid #1a1a22\">{$lead['email']}</td></tr>
<tr><td style=\"padding:8px;color:#666;border-bottom:1px solid #1a1a22\">Phone</td><td style=\"padding:8px;color:#fff;border-bottom:1px solid #1a1a22\">{$lead['phone']}</td></tr>
<tr><td style=\"padding:8px;color:#666;border-bottom:1px solid #1a1a22\">Tested URL</td><td style=\"padding:8px;border-bottom:1px solid #1a1a22\"><a href=\"{$lead['tested_url']}\" style=\"color:#00e5ff\">{$lead['tested_url']}</a></td></tr>
<tr><td style=\"padding:8px;color:#666;border-bottom:1px solid #1a1a22\">Message</td><td style=\"padding:8px;color:#ccc;border-bottom:1px solid #1a1a22\">{$lead['message']}</td></tr>
<tr><td style=\"padding:8px;color:#666\">Time</td><td style=\"padding:8px;color:#666\">" . date('Y-m-d H:i:s') . "</td></tr>
</table>
<div style=\"margin-top:24px\">
<a href=\"https://carbonstealth.eu\" style=\"display:inline-block;padding:12px 24px;background:#00e5ff;color:#000;text-decoration:none;font-weight:700;border-radius:6px\">Open Admin Panel</a>
</div>
</div>";
    return ['subject' => $subject, 'body' => $body];
}

function sendHtmlEmail($to, $subject, $body, $from = 'Carbon Stealth VCC <no-reply@carbonstealth.eu>') {
    $headers = "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    $headers .= "From: {$from}\r\n";
    $headers .= "Reply-To: info@carbonstealth.eu\r\n";
    $headers .= "X-Mailer: CarbonStealth/1.0\r\n";
    return @mail($to, $subject, $body, $headers);
}
