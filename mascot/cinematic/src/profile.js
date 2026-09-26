// The mascot's silhouette as pure math: a radius(y) function through the same control points
// `body.js` revolves into a LatheGeometry. Kept separate from three.js on purpose — `test/geometry.test.js`
// imports this module alone to prove the face/glasses/hat placement clears the body surface,
// with zero GPU and zero scene graph.

// [x=radius, y=height] pairs, feet to crown. body.js builds THREE.CatmullRomCurve3 from the same
// array — change one, change the other, `test/geometry.test.js` pins the point count.
export const PROFILE = [
  [0.02, -1.08], [0.5, -1.02], [0.8, -0.88], [0.97, -0.6],
  [1.02, -0.22], [1.0, 0.18], [0.9, 0.52], [0.7, 0.83],
  [0.44, 1.04], [0.0, 1.2],
];

export const TOP_OF_HEAD_Y = PROFILE[PROFILE.length - 1][1];
export const SOLE_Y = PROFILE[0][1];

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Radius of the body silhouette at height y, walking the same Catmull-Rom chain as the Lathe
// profile. Clamped to the endpoints outside the body's y range (sole / crown).
export function bodyRadiusAtY(y) {
  const pts = PROFILE;
  const n = pts.length;
  if (y <= pts[0][1]) return pts[0][0];
  if (y >= pts[n - 1][1]) return pts[n - 1][0];
  for (let i = 0; i < n - 1; i++) {
    const y0 = pts[i][1];
    const y1 = pts[i + 1][1];
    if (y >= y0 && y <= y1) {
      const t = (y - y0) / (y1 - y0);
      const p0 = pts[Math.max(0, i - 1)][0];
      const p1 = pts[i][0];
      const p2 = pts[i + 1][0];
      const p3 = pts[Math.min(n - 1, i + 2)][0];
      return catmullRom(p0, p1, p2, p3, t);
    }
  }
  return 0;
}

// Fraction of the body radius that any face accessory must clear in front of the surface
// (defect #1 in the design brief: glasses rims were sinking into the face). 0.02 = 2%.
export const FACE_CLEARANCE = 0.02;

// Forward (z) placement for an accessory whose own geometry extends `halfDepth` back from its
// pivot (e.g. a torus ring's tube radius) so its rearmost point still clears the body by
// FACE_CLEARANCE of the local body radius.
export function forwardZFor(y, halfDepth = 0) {
  const r = bodyRadiusAtY(y);
  return r * (1 + FACE_CLEARANCE) + halfDepth;
}
