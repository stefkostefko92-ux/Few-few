import { NextResponse } from 'next/server';
import { CSP_REPORT_MAX_BYTES, createLogBudget, parseCspReports } from '@/lib/csp-report';

// Докладите на CSP Report-Only (deploy/nginx.conf → report-uri/report-to). Пише по един ред в
// дневника на app (docker logs, ротиран) — само директива, произход на блокираното и шаблон на
// страницата (lib/csp-report.ts). Без IP, без user agent, без запис в базата. Винаги 204: на
// браузъра отговорът не му трябва, а на скенер не казваме нищо.
export const dynamic = 'force-dynamic';

// Общ таван за процеса: лимитът в nginx е по IP, а много IP-та могат да наводнят дневника.
const budget = createLogBudget(300, 60_000);

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared > CSP_REPORT_MAX_BYTES) return noContent();
  let text: string;
  try {
    text = await request.text();
  } catch {
    return noContent();
  }
  for (const entry of parseCspReports(text)) {
    if (!budget()) break;
    console.warn(`[csp-report] ${JSON.stringify(entry)}`);
  }
  return noContent();
}
