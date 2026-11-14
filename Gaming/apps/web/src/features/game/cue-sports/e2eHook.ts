/**
 * Test-only probes for the cue table on `window.__asoE2E.cue`, created ONLY
 * when the browser is driven by automation (`navigator.webdriver === true`).
 * Players never get the object and nothing is drawn: the end-to-end specs
 * read the WebGL table's projection (to click a felt point on the 3D canvas)
 * and each shot's client-side replay (to compare it with the server).
 */

type Pt = { x: number; y: number };

/** One shot as the client replayed it. Times are epoch ms (Date.now), so a
 *  spec can compare them with the server's `turnEndsAt` on the same machine. */
export interface CueShotLog {
  shotNo: number;
  startedAt: number;
  /** 0 while the animation still runs. */
  endedAt: number;
  frames: number;
  /** Last frame of the client's `runShot` replay (the balls left on the felt). */
  final: { id: number; x: number; y: number }[];
}

export interface CueE2E {
  shots: CueShotLog[];
  /** 3D only: felt point on the ball plane → viewport (client) coordinates. */
  toClient?: (x: number, y: number) => Pt | null;
  /** 3D only: client coordinates → felt point (the same raycast as aiming). */
  toWorld?: (clientX: number, clientY: number) => Pt | null;
}

export function cueE2E(): CueE2E | null {
  if (typeof navigator === "undefined" || navigator.webdriver !== true) return null;
  const w = window as unknown as { __asoE2E?: { cue?: CueE2E } };
  const root = (w.__asoE2E ??= {});
  return (root.cue ??= { shots: [] });
}
