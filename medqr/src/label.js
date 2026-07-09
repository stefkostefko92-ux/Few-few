// Размери на QR кода и генериране на самообяснителен „спешен медицински" етикет.
// Етикетът ВИНАГИ носи ясен надпис (BG + EN) и медицински символ, така че дори
// човек, който не познава услугата, веднага разбира, че това са медицински данни.

export const QR_SIZES = {
  sticker: { label: 'Стикер', px: 256 },
  small: { label: 'Малък', px: 384 },
  medium: { label: 'Среден', px: 512 },
  large: { label: 'Голям', px: 768 },
  poster: { label: 'Постер', px: 1024 },
};

export const DEFAULT_SIZE = 'medium';

export function resolveSize(key) {
  return QR_SIZES[key] ? key : DEFAULT_SIZE;
}

// Връща SVG (низ) с медицински етикет: червена лента с бял кръст и двуезичен надпис,
// QR кода и инструкция за сканиране. `qrDataUrl` е PNG data URI (висока резолюция).
export function buildLabelSvg(qrDataUrl, sizeKey = DEFAULT_SIZE) {
  const width = QR_SIZES[resolveSize(sizeKey)].px;
  const height = Math.round(width * (780 / 600));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 600 780" role="img" aria-label="Спешна медицинска информация — сканирайте QR кода">
  <style>
    .t { font-family: 'Inter', Arial, sans-serif; }
  </style>
  <rect x="2" y="2" width="596" height="776" rx="20" fill="#ffffff" stroke="#d9e0e8" stroke-width="2"/>
  <path d="M2 22 a20 20 0 0 1 20 -20 h556 a20 20 0 0 1 20 20 v128 h-616 z" fill="#c0392b"/>
  <g fill="#ffffff">
    <rect x="40" y="50" width="64" height="64" rx="10" fill="#ffffff"/>
    <rect x="64" y="58" width="16" height="48" fill="#c0392b"/>
    <rect x="48" y="74" width="48" height="16" fill="#c0392b"/>
    <text class="t" x="124" y="68" font-size="30" font-weight="800">СПЕШНА МЕДИЦИНСКА</text>
    <text class="t" x="124" y="104" font-size="30" font-weight="800">ИНФОРМАЦИЯ</text>
  </g>
  <text class="t" x="300" y="192" text-anchor="middle" font-size="19" font-weight="600" fill="#5b6b7b" letter-spacing="1">EMERGENCY MEDICAL INFORMATION</text>
  <rect x="118" y="218" width="364" height="364" rx="12" fill="#ffffff" stroke="#e2e8ef" stroke-width="2"/>
  <image href="${qrDataUrl}" x="130" y="230" width="340" height="340"/>
  <text class="t" x="300" y="638" text-anchor="middle" font-size="24" font-weight="700" fill="#16202c">Сканирайте кода с телефон</text>
  <text class="t" x="300" y="668" text-anchor="middle" font-size="18" fill="#5b6b7b">Scan this code with a phone</text>
  <text class="t" x="300" y="724" text-anchor="middle" font-size="15" fill="#8a98a6">При спешност · In an emergency · medqr.carbonstealth.eu</text>
</svg>`;
}
