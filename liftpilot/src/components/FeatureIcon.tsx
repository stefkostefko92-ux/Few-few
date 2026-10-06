// Line drawings for the landing page, in the manner of a technical drawing: the checked sheave with its wrap angle, the
// seal of the hash, the shaft in plan, the machine on its beams; a shield, the drawing kept on the user's screen, the
// roles.
const DRAWINGS = {
  check: (
    <>
      <circle cx="20" cy="17" r="10" />
      <circle cx="20" cy="17" r="2" />
      <path d="M10 17v27M30 17v19" />
      <path d="M6 17a14 14 0 0 1 28 0" strokeDasharray="2 2.6" />
      <circle cx="37" cy="37" r="7" />
      <path d="m33.8 37.2 2.2 2.2 4.4-4.8" />
    </>
  ),
  trace: (
    <>
      <circle cx="24" cy="20" r="13" />
      <circle cx="24" cy="20" r="9.5" strokeDasharray="1.8 2.2" />
      <path d="m21.6 15-1.6 10m7.6-10-1.6 10M17.6 18.2h11.2M17 22h11.2" />
      <path d="m17.5 31.5-3 11.5 4.6-2.6 3 3.6 1.4-9.4m6-3.1 3 11.5-4.6-2.6-3 3.6-1.4-9.4" />
    </>
  ),
  plan: (
    <>
      <rect x="7" y="7" width="34" height="34" rx="1.5" />
      <rect x="13" y="15" width="22" height="19" />
      <path d="M9.5 24.5H13m22 0h3.5M13 11h22" strokeDasharray="2 2" />
      <path d="M18 41v-4h12v4" />
    </>
  ),
  room: (
    <>
      <path d="M4 41h40M7 34h34M7 37.5h34" />
      <circle cx="17" cy="21" r="8" />
      <circle cx="17" cy="21" r="2" />
      <rect x="27" y="17" width="12" height="9" rx="2" />
      <path d="M11 29v5m12-5v5m11-8v8" />
    </>
  ),
  shield: (
    <>
      <path d="M24 5 9 11v11c0 9.5 6.4 17.4 15 20 8.6-2.6 15-10.5 15-20V11Z" />
      <path d="m17.5 24 4.5 4.5 9-9.5" />
    </>
  ),
  local: (
    <>
      <rect x="5" y="8" width="38" height="27" rx="2" />
      <path d="M17 41h14M24 35v6M5 14h38" />
      <rect x="14" y="19" width="12" height="11" />
      <path d="M30 22h7M30 27h5" />
    </>
  ),
  roles: (
    <>
      <circle cx="17" cy="16" r="6" />
      <path d="M6 40c0-7 5-12 11-12s11 5 11 12" />
      <circle cx="33" cy="14" r="5" />
      <path d="M31 25.2c6.3.5 11 5.4 11 11.8" />
    </>
  ),
} as const;

export type FeatureDrawing = keyof typeof DRAWINGS;

export default function FeatureIcon({ name }: { name: FeatureDrawing }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {DRAWINGS[name]}
    </svg>
  );
}
