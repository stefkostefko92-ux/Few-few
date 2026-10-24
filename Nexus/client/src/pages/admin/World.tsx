/**
 * Живият свят: световният бос (текущ преглед, ръчен спаун, HP, нулиране,
 * приноси) и сезонът (класиране с прогнозна награда, приключване на
 * предишния сезон чрез логиката на играта).
 */
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  DataTable, Field, Meter, Modal, NumberInput, PageHeader, Pager, SearchBox, Select, StateView, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useDebounced, useFmt, useLoad,
} from './ui';

/* ===================== Световен бос ===================== */
export function RealmBoss(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [week, setWeek] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<any>(
    () => api.get(`/admin/realm-boss?${new URLSearchParams({ week, q: dq, page: String(page), pageSize: '25' })}`),
    [week, dq, page],
  );
  const [spawning, setSpawning] = useState(false);
  const [editing, setEditing] = useState(false);
  const boss = data?.boss;
  const isCurrent = data && data.week === data.current_week;

  async function reset() {
    const ok = await confirm({ title: t('realmBoss.resetTitle', { week: data.week }), body: t('realmBoss.resetBody'), typeToConfirm: data.week, confirmLabel: t('realmBoss.reset'), danger: true });
    if (!ok) return;
    try { const r = await api.post(`/admin/realm-boss/${data.week}/reset`); toast(t('realmBoss.resetDone', { count: r.contributions_removed }), 'success'); await reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  const weekOptions = [{ value: '', label: t('realmBoss.currentWeek') }, ...((data?.weeks || []) as any[]).map((w) => ({ value: w.iso_week, label: `${w.iso_week} · ${w.boss_name}` }))];

  return (
    <>
      <PageHeader title={t('realmBoss.title')} subtitle={t('realmBoss.subtitle')}>
        {isCurrent && !boss && <button type="button" className="btn btn-primary btn-sm" onClick={() => setSpawning(true)}>{t('realmBoss.spawn')}</button>}
      </PageHeader>
      <Toolbar>
        <Select label={t('realmBoss.week')} value={week} onChange={(v) => { setWeek(v); setPage(1); }} options={weekOptions} />
      </Toolbar>
      <StateView loading={loading && !data} error={error} onRetry={reload} isEmpty={false}>
        {data && (
          <>
            <section className="adm-card">
              {boss ? (
                <>
                  <h2 className="adm-h2">{boss.boss_name} <span className="muted mono small">{boss.iso_week}</span></h2>
                  <Meter value={boss.hp_remaining} max={boss.hp_max} label={t('realmBoss.hp')} tone={boss.cleared_at ? 'emerald' : 'crimson'} />
                  <dl className="adm-kv" style={{ marginTop: 12 }}>
                    <dt>{t('realmBoss.hp')}</dt><dd className="mono">{fmt.num(boss.hp_remaining)} / {fmt.num(boss.hp_max)}</dd>
                    <dt>{t('common.status')}</dt><dd>{boss.cleared_at ? <Tag tone="emerald">{t('realmBoss.slain', { date: fmt.dateTime(boss.cleared_at) })}</Tag> : boss.ends_at < Date.now() ? <Tag>{t('realmBoss.expired')}</Tag> : <Tag tone="crimson">{t('realmBoss.alive')}</Tag>}</dd>
                    <dt>{t('realmBoss.window')}</dt><dd>{fmt.dateTime(boss.started_at)} – {fmt.dateTime(boss.ends_at)}</dd>
                    <dt>{t('realmBoss.settled')}</dt><dd>{boss.settled_at ? fmt.dateTime(boss.settled_at) : t('common.no')}</dd>
                  </dl>
                  <div className="adm-inline-actions" style={{ marginTop: 12 }}>
                    {!boss.cleared_at && <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>{t('realmBoss.edit')}</button>}
                    <button type="button" className="btn btn-sm btn-danger" onClick={reset}>{t('realmBoss.reset')}</button>
                  </div>
                </>
              ) : (
                <p className="muted">{isCurrent ? t('realmBoss.noneYet', { name: data.rotation.boss_name, hp: fmt.num(data.rotation.hp_max) }) : t('realmBoss.noneThatWeek')}</p>
              )}
            </section>
            <h2 className="adm-h2">{t('realmBoss.contributions')}</h2>
            <Toolbar><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('realmBoss.searchPlaceholder')} /></Toolbar>
            <StateView loading={loading} error={null} isEmpty={!data.contributions.length} emptyText={t('realmBoss.noContrib')}>
              <DataTable
                rows={data.contributions}
                rowKey={(r: any) => r.character_id}
                dim={loading}
                caption={t('realmBoss.contributions')}
                cols={[
                  { key: 'name', label: t('common.hero'), primary: true, render: (r: any) => <span>{r.name} <span className="muted cap">{t(`characters.cls.${r.class}`, { defaultValue: r.class })} · {t('common.lv')} {r.level}</span></span> },
                  { key: 'damage', label: t('realmBoss.damage'), align: 'right', render: (r: any) => fmt.num(r.damage) },
                  { key: 'strikes', label: t('realmBoss.strikes'), align: 'right', render: (r: any) => fmt.num(r.strikes) },
                  { key: 'last', label: t('realmBoss.lastStrike'), render: (r: any) => fmt.dateTime(r.last_strike_at) },
                  { key: 'claimed', label: t('realmBoss.claimed'), render: (r: any) => (r.claimed_at ? <Tag tone="emerald">{fmt.date(r.claimed_at)}</Tag> : null) },
                ]}
              />
              <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
            </StateView>
          </>
        )}
      </StateView>
      {spawning && data && <SpawnDialog bosses={data.bosses} rotation={data.rotation} onClose={() => setSpawning(false)} onDone={() => { setSpawning(false); void reload(); }} />}
      {editing && boss && <BossEditor boss={boss} onClose={() => setEditing(false)} onDone={() => { setEditing(false); void reload(); }} />}
    </>
  );
}

function SpawnDialog({ bosses, rotation, onClose, onDone }: { bosses: any[]; rotation: any; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const [slug, setSlug] = useState(rotation.boss_slug);
  const [hp, setHp] = useState<number | ''>('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try { await api.post('/admin/realm-boss/spawn', { boss_slug: slug, ...(hp !== '' ? { hp_max: hp } : {}) }); toast(t('realmBoss.spawned'), 'success'); onDone(); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  return (
    <Modal title={t('realmBoss.spawnTitle')} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" form="adm-rb-spawn" className="btn btn-primary" disabled={hp !== '' && hp < 1}>{t('realmBoss.spawn')}</button></>}>
      <form id="adm-rb-spawn" className="adm-form" onSubmit={submit}>
        <Field label={t('realmBoss.boss')} wide>
          {(id) => <select id={id} value={slug} onChange={(e) => setSlug(e.target.value)}>{bosses.map((b) => <option key={b.slug} value={b.slug}>{b.name} · {t('common.lv')} {b.level}{b.slug === rotation.boss_slug ? ` (${t('realmBoss.rotation')})` : ''}</option>)}</select>}
        </Field>
        <Field label={t('realmBoss.hpMax')} hint={t('realmBoss.hpHint', { hp: fmt.num(rotation.hp_max) })} wide>
          {(id) => <NumberInput id={id} value={hp} min={1} onChange={setHp} />}
        </Field>
      </form>
    </Modal>
  );
}

function BossEditor({ boss, onClose, onDone }: { boss: any; onClose: () => void; onDone: () => void }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const [hpMax, setHpMax] = useState<number | ''>(boss.hp_max);
  const [hp, setHp] = useState<number | ''>(boss.hp_remaining);
  const bad = hpMax === '' || hp === '' || hp < 1 || hp > hpMax;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (bad) return;
    const patch: Record<string, number> = {};
    if (hpMax !== boss.hp_max) patch.hp_max = hpMax as number;
    if (hp !== boss.hp_remaining) patch.hp_remaining = hp as number;
    if (!Object.keys(patch).length) { onClose(); return; }
    try { await api.put(`/admin/realm-boss/${boss.iso_week}`, patch); toast(t('common.saved'), 'success'); onDone(); }
    catch (err) { toast(errMsg(err), 'error'); }
  }
  return (
    <Modal title={t('realmBoss.editTitle', { name: boss.boss_name })} onClose={onClose} footer={<><button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button><button type="submit" form="adm-rb-edit" className="btn btn-primary" disabled={bad}>{t('common.save')}</button></>}>
      <form id="adm-rb-edit" className="adm-form grid" onSubmit={submit}>
        <Field label={t('realmBoss.hpMax')}>{(id) => <NumberInput id={id} value={hpMax} min={1} onChange={setHpMax} />}</Field>
        <Field label={t('realmBoss.hpRemaining')} error={bad ? t('realmBoss.hpRule') : null}>{(id) => <NumberInput id={id} value={hp} min={1} onChange={setHp} />}</Field>
      </form>
    </Modal>
  );
}

/* ===================== Сезон ===================== */
export function Season(): React.ReactElement {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [season, setSeason] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<any>(
    () => api.get(`/admin/season?${new URLSearchParams({ season, q: dq, page: String(page), pageSize: '25' })}`),
    [season, dq, page],
  );
  const [left, setLeft] = useState('');
  useEffect(() => {
    if (!data) return;
    const tick = () => { const ms = Math.max(0, data.ends_at - Date.now()); const d = Math.floor(ms / 86_400_000); const h = Math.floor((ms % 86_400_000) / 3_600_000); setLeft(t('season.left', { d, h })); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [data, t]);
  async function finalize() {
    const ok = await confirm({ title: t('season.finalizeTitle', { season: data.previous.season }), body: t('season.finalizeBody'), confirmLabel: t('season.finalize'), danger: true });
    if (!ok) return;
    try { const r = await api.post('/admin/season/finalize'); toast(t('season.finalized', { season: r.season, count: r.ranked }), 'success'); await reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  const seasonOptions = [{ value: '', label: t('season.current') }, ...((data?.seasons || []) as any[]).map((s) => ({ value: s.season_key, label: `${s.season_key} · ${fmt.num(s.players)}${s.finalized ? ' ✓' : ''}` }))];
  return (
    <>
      <PageHeader title={t('season.title')} subtitle={data ? t('season.subtitle', { season: data.current_season, left }) : undefined}>
        {data?.previous.due && <button type="button" className="btn btn-primary btn-sm" onClick={finalize}>{t('season.finalizePrev', { season: data.previous.season })}</button>}
      </PageHeader>
      <Toolbar>
        <Select label={t('season.pick')} value={season} onChange={(v) => { setSeason(v); setPage(1); }} options={seasonOptions} />
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('season.searchPlaceholder')} />
      </Toolbar>
      {data && <p className="muted small">{data.finalized ? t('season.isFinal') : t('season.isLive', { count: data.participants })}</p>}
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.standings.length} emptyText={t('season.empty')}>
        <DataTable
          rows={data?.standings || []}
          rowKey={(r: any) => r.character_id}
          dim={loading}
          caption={t('season.title')}
          cols={[
            { key: 'rank', label: t('season.rank'), align: 'right', render: (r: any) => (r.final_rank || r.position ? `#${r.final_rank ?? r.position}` : null) },
            { key: 'name', label: t('common.hero'), primary: true, render: (r: any) => <span>{r.name} <span className="muted cap">{t(`characters.cls.${r.class}`, { defaultValue: r.class })} · {t('common.lv')} {r.level}</span></span> },
            { key: 'points', label: t('season.points'), align: 'right', render: (r: any) => fmt.num(r.points) },
            {
              key: 'reward', label: t('season.reward'),
              render: (r: any) => {
                const rw = r.final_rank ? { gems: r.reward_gems, gold: r.reward_gold, title: r.title } : r.projected;
                if (!rw || (!rw.gems && !rw.gold)) return null;
                return <span className="mono small"><span className="gem">{fmt.num(rw.gems)}</span> · <span className="gold">{fmt.num(rw.gold)}</span>{rw.title ? ` · ${rw.title}` : ''}{r.final_rank ? '' : ` (${t('season.projected')})`}</span>;
              },
            },
            { key: 'updated', label: t('season.updated'), render: (r: any) => fmt.dateTime(r.updated_at) },
          ]}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
    </>
  );
}
