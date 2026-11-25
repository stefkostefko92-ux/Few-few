// The demo machine's tools: fixed tool numbers per drill diameter, the groove mill and the compression cutters of the
// contour. A real installation reads them from the machine's tool library; the cutting data below are the makers'.

const DRILL_SET = [[1, 5], [2, 7], [3, 35], [6, 8], [7, 3], [8, 10], [9, 15], [10, 20], [11, 26], [12, 12], [13, 6], [14, 4.5], [15, 4], [16, 25], [17, 30], [18, 40]];
export const DRILLS = DRILL_SET.map(([h, d]) => ({
  id: `T${h}`, h, kind: 'drill', d,
  rpm: d <= 10 ? 6000 : d <= 20 ? 5000 : 4000,
  feed: d <= 10 ? 2000 : d <= 20 ? 1500 : 1200,
  label: d >= 15 ? `BORING BIT D${d}` : `DRILL D${d}`,
}));
export const drillFor = (d) => DRILLS.find((t) => Math.abs(t.d - d) < 0.01) ?? null;

// Deep holes are pecked: from depth/Ø ≥ PECK_RATIO, in steps of PECK_PER_D × Ø (our assumption, a usual 1–3 × D).
export const PECK_RATIO = 3;
export const PECK_PER_D = 2;
export const pecks = (depth, d) => (depth / d >= PECK_RATIO ? Math.max(1, PECK_PER_D * d) : null);
// A through hole: the last THROUGH_SLOW mm at half the feed, so the drill does not tear the bottom face out
// (Leitz Lexicon, ed. 7, ch. 6.2).
export const THROUGH_SLOW = 2;

// fz 0,08 mm: inside Onsrud 57-200 for 1/8 in (0,076–0,127 mm, Laminated Chipboard chart), below Vortex's 0,10 mm.
export const GROOVE_MILL = { id: 'T4', h: 4, kind: 'mill', d: 4, rpm: 18000, flutes: 2, fz: 0.08, plunge: 1000, label: 'MILL D4' };

// Compression cutters for particleboard and MDF, z = 2. fz is the low end of the makers' chip load (Vortex catalogue
// p. 14: 1/4 in 0,33–0,41, 3/8 in 0,51–0,58, 1/2 in 0,64–0,69 mm; Onsrud 60-100MW, laminated chipboard: 1/4 in 0,43–0,48 —
// Ø8 takes 0,40, between the two). Vortex p. 14: 18 000 rpm for tools up to 3/8 in (9,525 mm), 16 000 above.
// CEL: cutting edge length of the Vortex 3100 series (Ø6 25, Ø8 28, Ø10 35, Ø12 35 mm) — the contour never goes deeper.
const CONTOUR_FZ = { 6: 0.33, 8: 0.4, 10: 0.51, 12: 0.64 };
export const CUT_LENGTH = { 6: 25, 8: 28, 10: 35, 12: 35 };
export const contourTool = (d) => ({
  id: 'T5', h: 5, kind: 'mill', d, flutes: 2, plunge: 3000,
  rpm: d <= 9.525 ? 18000 : 16000,
  fz: CONTOUR_FZ[d] ?? 0.33,
  cel: CUT_LENGTH[d] ?? 0,
  label: `COMPRESSION D${d}`,
});
// The feed a tool cuts at: rpm × flutes × fz for a mill, the drill's own feed for a drill.
export const cuttingFeed = (tool) => (tool.kind === 'drill' ? tool.feed : Math.round(tool.rpm * tool.flutes * tool.fz));
