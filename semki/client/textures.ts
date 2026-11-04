// Текстурите се рисуват в браузъра (Canvas 2D) — без файлове за сваляне: дървото на дъската, коркът,
// шарката на семето, мазилката на стената и меката сянка под стъкленицата. Генераторът е
// детерминистичен: всяко зареждане дава същата картина.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('canvas 2d is unavailable');
  return [c, g];
}

function texture(c: HTMLCanvasElement, color: boolean): CanvasTexture {
  const t = new CanvasTexture(c);
  if (color) t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// Орех: тъмна основа, дълги вълнисти жилки по дължината на дъската и няколко по-светли ивици.
export function woodTexture(): CanvasTexture {
  const [c, g] = canvas(1024, 256);
  const rnd = random(11);
  const base = g.createLinearGradient(0, 0, 0, c.height);
  base.addColorStop(0, '#5a3a21');
  base.addColorStop(0.5, '#4b2f1a');
  base.addColorStop(1, '#583822');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 170; i++) {
    const y0 = rnd() * c.height;
    const amp = 1.5 + rnd() * 5;
    const freq = 0.002 + rnd() * 0.008;
    const phase = rnd() * Math.PI * 2;
    const dark = rnd() < 0.62;
    g.strokeStyle = dark
      ? `rgba(28, 15, 7, ${0.12 + rnd() * 0.32})`
      : `rgba(150, 104, 62, ${0.06 + rnd() * 0.16})`;
    g.lineWidth = 0.5 + rnd() * 2.4;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 8) {
      const y =
        y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.3 + phase) * amp * 0.25;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  return texture(c, true);
}

// Корк: светлокафява основа, гъсти зърна в два тона и дребни тъмни шупли.
export function corkTexture(): CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rnd = random(23);
  g.fillStyle = '#b48656';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    const r = 0.6 + rnd() * 2.2;
    const tone = rnd();
    g.fillStyle =
      tone < 0.45
        ? `rgba(120, 80, 44, ${0.25 + rnd() * 0.4})`
        : tone < 0.85
          ? `rgba(214, 170, 120, ${0.2 + rnd() * 0.35})`
          : `rgba(58, 34, 16, ${0.45 + rnd() * 0.4})`;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, true);
}

// Семе: сиво-кафява обвивка с тъмни „тигрови“ петна по дължината.
export function seedTexture(): CanvasTexture {
  const [c, g] = canvas(256, 128);
  const rnd = random(37);
  g.fillStyle = '#8a6a48';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    g.fillStyle = `rgba(48, 30, 16, ${0.35 + rnd() * 0.45})`;
    g.beginPath();
    g.ellipse(x, y, 3 + rnd() * 9, 1.5 + rnd() * 4, (rnd() - 0.5) * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(196, 178, 150, ${0.15 + rnd() * 0.3})`;
    g.fillRect(rnd() * c.width, rnd() * c.height, 1 + rnd() * 2, 1);
  }
  return texture(c, true);
}

// Мазилка: почти равномерен шум за стената (дава грапавина, без да се вижда шарка).
export function plasterTexture(): CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rnd = random(51);
  const img = g.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.floor(rnd() * 55);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return texture(c, true);
}

// Мека сянка под дъното: черно, плътно в средата, изчезва към ръба.
export function contactShadowTexture(): CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  r.addColorStop(0.45, 'rgba(0, 0, 0, 0.45)');
  r.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = r;
  g.fillRect(0, 0, c.width, c.height);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
