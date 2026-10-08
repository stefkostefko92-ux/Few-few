// The rope geometry entered by hand against the shaft design's (registry impianto.L0, impianto.Hv): the rope beyond the
// travel and a machine below's height to the head pulleys are the drawing's when the software takes them; entered by
// hand (a measure of the installation) they must still agree with the drawing, within KL.l0Tol and KL.hvTol — a value
// the shaft cannot hold (an Hv of a machine at the lowest floor longer than the shaft) is an issue to correct, and the
// rope lengths for the order, the ropes' mass in the traction and the loads follow the value the calculation takes.
// Pure.
import { KL } from './norme';

/** What the shaft design gives for L0 and Hv entered by hand [m]; null where the software takes it (or there is no Hv). */
export interface Drawn {
  L0: number | null;
  Hv: number | null;
}

export const NOT_DRAWN: Drawn = { L0: null, Hv: null };

/** The values entered that the drawing contradicts. */
export function drawnIssues(entered: { L0: number; Hv: number }, drawn: Drawn): ('L0' | 'Hv')[] {
  return [
    ...(drawn.L0 !== null && Math.abs(entered.L0 - drawn.L0) > KL.l0Tol ? ['L0' as const] : []),
    ...(drawn.Hv !== null && Math.abs(entered.Hv - drawn.Hv) > KL.hvTol ? ['Hv' as const] : []),
  ];
}
