// The version of the engine of the relazione tecnica di modifica (round 49): an issued RT stores it, its hash covers it
// (snapshot.ts), and a change of the RT engine, of its registries (norme.ts, norme-voci.ts, sezioni.ts, documenti.ts,
// regimi.ts), of the document builder or of a reused function's output is a new version (rt-version.test.ts). The
// four engines it reads (ENGINE, LIFT, ROOM, SHAFT) keep their own versions. 1.1.0 (round 52): the ropes' section with
// the rope sheet's checks of a modification under UNI 10411-1 (lift/funi-modello.ts), S_f out where z stands in for it.
// 1.2.0 (round 57): the owner's words — «puleggia di trazione», «Diretto»/«Indiretto 1:2», «non soddisfatta».
export const RT_ENGINE_VERSION = '1.2.0';
