/**
 * Multi-account controller - dashboard view model + HTML (pure, unit-tested).
 */

// Pure dashboard request handler (unit-tested). Enforces the token and an
// anti-CSRF Origin check on mutations; returns what to send and, for mutations,
// which action the caller should perform (so this stays side-effect free).
//   opts: { method, pathname, query:{token,id}, origin, token, views, render }
// Constant-time string compare (no early exit on the first mismatching char).
function safeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export function dashboardResponse(opts) {
  const { method, pathname, query = {}, origin, token, views = [], render } = opts;
  if (!token || !safeEqual(query.token, token)) {
    return { status: 401, contentType: 'text/plain', body: 'unauthorized' };
  }
  const localOrigin = !origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(origin);
  if (method === 'POST' && (pathname === '/api/start' || pathname === '/api/stop')) {
    if (!localOrigin) return { status: 403, contentType: 'text/plain', body: 'forbidden' };
    return { status: 200, contentType: 'text/plain', body: 'ok', action: pathname === '/api/start' ? 'start' : 'stop', id: query.id };
  }
  if (pathname === '/api/status') {
    return { status: 200, contentType: 'application/json', body: JSON.stringify(views) };
  }
  return { status: 200, contentType: 'text/html', body: render ? render() : '' };
}

export function accountView(entry, now = Date.now()) {
  const s = entry.lastStats || {};
  return {
    id: entry.account.id,
    label: entry.account.label,
    status: entry.status || 'stopped',
    proxy: entry.account.proxy ? 'yes' : '',
    uptimeMin: entry.startedAt ? Math.round((now - entry.startedAt) / 60000) : 0,
    adventures: s.adventures || 0,
    encounters: s.encounters || 0,
    gold: s.goldEarned || 0,
    errors: s.errors || 0
  };
}

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Decorative icons (aria-hidden): stroke 2 on a 24 grid, tinted with currentColor.
const SVG = (inner, fill) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"${fill ? ' fill="currentColor"' : ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${inner}</svg>`;
const IC = {
  play: SVG('<path d="M7 4.5v15l12.5-7.5z"/>', true),
  stop: SVG('<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>', true),
  coin: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>'),
  sword: SVG('<path d="M19 5L9 15M6 12l6 6M9 15l-4 4M15 5h4v4"/>'),
  target: SVG('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>'),
  clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  warn: SVG('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>'),
  shield: SVG('<path d="M12 3l8 3v6c0 4.8-3.3 8-8 9.5C7.3 20 4 16.8 4 12V6z"/>'),
  users: SVG('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17 14c2.6 0 4.5 1.9 4.5 5"/>')
};
const MARK = `<svg class="mark" viewBox="0 0 128 128" aria-hidden="true" focusable="false"><defs><radialGradient id="tbm-dash-glow" cx="64" cy="58" r="62" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#27e08a" stop-opacity=".30"/><stop offset=".55" stop-color="#27e08a" stop-opacity=".07"/><stop offset="1" stop-color="#27e08a" stop-opacity="0"/></radialGradient><linearGradient id="tbm-dash-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="tbm-dash-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5dffb2" stop-opacity=".95"/><stop offset=".5" stop-color="#27e08a" stop-opacity=".55"/><stop offset="1" stop-color="#0d7a4a" stop-opacity=".85"/></linearGradient><linearGradient id="tbm-dash-flat" x1="56" y1="0" x2="72" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5a636b"/><stop offset=".14" stop-color="#c7d1d8"/><stop offset=".3" stop-color="#f8fbfc"/><stop offset=".46" stop-color="#a3aeb6"/><stop offset=".62" stop-color="#6f7a84"/><stop offset=".78" stop-color="#d6dee3"/><stop offset=".9" stop-color="#8d98a1"/><stop offset="1" stop-color="#3d444a"/></linearGradient><linearGradient id="tbm-dash-bevL" x1="56" y1="0" x2="58.8" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#aeb9c1"/></linearGradient><linearGradient id="tbm-dash-bevR" x1="69.2" y1="0" x2="72" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#626c75"/><stop offset="1" stop-color="#1b2024"/></linearGradient><linearGradient id="tbm-dash-fuller" x1="62.4" y1="0" x2="65.6" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2e3439"/><stop offset=".35" stop-color="#7b8791"/><stop offset=".7" stop-color="#e9eff3"/><stop offset="1" stop-color="#ffffff"/></linearGradient><linearGradient id="tbm-dash-env" x1="0" y1="10" x2="0" y2="77" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d4eaff" stop-opacity=".75"/><stop offset=".3" stop-color="#6fa6dc" stop-opacity=".30"/><stop offset=".5" stop-color="#1b3550" stop-opacity=".10"/><stop offset=".6" stop-color="#04070a" stop-opacity=".50"/><stop offset=".68" stop-color="#04070a" stop-opacity=".42"/><stop offset=".76" stop-color="#d9a869" stop-opacity=".34"/><stop offset="1" stop-color="#7a5a36" stop-opacity=".22"/></linearGradient><linearGradient id="tbm-dash-spec" x1="0" y1="36" x2="0" y2="72" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff" stop-opacity=".95"/><stop offset=".8" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="tbm-dash-ao-blade" x1="0" y1="64" x2="0" y2="77" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient><clipPath id="tbm-dash-bladeclip"><path d="M64 10 L72 30 L72 77 L56 77 L56 30 Z"/></clipPath><linearGradient id="tbm-dash-brass" x1="35" y1="0" x2="93" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4d330b"/><stop offset=".05" stop-color="#d7a63e"/><stop offset=".16" stop-color="#fbe9a6"/><stop offset=".28" stop-color="#bc8a2b"/><stop offset=".4" stop-color="#734f14"/><stop offset=".5" stop-color="#e8c562"/><stop offset=".6" stop-color="#734f14"/><stop offset=".72" stop-color="#bc8a2b"/><stop offset=".84" stop-color="#f6df93"/><stop offset=".95" stop-color="#c3952f"/><stop offset="1" stop-color="#3f2907"/></linearGradient><linearGradient id="tbm-dash-brassV" x1="0" y1="76" x2="0" y2="86" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#1a0f00" stop-opacity=".5"/></linearGradient><linearGradient id="tbm-dash-collar" x1="58.4" y1="0" x2="69.6" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5c3d0e"/><stop offset=".3" stop-color="#f3d980"/><stop offset=".6" stop-color="#a97720"/><stop offset="1" stop-color="#3d2706"/></linearGradient><radialGradient id="tbm-dash-pom" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff2b8"/><stop offset=".25" stop-color="#e2b34d"/><stop offset=".62" stop-color="#94661c"/><stop offset="1" stop-color="#3a2405"/></radialGradient><linearGradient id="tbm-dash-leath" x1="58.6" y1="0" x2="69.4" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#080504"/><stop offset=".2" stop-color="#2b1e15"/><stop offset=".4" stop-color="#6e4d37"/><stop offset=".52" stop-color="#85604a"/><stop offset=".66" stop-color="#3a2a20"/><stop offset=".88" stop-color="#150e0a"/><stop offset="1" stop-color="#060403"/></linearGradient><linearGradient id="tbm-dash-ao-grip" x1="0" y1="87.4" x2="0" y2="93" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><clipPath id="tbm-dash-gripclip"><path d="M60 87.4 C58.6 93 58.6 98.5 60 104 L68 104 C69.4 98.5 69.4 93 68 87.4 Z"/></clipPath><radialGradient id="tbm-dash-gem" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d4ffe9"/><stop offset=".2" stop-color="#6bf5b2"/><stop offset=".48" stop-color="#27e08a"/><stop offset=".8" stop-color="#0a8450"/><stop offset="1" stop-color="#03301d"/></radialGradient><radialGradient id="tbm-dash-bezel" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#2a1a04"/><stop offset="1" stop-color="#7a5316"/></radialGradient><filter id="tbm-dash-brush" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.6 .05" numOctaves="2" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 -.6"/></filter><filter id="tbm-dash-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.3"/></filter><filter id="tbm-dash-metal" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".9 .12" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 .9"/></filter><filter id="tbm-dash-drop" x="-30%" y="-15%" width="160%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="2.4"/><feOffset dx="2.6" dy="3.4" result="s"/><feFlood flood-color="#000" flood-opacity=".75"/><feComposite in2="s" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="tbm-dash-blur1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter><filter id="tbm-dash-blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter><filter id="tbm-dash-blur05" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".45"/></filter></defs><rect x="3" y="3" width="122" height="122" rx="27" fill="none" stroke="#27e08a" stroke-opacity=".55" stroke-width="3" filter="url(#tbm-dash-blur3)"/><rect x="3" y="3" width="122" height="122" rx="27" fill="#0a0b0d"/><rect x="3" y="3" width="122" height="122" rx="27" fill="url(#tbm-dash-glow)"/><rect x="3" y="3" width="122" height="122" rx="27" fill="url(#tbm-dash-sheen)"/><rect x="4" y="4" width="120" height="120" rx="26" fill="none" stroke="url(#tbm-dash-rim)" stroke-width="1.6"/><rect x="6" y="6" width="116" height="116" rx="24" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="1"/><g transform="translate(64 64) scale(.87) translate(-64 -65.3)"><g filter="url(#tbm-dash-drop)"><g transform="translate(64 8) scale(.82 1.104) translate(-64 -10)"><path d="M64 10 L72 30 L72 77 L56 77 L56 30 Z" fill="url(#tbm-dash-flat)"/><g clip-path="url(#tbm-dash-bladeclip)"><rect x="55" y="9" width="18" height="70" filter="url(#tbm-dash-metal)" opacity=".35"/><rect x="55" y="9" width="18" height="70" filter="url(#tbm-dash-brush)" opacity=".16"/><rect x="55" y="9" width="18" height="70" fill="url(#tbm-dash-env)"/><path d="M64 10 L56 30 L56 77 L58.8 77 L58.8 32.5 Z" fill="url(#tbm-dash-bevL)"/><path d="M64 10 L72 30 L72 77 L69.2 77 L69.2 32.5 Z" fill="url(#tbm-dash-bevR)"/><path d="M58.8 32.5 L58.8 77" stroke="#fff" stroke-opacity=".55" stroke-width=".35"/><path d="M69.2 32.5 L69.2 77" stroke="#fff" stroke-opacity=".30" stroke-width=".3"/><path d="M64 10 L58.8 32.5 M64 10 L69.2 32.5" stroke="#fff" stroke-opacity=".35" stroke-width=".3" fill="none"/><rect x="62.4" y="27" width="3.2" height="42" rx="1.6" fill="url(#tbm-dash-fuller)"/><rect x="62.4" y="27" width="3.2" height="42" rx="1.6" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".35"/><path d="M65.7 29 L65.7 67" stroke="#fff" stroke-opacity=".85" stroke-width=".3"/><path d="M60.3 36 L60.3 72" stroke="url(#tbm-dash-spec)" stroke-width=".7" stroke-linecap="round"/><path d="M67.6 40 L67.6 68" stroke="#fff" stroke-opacity=".28" stroke-width=".5" stroke-linecap="round"/><rect x="55" y="64" width="18" height="13" fill="url(#tbm-dash-ao-blade)"/></g><path d="M64 10 L72 30 L72 77 L56 77 L56 30 Z" fill="none" stroke="#0a0d10" stroke-opacity=".55" stroke-width=".5"/><ellipse cx="64.1" cy="12.6" rx=".7" ry="1.8" fill="#fff" opacity=".95" filter="url(#tbm-dash-blur05)"/></g><g transform="translate(0 5)"><path d="M35 83.5 C35 80.5 38 79 42 79.2 C50 79.6 55 76 64 76 C73 76 78 79.6 86 79.2 C90 79 93 80.5 93 83.5 C93 85.6 90.8 86.4 89 85.6 C82 83 74 84.8 64 84.8 C54 84.8 46 83 39 85.6 C37.2 86.4 35 85.6 35 83.5 Z" fill="url(#tbm-dash-brass)"/><path d="M35 83.5 C35 80.5 38 79 42 79.2 C50 79.6 55 76 64 76 C73 76 78 79.6 86 79.2 C90 79 93 80.5 93 83.5 C93 85.6 90.8 86.4 89 85.6 C82 83 74 84.8 64 84.8 C54 84.8 46 83 39 85.6 C37.2 86.4 35 85.6 35 83.5 Z" fill="url(#tbm-dash-brassV)" stroke="#2a1900" stroke-opacity=".7" stroke-width=".5"/><path d="M35 83.5 C35 80.5 38 79 42 79.2 C50 79.6 55 76 64 76 C73 76 78 79.6 86 79.2 C90 79 93 80.5 93 83.5 C93 85.6 90.8 86.4 89 85.6 C82 83 74 84.8 64 84.8 C54 84.8 46 83 39 85.6 C37.2 86.4 35 85.6 35 83.5 Z" filter="url(#tbm-dash-grain)" opacity=".28" fill="#000"/><g fill="none" stroke-linecap="round"><path d="M43 81.6 q2.5 -2.2 5 0 t5 0 t4 0" stroke="#fff3c0" stroke-opacity=".45" stroke-width=".5" transform="translate(0 .5)"/><path d="M43 81.6 q2.5 -2.2 5 0 t5 0 t4 0" stroke="#2c1a02" stroke-opacity=".85" stroke-width=".6"/><path d="M85 81.6 q-2.5 -2.2 -5 0 t-5 0 t-4 0" stroke="#fff3c0" stroke-opacity=".45" stroke-width=".5" transform="translate(0 .5)"/><path d="M85 81.6 q-2.5 -2.2 -5 0 t-5 0 t-4 0" stroke="#2c1a02" stroke-opacity=".85" stroke-width=".6"/><path d="M37.6 83.6 L40.6 83.6 M87.4 83.6 L90.4 83.6" stroke="#2c1a02" stroke-opacity=".8" stroke-width=".6"/></g><path d="M64 78.1 L66.3 80.6 L64 83.1 L61.7 80.6 Z" fill="#27e08a" stroke="#2c1a02" stroke-width=".6" stroke-linejoin="round"/><path d="M64 78.9 L65 80.2 L63 80.2 Z" fill="#d4ffe9" opacity=".8"/><rect x="59" y="84.4" width="10" height="3" rx="1.1" fill="url(#tbm-dash-collar)" stroke="#2a1900" stroke-opacity=".6" stroke-width=".4"/></g><g transform="translate(0 5) translate(0 87.4) scale(1 .8) translate(0 -87.4)"><path d="M60 87.4 C58.6 93 58.6 98.5 60 104 L68 104 C69.4 98.5 69.4 93 68 87.4 Z" fill="url(#tbm-dash-leath)"/><g clip-path="url(#tbm-dash-gripclip)"><rect x="57" y="86" width="14" height="19" filter="url(#tbm-dash-grain)" opacity=".5"/><g fill="none" stroke-linecap="round"><path d="M58 90.9 Q64 92.1 70 87.7" stroke="#030201" stroke-width="1.1" stroke-opacity=".85"/><path d="M58 93.9 Q64 95.1 70 90.7" stroke="#030201" stroke-width="1.1" stroke-opacity=".85"/><path d="M58 96.9 Q64 98.1 70 93.7" stroke="#030201" stroke-width="1.1" stroke-opacity=".85"/><path d="M58 99.9 Q64 101.1 70 96.7" stroke="#030201" stroke-width="1.1" stroke-opacity=".85"/><path d="M58 102.9 Q64 104.1 70 99.7" stroke="#030201" stroke-width="1.1" stroke-opacity=".85"/><path d="M58 105.9 Q64 107.1 70 102.7" stroke="#030201" stroke-width="1.1" stroke-opacity=".85"/><g stroke="#b78f6a" stroke-opacity=".55" stroke-width=".4" transform="translate(0 -.9)"><path d="M58 90.9 Q64 92.1 70 87.7"/><path d="M58 93.9 Q64 95.1 70 90.7"/><path d="M58 96.9 Q64 98.1 70 93.7"/><path d="M58 99.9 Q64 101.1 70 96.7"/><path d="M58 102.9 Q64 104.1 70 99.7"/><path d="M58 105.9 Q64 107.1 70 102.7"/></g><path d="M66.2 88 C67.4 93 67.4 98.5 66.2 104" stroke="#e8cfa8" stroke-opacity=".65" stroke-width=".45" stroke-dasharray=".7 1.1"/></g><rect x="57" y="87.4" width="14" height="5.6" fill="url(#tbm-dash-ao-grip)"/></g></g><rect x="58.4" y="105.68" width="11.2" height="2.4" rx="1.1" fill="url(#tbm-dash-collar)" stroke="#2a1900" stroke-opacity=".6" stroke-width=".4"/><g transform="translate(0 2.08)"><circle cx="64" cy="112.6" r="7.6" fill="url(#tbm-dash-pom)" stroke="#2a1900" stroke-opacity=".7" stroke-width=".5"/><circle cx="64" cy="112.6" r="7.6" filter="url(#tbm-dash-grain)" opacity=".22" fill="#000"/><circle cx="64" cy="112.6" r="6.2" fill="#e9c15b" opacity=".0"/><circle cx="64" cy="112.6" r="6" fill="#27e08a" opacity=".38" filter="url(#tbm-dash-blur1)"/><circle cx="64" cy="112.6" r="5" fill="url(#tbm-dash-bezel)"/><circle cx="64" cy="112.6" r="4.9" fill="none" stroke="#f0cf7a" stroke-opacity=".55" stroke-width=".4"/><circle cx="64" cy="112.6" r="4" fill="url(#tbm-dash-gem)"/><g fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".25"><path d="M61.8 109.6 L66.2 109.6 L68 111.4 L68 113.8 L66.2 115.6 L61.8 115.6 L60 113.8 L60 111.4 Z"/><path d="M61.8 109.6 L64 112.6 L66.2 109.6 M60 113.8 L64 112.6 L68 113.8 M61.8 115.6 L64 112.6 L66.2 115.6"/></g><path d="M61.4 115 A4 4 0 0 0 66.8 115.6" stroke="#02281a" stroke-opacity=".55" stroke-width=".9" fill="none" stroke-linecap="round" transform="translate(.4 -.3)"/><ellipse cx="62.4" cy="110.7" rx="1.6" ry=".9" transform="rotate(-35 62.4 110.7)" fill="#fff" opacity=".9"/><circle cx="65.6" cy="114.5" r=".5" fill="#fff" opacity=".6"/><ellipse cx="62.8" cy="108.9" rx="3.2" ry="1" transform="rotate(-20 62.8 108.9)" fill="#fff" opacity=".35" filter="url(#tbm-dash-blur05)"/></g></g><g transform="translate(61 42.2)" fill="#fff" opacity=".9"><path d="M0 -4.2 L.5 -.5 L4.2 0 L.5 .5 L0 4.2 L-.5 .5 L-4.2 0 L-.5 -.5 Z" filter="url(#tbm-dash-blur05)"/><circle r=".7"/></g></g></svg>`;

