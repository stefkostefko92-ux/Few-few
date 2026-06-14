/**
 * Per-region environment dressing for the combat stage.
 *
 * Builds a THREE.Group of decorative props (trees, rocks, crystals,
 * obelisks, ice spikes, ash pillars, bone arches, divine columns…)
 * arranged around the fighters without occluding the camera line.
 * Each region recipe writes its own visual signature on top of the
 * shared sky cylinder + PBR ground in CombatScene3D.
 *
 * Props are billboard sprites with procedurally-painted canvas
 * textures — zero asset cost, ~2-3 ms canvas paint at scene mount,
 * sub-millisecond per-frame render through InstancedMesh batching.
 *
 * Spawn rules:
 *   - Props live on two rings — `near` (radius 4-7) and `far` (8-14)
 *     — both arranged in an arc behind the fighters so they don't
 *     block the camera frame.
 *   - Lite-mode budget: each region's `count` field is halved for
 *     touch/coarse/<900px devices.
 */

import * as THREE from 'three';

export interface RegionEnvironment {
  group: THREE.Group;
  emberSpawner?: (dt: number, particles: ParticleHandles) => void;
  dispose: () => void;
}

interface ParticleHandles {
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  lives: Float32Array;
  maxLives: Float32Array;
  alive: number;
}

interface PropSpec {
  kind:
    | 'tree-fir' | 'tree-oak' | 'tree-dead' | 'mushroom-bell'
    | 'rock-jagged' | 'rock-round' | 'pillar-stone' | 'pillar-obsidian'
    | 'crystal-shard' | 'icicle' | 'cattail'
    | 'ash-plume' | 'lava-vent' | 'pickaxe' | 'cart' | 'tome'
    | 'rune-floating' | 'sigil-cursed' | 'bone-rib' | 'bone-skull'
    | 'pillar-divine' | 'moon-orb' | 'lightning-strike' | 'void-fissure'
    | 'spire-jagged' | 'cliff-mist';
  color: string;
  emissive?: string;
  count: number;
  scale: [number, number];
  radius: [number, number];
  yOffset?: number;
}

interface RegionRecipe {
  props: PropSpec[];
  emberColor?: number;
  emberRate?: number;  // particles per second
  emberUp?: boolean;   // true = rising embers/snow/dust; false = falling
}

