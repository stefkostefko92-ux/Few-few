// Machine room above the shaft: the room around the machine, its door, the control panel and the main switch.
// Inputs and typical values; the drawings and the checks are in machine-room.ts.

export interface RoomInputs {
  /** clear room, as a rectangle in plan [mm] */
  W: number;
  D: number;
  /** where the shaft (its inner corner at the main entrance side) lies in the room [mm] */
  shaftX: number;
  shaftY: number;
  /** clear height under the ceiling (the lowest point) and under the ridge of a pitched roof; ridge 0 = flat [mm] */
  H: number;
  ridge: number;
  /** slab between the room and the shaft [mm] */
  slab: number;
  /** door: wall of the room, distance of its left jamb from the corner, clear width and height [mm] */
  doorWall: 'front' | 'rear' | 'left' | 'right';
  doorAt: number;
  doorW: number;
  doorH: number;
  /** control panel: wall, distance from the corner, width, depth and height [mm] */
  panelWall: 'front' | 'rear' | 'left' | 'right';
  panelAt: number;
  panelW: number;
  panelD: number;
  panelH: number;
}

export const DEFAULT_ROOM: RoomInputs = {
  W: 3000,
  D: 3000,
  shaftX: 500,
  shaftY: 500,
  H: 2200,
  ridge: 0,
  slab: 250,
  doorWall: 'front',
  doorAt: 300,
  doorW: 800,
  doorH: 2000,
  panelWall: 'rear',
  panelAt: 1900,
  panelW: 800,
  panelD: 300,
  panelH: 1800,
};
