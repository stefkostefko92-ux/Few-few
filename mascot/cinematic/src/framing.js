// Рамките на камерата като чиста математика (без three.js), за да ги доказват тестовете без GPU.
// Снимка с дълъг обектив: далечна камера + тясно зрително поле — героят пълни кадъра, перспективата
// не се разтяга. `portrait` е целият маскот (шапка до крачета); `icon` е по-близо до главата и
// гърдите, та очилата, усмивката и папийонката да се четат и на 128 px.
export const FRAMING = {
  portrait: { fov: 16.5, dist: 11, camY: 0.75, lookY: 0.1, coc: 0.04, maxBlur: 0.026 },
  icon: { fov: 13.5, dist: 11, camY: 0.6, lookY: 0.5, coc: 0.05, maxBlur: 0.03 },
};

// Позицията на точка (y на оста на маскота, z напред) по височината на кадъра: 0 = долу, 1 = горе.
export function screenY(frame, y, z = 0) {
  const d = frame.dist - z;
  const pitch = Math.atan2(frame.camY - frame.lookY, frame.dist);
  const ang = Math.atan2(frame.camY - y, d) - pitch; // ъгъл под оптичната ос (надолу е положителен)
  return 0.5 - Math.tan(ang) / (2 * Math.tan((frame.fov * Math.PI) / 360));
}

// Върху коя хоризонтална равнина y пада долният ръб на кадъра, като разстояние напред от маскота (z).
export function bottomEdgeZ(frame, planeY) {
  const half = (frame.fov * Math.PI) / 360;
  const pitch = Math.atan2(frame.camY - frame.lookY, frame.dist);
  const down = pitch + half;
  return frame.dist - (frame.camY - planeY) / Math.tan(down);
}
