/**
 * Системна поща и известия: писмо до един герой или до всички (по избор с
 * прикачено злато/предмет — зачислява се веднага), in-app известие и списък
 * на изпратеното с изтегляне на партида. Изтеглянето НЕ отнема зачисленото.
 */
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import {
  CharacterPicker, DataTable, Field, NumberInput, PageHeader, Pager, SearchBox, Select, StateView, TabPanel, Tabs, Tag, Toolbar,
  errMsg, useAdminT, useConfirm, useDebounced, useFmt, useLoad, type CharOption,
} from './ui';

type TabId = 'compose' | 'notify' | 'sent';

export default function Mail(): React.ReactElement {
  const { t } = useAdminT();
  const [tab, setTab] = useState<TabId>('compose');
  const [players, setPlayers] = useState<number | null>(null);
  useEffect(() => { api.get('/admin/overview').then((r) => setPlayers(r.counts?.characters ?? null)).catch(() => setPlayers(null)); }, []);
  const tabs = [
    { id: 'compose', label: t('mail.tabs.compose') },
    { id: 'notify', label: t('mail.tabs.notify') },
    { id: 'sent', label: t('mail.tabs.sent') },
  ] as const;
  return (
    <>
      <PageHeader title={t('mail.title')} subtitle={t('mail.intro')} />
      <Tabs idPrefix="mail" tabs={tabs} value={tab} onChange={setTab} label={t('mail.title')} />
      <TabPanel idPrefix="mail" id={tab}>
        {tab === 'compose' && <Compose players={players} onSent={() => setTab('sent')} />}
        {tab === 'notify' && <Notify players={players} />}
        {tab === 'sent' && <Sent />}
      </TabPanel>
    </>
  );
}

function Recipient({ target, setTarget, hero, setHero }: { target: string; setTarget: (v: string) => void; hero: CharOption | null; setHero: (c: CharOption | null) => void }) {
  const { t } = useAdminT();
  return (
    <>
      <fieldset className="adm-check-row">
        <legend className="sr-only">{t('mail.recipient')}</legend>
        <label className="adm-check"><input type="radio" name="mail-target" checked={target === 'all'} onChange={() => setTarget('all')} /> {t('mail.toAll')}</label>
        <label className="adm-check"><input type="radio" name="mail-target" checked={target === 'character'} onChange={() => setTarget('character')} /> {t('mail.toOne')}</label>
      </fieldset>
      {target === 'character' && <Field label={t('mail.hero')} wide>{(id) => <CharacterPicker id={id} value={hero} onChange={setHero} label={t('mail.hero')} />}</Field>}
    </>
  );
}

function Compose({ players, onSent }: { players: number | null; onSent: () => void }) {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [target, setTarget] = useState('all');
  const [hero, setHero] = useState<CharOption | null>(null);
  const [from, setFrom] = useState('Heralds of the Crown');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [gold, setGold] = useState<number | ''>(0);
  const [slug, setSlug] = useState('');
  const [qty, setQty] = useState<number | ''>(1);
  const [sending, setSending] = useState(false);
  const slugOk = !slug || /^[a-z0-9_]{2,60}$/.test(slug);
  const ok = from.trim() && subject.trim() && body.trim() && (target === 'all' || hero) && gold !== '' && gold >= 0 && slugOk && qty !== '' && qty >= 1 && qty <= 100;
  const attached = (gold as number) > 0 || !!slug;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    const n = target === 'all' ? players ?? 0 : 1;
    const c = await confirm({
      title: target === 'all' ? t('mail.confirmAllTitle') : t('mail.confirmOneTitle', { name: hero?.name }),
      body: <>{t('mail.confirmBody', { count: n })}{attached ? <><br /><strong>{t('mail.confirmAttach', { gold: fmt.num(gold), item: slug ? `${qty}× ${slug}` : '—' })}</strong></> : null}</>,
      confirmLabel: t('mail.send'),
      danger: target === 'all' || attached,
      typeToConfirm: target === 'all' && attached ? 'ALL' : undefined,
    });
    if (!c) return;
    setSending(true);
    try {
      const r = await api.post('/admin/mail', {
        target, ...(target === 'character' ? { character_id: hero!.id } : {}),
        from_name: from.trim(), subject: subject.trim(), body: body.trim(), gold, ...(slug ? { item_slug: slug, item_qty: qty } : {}),
      });
      toast(t('mail.sent', { count: r.sent }), 'success');
      setSubject(''); setBody(''); setGold(0); setSlug(''); setQty(1);
      onSent();
    } catch (err) { toast(errMsg(err), 'error'); }
    finally { setSending(false); }
  }
  return (
    <form className="adm-card adm-form narrow" onSubmit={send}>
      <Recipient target={target} setTarget={setTarget} hero={hero} setHero={setHero} />
      <Field label={t('broadcast.from')} wide>{(id) => <input id={id} value={from} maxLength={40} onChange={(e) => setFrom(e.target.value)} />}</Field>
      <Field label={t('broadcast.subject')} hint={t('broadcast.chars', { count: subject.length, max: 120 })} wide>{(id) => <input id={id} value={subject} maxLength={120} onChange={(e) => setSubject(e.target.value)} />}</Field>
      <Field label={t('broadcast.body')} hint={t('broadcast.chars', { count: body.length, max: 2000 })} wide>{(id) => <textarea id={id} rows={8} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />}</Field>
      <h3 className="adm-h3">{t('mail.attachments')}</h3>
      <p className="muted small">{t('mail.attachHint')}</p>
      <div className="adm-form inline">
        <Field label={t('common.gold')}>{(id) => <NumberInput id={id} value={gold} min={0} max={1_000_000_000} onChange={setGold} />}</Field>
        <Field label={t('characters.inv.slug')} error={slugOk ? null : t('mail.slugRule')}>{(id) => <input id={id} value={slug} maxLength={60} autoComplete="off" spellCheck={false} onChange={(e) => setSlug(e.target.value.trim().toLowerCase())} />}</Field>
        <Field label={t('characters.inv.qty')}>{(id) => <NumberInput id={id} value={qty} min={1} max={100} onChange={setQty} />}</Field>
      </div>
      <div className="adm-form-actions">
        <button type="submit" className="btn btn-primary" disabled={sending || !ok}>{sending ? t('broadcast.sending') : t('mail.send')}</button>
      </div>
    </form>
  );
}

