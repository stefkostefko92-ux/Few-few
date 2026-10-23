// The version of the engine of the relazione tecnica di modifica (round 49): an issued RT stores it, its hash covers it
// (snapshot.ts), and a change of the RT engine, of its registries (norme.ts, norme-voci.ts, sezioni.ts, documenti.ts,
// regimi.ts), of the document builder or of a reused function's output is a new version (rt-version.test.ts). The
// four engines it reads (ENGINE, LIFT, ROOM, SHAFT) keep their own versions.
export const RT_ENGINE_VERSION = '1.0.0';