const CSS = `
:root{color-scheme:dark light;--bg:#05090a;--card:rgba(13,23,22,.78);--card-2:rgba(2,8,8,.55);--line:rgba(255,255,255,.16);--line-strong:rgba(255,255,255,.46);
--text:#f1f4f8;--muted:#bac3ce;--faint:#8f99a6;--accent:#27e08a;--accent-text:#3aeb9a;--accent-ink:#03170c;--accent-wash:rgba(39,224,138,.14);--accent-line:rgba(80,240,165,.6);
--danger-text:#ff9f98;--danger-wash:rgba(255,95,86,.14);--danger-line:rgba(255,120,110,.6);--warn-text:#f5c95c;--warn-wash:rgba(241,194,78,.13);--warn-line:rgba(245,201,92,.55);
--focus:#7ff5bd;--shadow:0 26px 50px -24px rgba(0,0,0,.8),0 8px 18px -8px rgba(0,0,0,.5);--lit:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(0,0,0,.35);
--aurora:radial-gradient(48% 36% at 84% 4%,rgba(18,196,122,.5),transparent 72%),radial-gradient(54% 42% at 2% 38%,rgba(10,140,165,.42),transparent 72%),radial-gradient(64% 44% at 74% 100%,rgba(20,170,110,.4),transparent 72%),radial-gradient(40% 28% at 6% 98%,rgba(230,179,74,.12),transparent 72%);
--hatch:repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 1px,transparent 1px 16px);--spring:cubic-bezier(.3,1.45,.5,1)}
@media (prefers-color-scheme:light){:root{--bg:#d9e8e4;--card:rgba(255,255,255,.72);--card-2:rgba(255,255,255,.7);--line:rgba(20,40,60,.18);--line-strong:rgba(20,40,60,.55);
--text:#0d1218;--muted:#364050;--faint:#566170;--accent-text:#05603a;--accent-wash:rgba(5,96,58,.1);--accent-line:rgba(5,96,58,.6);--danger-text:#a3190f;--danger-wash:rgba(163,25,15,.08);--danger-line:rgba(163,25,15,.55);
--warn-text:#6b4600;--warn-wash:rgba(140,90,0,.1);--warn-line:rgba(107,70,0,.55);--focus:#05603a;--shadow:0 24px 46px -24px rgba(18,36,56,.5),0 8px 18px -8px rgba(18,36,56,.22);--lit:inset 0 1px 0 #fff,inset 0 -1px 0 rgba(20,40,60,.1);
--aurora:radial-gradient(48% 36% at 84% 4%,rgba(60,220,160,.55),transparent 72%),radial-gradient(54% 42% at 2% 38%,rgba(70,190,230,.45),transparent 72%),radial-gradient(64% 44% at 74% 100%,rgba(90,225,170,.45),transparent 72%),radial-gradient(40% 28% at 6% 98%,rgba(255,214,140,.4),transparent 72%);
--hatch:repeating-linear-gradient(135deg,rgba(255,255,255,.55) 0 1px,transparent 1px 16px)}}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{position:relative;isolation:isolate;min-height:100vh;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.45;color:var(--text);font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;overflow-wrap:break-word;padding:clamp(16px,4vw,40px)}
body::before{content:'';position:fixed;inset:0;z-index:-2;background:var(--aurora)}
body::after{content:'';position:fixed;inset:0;z-index:-1;background:var(--hatch);pointer-events:none}
.wrap{max-width:1120px;margin:0 auto}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:8px}
header{display:flex;align-items:center;gap:14px;margin-bottom:clamp(20px,4vw,34px)}
.mark{width:44px;height:44px;flex:0 0 auto;filter:drop-shadow(0 6px 14px rgba(39,224,138,.4))}
.m-tile{fill:var(--bg);stroke:var(--accent-line)}.m-blade{fill:var(--accent)}.m-guard{stroke:var(--accent)}
@media (prefers-color-scheme:light){.m-tile{fill:#0a0b0d;stroke:#0a0b0d}.mark{filter:drop-shadow(0 6px 10px rgba(5,96,58,.3))}}
h1{font-size:clamp(24px,4vw,34px);line-height:1.1;font-weight:800;letter-spacing:-.025em}
.sub{margin-top:4px;color:var(--text);font-size:13.5px}
.grid{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr));gap:16px}
.acct{--rim:linear-gradient(142deg,rgba(255,255,255,.7),rgba(255,255,255,.14) 28%,rgba(255,255,255,.05) 55%,rgba(255,255,255,.4));--glow:0 0 0 0 transparent;
position:relative;isolation:isolate;display:flex;flex-direction:column;gap:16px;min-width:0;padding:18px;border-radius:24px;background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 55%),var(--card);
-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);box-shadow:var(--lit),var(--shadow),var(--glow)}
.acct::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit;padding:1.5px;background:var(--rim);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.st-running{--rim:linear-gradient(142deg,rgba(200,255,230,.95),rgba(70,240,165,.5) 28%,rgba(60,230,150,.14) 55%,rgba(120,255,200,.5));--glow:0 0 44px -14px rgba(39,224,138,.55)}
.st-error{--rim:linear-gradient(142deg,rgba(255,190,185,.9),var(--danger-line) 30%,rgba(255,120,110,.14) 55%,var(--danger-line));--glow:0 0 40px -16px rgba(255,95,86,.45)}
.st-dry-run,.st-launching{--rim:linear-gradient(142deg,rgba(255,238,190,.9),var(--warn-line) 30%,rgba(245,201,92,.14) 55%,var(--warn-line))}
@media (prefers-color-scheme:light){.st-running{--rim:linear-gradient(142deg,#fff,rgba(60,200,140,.8) 28%,rgba(40,190,130,.3) 55%,rgba(40,170,120,.6))}}
.head{display:flex;align-items:flex-start;gap:12px;min-width:0}
.name{flex:1 1 auto;min-width:0;font-size:18px;line-height:1.2;font-weight:800;letter-spacing:-.015em;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;min-height:28px;max-width:46%;padding:0 12px 0 10px;border-radius:999px;font-size:12.5px;font-weight:700;line-height:1.2;color:var(--muted);background:var(--card-2);border:1px dashed var(--line-strong);overflow-wrap:anywhere}
.beacon{position:relative;display:block;flex:0 0 auto;width:12px;height:12px;border-radius:50%;border:2px solid var(--muted)}
.st-running .pill{color:var(--accent-text);border:1px solid var(--accent-line);background:linear-gradient(0deg,var(--accent-wash),var(--accent-wash)),var(--card-2)}
.st-running .beacon{border-color:#b7ffe0;background:radial-gradient(circle at 35% 30%,#d6ffec,var(--accent) 55%,#0c8f55);box-shadow:0 0 0 3px var(--accent-wash),0 0 12px 2px var(--accent-line)}
.st-error .pill{color:var(--danger-text);border:1px solid var(--danger-line);background:linear-gradient(0deg,var(--danger-wash),var(--danger-wash)),var(--card-2)}
.st-error .beacon{border-radius:3px;border-color:var(--danger-text);background:linear-gradient(45deg,transparent 42%,var(--danger-text) 42% 58%,transparent 58%),linear-gradient(-45deg,transparent 42%,var(--danger-text) 42% 58%,transparent 58%)}
.st-dry-run .pill,.st-launching .pill{color:var(--warn-text);border:1px dashed var(--warn-line);background:linear-gradient(0deg,var(--warn-wash),var(--warn-wash)),var(--card-2)}
.st-dry-run .beacon,.st-launching .beacon{border-style:dotted;border-color:var(--warn-text)}
@media (prefers-color-scheme:light){.st-running .beacon{border-color:#0a8a55;background:radial-gradient(circle at 35% 30%,#9af0c6,#12b868 60%,#067a45);box-shadow:0 0 0 3px rgba(10,138,85,.14)}}
.hero{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,0) 55%),var(--card-2);border:1px solid var(--line);box-shadow:var(--lit)}
.disc{display:grid;place-items:center;flex:0 0 auto;width:40px;height:40px;border-radius:50%;color:var(--accent-text);background:var(--accent-wash);border:1px solid var(--accent-line)}
.disc .ic{width:20px;height:20px}
.hero dl,.m{display:flex;flex-direction:column-reverse;min-width:0}
.hero dd{font-size:clamp(28px,4.4vw,36px);line-height:1.05;font-weight:800;letter-spacing:-.03em;overflow-wrap:anywhere}
.hero dt{font-size:12.5px;color:var(--muted)}
.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.m{justify-content:center;gap:2px;padding:9px 10px;border-radius:14px;background:var(--card-2);border:1px solid var(--line);box-shadow:var(--lit)}
.m dd{display:flex;align-items:center;gap:6px;font-size:20px;line-height:1.15;font-weight:750;letter-spacing:-.02em;overflow-wrap:anywhere}
.m dt{font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.m .ic{width:14px;height:14px;flex:0 0 auto;color:var(--faint)}
.m.bad{border-color:var(--danger-line);background:linear-gradient(0deg,var(--danger-wash),var(--danger-wash)),var(--card-2)}
.m.bad dd,.m.bad dt,.m.bad .ic{color:var(--danger-text)}
.foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:auto}
.chip{display:inline-flex;align-items:center;gap:6px;min-height:28px;padding:0 11px 0 9px;border-radius:14px;font-size:12px;font-weight:600;color:var(--muted);background:var(--card-2);border:1px solid var(--line)}
.chip .ic{width:14px;height:14px;color:var(--accent-text)}
.acts{display:flex;gap:8px;margin-left:auto}
button{font:inherit;font-weight:700;line-height:1.2;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;min-width:92px;padding:0 18px 0 14px;border-radius:999px;cursor:pointer;color:var(--text);background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 60%),var(--card-2);border:1px solid var(--line-strong);box-shadow:var(--lit),0 6px 14px -8px rgba(0,0,0,.6)}
button .ic{width:14px;height:14px}
button:hover{border-color:var(--text)}
button:active{transform:translateY(1px) scale(.96)}
.go{color:var(--accent-ink);border-color:rgba(190,255,225,.85);background:radial-gradient(120% 90% at 28% 0%,rgba(255,255,255,.6),rgba(255,255,255,0) 55%),linear-gradient(180deg,#46f5a8,#14b96b);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.85),inset 0 -3px 6px rgba(0,90,50,.38),0 8px 20px -6px rgba(39,224,138,.7),0 2px 4px rgba(0,0,0,.25)}
.go:hover{border-color:#fff;background:radial-gradient(120% 90% at 28% 0%,rgba(255,255,255,.75),rgba(255,255,255,0) 55%),linear-gradient(180deg,#6bffbd,#1ccb78)}
.st-running .go{color:var(--text);border-color:var(--line-strong);background:linear-gradient(180deg,rgba(255,255,255,.14),rgba(255,255,255,0) 60%),var(--card-2);box-shadow:var(--lit)}
.st-running .go:hover{border-color:var(--accent-line);color:var(--accent-text)}
.st-stopped .halt,.st-error .halt,.st-dry-run .halt,.st-launching .halt{color:var(--muted);box-shadow:none}
.st-running .halt{color:var(--danger-text);border-color:var(--danger-line);background:linear-gradient(0deg,var(--danger-wash),var(--danger-wash)),var(--card-2)}
.st-running .halt:hover{border-color:var(--danger-text)}
.empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;max-width:520px;margin:clamp(20px,8vh,80px) auto;padding:36px 28px;border-radius:28px;background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 55%),var(--card);-webkit-backdrop-filter:blur(20px) saturate(1.6);backdrop-filter:blur(20px) saturate(1.6);box-shadow:var(--lit),var(--shadow);border:1px dashed var(--line-strong)}
.empty .disc{width:64px;height:64px}.empty .disc .ic{width:30px;height:30px}
.empty h2{font-size:22px;font-weight:800;letter-spacing:-.02em}
.empty p{color:var(--muted);max-width:42ch}
code{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:.92em;padding:1px 6px;border-radius:6px;background:var(--card-2);border:1px solid var(--line);color:var(--text)}
.muted{margin-top:22px;color:var(--text);font-size:12.5px;text-align:center}
@media (prefers-reduced-motion:no-preference){
button,.pill{transition:transform .35s var(--spring),background-color .18s,border-color .18s,color .18s,box-shadow .25s}
button:hover{transform:translateY(-2px)}button:active{transform:translateY(1px) scale(.96)}
.st-running .beacon::after{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid var(--accent);animation:ping 2.6s ease-out infinite}
@keyframes ping{0%{opacity:.75;transform:scale(.7)}70%,100%{opacity:0;transform:scale(2.2)}}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){:root{--card:#0f1719;--card-2:#172123}@media (prefers-color-scheme:light){:root{--card:#f3f7f6;--card-2:#e6eeec}}}
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){:root{--card:#0f1719;--card-2:#172123;--aurora:linear-gradient(var(--bg),var(--bg));--hatch:linear-gradient(transparent,transparent);--line:var(--line-strong);--muted:var(--text)}
@media (prefers-color-scheme:light){:root{--card:#f3f7f6;--card-2:#e6eeec}}
.acct,.empty{-webkit-backdrop-filter:none;backdrop-filter:none}}
@media (max-width:420px){.acts{width:100%}.acts button{flex:1}.pill{max-width:none}.head{flex-wrap:wrap}}
`;

