// The machine room measured on a DXF/DWG plan (round 50), in the browser like the shaft (measure.ts): a click inside the
// room and one inside the shaft below give two clear rectangles; the room's front wall is a side of the room's
// rectangle as the drawing shows it (the bottom by default: the plan seen from the front wall, its left the room's
// left), the side of entrance A of the shaft (the survey's frame, src/lib/room/survey.ts). From them: the room's clear
// size (room.W along the front wall, room.D into the room), the shaft's (shaft.W along the entrance-A wall — the front
// wall's direction —, shaft.D across) and where the shaft lies (room.shaftX from the room's left inner wall to the
// shaft's left inner face, room.shaftY from the room's front inner wall to the shaft's entrance-A face). Millimetres,
// rounded; nothing is checked here — the confirm table checks every value against the form's range. Pure.
import { shaftSize, surveyCorners, type DoorSide, type Survey } from './measure';

export interface MisuraLocale {
  values: { id: string; value: number }[];
  /** the shaft's walls are not parallel to the room's (more than half a degree): its place is approximate */
  skew: boolean;
}

/** Beyond this the shaft's walls are said not parallel to the room's [rad] (half a degree). */
const SKEW = (0.5 * Math.PI) / 180;

/** A point of the drawing in the room's frame: x from the left inner wall along the front wall, y from the front inner
 *  wall into the room [drawing units], for the room's front side on the drawing. */
function frame(room: Survey, front: DoorSide): (p: readonly [number, number]) => [number, number] {
  const ux = Math.cos(room.angle), uy = Math.sin(room.angle), u0 = -room.left, u1 = room.right, v0 = -room.down, v1 = room.up;
  return ([px, py]) => {
    const dx = px - room.x, dy = py - room.y, u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    switch (front) {
      case 'down': return [u - u0, v - v0];
      case 'up': return [u1 - u, v1 - v];
      case 'left': return [v1 - v, u - u0];
      case 'right': return [v - v0, u1 - u];
    }
  };
}

/** The angle between two surveys' axes within ±45°, and whether one is turned a quarter from the other. */
function relative(a: Survey, b: Survey): { diff: number; quarter: boolean } {
  let d = b.angle - a.angle;
  const q = Math.PI / 2;
  let quarter = false;
  if (d > q / 2) { d -= q; quarter = true; } else if (d <= -q / 2) { d += q; quarter = true; }
  return { diff: d, quarter };
}

/** The measures the clicks give so far (the room's, the shaft's, and the shaft's place once both are measured). */
export function misuraLocale(room: Survey | null, shaft: Survey | null, mmPerUnit: number, front: DoorSide): MisuraLocale {
  const mm = (x: number): number => Math.round(x * mmPerUnit), values: MisuraLocale['values'] = [];
  const across = front === 'down' || front === 'up';
  if (room) {
    values.push({ id: 'room.W', value: mm(across ? room.left + room.right : room.up + room.down) });
    values.push({ id: 'room.D', value: mm(across ? room.up + room.down : room.left + room.right) });
  }
  if (!shaft) return { values, skew: false };
  if (!room) {
    const { W, D } = shaftSize(shaft, mmPerUnit, front);
    return { values: [{ id: 'shaft.W', value: W }, { id: 'shaft.D', value: D }], skew: false };
  }
  // the shaft's own size, its axes taken as the room's (or a quarter turned from them)
  const r = relative(room, shaft), alongU = r.quarter ? shaft.up + shaft.down : shaft.left + shaft.right, alongV = r.quarter ? shaft.left + shaft.right : shaft.up + shaft.down;
  values.push({ id: 'shaft.W', value: mm(across ? alongU : alongV) }, { id: 'shaft.D', value: mm(across ? alongV : alongU) });
  const toRoom = frame(room, front), corners = surveyCorners(shaft).map(toRoom);
  values.push({ id: 'room.shaftX', value: mm(Math.min(...corners.map((c) => c[0]))) }, { id: 'room.shaftY', value: mm(Math.min(...corners.map((c) => c[1]))) });
  return { values, skew: Math.abs(r.diff) > SKEW };
}
