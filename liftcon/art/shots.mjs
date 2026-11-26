// Кадри: позиция/цел в метри, fov (вертикален), lens shift (дял от кадъра), фокус, апертура (радиус, м)
export const shots = {
  hero: { bloom: 0, W: 2400, H: 1800, pos: [-2.3, 1.3, 7.2], target: [0.6, 1.2, 0], fov: 29.5, shift: [-0.03, 0.03], focus: 7.6, aperture: 0.012, spp: 120, exposure: 1.0 },
  dettaglio: { W: 1800, H: 1350, pos: [0.02, 1.17, 0.6], target: [0.42, 1.12, 0], fov: 25, shift: [0, 0], focus: 0.62, aperture: 0.004, spp: 120, exposure: 1.0, floorRefl: false },
  og: { W: 1200, H: 630, pos: [-1.3, 1.25, 6.9], target: [1.1, 1.15, 0], fov: 30, shift: [-0.2, 0.0], focus: 7.0, aperture: 0.01, spp: 128, exposure: 1.0 },
};