function Notify({ players }: { players: number | null }) {
  const { t } = useAdminT();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [target, setTarget] = useState('all');
  const [hero, setHero] = useState<CharOption | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = message.trim() && (target === 'all' || hero);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ok) return;
    if (target === 'all') {
      const c = await confirm({ title: t('mail.notifyConfirm'), body: t('mail.confirmBody', { count: players ?? 0 }), confirmLabel: t('mail.notifySend'), danger: true });
      if (!c) return;
    }
    setBusy(true);
    try {
      const r = await api.post('/admin/notifications', { target, ...(target === 'character' ? { character_id: hero!.id } : {}), message: message.trim() });
      toast(t('mail.notified', { count: r.sent }), 'success');
      setMessage('');
    } catch (err) { toast(errMsg(err), 'error'); }
    finally { setBusy(false); }
  }
  return (
    <form className="adm-card adm-form narrow" onSubmit={send}>
      <p className="muted small">{t('mail.notifyIntro')}</p>
      <Recipient target={target} setTarget={setTarget} hero={hero} setHero={setHero} />
      <Field label={t('mail.message')} hint={t('broadcast.chars', { count: message.length, max: 300 })} wide>{(id) => <textarea id={id} rows={3} value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} />}</Field>
      <div className="adm-form-actions"><button type="submit" className="btn btn-primary" disabled={busy || !ok}>{t('mail.notifySend')}</button></div>
    </form>
  );
}

interface Batch {
  id: number; target: string; character_name: string | null; from_name: string; subject: string; body: string; gold: number;
  item_qty: number; item_name: string | null; recipients: number; created_at: number; sent_by_name: string | null; remaining: number; read_count: number;
}

function Sent() {
  const { t } = useAdminT();
  const fmt = useFmt();
  const toast = useStore((s) => s.toast);
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [target, setTarget] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, error, loading, reload } = useLoad<{ mail: Batch[]; total: number; page: number; pages: number }>(
    () => api.get(`/admin/mail?${new URLSearchParams({ q: dq, target, page: String(page), pageSize: '20' })}`),
    [dq, target, page],
  );
  async function recall(b: Batch) {
    const ok = await confirm({
      title: t('mail.recallTitle', { subject: b.subject }),
      body: <>{t('mail.recallBody', { count: b.remaining })}{b.gold || b.item_name ? <><br /><strong>{t('mail.recallKeeps')}</strong></> : null}</>,
      confirmLabel: t('mail.recall'),
      danger: true,
    });
    if (!ok) return;
    try { const r = await api.delete(`/admin/mail/${b.id}`); toast(t('mail.recalled', { count: r.removed }), 'success'); await reload(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  return (
    <>
      <Toolbar>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t('mail.searchPlaceholder')} />
        <Select label={t('mail.recipient')} value={target} onChange={(v) => { setTarget(v); setPage(1); }} options={[{ value: '', label: t('common.all') }, { value: 'all', label: t('mail.toAll') }, { value: 'character', label: t('mail.toOne') }]} />
      </Toolbar>
      <StateView loading={loading} error={error} onRetry={reload} isEmpty={!data?.mail.length} emptyText={t('mail.noneSent')}>
        <DataTable
          rows={data?.mail || []}
          rowKey={(b) => b.id}
          dim={loading}
          caption={t('mail.tabs.sent')}
          cols={[
            { key: 'subject', label: t('broadcast.subject'), primary: true, render: (b) => <span className="adm-stack"><strong>{b.subject}</strong><span className="muted small adm-clamp">{b.body}</span></span> },
            { key: 'to', label: t('mail.recipient'), render: (b) => (b.target === 'all' ? <Tag tone="gold">{t('mail.toAll')}</Tag> : b.character_name) },
            { key: 'attach', label: t('mail.attachments'), render: (b) => [b.gold ? `${fmt.num(b.gold)} g` : '', b.item_name ? `${b.item_qty}× ${b.item_name}` : ''].filter(Boolean).join(' + ') || null },
            { key: 'reach', label: t('mail.reach'), align: 'right', render: (b) => t('mail.reachValue', { read: fmt.num(b.read_count), left: fmt.num(b.remaining), sent: fmt.num(b.recipients) }) },
            { key: 'when', label: t('common.when'), render: (b) => <span className="adm-stack"><span>{fmt.dateTime(b.created_at)}</span><span className="muted small">{b.sent_by_name}</span></span> },
          ]}
          actions={(b) => (b.remaining > 0 ? <button type="button" className="btn btn-sm btn-danger" onClick={() => recall(b)}>{t('mail.recall')}</button> : null)}
        />
        {data && <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </StateView>
    </>
  );
}
