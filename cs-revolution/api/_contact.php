<?php
/**
 * Carbon Stealth VCC — формата за контакт: полета, ред в лога, писмото до нас (чисти функции).
 *
 * B2B квалификация (доклад SEO/GEO/AEO, 22.11.2026, §9): освен име, имейл, телефон и съобщение —
 * фирма, държава, тип решение и приблизителен бюджет. Новите полета са НЕзадължителни; стойност
 * извън списъка става празна, за да не чупи стар клиент. Тестове: tests/contact.test.php.
 * Не е входна точка (404 при пряка заявка; nginx също я отказва).
 */

if (isset($_SERVER['SCRIPT_FILENAME']) && realpath($_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

if (!function_exists('cs_contact_fields')) {

    /** Позволените стойности и етикетите им в писмото до нас (на английски, като останалото писмо). */
    function cs_contact_options(): array {
        return [
            'country'  => ['IT' => 'Italy', 'BG' => 'Bulgaria', 'EU' => 'Other EU country', 'WORLD' => 'Outside the EU'],
            'solution' => ['web' => 'Website', 'ecommerce' => 'E-commerce', 'erp' => 'ERP / management software',
                           'software' => 'Custom software', 'app' => 'Mobile app', 'seo' => 'SEO / GEO / AEO', 'other' => 'Other'],
            'budget'   => ['lt5k' => 'under €5,000', '5-15k' => '€5,000–15,000', '15-50k' => '€15,000–50,000',
                           'gt50k' => 'over €50,000', 'tbd' => 'to be defined'],
        ];
    }

    function cs_contact_text($v, int $max): string {
        $s = trim(strip_tags(is_scalar($v) ? (string)$v : ''));
        return mb_substr($s, 0, $max, 'UTF-8');
    }

    /** Входът (JSON/форма) → нормализирани полета. Не валидира задължителните — това е cs_contact_invalid(). */
    function cs_contact_fields(array $d): array {
        $o = cs_contact_options();
        $pick = static function ($v, array $allowed): string { $v = is_scalar($v) ? trim((string)$v) : ''; return isset($allowed[$v]) ? $v : ''; };
        return [
            'name'     => trim(strip_tags(is_scalar($d['name'] ?? null) ? (string)$d['name'] : '')),
            'email'    => trim(strip_tags(is_scalar($d['email'] ?? null) ? (string)$d['email'] : '')),
            'phone'    => cs_contact_text($d['phone'] ?? '', 60),
            'message'  => trim(strip_tags(is_scalar($d['message'] ?? null) ? (string)$d['message'] : '')),
            'lang'     => cs_contact_text($d['lang'] ?? 'en', 5),
            'company'  => cs_contact_text($d['company'] ?? '', 200),
            'country'  => $pick($d['country'] ?? '', $o['country']),
            'solution' => $pick($d['solution'] ?? '', $o['solution']),
            'budget'   => $pick($d['budget'] ?? '', $o['budget']),
        ];
    }

    /** null = наред; иначе текстът на грешката (400). Правилата за задължителните полета са непроменени. */
    function cs_contact_invalid(array $f): ?string {
        if ($f['name'] === '' || strlen($f['name']) < 2 || strlen($f['name']) > 200) return 'Invalid name';
        if (!filter_var($f['email'], FILTER_VALIDATE_EMAIL)) return 'Invalid email';
        if ($f['message'] === '' || strlen($f['message']) < 5 || strlen($f['message']) > 5000) return 'Invalid message';
        return null;
    }

    function cs_contact_lang_flag(string $lang): string {
        return match ($lang) { 'it', 'IT' => 'IT', 'bg', 'BG' => 'BG', default => 'EN' };
    }

    /**
     * Един ред в лога. Нов формат (10 полета): дата | име | имейл | телефон | език | фирма | държава | тип | бюджет | съобщение.
     * „|“, CR и LF стават „/“ и интервал — посетител не може да създаде нов ред или да измести поле.
     */
    function cs_contact_log_line(array $f, string $ts): string {
        $c = static function ($v): string { return preg_replace('/[\r\n]+/', ' ', str_replace('|', '/', (string)$v)); };
        $parts = [$ts, $c($f['name']), $c($f['email']), $c($f['phone']), cs_contact_lang_flag($f['lang']),
                  $c($f['company']), $c($f['country']), $c($f['solution']), $c($f['budget']), $c(mb_substr($f['message'], 0, 200, 'UTF-8'))];
        return implode(' | ', $parts) . "\n";
    }

    /** Ред от лога → запис; чете и стария формат (6 полета). null при невалиден ред. */
    function cs_contact_log_parse(string $line): ?array {
        $p = explode(' | ', $line, 10);
        $n = count($p);
        if ($n < 4) return null;
        $base = ['date' => trim($p[0]), 'name' => trim($p[1]), 'email' => trim($p[2]), 'phone' => trim($p[3]),
                 'lang' => trim($p[4] ?? ''), 'company' => '', 'country' => '', 'solution' => '', 'budget' => '', 'message' => ''];
        // Нов формат само ако и полетата пасват на списъците: стар ред отпреди 25.09.2026 (съобщение със
        // сурови „ | “) също може да даде 10 части, но тогава държава/тип/бюджет не са от списъка.
        $o = cs_contact_options();
        $fits = static function (string $k, string $v) use ($o): bool { return $v === '' || isset($o[$k][$v]); };
        if ($n === 10 && in_array(trim($p[4]), ['IT', 'BG', 'EN'], true)
            && $fits('country', trim($p[6])) && $fits('solution', trim($p[7])) && $fits('budget', trim($p[8]))) {
            $base['company'] = trim($p[5]); $base['country'] = trim($p[6]); $base['solution'] = trim($p[7]);
            $base['budget'] = trim($p[8]); $base['message'] = trim($p[9]);
        } else {
            // стар формат: всичко след езика е съобщението (то пак е с „|“ → „/“)
            $base['message'] = trim(implode(' | ', array_slice($p, 5)));
        }
        return $base;
    }

    /** [html, txt] на писмото до нас. Всичко от посетителя е екранирано в HTML. */
    function cs_contact_mail(array $f, string $ts): array {
        $o = cs_contact_options();
        $h = static function ($v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); };
        $label = static function (string $k, string $v) use ($o): string { return $v === '' ? '' : ($o[$k][$v] ?? ''); };
        $flag = cs_contact_lang_flag($f['lang']);
        $rows = [['Name', '<strong>' . $h($f['name']) . '</strong>'],
                 ['Email', '<a href="mailto:' . $h($f['email']) . '" style="color:#00e5ff">' . $h($f['email']) . '</a>'],
                 ['Phone', $h($f['phone'])], ['Language', $flag],
                 ['Company', $h($f['company'])], ['Country', $h($label('country', $f['country']))],
                 ['Solution', $h($label('solution', $f['solution']))], ['Budget', $h($label('budget', $f['budget']))]];
        $tr = '';
        foreach ($rows as [$k, $v]) {
            if ($v === '' && in_array($k, ['Company', 'Country', 'Solution', 'Budget'], true)) continue;
            $tr .= '<tr><td style="color:#999;width:90px">' . $k . ':</td><td>' . $v . '</td></tr>';
        }
        $html = '<table style="width:100%;max-width:600px;font-family:monospace;background:#0a0a0a;color:#f5f5f0;padding:24px"><tr><td>'
              . '<div style="border-bottom:1px solid #00e5ff33;padding-bottom:12px;margin-bottom:16px"><strong style="color:#00e5ff;font-size:14px">CARBON STEALTH VCC — NEW CONTACT</strong></div>'
              . '<table style="width:100%;font-size:13px;line-height:2">' . $tr . '</table>'
              . '<div style="margin-top:16px;padding:16px;background:#111;border-left:3px solid #00e5ff"><div style="color:#999;font-size:10px;margin-bottom:8px">MESSAGE:</div>'
              . '<div style="white-space:pre-wrap">' . $h($f['message']) . '</div></div>'
              . '<div style="margin-top:16px;font-size:10px;color:#666">' . $h($ts) . '</div></td></tr></table>';
        $txt = "CARBON STEALTH VCC — New Contact\n" . str_repeat('=', 50) . "\n"
             . "Name:     {$f['name']}\nEmail:    {$f['email']}\nPhone:    {$f['phone']}\nLang:     $flag\n";
        foreach (['Company' => $f['company'], 'Country' => $label('country', $f['country']),
                  'Solution' => $label('solution', $f['solution']), 'Budget' => $label('budget', $f['budget'])] as $k => $v) {
            if ($v !== '') $txt .= str_pad($k . ':', 10) . $v . "\n";
        }
        $txt .= "\nMessage:\n{$f['message']}\n\n" . str_repeat('-', 50) . "\nDate: $ts";   // IP и браузърът — само в сървърния лог
        return [$html, $txt];
    }
}
