/* Кадри: камери и настроения за картата и за 21-те региона. */
import { REGIONS, MAP_CAM, anchor, structOf } from './world.js';
import { BASE_MOOD, BASE_POST, mood } from './moods.js';

// Камера около котвата на региона.
//   az   — посока (в градуси) от котвата към камерата (0 = камерата е на юг и гледа на север)
//   dist — хоризонтално разстояние, h — височина над терена, ty — височина на целта над терена
//   lx,lz — отместване на целта, fov — вертикално зрително поле
const CAM_DEFAULT = { az: 0, dist: 16, h: 4, ty: 2.5, fov: 38, lx: 0, lz: 0 };

// Настроения по регион (върху нощта от ключовия арт).
export const REGION_SHOTS = {
  whispering_woods: {
    cam: { az: 25, dist: 15, h: 3.2, ty: 1.4, fov: 40, lx: -1, lz: 1 },
    mood: { moonAz: 20, moonEl: 33, ambSky: [0.03, 0.07, 0.07], fogCol: [0.03, 0.07, 0.07], mist: 1.6, fog: 1.1, warm: 1.2, cloud: 0.4,
      motes: [0.5, 1.0, 0.45, 0.4, 0.1], moteSize: 0.018 },
  },
  mistmoor_hills: {
    cam: { az: -35, dist: 16, h: 3.4, ty: 1.4, fov: 40 },
    mood: { moonAz: 10, moonEl: 22, fogCol: [0.06, 0.09, 0.12], mist: 3.2, fog: 2.0, cloud: 0.7 },
  },
  crystal_caverns: {
    cam: { az: 20, dist: 14, h: 2.2, ty: 1.6, fov: 42 },
    mood: { moonAz: -20, moonEl: 28, cyan: 2.0, ambSky: [0.02, 0.06, 0.1], fogCol: [0.02, 0.06, 0.09], mist: 1.0 },
  },
  ashen_wastes: {
    cam: { az: -15, dist: 17, h: 3.0, ty: 1.0, fov: 40 },
    mood: { moonAz: 160, moonEl: 20, moonCol: [0.5, 0.45, 0.5], ambSky: [0.06, 0.04, 0.04], fogCol: [0.09, 0.06, 0.055], mist: 2.0, cloud: 0.9, warm: 1.4,
      motes: [1.0, 0.5, 0.2, 0.5, 0.12], moteSize: 0.012 },
  },
  shadowfell: {
    cam: { az: 30, dist: 16, h: 3.0, ty: 2.0, fov: 40 },
    mood: { moonAz: -10, moonEl: 20, moonCol: [0.45, 0.4, 0.8], ambSky: [0.04, 0.025, 0.08], fogCol: [0.05, 0.03, 0.09], mist: 2.4, fog: 1.6, cyan: 1.4 },
  },
  emberreach: {
    cam: { az: -25, dist: 16, h: 3.4, ty: 2.0, fov: 40 },
    mood: { moonAz: 200, moonEl: 15, moonCol: [0.6, 0.35, 0.3], ambSky: [0.09, 0.04, 0.03], ambGround: [0.04, 0.012, 0.008], fogCol: [0.12, 0.05, 0.035], mist: 1.2, cloud: 1.0, warm: 1.8,
      motes: [1.0, 0.45, 0.12, 0.6, 0.15], moteSize: 0.012 },
  },
  hammerhand_pass: {
    cam: { az: -70, dist: 16, h: 3.0, ty: 2.0, fov: 40 },
    mood: { moonAz: 30, moonEl: 25, mist: 1.2, warm: 1.4 },
  },
  conclave_aedric: {
    cam: { az: 15, dist: 17, h: 3.5, ty: 3.2, fov: 42 },
    mood: { moonAz: -30, moonEl: 32, cyan: 1.6, mist: 1.1, motes: [0.5, 0.7, 1.0, 0.25, 0.1], moteSize: 0.015 },
  },
  saltmarsh: {
    cam: { az: 20, dist: 15, h: 2.2, ty: 1.0, fov: 42 },
    mood: { moonAz: 0, moonEl: 26, fogCol: [0.05, 0.08, 0.1], mist: 2.2, fog: 1.4, cloud: 0.3,
      motes: [0.5, 1.0, 0.9, 0.3, 0.1], moteSize: 0.016 },
  },
  frostvale: {
    cam: { az: -25, dist: 16, h: 2.8, ty: 2.5, fov: 40 },
    mood: { sky: 1, moonAz: 150, moonEl: 18, moonCol: [0.55, 0.75, 1.0], ambSky: [0.04, 0.08, 0.12], fogCol: [0.05, 0.09, 0.13], cloud: 0.2, mist: 1.2,
      motes: [0.7, 0.85, 1.0, 0.35, 0.08], moteSize: 0.012 },
  },
  black_spire: {
    cam: { az: 15, dist: 18, h: 3.0, ty: 4.5, fov: 44 },
    mood: { moonAz: 150, moonEl: 24, ambSky: [0.06, 0.04, 0.045], fogCol: [0.08, 0.05, 0.05], mist: 1.4, cloud: 1.0, warm: 1.6,
      motes: [1.0, 0.45, 0.1, 0.5, 0.14], moteSize: 0.013 },
  },
  stormpeaks: {
    cam: { az: 200, dist: 18, h: 6.0, ty: 3.0, fov: 44 },
    mood: { sky: 5, bolt: 0.25, moonAz: -20, moonEl: 30, cloud: 1.0, ambSky: [0.03, 0.05, 0.1], mist: 1.4 },
  },
  voidshade_hollow: {
    cam: { az: 0, dist: 15, h: 4.2, ty: 0.0, fov: 44 },
    mood: { moonAz: 200, moonEl: 20, moonCol: [0.4, 0.3, 0.8], ambSky: [0.03, 0.02, 0.08], fogCol: [0.04, 0.025, 0.09], mist: 2.4, fog: 1.6, cyan: 1.6 },
  },
  mooncradle: {
    cam: { az: 20, dist: 15, h: 2.6, ty: 3.0, fov: 44 },
    mood: { moonAz: -5, moonEl: 42, moonSize: 0.085, moonCol: [0.6, 0.72, 1.1], mist: 1.2, cloud: 0.4 },
  },
  worldspine: {
    cam: { az: 35, dist: 22, h: 6.0, ty: 3.5, fov: 46 },
    mood: { moonAz: 205, moonEl: 20, moonCol: [0.55, 0.62, 0.9], mist: 1.0, cloud: 0.6, warm: 1.2 },
  },
  eternal_throne: {
    cam: { az: -18, dist: 17, h: 2.4, ty: 4.4, fov: 42 },
    mood: { moonAz: -25, moonEl: 30, moonSize: 0.075, cyan: 1.8, mist: 1.4, cloud: 0.8, motes: [0.6, 0.7, 1.0, 0.25, 0.08], moteSize: 0.014 },
  },
  ashen_veil: {
    cam: { az: 15, dist: 15, h: 2.6, ty: 1.6, fov: 42 },
    mood: { moonAz: 20, moonEl: 24, moonCol: [0.5, 0.52, 0.6], ambSky: [0.04, 0.045, 0.06], fogCol: [0.07, 0.075, 0.09], mist: 3.0, fog: 2.2, cloud: 0.9,
      motes: [0.8, 0.8, 0.85, 0.35, 0.1], moteSize: 0.012 },
  },
  starfall_abyss: {
    cam: { az: 25, dist: 15, h: 8.0, ty: 1.0, fov: 46 },
    mood: { sky: 4, moonAz: 160, moonEl: 28, cyan: 1.8, ambSky: [0.03, 0.05, 0.12], fogCol: [0.03, 0.05, 0.11], cloud: 0.2, mist: 1.1 },
  },
  forge_of_dawn: {
    cam: { az: -20, dist: 17, h: 3.0, ty: 2.0, fov: 42 },
    mood: { sky: 3, moonAz: 170, moonEl: 8, moonSize: 0.06, moonCol: [1.0, 0.65, 0.35], ambSky: [0.07, 0.045, 0.04], fogCol: [0.12, 0.07, 0.05], mist: 1.3, warm: 1.8, cloud: 0.7,
      motes: [1.0, 0.55, 0.15, 0.6, 0.15], moteSize: 0.012 },
  },
  crown_of_night: {
    cam: { az: 10, dist: 16, h: 2.4, ty: 3.0, fov: 44 },
    mood: { sky: 2, moonAz: -10, moonEl: 32, moonSize: 0.07, moonCol: [0.35, 0.25, 0.8], ambSky: [0.03, 0.02, 0.09], fogCol: [0.035, 0.025, 0.09], mist: 1.8, cyan: 1.6 },
  },
  first_light: {
    cam: { az: 20, dist: 16, h: 2.4, ty: 3.2, fov: 44 },
    mood: { sky: 3, moonAz: 25, moonEl: 6, moonSize: 0.07, moonCol: [1.0, 0.75, 0.5], ambSky: [0.1, 0.09, 0.1], ambGround: [0.04, 0.035, 0.04], fogCol: [0.16, 0.12, 0.09], mist: 1.6, fog: 0.9, warm: 1.4, cloud: 0.4,
      motes: [1.0, 0.85, 0.5, 0.35, 0.1], moteSize: 0.012 },
  },
};

/** Конфигурация на кадър за регион (камерата се довършва в браузъра по терена). */
export function regionShot(slug) {
  const r = REGIONS.find((x) => x.slug === slug);
  const [ax, az] = anchor(r);
  const spec = REGION_SHOTS[slug];
  const st = structOf(r);
  const c = { ...CAM_DEFAULT, ...(spec.cam || {}) };
  return {
    slug,
    target: st ? [st.x, st.z] : [ax, az],
    cam: c,
    mood: mood(spec.mood),
    post: { ...BASE_POST, ...(spec.post || {}) },
  };
}

export const MAP_SHOT = { cam: MAP_CAM, mood: mood({}), post: BASE_POST };
