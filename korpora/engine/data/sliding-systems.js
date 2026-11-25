// Sliding door systems with planning data from the maker. Each value carries its source; where the page is silent the
// program chooses and the comment says „our choice“ (the drawing and the warnings say it too).
//
// Häfele Slido F-Line21 40C — Häfele U.K., Sliding Systems Directory 2025, „Sliding & Folding Door Systems For
// Furniture“, p. 1.20 (system, installation dimensions, drilling diagram) and p. 1.21 (tracks, fitting sets);
// https://files.hafele.co.uk/CatalogFiles/www/25S1-20.pdf. Planofit: same directory, p. 1.144 (25S1-144.pdf).
export const SLIDING_SYSTEMS = {
  hafele_fline21_40c: {
    id: 'hafele_fline21_40c',
    brand: 'Häfele',
    name: 'Häfele Slido F-Line21 40C',
    // p. 1.20 „Range“: max. door weight 40 kg, max. door height 2200 mm, max. door width 1250 mm, door thickness 16–19 mm
    maxKg: 40,
    maxH: 2200,
    maxW: 1250,
    // p. 1.20 „Minimum door width with one soft closing mechanism: Min. 390“
    minW: 390,
    // p. 1.20 „Door overlap“: 20
    overlap: 20,
    // p. 1.20 „With screw fixing tracks B = A − 23.5 mm“ (B the door, A the clear height). The groove-mounted track
    // (B = A − 10) needs a top of 19 mm and more (p. 1.21 „For min 19 mm board thickness“); our tops are 18 mm.
    heightDeduction: 23.5,
    // the door stands 4 mm above the bottom (p. 1.20, installation dimensions, screw-fixed track: 17.5 + 2 above it)
    bottomGap: 4,
    // the doors are 16 mm boards: p. 1.20 gives the places for 16 mm doors (and 19 mm in brackets), not for 18 mm
    door: { T: 16, stock: 'pb16' },
    // p. 1.20, installation dimensions for 16 mm doors: the front door 11 mm behind the front edge, 10 mm between the
    // doors; the double track is 42 mm wide (p. 1.21) and sits 15 mm behind the front edge
    frontSetback: 11,
    doorGap: 10,
    track: { w: 42, setback: 15 },
    // the interior (partitions, shelves, rails) stands behind the rear door and the track: 11 + 16 + 10 + 16 = 53 mm of
    // doors, 15 + 42 = 57 mm of track — our choice: 60 mm, 3 mm clear of the track
    frontZone: 60,
    // p. 1.20 drilling diagram: the housing of the running gear in a Ø35 recess 12 mm deep, 64 mm in from each side edge
    // (the soft-close set 402.33.027 has no inspection support: not the +43), its centre on the line of the fixing holes
    // 11 mm under the top edge — the recess opens through the top edge, so it is made by the maker's instruction
    gear: { d: 35, depth: 12, fromSide: 64, fromTop: 11 },
    // p. 1.20 drilling diagram: a 6 mm groove 9.5 mm deep in the bottom edge runs on the guides
    bottomGroove: { w: 6, depth: 9.5 },
    // p. 1.21: fitting set for 2 doors with soft close; double top track for screw fixing, 2.5 m and 3.5 m
    set: { sku: '402.33.027', doors: 2 },
    tracks: [
      { sku: '402.30.652', length: 2500 },
      { sku: '402.30.653', length: 3500 },
    ],
    // p. 1.21: „FIXINGS REQUIRED Ø 3.5“ — the spacing is not given; our choice: one screw every 300 mm and at each end
    trackScrew: { d: 3.5, every: 300 },
  },
};

// Häfele Planofit door straightener — p. 1.144: „Planofit … must be used to add rigidity to wooden doors“ (p. 1.20);
// „Normally two straightening fittings are recommended per door panel“; for door heights up to 2400 mm (centre lines up
// to 1900 mm) — set 407.90.202; „2x boss drillings, Ø 35 mm, 12.5 mm deep, 1x groove 10 mm wide, 8 mm deep“; the bosses
// at most 250 mm from the door edge. Where across the door the two go is our choice: at a quarter and three quarters of
// its width; the bosses 150 mm from the top and the bottom edge (the centre lines stay within 1900 mm up to 2200 mm).
export const PLANOFIT = {
  sku: '407.90.202',
  maxDoorH: 2400,
  maxCentres: 1900,
  boss: { d: 35, depth: 12.5 },
  groove: { w: 10, depth: 8 },
  maxFromEdge: 250,
  fromEdge: 150,
  perDoor: 2,
};
