// Discord alert при доклад с находки (research/07 — alert pipeline).
// Праща rich embed по severity. Използва native fetch (Node >=18).

const COLORS = {
  detected: 0xe23c3c, // червено
  suspicious: 0xf0a020, // кехлибар
  clean: 0x3ba55d, // зелено
};

/**
 * Праща embed към Discord webhook. Тих no-op ако няма webhook URL.
 * @param {string} webhookUrl
 * @param {object} report
 * @param {string} viewUrl публичен линк към доклада
 */
export async function sendAlert(webhookUrl, report, viewUrl) {
  if (!webhookUrl) return { skipped: true };

  const sev = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const d of report.detections ?? []) {
    if (sev[d.severity] !== undefined) sev[d.severity]++;
  }

  const top = (report.detections ?? [])
    .slice()
    .sort((a, b) => rank(b.severity) - rank(a.severity))
    .slice(0, 8)
    .map((d) => `• \`${d.severity.toUpperCase()}\` ${d.title} — ${trunc(d.detail, 48)}`)
    .join('\n') || '—';

  const embed = {
    title: `CS Anticheat · ${verdictLabel(report.verdict)}`,
    color: COLORS[report.verdict] ?? 0x808080,
    description: `Риск **${report.score}/100** · находки **${report.detections?.length ?? 0}**`,
    fields: [
      { name: 'Хост', value: codeOrDash(report.system?.hostname), inline: true },
      { name: 'HWID', value: codeOrDash(report.hwid?.composite?.slice(0, 16)), inline: true },
      { name: 'Сървър', value: codeOrDash(report.serverRef), inline: true },
      {
        name: 'Тежести',
        value: `critical ${sev.critical} · high ${sev.high} · medium ${sev.medium} · low ${sev.low}`,
        inline: false,
      },
      { name: 'Топ находки', value: trunc(top, 1000), inline: false },
    ],
    footer: { text: `report ${report.reportId}` },
    timestamp: report.createdAt,
  };

  if (viewUrl) {
    embed.url = viewUrl;
    embed.fields.push({ name: 'Преглед', value: viewUrl, inline: false });
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'CS Anticheat',
      embeds: [embed],
      allowed_mentions: { parse: [] }, // защита срещу @everyone injection през полета
    }),
  });
  return { ok: res.ok, status: res.status };
}

function rank(s) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[s] ?? 0;
}
function verdictLabel(v) {
  return { detected: '🔴 ОТКРИТ ЧИЙТ', suspicious: '🟠 ПОДОЗРИТЕЛНО', clean: '🟢 ЧИСТО' }[v] ?? v;
}
function trunc(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function codeOrDash(s) {
  return s ? `\`${s}\`` : '—';
}
