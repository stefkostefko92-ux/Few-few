/** Одит/дневници, настройки, webhook-и и разпращане. */
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, Field, PageHeader, SearchBox, Select, StateView, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useDebounced, useFmt, useLoad,
} from './ui';

/* ===================== Одит и дневници ===================== */
interface LogRow {
  id: number; ts: number; category: string; action: string; level: string; user_id: number | null;
  target_id: number | null; target_type: string | null; ip: string; country: string; message: string; meta_json: string; webhook_sent: number;
}
const CATEGORIES = ['admin', 'moderation', 'security', 'dsa', 'auth', 'character', 'combat', 'inventory', 'market', 'guild', 'payment', 'daily', 'wheel', 'achievement', 'camp', 'system'];

function safeParse(raw: string): Record<string, any> | null {
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
const show = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));

function LogMeta({ meta }: { meta: Record<string, any> }) {
  const { t } = useAdminT();
  const changed: string[] = Array.isArray(meta.changed) ? meta.changed : [];
  const { before, after, changed: _c, ...rest } = meta;
  return (
    <div className="adm-meta">
      {(before || after) && (
        <table className="adm-diff">
          <thead><tr><th scope="col">{t('logs.field')}</th><th scope="col">{t('logs.from')}</th><th scope="col">{t('logs.to')}</th></tr></thead>
          <tbody>
            {(changed.length ? changed : Object.keys({ ...(before || {}), ...(after || {}) })).map((k) => (
              <tr key={k}><td className="mono">{k}</td><td className="from">{show(before?.[k])}</td><td className="to">{show(after?.[k])}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {Object.keys(rest).length > 0 && <pre>{JSON.stringify(rest, null, 2)}</pre>}
    </div>
  );
}

export function Logs(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const [category, setCategory] = useState('audit');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [userId, setUserId] = useState('');
  const dq = useDebounced(q);
  const du = useDebounced(userId);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const params = (before?: number) => {
    const p = new URLSearchParams({ limit: '50' });
    if (category) p.set('category', category);
    if (level) p.set('level', level);
    if (dq) p.set('q', dq);
    if (/^\d+$/.test(du)) p.set('user_id', du);
    if (before) p.set('before_id', String(before));
    return p.toString();
  };
  const { error, loading, reload } = useLoad(async () => {
    const r = await api.get(`/admin/logs?${params()}`);
    setRows(r.logs); setNext(r.next_before_id);
    return r;
  }, [category, level, dq, du]);
  const [more, setMore] = useState(false);
  async function loadOlder() {
    if (!next) return;
    setMore(true);
    try { const r = await api.get(`/admin/logs?${params(next)}`); setRows((x) => [...x, ...r.logs]); setNext(r.next_before_id); }
    finally { setMore(false); }
  }
  return (
    <>
      <PageHeader title={t('logs.title')} count={rows.length || null}>
        <button type="button" className="btn btn-sm" onClick={reload}>{t('common.refresh')}</button>
      </PageHeader>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder={t('logs.searchPlaceholder')} />
        <Select
          label={t('logs.event')} value={category} onChange={setCategory}
          options={[{ value: 'audit', label: t('logs.auditOnly') }, { value: '', label: t('logs.allCategories') }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
        />
        <Select
          label={t('logs.levelCol')} value={level} onChange={setLevel}
          options={[{ value: '', label: t('logs.allLevels') }, ...['info', 'warn', 'error', 'debug'].map((l) => ({ value: l, label: l }))]}
        />
        <label className="adm-search narrow">
          <span className="sr-only">{t('logs.userId')}</span>
          <input inputMode="numeric" placeholder={t('logs.userId')} value={userId} onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))} />
        </label>
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!rows.length} emptyText={t('common.noResults')}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          dim={loading}
          cols={[
            { key: 'ts', label: t('logs.time'), mono: true, render: (r) => fmt.dateTime(r.ts) },
            { key: 'level', label: t('logs.levelCol'), render: (r) => <Tag tone={r.level === 'error' ? 'crimson' : r.level === 'warn' ? 'gold' : r.level === 'debug' ? undefined : 'emerald'}>{r.level}</Tag> },
            { key: 'event', label: t('logs.event'), primary: true, render: (r) => <strong className="mono">{r.category}.{r.action}</strong> },
            { key: 'user', label: t('common.user'), mono: true, render: (r) => (r.user_id ? `#${r.user_id}` : null) },
            { key: 'target', label: t('logs.target'), mono: true, render: (r) => (r.target_id ? `${r.target_type || ''} #${r.target_id}` : r.target_type || null) },
            { key: 'ip', label: t('logs.ipCountry'), mono: true, render: (r) => (r.ip ? <>{r.ip}{r.country ? <> <Tag>{r.country}</Tag></> : null}</> : null) },
            { key: 'message', label: t('logs.message'), render: (r) => <span className="adm-clamp">{r.message}</span> },
          ]}
          actions={(r) => {
            const meta = safeParse(r.meta_json);
            if (!meta || !Object.keys(meta).length) return null;
            return (
              <button type="button" className="btn btn-sm" aria-expanded={expanded === r.id} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                {t('logs.expand')}
              </button>
            );
          }}
        />
        {expanded !== null && (() => {
          const r = rows.find((x) => x.id === expanded);
          const meta = r && safeParse(r.meta_json);
          return meta ? (
            <section className="adm-card" aria-live="polite">
              <h3 className="adm-h3 mono">#{r!.id} · {r!.category}.{r!.action} · {fmt.dateTime(r!.ts)}{meta.admin_id ? ` · ${t('logs.by', { id: meta.admin_id })}` : ''}</h3>
              <LogMeta meta={meta} />
            </section>
          ) : null;
        })()}
        {next && <div className="adm-pager"><button type="button" className="btn btn-sm" disabled={more} onClick={loadOlder}>{more ? t('common.loading') : t('logs.loadOlder')}</button></div>}
      </StateView>
    </>
  );
}

/* ===================== Настройки ===================== */
interface SettingRow { def: { key: string; label: string; description: string; type: 'int' | 'float' | 'string' | 'bool'; default: unknown; group: string }; value: unknown; isDefault: boolean; bounds: [number, number] | null }

export function Settings(): React.ReactElement {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad<SettingRow[]>(async () => (await api.get('/admin/settings')).settings, []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const groups = Array.from(new Set((data || []).map((r) => r.def.group)));

  function invalid(r: SettingRow, raw: string): string | null {
    if (r.def.type === 'int' || r.def.type === 'float') {
      const n = raw.trim() === '' ? NaN : Number(raw);
      if (!Number.isFinite(n) || (r.def.type === 'int' && !Number.isInteger(n))) return t('common.invalidNumber');
      if (r.bounds && (n < r.bounds[0] || n > r.bounds[1])) return t('common.range', { min: r.bounds[0], max: r.bounds[1] });
    }
    return null;
  }
  async function save(r: SettingRow, raw: string) {
    if (r.def.group === 'security') {
      if (!(await confirm({ title: t(`settings.defs.${r.def.key}.label`, { defaultValue: r.def.label }), body: t('settings.securityWarn'), danger: true, confirmLabel: t('common.save') }))) return;
    }
    const value = r.def.type === 'bool' ? raw === 'true' : r.def.type === 'string' ? raw : Number(raw);
    try {
      await api.put(`/admin/settings/${r.def.key}`, { value });
      toast(t('settings.updated', { key: t(`settings.defs.${r.def.key}.label`, { defaultValue: r.def.label }) }), 'success');
      setDraft((d) => { const { [r.def.key]: _, ...rest } = d; return rest; });
      await reload();
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.intro')} />
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.length}>
        {groups.map((g) => (
          <section key={g} className="adm-section">
            <h2 className="adm-h2">{t(`settings.groups.${g}`, { defaultValue: g })}</h2>
            <div className="adm-settings">
              {(data || []).filter((r) => r.def.group === g).map((r) => {
                const editing = draft[r.def.key] !== undefined;
                const raw = editing ? draft[r.def.key] : String(r.value);
                const err = editing ? invalid(r, raw) : null;
                return (
                  <form key={r.def.key} className="adm-setting" onSubmit={(e) => { e.preventDefault(); if (editing && !err) void save(r, raw); }}>
                    <div className="adm-setting-info">
                      <label htmlFor={`set-${r.def.key}`}><strong>{t(`settings.defs.${r.def.key}.label`, { defaultValue: r.def.label })}</strong></label>
                      <span className="muted small">{t(`settings.defs.${r.def.key}.description`, { defaultValue: r.def.description })}</span>
                      <code className="muted small">{r.def.key}</code>
                    </div>
                    <div className="adm-setting-ctrl">
                      {r.def.type === 'bool' ? (
                        <select id={`set-${r.def.key}`} value={raw} onChange={(e) => setDraft((d) => ({ ...d, [r.def.key]: e.target.value }))}>
                          <option value="true">{t('common.yes')}</option>
                          <option value="false">{t('common.no')}</option>
                        </select>
                      ) : (
                        <input
                          id={`set-${r.def.key}`}
                          type={r.def.type === 'string' ? 'text' : 'number'}
                          step={r.def.type === 'float' ? 'any' : 1}
                          min={r.bounds?.[0]} max={r.bounds?.[1]}
                          value={raw}
                          aria-invalid={!!err}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.def.key]: e.target.value }))}
                        />
                      )}
                      <span className={err ? 'adm-field-error' : 'adm-field-hint'}>
                        {err || (
                          <>
                            {t('settings.default')}: <code>{String(r.def.default)}</code>
                            {r.bounds ? ` · ${t('common.range', { min: r.bounds[0], max: r.bounds[1] })}` : ''}
                            {r.isDefault ? <> <Tag>{t('settings.usingDefault')}</Tag></> : null}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="adm-setting-actions">
                      <button type="submit" className="btn btn-sm btn-primary" disabled={!editing || !!err}>{t('common.save')}</button>
                      {!r.isDefault && !editing && (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void save(r, String(r.def.default))}>{t('settings.reset')}</button>
                      )}
                    </div>
                  </form>
                );
              })}
            </div>
          </section>
        ))}
      </StateView>
    </>
  );
}

