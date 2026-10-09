// QR на таблото (FR-13). Два входа към един и същ резултат — нов случай с контекста на таблото:
//  1) `/q/<токен>` → сървърът пренасочва към `/?qr=<токен>`; токенът се чете веднъж, маха се от
//     адреса и от историята и се държи само в паметта до вход;
//  2) сканиране с камерата през BarcodeDetector (където го има) или ръчен сериен номер.
// Без външни библиотеки.

import { api } from '../api.js';
import { $ } from '../dom.js';
import { errorText } from '../errors.js';
import { t } from '../i18n.js';

const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
let pendingToken = null;
let stream = null;
let rafStop = false;

/** Чете и изтрива `?qr=` от адреса. Връща true, ако е имало токен. */
export function takeQrFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('qr');
  if (raw === null) return false;
  pendingToken = TOKEN.test(raw) ? raw : null;
  history.replaceState(null, '', location.pathname + location.hash);
  return pendingToken !== null;
}

export const hasPendingQr = () => pendingToken !== null;

/** Таблото по чакащия токен (след вход) или null. */
export async function resolvePendingQr() {
  const token = pendingToken;
  pendingToken = null;
  if (!token) return null;
  const { device } = await api('GET', `/devices/by-qr/${encodeURIComponent(token)}`);
  return device;
}

/** Токен от съдържанието на кода: адрес `…/q/<токен>` или чист токен; иначе сериен номер. */
export function parseScanned(value) {
  const text = String(value ?? '').trim();
  const m = /\/q\/([A-Za-z0-9_-]{20,100})(?:[/?#]|$)/.exec(text);
  if (m) return { token: m[1] };
  if (TOKEN.test(text)) return { token: text };
  return text ? { serial: text } : null;
}

async function lookup(parsed) {
  if (parsed.token) {
    return (await api('GET', `/devices/by-qr/${encodeURIComponent(parsed.token)}`)).device;
  }
  return (await api('GET', `/devices/${encodeURIComponent(parsed.serial)}`)).device;
}

export async function cameraSupported() {
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    return formats.includes('qr_code');
  } catch {
    return false;
  }
}

function stopCamera() {
  rafStop = true;
  if (stream) for (const track of stream.getTracks()) track.stop();
  stream = null;
  const video = $('#scan-video');
  video.srcObject = null;
}

async function startCamera(onFound) {
  const video = $('#scan-video');
  const box = $('#scan-camera');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    box.hidden = true;
    return;
  }
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  box.hidden = false;
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
  rafStop = false;
  let last = 0;
  const tick = async (now) => {
    if (rafStop) return;
    if (now - last > 250 && video.readyState >= 2) {
      last = now;
      try {
        const codes = await detector.detect(video);
        const parsed = codes.length ? parseScanned(codes[0].rawValue) : null;
        if (parsed) return onFound(parsed);
      } catch {
        /* кадърът не се чете — следващият */
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** @param {(device: object) => void} onDevice */
export function initScan(onDevice) {
  const dlg = $('#dlg-scan');
  const msg = $('#scan-msg');
  const say = (text, isError) => {
    msg.textContent = text;
    msg.className = isError ? 'form-error' : 'form-note';
    msg.hidden = text === '';
  };
  const found = async (parsed) => {
    stopCamera();
    say(t('qr.looking'), false);
    try {
      const device = await lookup(parsed);
      dlg.close();
      onDevice(device);
    } catch (err) {
      say(err.status === 404 ? t('qr.notFound') : errorText(err), true);
      if (await cameraSupported()) void startCamera(found);
    }
  };
  $('#btn-scan').addEventListener('click', async () => {
    say('', false);
    $('#scan-serial').value = '';
    dlg.showModal();
    if (await cameraSupported()) void startCamera(found);
    else $('#scan-serial').focus();
  });
  dlg.addEventListener('close', stopCamera);
  $('#scan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const serial = $('#scan-serial').value.trim();
    if (serial) void found({ serial });
  });
}