// ============================================================================
// Procedural sprite painter — each prop kind gets its own canvas recipe so
// the resulting texture matches the silhouette the player expects from
// the prop's name. Returns a re-usable THREE.CanvasTexture.
// ============================================================================
const textureCache = new Map<string, THREE.CanvasTexture>();
function spritePaint(kind: PropSpec['kind'], color: string, emissive?: string): THREE.CanvasTexture {
  const key = `${kind}:${color}:${emissive || ''}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  const stroke = (s: string, w: number) => { ctx.strokeStyle = s; ctx.lineWidth = w; };
  const fill = (s: string) => { ctx.fillStyle = s; };

  switch (kind) {
    case 'tree-fir': {
      // Conifer silhouette — three triangular tiers + trunk
      fill('#3a2412'); ctx.fillRect(118, 200, 20, 50);
      fill(color);
      ctx.beginPath(); ctx.moveTo(128, 30); ctx.lineTo(80, 110); ctx.lineTo(176, 110); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(128, 90); ctx.lineTo(60, 165); ctx.lineTo(196, 165); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(128, 145); ctx.lineTo(48, 205); ctx.lineTo(208, 205); ctx.closePath(); ctx.fill();
      break;
    }
    case 'tree-oak': {
      fill('#3a2412'); ctx.fillRect(118, 160, 20, 90);
      fill(color);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(128 + Math.cos(a) * 50, 100 + Math.sin(a) * 35, 45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(128, 100, 60, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'tree-dead': {
      stroke(color, 8);
      ctx.beginPath(); ctx.moveTo(128, 250); ctx.lineTo(128, 100); ctx.stroke();
      stroke(color, 5);
      ctx.beginPath(); ctx.moveTo(128, 160); ctx.lineTo(80, 110); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(128, 130); ctx.lineTo(180, 70); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(128, 110); ctx.lineTo(95, 50); ctx.stroke();
      stroke(color, 3);
      ctx.beginPath(); ctx.moveTo(95, 50); ctx.lineTo(70, 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(180, 70); ctx.lineTo(210, 55); ctx.stroke();
      break;
    }
    case 'mushroom-bell': {
      fill('#e8dac0'); ctx.fillRect(120, 165, 16, 75);
      fill(color);
      ctx.beginPath(); ctx.arc(128, 150, 70, Math.PI, 0); ctx.closePath(); ctx.fill();
      fill(emissive || '#fff5d6');
      for (const [x, y] of [[100, 130], [128, 110], [156, 130], [140, 150]]) {
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'rock-jagged': {
      fill(color);
      ctx.beginPath();
      ctx.moveTo(40, 240);
      ctx.lineTo(80, 130); ctx.lineTo(130, 80); ctx.lineTo(160, 110);
      ctx.lineTo(200, 90); ctx.lineTo(215, 160); ctx.lineTo(220, 240);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.moveTo(40, 240); ctx.lineTo(80, 130); ctx.lineTo(130, 180); ctx.lineTo(120, 240); ctx.closePath(); ctx.fill();
      break;
    }
    case 'rock-round': {
      fill(color);
      ctx.beginPath(); ctx.ellipse(128, 180, 90, 60, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.ellipse(105, 155, 30, 18, -0.3, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'pillar-stone':
    case 'pillar-obsidian': {
      fill(color);
      ctx.fillRect(108, 30, 40, 220);
      fill(emissive || 'rgba(0,0,0,0.4)');
      ctx.fillRect(105, 30, 6, 220);
      ctx.fillRect(146, 30, 4, 220);
      // capital
      fill(color);
      ctx.fillRect(95, 25, 66, 16);
      ctx.fillRect(95, 245, 66, 11);
      break;
    }
    case 'crystal-shard': {
      const grad = ctx.createLinearGradient(128, 0, 128, 256);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, emissive || color);
      grad.addColorStop(1, '#1a2845');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(128, 30); ctx.lineTo(95, 100); ctx.lineTo(110, 240);
      ctx.lineTo(146, 240); ctx.lineTo(161, 100); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.moveTo(128, 40); ctx.lineTo(115, 230); ctx.lineTo(122, 230); ctx.closePath(); ctx.fill();
      break;
    }
    case 'icicle': {
      const grad = ctx.createLinearGradient(128, 0, 128, 256);
      grad.addColorStop(0, '#dfeefb'); grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(108, 30); ctx.lineTo(148, 30); ctx.lineTo(128, 240); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.moveTo(120, 35); ctx.lineTo(128, 220); ctx.lineTo(132, 220); ctx.closePath(); ctx.fill();
      break;
    }
    case 'cattail': {
      stroke('#2a4030', 4);
      ctx.beginPath(); ctx.moveTo(128, 250); ctx.lineTo(128, 90); ctx.stroke();
      fill(color);
      ctx.beginPath(); ctx.ellipse(128, 80, 12, 35, 0, 0, Math.PI * 2); ctx.fill();
      fill('#2a4030');
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(128, 200 - i * 50);
        ctx.lineTo(180 + i * 8, 130 - i * 50);
        ctx.lineWidth = 2; ctx.strokeStyle = '#2a4030'; ctx.stroke();
      }
      break;
    }
    case 'ash-plume': {
      const grad = ctx.createLinearGradient(128, 0, 128, 256);
      grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(40,20,10,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(80, 250); ctx.bezierCurveTo(70, 180, 80, 110, 100, 50);
      ctx.lineTo(160, 50); ctx.bezierCurveTo(180, 110, 190, 180, 176, 250);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'lava-vent': {
      fill('#1a0805');
      ctx.beginPath(); ctx.ellipse(128, 230, 80, 25, 0, 0, Math.PI * 2); ctx.fill();
      fill(emissive || color);
      ctx.beginPath(); ctx.ellipse(128, 215, 55, 18, 0, 0, Math.PI * 2); ctx.fill();
      const grad = ctx.createRadialGradient(128, 200, 0, 128, 200, 90);
      grad.addColorStop(0, color); grad.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(128, 200, 90, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'pickaxe': {
      stroke('#5a3a20', 7);
      ctx.beginPath(); ctx.moveTo(128, 250); ctx.lineTo(150, 70); ctx.stroke();
      fill(color);
      ctx.save(); ctx.translate(150, 70); ctx.rotate(0.3);
      ctx.fillRect(-80, -10, 160, 20);
      ctx.beginPath(); ctx.moveTo(-80, -10); ctx.lineTo(-110, 0); ctx.lineTo(-80, 10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(80, -10); ctx.lineTo(110, 0); ctx.lineTo(80, 10); ctx.closePath(); ctx.fill();
      ctx.restore();
      break;
    }
    case 'cart': {
      fill('#3a2818');
      ctx.fillRect(60, 130, 140, 70);
      fill(color);
      ctx.fillRect(70, 140, 120, 50);
      fill('#1a1008');
      ctx.beginPath(); ctx.arc(85, 215, 22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(175, 215, 22, 0, Math.PI * 2); ctx.fill();
      fill('#5a3a20');
      ctx.beginPath(); ctx.arc(85, 215, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(175, 215, 12, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'tome': {
      fill('#4a2818');
      ctx.fillRect(70, 140, 116, 100);
      fill(color);
      ctx.fillRect(74, 144, 108, 92);
      ctx.fillStyle = emissive || '#fff5d6';
      ctx.font = 'bold 64px serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦', 128, 200);
      break;
    }
    case 'rune-floating': {
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 90);
      grad.addColorStop(0, emissive || color);
      grad.addColorStop(0.6, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(128, 128, 90, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = emissive || '#fff5d6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      // pentagram-ish glyph
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
        const x = 128 + Math.cos(a) * 50, y = 128 + Math.sin(a) * 50;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 70, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'sigil-cursed': {
      ctx.strokeStyle = emissive || color;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(128, 128, 70, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(128, 128, 50, 0, Math.PI * 2); ctx.stroke();
      // inverted star
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + i * (Math.PI * 4 / 5);
        const x = 128 + Math.cos(a) * 45, y = 128 + Math.sin(a) * 45;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.stroke();
      break;
    }
    case 'bone-rib': {
      fill(color);
      // upright rib arch
      ctx.beginPath();
      ctx.moveTo(60, 250);
      ctx.bezierCurveTo(50, 150, 80, 50, 128, 30);
      ctx.bezierCurveTo(176, 50, 206, 150, 196, 250);
      ctx.lineTo(170, 250);
      ctx.bezierCurveTo(180, 150, 160, 70, 128, 60);
      ctx.bezierCurveTo(96, 70, 76, 150, 86, 250);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'bone-skull': {
      fill(color);
      ctx.beginPath(); ctx.arc(128, 150, 75, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(95, 200, 66, 40);
      fill('#1a1008');
      ctx.beginPath(); ctx.arc(103, 145, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(153, 145, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(122, 180); ctx.lineTo(134, 180); ctx.lineTo(128, 200); ctx.closePath(); ctx.fill();
      ctx.fillRect(112, 215, 6, 25);
      ctx.fillRect(125, 215, 6, 25);
      ctx.fillRect(138, 215, 6, 25);
      break;
    }
    case 'pillar-divine': {
      const grad = ctx.createLinearGradient(108, 0, 148, 0);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, emissive || '#fff5d6');
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.fillRect(106, 28, 44, 222);
      // capital + base
      fill(color);
      ctx.fillRect(92, 22, 72, 18);
      ctx.fillRect(92, 240, 72, 14);
      // fluting
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const x = 113 + i * 7;
        ctx.beginPath(); ctx.moveTo(x, 42); ctx.lineTo(x, 238); ctx.stroke();
      }
      break;
    }
    case 'moon-orb': {
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 100);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, emissive || color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(128, 128, 100, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'lightning-strike': {
      const grad = ctx.createLinearGradient(128, 0, 128, 256);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, emissive || color);
      grad.addColorStop(1, 'rgba(80,100,160,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(110, 0); ctx.lineTo(140, 80); ctx.lineTo(105, 130);
      ctx.lineTo(150, 200); ctx.lineTo(120, 256);
      ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      break;
    }
    case 'void-fissure': {
      fill('#000');
      ctx.beginPath();
      ctx.moveTo(118, 20); ctx.lineTo(124, 80); ctx.lineTo(112, 130);
      ctx.lineTo(125, 180); ctx.lineTo(108, 240);
      ctx.lineTo(135, 240); ctx.lineTo(140, 180); ctx.lineTo(146, 130);
      ctx.lineTo(133, 80); ctx.lineTo(138, 20);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = emissive || color;
      ctx.beginPath();
      ctx.moveTo(124, 30); ctx.lineTo(128, 80); ctx.lineTo(122, 130);
      ctx.lineTo(130, 180); ctx.lineTo(125, 230);
      ctx.lineTo(132, 230); ctx.lineTo(134, 180); ctx.lineTo(132, 130);
      ctx.lineTo(130, 80); ctx.lineTo(132, 30);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'spire-jagged': {
      fill(color);
      ctx.beginPath();
      ctx.moveTo(70, 250);
      ctx.lineTo(110, 80); ctx.lineTo(128, 20); ctx.lineTo(155, 90);
      ctx.lineTo(170, 60); ctx.lineTo(190, 120);
      ctx.lineTo(196, 250);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.moveTo(128, 20); ctx.lineTo(110, 80); ctx.lineTo(128, 130);
      ctx.lineTo(120, 250); ctx.lineTo(70, 250); ctx.closePath();
      ctx.fill();
      break;
    }
    case 'cliff-mist': {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, color);
      grad.addColorStop(0.7, color);
      grad.addColorStop(1, 'rgba(40,50,70,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 256);
      const baseY = 90;
      for (let x = 0; x <= 256; x += 20) {
        ctx.lineTo(x, baseY - Math.sin(x * 0.04) * 15 - Math.random() * 8);
      }
      ctx.lineTo(256, 256);
      ctx.closePath(); ctx.fill();
      break;
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  textureCache.set(key, t);
  return t;
}

// ============================================================================
// Region recipes — what to spawn for each of the 16 named regions.
// ============================================================================
const RECIPES: Record<string, RegionRecipe> = {
  // ----- Act 1 -----
  whispering_woods: {
    props: [
      { kind: 'tree-fir',     color: '#2a5530', count: 5, scale: [3.5, 5.5], radius: [8, 14] },
      { kind: 'tree-oak',     color: '#3a6038', count: 3, scale: [3.0, 4.5], radius: [6, 11] },
      { kind: 'mushroom-bell',color: '#a04030', emissive: '#ffd070', count: 4, scale: [0.6, 1.0], radius: [3, 5] },
      { kind: 'rock-round',   color: '#2c2820', count: 3, scale: [1.0, 1.6], radius: [4, 7] },
    ],
    emberColor: 0xa8e470, emberRate: 1.6, emberUp: true,  // fireflies
  },
  mistmoor_hills: {
    props: [
      { kind: 'rock-jagged',  color: '#454a55', count: 5, scale: [1.8, 2.8], radius: [5, 11] },
      { kind: 'rock-round',   color: '#3a3c45', count: 4, scale: [1.2, 1.8], radius: [4, 7] },
      { kind: 'cliff-mist',   color: '#5a6275', count: 3, scale: [6, 10], radius: [10, 14] },
      { kind: 'tree-dead',    color: '#3a3a3a', count: 2, scale: [3.0, 4.0], radius: [7, 10] },
    ],
    emberColor: 0xa8b0c0, emberRate: 1.0, emberUp: false, // drifting mist motes
  },
  crystal_caverns: {
    props: [
      { kind: 'crystal-shard', color: '#3a5a8a', emissive: '#7ab8ff', count: 6, scale: [1.5, 3.0], radius: [4, 10] },
      { kind: 'pillar-stone',  color: '#1a253a', count: 3, scale: [3.0, 4.5], radius: [8, 13] },
      { kind: 'rock-jagged',   color: '#1f2840', count: 3, scale: [1.4, 2.2], radius: [4, 7] },
    ],
    emberColor: 0x6aa7ff, emberRate: 2.0, emberUp: true,  // crystal motes
  },
  ashen_wastes: {
    props: [
      { kind: 'tree-dead',  color: '#4a2a18', count: 4, scale: [3.0, 4.0], radius: [6, 11] },
      { kind: 'ash-plume',  color: '#5a3525', count: 4, scale: [4, 7], radius: [9, 14] },
      { kind: 'lava-vent',  color: '#ff5a2c', emissive: '#ffb070', count: 3, scale: [1.2, 1.8], radius: [4, 8] },
      { kind: 'rock-jagged',color: '#3a1a10', count: 3, scale: [1.5, 2.4], radius: [4, 8] },
    ],
    emberColor: 0xff7c4d, emberRate: 3.5, emberUp: true,
  },
  shadowfell: {
    props: [
      { kind: 'pillar-obsidian', color: '#180828', emissive: '#a060ff', count: 4, scale: [3.5, 5.0], radius: [6, 11] },
      { kind: 'sigil-cursed',    color: '#3a1a4a', emissive: '#c294ff', count: 3, scale: [1.8, 2.5], radius: [5, 9] },
      { kind: 'tree-dead',       color: '#2a1a35', count: 2, scale: [3.5, 4.5], radius: [8, 12] },
    ],
    emberColor: 0xc294ff, emberRate: 2.0, emberUp: true,
  },

  // ----- Mid-tier -----
  emberreach: {
    props: [
      { kind: 'lava-vent',   color: '#ff4a20', emissive: '#ffa050', count: 5, scale: [1.4, 2.2], radius: [4, 10] },
      { kind: 'rock-jagged', color: '#2a0a04', count: 5, scale: [1.6, 2.8], radius: [5, 11] },
      { kind: 'spire-jagged',color: '#5a1f10', count: 3, scale: [4, 7], radius: [10, 14] },
      { kind: 'ash-plume',   color: '#6a2a15', count: 3, scale: [4, 6], radius: [9, 13] },
    ],
    emberColor: 0xff5a2c, emberRate: 5.0, emberUp: true,
  },
  hammerhand_pass: {
    props: [
      { kind: 'rock-jagged', color: '#3a302a', count: 5, scale: [1.6, 2.6], radius: [5, 10] },
      { kind: 'pickaxe',     color: '#888888', count: 3, scale: [1.0, 1.4], radius: [4, 7] },
      { kind: 'cart',        color: '#5a3a20', count: 2, scale: [1.4, 1.8], radius: [6, 9] },
      { kind: 'pillar-stone',color: '#403028', count: 3, scale: [3.0, 4.0], radius: [9, 13] },
    ],
    emberColor: 0xc89060, emberRate: 1.5, emberUp: false, // dust
  },
  conclave_aedric: {
    props: [
      { kind: 'pillar-stone',   color: '#3a2050', emissive: '#a070ff', count: 4, scale: [3.5, 5.0], radius: [7, 12] },
      { kind: 'tome',           color: '#2a1840', emissive: '#fff5d6', count: 4, scale: [0.8, 1.2], radius: [3, 7] },
      { kind: 'rune-floating',  color: '#5a3080', emissive: '#c294ff', count: 4, scale: [1.5, 2.2], radius: [5, 9] },
    ],
    emberColor: 0xc294ff, emberRate: 2.5, emberUp: true,
  },
  saltmarsh: {
    props: [
      { kind: 'cattail',      color: '#5a3a18', count: 8, scale: [1.4, 2.0], radius: [3, 8] },
      { kind: 'tree-dead',    color: '#3a2818', count: 3, scale: [3.0, 4.5], radius: [7, 12] },
      { kind: 'rock-round',   color: '#2a3025', count: 3, scale: [1.0, 1.5], radius: [4, 7] },
      { kind: 'cliff-mist',   color: '#3a4a3a', count: 3, scale: [5, 8], radius: [10, 14] },
    ],
    emberColor: 0x9ac8a4, emberRate: 1.2, emberUp: false,
  },
  frostvale: {
    props: [
      { kind: 'icicle',      color: '#a8d0e0', emissive: '#ffffff', count: 6, scale: [1.6, 2.6], radius: [4, 10] },
      { kind: 'rock-jagged', color: '#7a8a98', count: 4, scale: [1.5, 2.2], radius: [5, 9] },
      { kind: 'tree-fir',    color: '#3a4a52', count: 4, scale: [3.5, 5.0], radius: [8, 13] },
      { kind: 'spire-jagged',color: '#909caa', count: 2, scale: [5, 7], radius: [11, 14] },
    ],
    emberColor: 0xe8f5ff, emberRate: 4.0, emberUp: false, // snow
  },
  black_spire: {
    props: [
      { kind: 'spire-jagged',    color: '#1a0808', count: 4, scale: [5, 8], radius: [9, 14] },
      { kind: 'pillar-obsidian', color: '#2a0a0a', emissive: '#ff3a2a', count: 3, scale: [3.5, 5], radius: [6, 10] },
      { kind: 'sigil-cursed',    color: '#5a1a1a', emissive: '#ff5a3a', count: 4, scale: [1.6, 2.4], radius: [4, 8] },
      { kind: 'bone-skull',      color: '#7a6a5a', count: 3, scale: [1.0, 1.4], radius: [4, 7] },
    ],
    emberColor: 0xff3a2a, emberRate: 4.0, emberUp: true,
  },

  // ----- Divine -----
  stormpeaks: {
    props: [
      { kind: 'spire-jagged',    color: '#2a303a', count: 4, scale: [6, 9], radius: [10, 14] },
      { kind: 'cliff-mist',      color: '#48586a', count: 4, scale: [6, 9], radius: [9, 13] },
      { kind: 'lightning-strike',color: '#a0c8ff', emissive: '#ffffff', count: 3, scale: [3.5, 5], radius: [9, 13], yOffset: 2 },
      { kind: 'rock-jagged',     color: '#1a2030', count: 3, scale: [1.6, 2.2], radius: [4, 8] },
    ],
    emberColor: 0xa0c8ff, emberRate: 2.5, emberUp: false,
  },
  voidshade_hollow: {
    props: [
      { kind: 'void-fissure',    color: '#a074ff', emissive: '#e0a0ff', count: 4, scale: [3.5, 5], radius: [7, 12] },
      { kind: 'pillar-obsidian', color: '#080414', emissive: '#7050ff', count: 3, scale: [4, 5.5], radius: [6, 10] },
      { kind: 'rune-floating',   color: '#3a1a5a', emissive: '#c294ff', count: 4, scale: [1.5, 2.2], radius: [4, 8] },
    ],
    emberColor: 0xa074ff, emberRate: 3.0, emberUp: true,
  },
  mooncradle: {
    props: [
      { kind: 'pillar-divine', color: '#b8c4e8', emissive: '#fff5fa', count: 4, scale: [3.5, 5], radius: [7, 12] },
      { kind: 'moon-orb',      color: '#d4dfff', emissive: '#ffffff', count: 5, scale: [1.5, 2.5], radius: [5, 10], yOffset: 2 },
      { kind: 'rock-round',    color: '#8a8aa0', count: 3, scale: [1.0, 1.5], radius: [4, 7] },
    ],
    emberColor: 0xd4dfff, emberRate: 3.0, emberUp: true,
  },
  worldspine: {
    props: [
      { kind: 'bone-rib',    color: '#d4c8b0', count: 4, scale: [4, 6], radius: [7, 12] },
      { kind: 'bone-skull',  color: '#c8bca0', count: 4, scale: [1.0, 1.5], radius: [4, 8] },
      { kind: 'spire-jagged',color: '#85756a', count: 3, scale: [5, 7], radius: [10, 14] },
    ],
    emberColor: 0xffe4b0, emberRate: 1.8, emberUp: false,
  },
  eternal_throne: {
    props: [
      { kind: 'pillar-divine', color: '#3a2a14', emissive: '#ffd060', count: 5, scale: [4, 6], radius: [6, 12] },
      { kind: 'rune-floating', color: '#5a3a0a', emissive: '#fff5a0', count: 4, scale: [1.6, 2.4], radius: [4, 9] },
      { kind: 'sigil-cursed',  color: '#1a1020', emissive: '#ffd060', count: 3, scale: [2, 3], radius: [5, 10] },
    ],
    emberColor: 0xffd060, emberRate: 4.0, emberUp: true,
  },
};

// Fallback for unmapped regions.
const DEFAULT_RECIPE: RegionRecipe = RECIPES.whispering_woods;

// ============================================================================
// Public builder
// ============================================================================
export function buildRegionEnvironment(
  regionKey: string,
  liteMode: boolean,
): RegionEnvironment {
  const recipe = RECIPES[regionKey] || DEFAULT_RECIPE;
  const group = new THREE.Group();
  group.name = 'environment';
  const created: THREE.Object3D[] = [];

  for (const spec of recipe.props) {
    // Lite mode halves the prop count (and rounds up to at least 1).
    const count = liteMode ? Math.max(1, Math.ceil(spec.count / 2)) : spec.count;
    const tex = spritePaint(spec.kind, spec.color, spec.emissive);
    // Sprites batched manually — we don't use InstancedMesh for sprites
    // because three.js Sprites have their own pipeline; for these counts
    // (<10 per kind) the per-sprite cost is negligible.
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI + Math.PI; // back arc only (camera faces +z forward in scene coords)
      const r = lerp(spec.radius[0], spec.radius[1], Math.random());
      const x = Math.cos(angle) * r + (Math.random() - 0.5) * 1.5;
      const z = Math.sin(angle) * r * 0.6 + (Math.random() - 0.5) * 1.5 - 2; // bias behind origin
      const scale = lerp(spec.scale[0], spec.scale[1], Math.random());
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        fog: true,
        // Slight per-instance tint variation so the props don't all look identical.
        color: new THREE.Color().setRGB(
          0.85 + Math.random() * 0.15,
          0.85 + Math.random() * 0.15,
          0.85 + Math.random() * 0.15,
        ),
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(scale, scale, 1);
      sprite.position.set(x, scale * 0.5 + (spec.yOffset ?? 0), z);
      group.add(sprite);
      created.push(sprite);
    }
  }

  return {
    group,
    dispose: () => {
      for (const obj of created) {
        const s = obj as THREE.Sprite;
        (s.material as THREE.SpriteMaterial).dispose();
        // Don't dispose textures — they're cached and shared.
        group.remove(s);
      }
    },
  };
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

export function getRegionEmberSpec(regionKey: string): { color: number; rate: number; up: boolean } {
  const r = RECIPES[regionKey] || DEFAULT_RECIPE;
  return {
    color: r.emberColor ?? 0xffd34d,
    rate:  r.emberRate ?? 2.0,
    up:    r.emberUp ?? true,
  };
}
