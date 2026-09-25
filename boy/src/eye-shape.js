// Eyeball shape shared by the head bake and the renderer: a 12 mm sclera sphere with a 7.8 mm
// cornea cap that meets it at the limbus (the iris edge, 5.85 mm from the optical axis).
export const EYE = { radius: 0.012, cornea: 0.0078, limbus: 0.00585 };
export const LIMBUS_Z = Math.sqrt(EYE.radius ** 2 - EYE.limbus ** 2);
export const CORNEA_Z = LIMBUS_Z - Math.sqrt(EYE.cornea ** 2 - EYE.limbus ** 2);
export const LIMBUS_ANGLE = Math.asin(EYE.limbus / EYE.radius);

// Distance from the eyeball centre to its surface at angle `a` from the optical axis.
export function eyeFront(a) {
  if (a >= LIMBUS_ANGLE) return EYE.radius;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return CORNEA_Z * c + Math.sqrt(EYE.cornea ** 2 - (CORNEA_Z * s) ** 2);
}
