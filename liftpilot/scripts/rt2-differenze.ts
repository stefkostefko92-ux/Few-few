// The list of the differences of the relazione tecnica from the owner's model (round 52): every place where the model
// contradicts the standard, is unsafe or gives a wrong number or verdict, what it does and what LiftPilot does instead,
// from the registries of the code (src/lib/rt2/differenze*.ts) — the list the owner's decision asks for, in Italian
// like the entries. Writes docs/relazione-tecnica-differenze.md; the test rt2-differenze-doc keeps it current.
// Run: npx tsx scripts/rt2-differenze.ts
import { writeFileSync } from 'node:fs';
import { differenzeMarkdown } from '../src/lib/rt2/differenze-doc';

const file = new URL('../docs/relazione-tecnica-differenze.md', import.meta.url);
writeFileSync(file, differenzeMarkdown());
process.stdout.write('docs/relazione-tecnica-differenze.md scritto\n');
