// The roping as the owner's model of the relazione tecnica names it (round 57, the owner's choice over «taglia 1:1/2:1»):
// «Diretto» and «Indiretto 1:2» (the RT also «Indiretto 1:4»), the same words on every screen and document. Pure.

/** The roping's name: «Diretto», «Indiretto 1:2». */
export const sospensione = (r: number): string => (r === 1 ? 'Diretto' : `Indiretto 1:${r}`);

/** The roping in a sentence: «sospensione diretta», «sospensione indiretta 1:2». */
export const sospensioneTesto = (r: number): string => (r === 1 ? 'sospensione diretta' : `sospensione indiretta 1:${r}`);
