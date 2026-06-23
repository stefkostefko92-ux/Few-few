<?php
/**
 * Carbon Stealth — Site Analyzer Backend
 * Real PageSpeed Insights + HTML meta/schema analysis
 * Privacy: logs scan only with explicit user consent
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);
require_once __DIR__.'/_auth.php';

// ═══ UTILS ═══
function jsonOut($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sanitizeUrl($raw) {
    $raw = trim($raw);
    if (!preg_match('#^https?://#i', $raw)) $raw = 'https://' . $raw;
    if (!filter_var($raw, FILTER_VALIDATE_URL)) return false;
    $host = parse_url($raw, PHP_URL_HOST);
    if (!$host) return false;
    // SSRF guard: every resolved A/AAAA record must be a public unicast IP
    if (!cs_resolve_public($host)) return false;
    return $raw;
}

function fetchUrl($url, $timeout = 15) {
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; CarbonStealthAudit/1.0; +https://carbonstealth.eu/test)',
        CURLOPT_HEADER => true,
        CURLOPT_NOBODY => false,
        CURLOPT_ENCODING => '',
    ]);
    $response = curl_exec($ch);
    $info = curl_getinfo($ch);
    $err = curl_error($ch);
    curl_close($ch);
    if ($response === false) return ['error' => $err, 'info' => $info];
    $headerSize = $info['header_size'];
    $headers = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    return ['body' => $body, 'headers' => $headers, 'info' => $info];
}

function getMeta($html, $name, $attr = 'name') {
    if (preg_match('#<meta\s+[^>]*' . $attr . '=["\']' . preg_quote($name, '#') . '["\'][^>]*content=["\']([^"\']*)["\']#i', $html, $m)) {
        return html_entity_decode($m[1], ENT_QUOTES);
    }
    if (preg_match('#<meta\s+[^>]*content=["\']([^"\']*)["\'][^>]*' . $attr . '=["\']' . preg_quote($name, '#') . '["\']#i', $html, $m)) {
        return html_entity_decode($m[1], ENT_QUOTES);
    }
    return null;
}

// ═══ ACTION ROUTER ═══
$action = $_GET['action'] ?? 'analyze';
$input = json_decode(file_get_contents('php://input'), true) ?: $_POST;

// ═══ ANALYZE ═══
if ($action === 'analyze') {
    $url = sanitizeUrl($input['url'] ?? $_GET['url'] ?? '');
    if (!$url) jsonOut(['ok' => false, 'error' => 'Invalid URL'], 400);

    $host = parse_url($url, PHP_URL_HOST);
    $origin = parse_url($url, PHP_URL_SCHEME) . '://' . $host;

    $result = [
        'ok' => true,
        'url' => $url,
        'host' => $host,
        'timestamp' => date('c'),
        'psi_mobile' => null,
        'psi_desktop' => null,
        'html' => null,
        'robots' => null,
        'sitemap' => null,
        'ssl' => null,
        'errors' => [],
    ];

    // 1. Fetch HTML
    $page = fetchUrl($url, 10);
    if (isset($page['error'])) {
        $result['errors'][] = 'Could not fetch site: ' . $page['error'];
    } else {
        $html = $page['body'];
        $headers = $page['headers'];
        $info = $page['info'];

        $ttfbMs = round($info['starttransfer_time'] * 1000);
        $totalMs = round($info['total_time'] * 1000);
        $sizeKB = round(strlen($html) / 1024, 1);

        // HTML analysis
        $title = preg_match('#<title[^>]*>([^<]*)</title>#i', $html, $m) ? trim($m[1]) : null;
        $description = getMeta($html, 'description');
        $keywords = getMeta($html, 'keywords');
        $canonical = preg_match('#<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)#i', $html, $m) ? $m[1] : null;
        $viewport = getMeta($html, 'viewport');
        $robotsMeta = getMeta($html, 'robots');
        $lang = preg_match('#<html[^>]+lang=["\']([^"\']+)#i', $html, $m) ? $m[1] : null;
        $charset = preg_match('#<meta[^>]+charset=["\']?([^"\'\s/>]+)#i', $html, $m) ? $m[1] : null;

        // OG tags
        $ogTitle = getMeta($html, 'og:title', 'property');
        $ogDescription = getMeta($html, 'og:description', 'property');
        $ogImage = getMeta($html, 'og:image', 'property');
        $ogType = getMeta($html, 'og:type', 'property');
        $ogUrl = getMeta($html, 'og:url', 'property');

        // Twitter
        $twitterCard = getMeta($html, 'twitter:card');
        $twitterTitle = getMeta($html, 'twitter:title');

        // Hreflang count
        preg_match_all('#<link[^>]+rel=["\']alternate["\'][^>]+hreflang=#i', $html, $hrefMatches);
        $hreflangCount = count($hrefMatches[0]);

        // Schema.org JSON-LD
        preg_match_all('#<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is', $html, $ldMatches);
        $schemaCount = count($ldMatches[1]);
        $schemaTypes = [];
        foreach ($ldMatches[1] as $ld) {
            $decoded = @json_decode($ld, true);
            if ($decoded) {
                if (isset($decoded['@type'])) $schemaTypes[] = $decoded['@type'];
                if (isset($decoded['@graph'])) {
                    foreach ($decoded['@graph'] as $g) {
                        if (isset($g['@type'])) $schemaTypes[] = is_array($g['@type']) ? implode('+', $g['@type']) : $g['@type'];
                    }
                }
            }
        }

        // H1 count
        preg_match_all('#<h1[^>]*>(.*?)</h1>#is', $html, $h1Matches);
        $h1Count = count($h1Matches[0]);
        $h1Text = $h1Count > 0 ? trim(strip_tags($h1Matches[1][0])) : null;

        // Images without alt
        preg_match_all('#<img[^>]*>#i', $html, $imgTags);
        $totalImages = count($imgTags[0]);
        $imagesWithoutAlt = 0;
        foreach ($imgTags[0] as $img) {
            if (!preg_match('#\salt\s*=#i', $img)) $imagesWithoutAlt++;
        }

        // Links count
        preg_match_all('#<a[^>]+href=["\']([^"\']+)["\']#i', $html, $linkMatches);
        $totalLinks = count($linkMatches[1]);
        $internalLinks = 0;
        $externalLinks = 0;
        foreach ($linkMatches[1] as $link) {
            if (strpos($link, '#') === 0 || strpos($link, 'mailto:') === 0 || strpos($link, 'tel:') === 0) continue;
            if (strpos($link, 'http') === 0) {
                if (strpos($link, $host) !== false) $internalLinks++;
                else $externalLinks++;
            } else {
                $internalLinks++;
            }
        }

        // Security headers
        $hasHSTS = stripos($headers, 'strict-transport-security') !== false;
        $hasCSP = stripos($headers, 'content-security-policy') !== false;
        $hasXFO = stripos($headers, 'x-frame-options') !== false;
        $hasXCTO = stripos($headers, 'x-content-type-options') !== false;
        $hasReferrerPolicy = stripos($headers, 'referrer-policy') !== false;

        // HTTPS
        $isHttps = parse_url($url, PHP_URL_SCHEME) === 'https';

        // favicon
        $hasFavicon = preg_match('#<link[^>]+rel=["\'](?:shortcut )?icon["\']#i', $html);

        // llms.txt check
        $llmsCheck = fetchUrl($origin . '/llms.txt', 5);
        $hasLlms = isset($llmsCheck['info']['http_code']) && $llmsCheck['info']['http_code'] === 200 && strlen($llmsCheck['body']) > 100 && strpos($llmsCheck['body'], '<!DOCTYPE') === false && strpos($llmsCheck['body'], '<html') === false;

        $result['html'] = [
            'http_code' => $info['http_code'],
            'ttfb_ms' => $ttfbMs,
            'total_load_ms' => $totalMs,
            'page_size_kb' => $sizeKB,
            'title' => $title,
            'title_length' => $title ? (function_exists('mb_strlen') ? mb_strlen($title) : strlen($title)) : 0,
            'description' => $description,
            'description_length' => $description ? (function_exists('mb_strlen') ? mb_strlen($description) : strlen($description)) : 0,
            'keywords' => $keywords,
            'canonical' => $canonical,
            'viewport' => $viewport,
            'robots_meta' => $robotsMeta,
            'lang' => $lang,
            'charset' => $charset,
            'og_title' => $ogTitle,
            'og_description' => $ogDescription,
            'og_image' => $ogImage,
            'og_type' => $ogType,
            'og_url' => $ogUrl,
            'twitter_card' => $twitterCard,
            'twitter_title' => $twitterTitle,
            'hreflang_count' => $hreflangCount,
            'schema_count' => $schemaCount,
            'schema_types' => array_values(array_unique($schemaTypes)),
            'h1_count' => $h1Count,
            'h1_text' => $h1Text,
            'total_images' => $totalImages,
            'images_without_alt' => $imagesWithoutAlt,
            'total_links' => $totalLinks,
            'internal_links' => $internalLinks,
            'external_links' => $externalLinks,
            'has_hsts' => $hasHSTS,
            'has_csp' => $hasCSP,
            'has_xfo' => $hasXFO,
            'has_xcto' => $hasXCTO,
            'has_referrer_policy' => $hasReferrerPolicy,
            'is_https' => $isHttps,
            'has_favicon' => !!$hasFavicon,
            'has_llms_txt' => $hasLlms,
        ];
    }

    // 2. Check robots.txt
    $robotsFetch = fetchUrl($origin . '/robots.txt', 5);
    if (!isset($robotsFetch['error']) && $robotsFetch['info']['http_code'] === 200) {
        $rb = $robotsFetch['body'];
        $result['robots'] = [
            'exists' => true,
            'has_sitemap' => stripos($rb, 'Sitemap:') !== false,
            'has_gptbot' => stripos($rb, 'GPTBot') !== false,
            'has_claude' => stripos($rb, 'Claude-Web') !== false || stripos($rb, 'ClaudeBot') !== false,
            'has_perplexity' => stripos($rb, 'PerplexityBot') !== false,
            'blocks_all' => preg_match('/User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*(\n|$)/im', $rb) === 1,
            'size_bytes' => strlen($rb),
        ];
    } else {
        $result['robots'] = ['exists' => false];
    }

    // 3. Check sitemap.xml
    $sitemapFetch = fetchUrl($origin . '/sitemap.xml', 5);
    if (!isset($sitemapFetch['error']) && $sitemapFetch['info']['http_code'] === 200) {
        $sm = $sitemapFetch['body'];
        $isXml = strpos($sm, '<?xml') !== false || strpos($sm, '<urlset') !== false || strpos($sm, '<sitemapindex') !== false;
        if ($isXml) {
            $urlCount = substr_count($sm, '<loc>');
            $result['sitemap'] = [
                'exists' => true,
                'url_count' => $urlCount,
                'has_lastmod' => strpos($sm, '<lastmod>') !== false,
                'has_priority' => strpos($sm, '<priority>') !== false,
                'has_changefreq' => strpos($sm, '<changefreq>') !== false,
                'has_images' => strpos($sm, 'image:image') !== false,
            ];
        } else {
            $result['sitemap'] = ['exists' => false, 'reason' => 'returns_html_not_xml'];
        }
    } else {
        $result['sitemap'] = ['exists' => false];
    }

    // 4. SSL info (only if https)
    if (parse_url($url, PHP_URL_SCHEME) === 'https') {
        $sslCtx = stream_context_create(['ssl' => ['capture_peer_cert' => true, 'verify_peer' => true]]);
        $fp = @stream_socket_client("ssl://{$host}:443", $errno, $errstr, 5, STREAM_CLIENT_CONNECT, $sslCtx);
        if ($fp) {
            $params = stream_context_get_params($fp);
            $cert = isset($params['options']['ssl']['peer_certificate']) ? openssl_x509_parse($params['options']['ssl']['peer_certificate']) : null;
            if ($cert) {
                $daysUntilExpiry = round(($cert['validTo_time_t'] - time()) / 86400);
                $result['ssl'] = [
                    'valid' => true,
                    'issuer' => $cert['issuer']['O'] ?? 'Unknown',
                    'expires' => date('Y-m-d', $cert['validTo_time_t']),
                    'days_until_expiry' => $daysUntilExpiry,
                ];
            }
            fclose($fp);
        }
    }

    // 5. PageSpeed Insights — MOBILE + DESKTOP
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TO ENABLE PSI: Get free API key at https://console.cloud.google.com/apis/credentials
    // Then either: 1) Paste key below, or 2) Set env var PSI_API_KEY in PHP-FPM config
    // Without key: ~400 queries/day (shared IP pool, often fails)
    // With key: 25,000 queries/day (free)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    $psiKey = getenv('PSI_API_KEY') ?: ''; // PASTE KEY HERE: 'AIzaSy...'
    foreach (['mobile', 'desktop'] as $strategy) {
        $psiUrl = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" . urlencode($url) . "&strategy=" . $strategy;
        foreach (['performance', 'seo', 'accessibility', 'best-practices'] as $cat) {
            $psiUrl .= "&category=" . $cat;
        }
        if ($psiKey) $psiUrl .= "&key=" . urlencode($psiKey);

        $psi = fetchUrl($psiUrl, 60);
        if (isset($psi['error'])) {
            $result['psi_' . $strategy] = ['error' => $psi['error']];
            continue;
        }
        $data = json_decode($psi['body'], true);
        if (!$data || !isset($data['lighthouseResult'])) {
            $result['psi_' . $strategy] = ['error' => 'PSI failed', 'raw' => substr($psi['body'], 0, 200)];
            continue;
        }
        $lh = $data['lighthouseResult'];
        $cats = $lh['categories'];
        $audits = $lh['audits'];

        // Core Web Vitals
        $lcp = $audits['largest-contentful-paint']['numericValue'] ?? null;
        $cls = $audits['cumulative-layout-shift']['numericValue'] ?? null;
        $fcp = $audits['first-contentful-paint']['numericValue'] ?? null;
        $tbt = $audits['total-blocking-time']['numericValue'] ?? null;
        $si = $audits['speed-index']['numericValue'] ?? null;
        $tti = $audits['interactive']['numericValue'] ?? null;
        $inp = $audits['experimental-interaction-to-next-paint']['numericValue'] ?? null;

        $result['psi_' . $strategy] = [
            'performance' => isset($cats['performance']) ? round($cats['performance']['score'] * 100) : null,
            'seo' => isset($cats['seo']) ? round($cats['seo']['score'] * 100) : null,
            'accessibility' => isset($cats['accessibility']) ? round($cats['accessibility']['score'] * 100) : null,
            'best_practices' => isset($cats['best-practices']) ? round($cats['best-practices']['score'] * 100) : null,
            'lcp_ms' => $lcp ? round($lcp) : null,
            'cls' => $cls ? round($cls, 3) : null,
            'fcp_ms' => $fcp ? round($fcp) : null,
            'tbt_ms' => $tbt ? round($tbt) : null,
            'si_ms' => $si ? round($si) : null,
            'tti_ms' => $tti ? round($tti) : null,
            'fetched_at' => $lh['fetchTime'] ?? null,
        ];
    }

    // Log scan ONLY if consent is given
    $consent = !empty($input['consent']) && $input['consent'] === true;
    if ($consent) {
        $logPath = __DIR__ . '/logs/scans.log';
        if (!file_exists(dirname($logPath))) @mkdir(dirname($logPath), 0755, true);
        $logEntry = [
            'ts' => date('c'),
            'url' => $url,
            'host' => $host,
            'perf_mobile' => $result['psi_mobile']['performance'] ?? null,
            'seo_mobile' => $result['psi_mobile']['seo'] ?? null,
            'ip' => cs_client_ip(),
            'ua' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200),
            'consent' => true,
            'ab_variant' => $input['ab_variant'] ?? null,
        ];
        @file_put_contents($logPath, json_encode($logEntry) . "\n", FILE_APPEND | LOCK_EX);
    }

    jsonOut($result);
}

// ═══ LEAD CAPTURE ═══
if ($action === 'lead') {
    $email = trim($input['email'] ?? '');
    $phone = trim($input['phone'] ?? '');
    $testedUrl = trim($input['tested_url'] ?? '');
    $name = trim(strip_tags($input['name'] ?? ''));
    $message = trim(strip_tags($input['message'] ?? ''));

    if (!$email && !$phone) jsonOut(['ok' => false, 'error' => 'Email or phone required'], 400);
    if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) jsonOut(['ok' => false, 'error' => 'Invalid email'], 400);

    $leadsPath = cs_log_dir() . '/leads.log';

    $leadEntry = [
        'ts' => date('c'),
        'name' => $name,
        'email' => $email,
        'phone' => $phone,
        'tested_url' => $testedUrl,
        'message' => substr($message, 0, 500),
        'ip' => cs_client_ip(),
        'ua' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200),
    ];
    @file_put_contents($leadsPath, json_encode($leadEntry) . "\n", FILE_APPEND | LOCK_EX);

    // Send email notification to info@carbonstealth.eu
    require_once __DIR__ . '/email-templates.php';

    // Detect language from referrer
    $referer = $_SERVER['HTTP_REFERER'] ?? '';
    $lang = 'it';
    if (strpos($referer, '/en/') !== false) $lang = 'en';
    elseif (strpos($referer, '/bg/') !== false) $lang = 'bg';

    // Admin notification (HTML)
    $adminEmail = getAdminNotification($leadEntry);
    sendHtmlEmail('info@carbonstealth.eu', $adminEmail['subject'], $adminEmail['body']);

    // Auto-response to lead (HTML, branded)
    if ($email) {
        $autoResp = getLeadAutoResponse($name, $testedUrl, $lang);
        sendHtmlEmail($email, $autoResp['subject'], $autoResp['body']);
    }

    jsonOut(['ok' => true, 'message' => 'Lead saved']);
}

// ═══ STATS (admin only) ═══
if ($action === 'stats') {
    cs_require_admin();

    $scansPath = cs_log_dir() . '/scans.log';
    $leadsPath = cs_log_dir() . '/leads.log';
    $scans = file_exists($scansPath) ? count(file($scansPath)) : 0;
    $leads = file_exists($leadsPath) ? count(file($leadsPath)) : 0;

    $recentScans = [];
    if (file_exists($scansPath)) {
        $lines = array_slice(file($scansPath), -20);
        foreach ($lines as $l) {
            $parsed = json_decode($l, true);
            if ($parsed) $recentScans[] = $parsed;
        }
    }
    $recentLeads = [];
    if (file_exists($leadsPath)) {
        $lines = array_slice(file($leadsPath), -20);
        foreach ($lines as $l) {
            $parsed = json_decode($l, true);
            if ($parsed) $recentLeads[] = $parsed;
        }
    }

    jsonOut([
        'ok' => true,
        'total_scans' => $scans,
        'total_leads' => $leads,
        'recent_scans' => array_reverse($recentScans),
        'recent_leads' => array_reverse($recentLeads),
    ]);
}

jsonOut(['ok' => false, 'error' => 'Unknown action'], 404);
