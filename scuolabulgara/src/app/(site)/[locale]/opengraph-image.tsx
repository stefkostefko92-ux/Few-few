import { ImageResponse } from "next/og";
import { borderTile, outlinePath, rosette, stitchPaths, type Motif } from "@/lib/stitch";

// Branded 1200×630 social card (Open Graph / Twitter), in the site's own
// language: linen, the Divotino border and rosette, drawn by the same stitch
// charts as the page. Generated at request time — no binary
// asset to keep in sync.
export const runtime = "nodejs";
export const alt = "Qui Bulgaria — Scuola bulgara di Milano";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Stitches({ motif, cell, pad = 0 }: { motif: Motif; cell: number; pad?: number }) {
  const paths = stitchPaths(motif.cells, cell, cell * 0.12); // as dense as on the page
  const w = cell * 0.34;
  const W = motif.w * cell + 2 * pad, H = motif.h * cell + 2 * pad;
  return (
    <svg width={W} height={H} viewBox={`${-pad} ${-pad} ${W} ${H}`}>
      {Object.entries(paths).map(([c, d]) => (
        <path key={c} d={d} stroke={c} strokeWidth={w} strokeLinecap="round" fill="none" />
      ))}
      {motif.outline && <path d={outlinePath(motif.cells, cell)} stroke={motif.outline} strokeWidth={w * 0.55} strokeLinecap="round" fill="none" />}
    </svg>
  );
}

export default async function OgImage() {
  const tile = borderTile();
  const cell = 6;
  const tiles = Math.ceil(1200 / (tile.w * cell));
  const Band = () => (
    <div style={{ display: "flex", width: "100%" }}>
      {Array.from({ length: tiles }, (_, i) => <Stitches key={i} motif={tile} cell={cell} />)}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fdfcf9", color: "#1c1917", fontFamily: "sans-serif" }}>
        <Band />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 80px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "760px" }}>
            <div style={{ fontSize: "34px", fontWeight: 700, color: "#a3141a" }}>Qui Bulgaria</div>
            <div style={{ fontSize: "84px", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>Scuola bulgara di Milano</div>
            <div style={{ fontSize: "32px", color: "#45403b" }}>Lingua, cultura e danza bulgara, dal 2014</div>
          </div>
          <Stitches motif={rosette()} cell={11} pad={6} />
        </div>
        <Band />
      </div>
    ),
    { ...size },
  );
}
