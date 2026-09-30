// Line drawings for the landing features, in the manner of a technical drawing: the checked sheave with its wrap
// angle, the worm gear the software proposes, the calculation report with its signature, the seal of the hash.
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
  proposal: (
    <>
      <circle cx="24" cy="17" r="10" />
      <circle cx="24" cy="17" r="12.5" strokeDasharray="2.2 2" />
      <circle cx="24" cy="17" r="2.5" />
      <rect x="8" y="32" width="32" height="9" rx="4.5" />
      <path d="m15 32-2.5 9m7.5-9-2.5 9m7.5-9-2.5 9m7.5-9-2.5 9M3 36.5h5m32 0h5" />
    </>
  ),
  report: (
    <>
      <path d="M14.5 5H28l9 9v28.5a1.5 1.5 0 0 1-1.5 1.5h-21a1.5 1.5 0 0 1-1.5-1.5v-36A1.5 1.5 0 0 1 14.5 5Z" />
      <path d="M28 5v9h9M18 19h14M18 24h14M18 29h9" />
      <path d="M18 38c1.6-3.2 3.2-3.2 3.8-.2s2 2 3.4-1.2 2.6-2.2 3.6.6" />
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
} as const;

export type FeatureDrawing = keyof typeof DRAWINGS;

export default function FeatureIcon({ name }: { name: FeatureDrawing }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {DRAWINGS[name]}
    </svg>
  );
}
