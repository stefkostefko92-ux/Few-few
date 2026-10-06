import { indexingAllowed, publicBaseUrl } from '@/lib/env';
import { PROFILO } from '@/calc/norme';

export const dynamic = 'force-dynamic';

// llms.txt: what the site is and where the key pages are, for AI crawlers; not found while indexing is off, as robots.txt
// and the sitemap.
export function GET(): Response {
  if (!indexingAllowed()) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const base = publicBaseUrl();
  const body = [
    '# LiftPilot',
    '',
    "> Lift design software for installers and engineering firms in Italy: shaft survey from DXF/DWG (read in the browser), design of the shaft plan, section A-A with pit and headroom and the machine room against UNI EN 81-20, selection and checks of the geared machine against UNI EN 81-50 (or a proposal), a 3D simulation driven by the same forces as the checks, and the documents: drawing sets (PDF), the calculation report (relazione di calcolo, PDF) and every view as DXF and DWG. Italian normative profile " + PROFILO.id + ': ' + PROFILO.documenti.map((d) => d.sigla).join('; ') + '.',
    '',
    '## Features',
    '- Shaft design: largest car that fits, one or two entrances (opposite or at 90°), doors, rails, counterweight, niches, door linings; every dimension editable on the drawing',
    '- Section A-A: floors and rises, refuge spaces, run-bys, spring, polyurethane or oil buffers',
    '- Machine room: machine on shims, a frame, beams (also raised off the floor), plates or a plinth, with the beam check; slab loads P1–P9',
    '- Machine: traction in the three conditions of UNI EN 81-50, ropes, motor, brake, emergency operation, shaft load; proposal from the calculation grid or makers’ catalogues',
    '- 3D simulation: ride, emergency braking, 125 % loading, stalled car, buffer impact, with charts over time',
    '- Documents: A4 drawing sets with company and client logos, numbers and revisions; calculation report; DXF/DWG export; immutable records with SHA-256',
    '',
    'Results are indicative until a qualified technician checks and signs the report; the normative values are being verified by an engineer. Installer companies register themselves; the owner confirms the e-mail address and invites colleagues by e-mail.',
    '',
    '## Pages',
    `- [LiftPilot (Italiano)](${base}/it): modules, drawings made by the software, workflow, deliverables, security, standards, FAQ`,
    `- [LiftPilot (English)](${base}/en)`,
    `- [LiftPilot (Български)](${base}/bg)`,
    `- [Register a company](${base}/it/register): self-registration of an installer company and its owner (also [English](${base}/en/register), [Български](${base}/bg/register))`,
    `- [Pricing](${base}/it/pricing): the owner’s monthly subscription, the packs of slots for colleagues, the free trial (also [English](${base}/en/pricing), [Български](${base}/bg/pricing))`,
    `- [Privacy and terms of use](${base}/it/privacy): data controller, data processed, cookies, retention, rights, terms (also [English](${base}/en/privacy), [Български](${base}/bg/privacy))`,
    `- [Data, formats and jurisdiction](${base}/it/data): what a company can export and in which formats, the JSON export’s structure, switching provider, the servers in Germany (Data Act; also [English](${base}/en/data), [Български](${base}/bg/data))`,
    '',
    '## Publisher',
    '- [Carbon Stealth VCC](https://carbonstealth.eu)',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
