// Canvas-рисуван мотив (нитове/филигран/шипове/руни/пера/люспи/тръни/звезди/пламъци),
// оцветен по темата — приложен като декал (прозрачна текстура) върху основните повърхности.
// Същият подход като heraldry.js (canvas → CanvasTexture), но параметризиран по мотив вместо
// фиксирана хералдика.
import * as THREE from 'three/webgpu';
import type { Rand } from './rng';
import type { ItemTheme } from './theme';

const SIZE = 256;

function makeCtx(): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Плътност на орнамента по тир: 1 (беден) → 12 (пищен). */
function density(tier: number): number {
  return THREE.MathUtils.clamp(tier, 1, 12);
}

/** Извън браузър (напр. `node --test` на генератора) няма Canvas 2D — връщаме 1x1 прозрачна
 *  текстура, за да може buildItem() да строи навсякъде без DOM. В браузъра тръгва пълният мотив. */
function hasDom(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export function buildMotifTexture(theme: ItemTheme, rand: Rand, tier: number): THREE.Texture {
  if (!hasDom()) {
    const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const { c, ctx } = makeCtx();
  ctx.clearRect(0, 0, SIZE, SIZE);
  const trim = theme.trim;
  const glow = theme.emissive || theme.trim;
  const n = Math.round(density(tier));

  switch (theme.motif) {
    case 'plain':
      break;
    case 'rivets': {
      ctx.fillStyle = trim;
      const cols = 3 + Math.min(3, Math.floor(n / 3));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < cols; j++) {
          const x = SIZE * ((i + 0.5) / cols);
          const y = SIZE * ((j + 0.5) / cols);
          ctx.beginPath();
          ctx.arc(x, y, 4 + rand() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'filigree': {
      ctx.strokeStyle = trim;
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 3 + Math.floor(n / 2); i++) {
        ctx.beginPath();
        const x0 = SIZE * rand();
        const y0 = SIZE * rand();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x0 + 40 - rand() * 80, y0 + 40, x0 - 40 + rand() * 80, y0 - 40, x0 + (rand() - 0.5) * 60, y0 + (rand() - 0.5) * 60);
        ctx.stroke();
      }
      break;
    }
    case 'spikes': {
      ctx.fillStyle = trim;
      const rows = 2 + Math.min(3, Math.floor(n / 4));
      for (let r = 0; r < rows; r++) {
        const y = SIZE * ((r + 0.5) / rows);
        const cols = 4 + r;
        for (let i = 0; i < cols; i++) {
          const x = SIZE * ((i + 0.5) / cols);
          ctx.beginPath();
          ctx.moveTo(x, y - 10);
          ctx.lineTo(x - 6, y + 8);
          ctx.lineTo(x + 6, y + 8);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case 'runes': {
      ctx.strokeStyle = glow;
      ctx.lineWidth = 3;
      const count = 3 + Math.floor(n / 2);
      for (let i = 0; i < count; i++) {
        const cx = SIZE * (0.15 + 0.7 * rand());
        const cy = SIZE * (0.15 + 0.7 * rand());
        const s = 10 + rand() * 14;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx, cy + s);
        ctx.moveTo(cx - s * 0.6, cy - s * 0.3);
        ctx.lineTo(cx + s * 0.6, cy + s * 0.3);
        ctx.moveTo(cx - s * 0.6, cy + s * 0.3);
        ctx.lineTo(cx + s * 0.6, cy - s * 0.3);
        ctx.stroke();
      }
      break;
    }
    case 'feathers': {
      ctx.fillStyle = theme.secondary;
      ctx.strokeStyle = trim;
      const rows = 3 + Math.floor(n / 4);
      for (let r = 0; r < rows; r++) {
        const y = SIZE * ((r + 0.5) / rows);
        ctx.beginPath();
        ctx.ellipse(SIZE * 0.5, y, SIZE * 0.42, 10 + rand() * 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'scales': {
      ctx.fillStyle = theme.secondary;
      ctx.strokeStyle = trim;
      ctx.lineWidth = 1;
      const rows = 4 + Math.floor(n / 3);
      for (let r = 0; r < rows; r++) {
        const y = SIZE * ((r + 0.5) / rows);
        const cols = 5;
        for (let i = 0; i < cols; i++) {
          const x = SIZE * ((i + 0.5) / cols) + (r % 2 ? SIZE / cols / 2 : 0);
          ctx.beginPath();
          ctx.arc(x, y, SIZE / cols / 1.6, 0, Math.PI, false);
          ctx.fill();
          ctx.stroke();
        }
      }
      break;
    }
    case 'thorns': {
      ctx.strokeStyle = theme.secondary;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 2 + Math.floor(n / 3); i++) {
        const x0 = SIZE * rand();
        ctx.beginPath();
        ctx.moveTo(x0, SIZE);
        ctx.quadraticCurveTo(x0 + (rand() - 0.5) * 60, SIZE * 0.5, x0 + (rand() - 0.5) * 30, 0);
        ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const t = (k + 1) / 5;
          const x = x0 * (1 - t) + (x0 + (rand() - 0.5) * 30) * t;
          const y = SIZE * (1 - t);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 8, y - 4);
          ctx.stroke();
        }
      }
      break;
    }
    case 'stars': {
      ctx.fillStyle = glow;
      for (let i = 0; i < 6 + n; i++) {
        const x = SIZE * rand();
        const y = SIZE * rand();
        const s = 2 + rand() * 3;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const rr = k % 2 === 0 ? s * 2.6 : s * 0.6;
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'flames': {
      const grad = ctx.createRadialGradient(SIZE / 2, SIZE * 0.7, 4, SIZE / 2, SIZE * 0.7, SIZE * 0.5);
      grad.addColorStop(0, glow);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      for (let i = 0; i < 3 + Math.floor(n / 3); i++) {
        const x = SIZE * (0.2 + 0.6 * rand());
        ctx.beginPath();
        ctx.moveTo(x, SIZE);
        ctx.quadraticCurveTo(x + (rand() - 0.5) * 40, SIZE * 0.4, x + (rand() - 0.5) * 12, SIZE * 0.05);
        ctx.quadraticCurveTo(x - (rand() - 0.5) * 40, SIZE * 0.5, x, SIZE);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  return toTexture(c);
}
