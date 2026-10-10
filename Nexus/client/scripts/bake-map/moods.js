/* Настроения (осветление/атмосфера) — базата е нощта от ключовия арт. */
export const BASE_MOOD = {
  moonAz: -40, moonEl: 30,                 // луната от северозапад — странично осветление
  moonCol: [0.66, 0.80, 1.10],
  ambSky: [0.035, 0.060, 0.115],
  ambGround: [0.012, 0.016, 0.030],
  fogCol: [0.030, 0.050, 0.085],
  fog: 1.0, mist: 1.0, cloud: 0.6, moonSize: 0.055,
  warm: 1.0, cyan: 1.0,
};
export const BASE_POST = { exposure: 1.1, bloom: 0.17, grain: 0.006, vig: 0.38, ca: 0.004, sat: 1.0, contrast: 1.16, thr: 0.9 };
export const mood = (o = {}) => ({ ...BASE_MOOD, ...o });
