import { publicBaseUrl } from '@/lib/env';
import { PROFILO } from '@/calc/norme';

export const dynamic = 'force-dynamic';

// llms.txt: what the site is and where the key pages are, for AI crawlers.
export function GET(): Response {
  const base = publicBaseUrl();
  const body = [
    '# Argano',
    '',
    "> Software for lift installers in Italy: checks the geared machine offered for a replacement (or proposes one) and prepares the calculation report (relazione di calcolo) for the technical file. Italian normative profile " + PROFILO.id + ': ' + PROFILO.documenti.map((d) => d.sigla).join('; ') + '.',
    '',
    'Results are indicative until a qualified technician checks and signs the report; the normative values are being verified by an engineer. Access is by invitation during validation.',
    '',
    '## Pages',
    `- [Argano (Italiano)](${base}/it): what the software checks, how it works, standards, FAQ`,
    `- [Argano (English)](${base}/en)`,
    `- [Argano (Български)](${base}/bg)`,
    '',
    '## Publisher',
    '- [Carbon Stealth VCC](https://carbonstealth.eu)',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