export function renderDashboardHtml(views, opts = {}) {
  const cards = views.map((v) => {
    const bad = Number(v.errors) > 0 ? ' bad' : '';
    return `
    <li class="acct st-${esc(v.status)}">
      <div class="head">
        <h2 class="name">${esc(v.label)}</h2>
        <span class="pill"><span class="beacon" aria-hidden="true"></span>${esc(v.status)}</span>
      </div>
      <div class="hero"><span class="disc" aria-hidden="true">${IC.coin}</span><dl><dt>Gold</dt><dd>${esc(fmt(v.gold))}</dd></dl></div>
      <dl class="metrics">
        <div class="m"><dt>Adventures</dt><dd>${IC.sword}${esc(fmt(v.adventures))}</dd></div>
        <div class="m"><dt>Encounters</dt><dd>${IC.target}${esc(fmt(v.encounters))}</dd></div>
        <div class="m"><dt>Uptime</dt><dd>${IC.clock}${esc(v.uptimeMin)}m</dd></div>
        <div class="m${bad}"><dt>Errors</dt><dd>${IC.warn}${esc(v.errors)}</dd></div>
      </dl>
      <div class="foot">
        ${v.proxy ? `<span class="chip">${IC.shield}Proxy</span>` : ''}
        <div class="acts">
          <button class="go" aria-label="Start ${esc(v.label)}" onclick="ctl('start',${esc(JSON.stringify(String(v.id)))})">${IC.play}Start</button>
          <button class="halt" aria-label="Stop ${esc(v.label)}" onclick="ctl('stop',${esc(JSON.stringify(String(v.id)))})">${IC.stop}Stop</button>
        </div>
      </div>
    </li>`;
  }).join('');
  const body = cards
    ? `<ul class="grid" aria-label="Accounts">${cards}</ul>`
    : `<section class="empty"><span class="disc" aria-hidden="true">${IC.users}</span><h2>No accounts yet</h2><p>Add an account to <code>accounts.json</code> and restart the controller. It shows up here with its own Start and Stop.</p></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><title>Tanoth Controller</title>
<style>${CSS}</style></head><body><div class="wrap">
<header>${MARK}<div><h1>Tanoth Controller</h1><p class="sub">Multi-account control room. Every account runs locally on this machine.</p></div></header>
<main>${body}</main>
<p class="muted">Auto-refreshes every 5s.</p></div>
<script>
const TOKEN=${JSON.stringify(opts.token || '').replace(/</g, '\\u003c')};
async function ctl(action,id){await fetch('/api/'+action+'?id='+encodeURIComponent(id)+(TOKEN?'&token='+encodeURIComponent(TOKEN):''),{method:'POST'});setTimeout(()=>location.reload(),600);}
setTimeout(()=>location.reload(),5000);
</script></body></html>`;
}