/* ===================== Webhooks ===================== */
const FILTERS = ['*', 'admin', 'moderation', 'security', 'combat', 'payment', 'inventory', 'guild', 'character', 'daily', 'system', 'market'];
function isDiscordUrl(url: string): boolean {
  try { const h = new URL(url).hostname.toLowerCase(); return h === 'discord.com' || h === 'discordapp.com' || h.endsWith('.discord.com') || h.endsWith('.discordapp.com'); }
  catch { return false; }
}

export function Webhooks(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const { data, error, loading, reload } = useLoad<any[]>(async () => (await api.get('/admin/webhooks')).webhooks, []);
  const [draft, setDraft] = useState({ url: '', secret: '', category_filter: '*', enabled: true });
  const discord = isDiscordUrl(draft.url);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/admin/webhooks', { ...draft, secret: discord ? '' : draft.secret });
      toast(t('webhooks.added'), 'success');
      setDraft({ url: '', secret: '', category_filter: '*', enabled: true });
      await reload();
    } catch (err) { toast(errMsg(err), 'error'); }
  }
  async function patch(id: number, body: Record<string, unknown>) {
    try { await api.patch(`/admin/webhooks/${id}`, body); toast(t('webhooks.updated'), 'success'); await reload(); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  async function del(id: number) {
    if (!(await confirm({ title: t('webhooks.deleteTitle'), danger: true, confirmLabel: t('common.delete') }))) return;
    try { await api.delete(`/admin/webhooks/${id}`); toast(t('common.deleted'), 'success'); await reload(); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  async function test(id: number) {
    try {
      const r = await api.post(`/admin/webhooks/${id}/test`, {});
      toast(r.delivered ? t('webhooks.testOk', { status: r.status }) : t('webhooks.testFail', { status: r.status ?? '—' }), r.delivered ? 'success' : 'error');
      await reload();
    } catch (err) { toast(errMsg(err), 'error'); }
  }

  return (
    <>
      <PageHeader title={t('webhooks.title')} count={data?.length ?? null} />
      <div className="adm-note"><strong>{t('webhooks.discordTitle')}</strong> <span className="muted">{t('webhooks.discordBody')}</span></div>
      <form className="adm-card adm-form grid" onSubmit={add}>
        <Field label={t('webhooks.url')} wide>
          {(id) => <input id={id} type="url" required value={draft.url} placeholder={t('webhooks.urlPlaceholder')} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />}
        </Field>
        <Field label={t('webhooks.secret')} hint={discord ? t('webhooks.secretIgnored') : undefined}>
          {(id) => <input id={id} type="password" autoComplete="off" value={discord ? '' : draft.secret} disabled={discord} placeholder={t('webhooks.secretPlaceholder')} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} />}
        </Field>
        <Field label={t('webhooks.categoryFilter')}>
          {(id) => <select id={id} value={draft.category_filter} onChange={(e) => setDraft({ ...draft, category_filter: e.target.value })}>{FILTERS.map((c) => <option key={c} value={c}>{c}</option>)}</select>}
        </Field>
        <label className="adm-check"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> {t('webhooks.enabled')}</label>
        <div className="adm-form-actions"><button type="submit" className="btn btn-primary" disabled={!/^https?:\/\//.test(draft.url)}>{t('webhooks.add')}</button></div>
      </form>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.length}>
        <DataTable
          rows={data || []}
          rowKey={(w) => w.id}
          cols={[
            { key: 'url', label: t('webhooks.url'), primary: true, render: (w) => <span className="adm-url">{isDiscordUrl(w.url) && <Tag tone="emerald">discord</Tag>} <code className="break">{w.url.length > 64 ? `${w.url.slice(0, 61)}…` : w.url}</code>{w.has_secret ? <> <Tag tone="sapphire">{t('webhooks.hasSecret')}</Tag></> : null}</span> },
            {
              key: 'filter', label: t('webhooks.categoryFilter'),
              render: (w) => (
                <select aria-label={t('webhooks.categoryFilter')} value={w.category_filter} onChange={(e) => patch(w.id, { category_filter: e.target.value })}>
                  {[...new Set([w.category_filter, ...FILTERS])].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ),
            },
            {
              key: 'state', label: t('webhooks.state'),
              render: (w) => (
                <button type="button" className={`btn btn-sm ${w.enabled ? 'btn-primary' : ''}`} aria-pressed={!!w.enabled} onClick={() => patch(w.id, { enabled: !w.enabled })}>
                  {w.enabled ? t('webhooks.enabled') : t('webhooks.disabled')}
                </button>
              ),
            },
            { key: 'last', label: t('webhooks.lastCall'), render: (w) => (w.last_called_at ? <>{fmt.dateTime(w.last_called_at)} {w.last_status ? <Tag tone={w.last_status >= 200 && w.last_status < 300 ? 'emerald' : 'crimson'}>{w.last_status}</Tag> : null}</> : null) },
            { key: 'failures', label: t('webhooks.failures'), align: 'right', render: (w) => fmt.num(w.failures) },
          ]}
          actions={(w) => (
            <>
              <button type="button" className="btn btn-sm" onClick={() => test(w.id)}>{t('webhooks.test')}</button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => del(w.id)}>{t('common.delete')}</button>
            </>
          )}
        />
      </StateView>
    </>
  );
}
