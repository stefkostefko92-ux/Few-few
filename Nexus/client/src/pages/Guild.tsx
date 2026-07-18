import React, { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { onStream } from '../lib/stream';
import { useStore } from '../lib/store';
import Avatar from '../components/Avatar';
import ReportModal, { type ReportTarget } from '../components/ReportModal';
import CombatScene from '../combat/CombatScene';
import Sprite, { spriteForItem } from '../components/Sprite';
import type { InventoryItem } from '../lib/types';
import '../styles/guild.css';

type Tab = 'overview' | 'members' | 'vault' | 'chat' | 'wars' | 'raid' | 'upgrade';

interface GuildData {
  guild: any | null;
  members: any[];
  my_role: string;
  wars: any[];
  dungeon: any | null;
  invites?: any[];
}

export default function Guild(): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const char = useStore((s) => s.character);
  const refreshChar = useStore((s) => s.refreshCharacter);
  const [data, setData] = useState<GuildData | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [browse, setBrowse] = useState<any[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [warTarget, setWarTarget] = useState<any | null>(null);
  const [activeWars, setActiveWars] = useState<any[]>([]);
  const [combat, setCombat] = useState<any>(null);

  async function load() {
    try {
      const r = await api.get('/guild/me');
      setData(r);
      if (!r.guild) {
        const list = await api.get('/guild/list');
        setBrowse(list.guilds);
      }
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  // Outside-of-guild view
  if (!data) return <div className="muted">{t('common.loading')}</div>;
  if (!data.guild) {
    return <NoGuild data={data} browse={browse || []} onChanged={load} onOpenCreate={() => setCreateOpen(true)} createOpen={createOpen} setCreateOpen={setCreateOpen} />;
  }

  const g = data.guild;
  const me = data.members.find((m) => m.id === char?.id);
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: t('guild.tabs.overview') },
    { key: 'members', label: t('guild.tabs.members', { count: data.members.length, slots: g.member_slots }) },
    { key: 'vault', label: t('guild.tabs.vault') },
    { key: 'chat', label: t('guild.tabs.chat') },
    { key: 'wars', label: t('guild.tabs.wars') },
    { key: 'raid', label: t('guild.tabs.raid') },
    { key: 'upgrade', label: t('guild.tabs.upgrade') },
  ];

  if (combat) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <CombatScene
          hero={combat.hero}
          foe={combat.foe}
          rounds={combat.rounds}
          victory={combat.success}
          onClose={() => { setCombat(null); load(); }}
          introTitle={combat.introTitle}
        />
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="panel">
        <div className="guild-header">
          <div className="guild-crest" style={{ background: `linear-gradient(135deg, ${g.crest_color}, #0a0610)` }}>
            <span>{g.tag}</span>
          </div>
          <div>
            <div className="guild-name">{g.name}</div>
            <div style={{ marginTop: 4 }}>
              <span className="guild-tag-pill" style={{ backgroundColor: g.crest_color, color: '#0a0610' }}>{g.tag}</span>
              <span className="muted">{t('guild.header.levelMembers', { level: g.level, count: data.members.length, slots: g.member_slots })}</span>
            </div>
            {g.motto && <div className="muted" style={{ marginTop: 6, fontStyle: 'italic' }}>"{g.motto}"</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tag gold">{t('guild.header.treasuryGold', { gold: g.gold.toLocaleString() })}</div>
            <div className="muted text-sm" style={{ marginTop: 4 }}>{t('guild.header.youAre')} <strong>{t(`guild.role.${data.my_role}`, { defaultValue: data.my_role })}</strong></div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="guild-tabs">
          {tabs.map((tb) => (
            <div key={tb.key} className={`guild-tab ${tab === tb.key ? 'active' : ''}`} onClick={() => { setTab(tb.key); if (tb.key === 'wars') api.get('/guild/wars/active').then((r) => setActiveWars(r.wars)).catch(() => {}); }}>
              {tb.label}
            </div>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'members' && <MembersTab data={data} onChanged={load} />}
        {tab === 'vault' && <VaultTab onRefreshChar={refreshChar} />}
        {tab === 'chat' && <ChatTab guildId={g.id} myCharId={char?.id} />}
        {tab === 'wars' && (
          <WarsTab
            data={data}
            myGuildId={g.id}
            active={activeWars}
            onDeclare={(target) => setWarTarget(target)}
            onFight={async (warId, introTitle) => {
              try {
                const r = await api.post('/guild/wars/fight', { warId });
                setCombat({ ...r, introTitle });
                await refreshChar();
              } catch (e: any) { toast(e.message, 'error'); }
            }}
          />
        )}
        {tab === 'raid' && (
          <RaidTab
            dungeon={data.dungeon}
            isOfficer={data.my_role === 'leader' || data.my_role === 'officer'}
            members={data.members}
            onChanged={load}
            onCombat={(combat, title) => setCombat({ ...combat, introTitle: title })}
            onRefreshChar={refreshChar}
          />
        )}
        {tab === 'upgrade' && <UpgradeTab data={data} onChanged={load} onRefreshChar={refreshChar} />}
      </div>

      {warTarget && (
        <>
          <div className="admin-overlay" onClick={() => setWarTarget(null)} />
          <div className="admin-editor" style={{ width: 400 }}>
            <h3>{t('guild.declareWarTitle')}</h3>
            <p><Trans i18nKey="guild.declareWarConfirm" values={{ name: warTarget.name }} components={{ b: <strong /> }} /></p>
            <div className="actions">
              <button className="btn" onClick={() => setWarTarget(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  await api.post('/guild/wars/declare', { defenderGuildId: warTarget.id });
                  toast(t('guild.warDeclared'), 'success');
                  setWarTarget(null);
                  load();
                  api.get('/guild/wars/active').then((r) => setActiveWars(r.wars)).catch(() => {});
                } catch (e: any) { toast(e.message, 'error'); }
              }}>{t('guild.declare')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== No guild ===== */

function NoGuild({ data, browse, onChanged, createOpen, setCreateOpen }: any): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const refreshChar = useStore((s) => s.refreshCharacter);
  const [form, setForm] = useState({ name: '', tag: '', motto: '', crest_color: '#d6a13d' });

  async function create() {
    try {
      await api.post('/guild/create', form);
      toast(t('guild.founded'), 'success');
      setCreateOpen(false);
      await Promise.all([onChanged(), refreshChar()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function accept(inv: any) {
    try {
      await api.post('/guild/invite/accept', { inviteId: inv.id });
      toast(t('guild.joined', { tag: inv.tag, name: inv.name }), 'success');
      onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function decline(inv: any) {
    try {
      await api.post('/guild/invite/decline', { inviteId: inv.id });
      toast(t('guild.declined'), 'info');
      onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      {data.invites && data.invites.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2 className="panel-title">{t('guild.pendingInvitations')}</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.invites.map((i: any) => (
              <div key={i.id} className="card">
                <div className="flex between" style={{ alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: 'var(--gold-1)' }}>&lt;{i.tag}&gt; {i.name}</strong>
                    <div className="muted text-sm">{t('guild.invitedBy', { level: i.level, name: i.invited_by_name })}</div>
                    {i.motto && <div className="muted text-sm" style={{ fontStyle: 'italic', marginTop: 4 }}>"{i.motto}"</div>}
                  </div>
                  <div className="flex gap-sm">
                    <button className="btn btn-sm" onClick={() => decline(i)}>{t('guild.decline')}</button>
                    <button className="btn btn-sm btn-primary" onClick={() => accept(i)}>{t('guild.accept')}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{t('guild.foundTitle')}</h2>
            <div className="panel-subtitle">{t('guild.foundDesc')}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>{t('guild.foundButton')}</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t('guild.directory')}</h2>
        </div>
        <table className="admin-table">
          <thead>
            <tr><th>{t('guild.th.crest')}</th><th>{t('guild.th.guild')}</th><th>{t('guild.th.lv')}</th><th>{t('guild.th.members')}</th><th>{t('guild.th.treasury')}</th><th>{t('guild.th.motto')}</th></tr>
          </thead>
          <tbody>
            {browse.map((g: any) => (
              <tr key={g.id}>
                <td><div className="guild-crest" style={{ width: 36, height: 36, fontSize: 12, background: `linear-gradient(135deg, ${g.crest_color}, #0a0610)` }}>{g.tag}</div></td>
                <td><strong>{g.name}</strong></td>
                <td>{g.level}</td>
                <td>{g.member_count}/{g.member_slots}</td>
                <td className="gold">{g.gold?.toLocaleString() || 0}</td>
                <td className="muted">{g.motto || '—'}</td>
              </tr>
            ))}
            {browse.length === 0 && (
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>{t('guild.noGuilds')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <>
          <div className="admin-overlay" onClick={() => setCreateOpen(false)} />
          <div className="admin-editor" style={{ width: 460 }}>
            <h3>{t('guild.foundTitle')}</h3>
            <div className="field">
              <label>{t('guild.form.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={30} style={{ width: '100%' }} />
            </div>
            <div className="field-grid">
              <div className="field">
                <label>{t('guild.form.tag')}</label>
                <input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} maxLength={5} style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>{t('guild.form.crestColor')}</label>
                <input type="color" value={form.crest_color} onChange={(e) => setForm({ ...form, crest_color: e.target.value })} style={{ width: '100%', height: 40 }} />
              </div>
            </div>
            <div className="field">
              <label>{t('guild.form.motto')}</label>
              <input value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} maxLength={80} style={{ width: '100%' }} placeholder={t('guild.form.mottoPlaceholder')} />
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" disabled={form.name.length < 3 || form.tag.length < 2} onClick={create}>{t('guild.form.submit')}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== Tabs ===== */

interface GuildMission { key: string; label: string; target: number; reward_gold: number; progress: number; completed: boolean; }

function OverviewTab({ data }: { data: GuildData }) {
  const { t } = useTranslation();
  const g = data.guild!;
  const bonus = g.bonus;
  const [missions, setMissions] = useState<GuildMission[]>([]);
  const [missionsResetAt, setMissionsResetAt] = useState(0);
  useEffect(() => {
    api.get('/guild/missions')
      .then((r) => { setMissions(r.missions || []); setMissionsResetAt(r.reset_at || 0); })
      .catch(() => {});
  }, []);
  const missionDays = Math.max(0, Math.ceil((missionsResetAt - Date.now()) / 86_400_000));
  const MISSION_ICON: Record<string, string> = { hunt_kills: '⚔️', arena_wins: '🏟️', tower_floors: '🗼' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      {/* Седмични кооперативни мисии — общ прогрес, награда за всеки член. */}
      {missions.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="flex between" style={{ alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>{t('guild.missions.title', { defaultValue: 'Weekly guild missions' })}</h3>
            <span className="muted text-sm">{t('guild.missions.resets', { days: missionDays, defaultValue: 'Resets in {{days}}d' })}</span>
          </div>
          <div className="grid-cards">
            {missions.map((m) => (
              <div key={m.key} className="card" style={m.completed ? { borderColor: 'var(--green-1, #6ad8a4)' } : undefined}>
                <div className="flex between" style={{ alignItems: 'center' }}>
                  <strong>{MISSION_ICON[m.key] || '🎯'} {t(`guild.missions.${m.key}`, { defaultValue: m.label })}</strong>
                  <span className="muted text-sm">{m.progress.toLocaleString()}/{m.target.toLocaleString()}</span>
                </div>
                <div className="bar" style={{ height: 8, margin: '8px 0' }}>
                  <div className="bar-fill xp" style={{ width: `${Math.min(100, (m.progress / Math.max(1, m.target)) * 100)}%` }} />
                </div>
                <div className="flex between" style={{ alignItems: 'center' }}>
                  <span className="muted text-sm">💰 {m.reward_gold.toLocaleString()}g {t('guild.missions.perMember', { defaultValue: 'per member' })}</span>
                  {m.completed && <span className="tag" style={{ color: 'var(--green-1, #6ad8a4)' }}>{t('guild.missions.done', { defaultValue: 'Complete ✓' })}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 style={{ marginBottom: 10 }}>{t('guild.overview.stats')}</h3>
        <div className="guild-stat-grid">
          <Stat label={t('guild.overview.level')} value={g.level} />
          <Stat label={t('guild.overview.members')} value={`${data.members.length} / ${g.member_slots}`} />
          <Stat label={t('guild.overview.treasury')} value={`${g.gold.toLocaleString()}g`} />
          <Stat label={t('guild.overview.guildXp')} value={g.xp.toLocaleString()} />
          {g.next_level_xp ? <Stat label={t('guild.overview.toNextLevel')} value={`${Math.max(0, g.next_level_xp - g.xp).toLocaleString()}`} /> : null}
        </div>
      </div>
      <div>
        <h3 style={{ marginBottom: 10 }}>{t('guild.overview.activeBonuses')}</h3>
        <div className="guild-bonus-list">
          <BonusRow icon="✨" label={t('guild.overview.xpGain')} value={`+${Math.round(((bonus.exp_multiplier ?? 1) - 1) * 100)}%`} />
          <BonusRow icon="💰" label={t('guild.overview.goldGain')} value={`+${Math.round((bonus.gold_multiplier - 1) * 100)}%`} />
          {bonus.crit_bonus > 0 && <BonusRow icon="🗡" label={t('guild.overview.critChance')} value={`+${Math.round(bonus.crit_bonus * 100)}%`} />}
          {bonus.dodge_bonus > 0 && <BonusRow icon="🌀" label={t('guild.overview.dodgeChance')} value={`+${Math.round(bonus.dodge_bonus * 100)}%`} />}
          {bonus.hp_multiplier > 1 && <BonusRow icon="❤" label={t('guild.overview.maxHp')} value={`+${Math.round((bonus.hp_multiplier - 1) * 100)}%`} />}
          <BonusRow icon="🛡" label={t('guild.overview.memberSlots')} value={String(bonus.member_slots)} />
        </div>
      </div>
    </div>
  );
}

function MembersTab({ data, onChanged }: { data: GuildData; onChanged: () => Promise<any> }) {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const char = useStore((s) => s.character);
  const isLeader = data.my_role === 'leader';
  const isOfficer = data.my_role === 'officer';
  const [inviteName, setInviteName] = useState('');

  async function action(path: string, body: any) {
    try {
      await api.post(path, body);
      toast(t('guild.done'), 'success');
      onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div>
      {(isLeader || isOfficer) && (
        <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder={t('guild.invitePlaceholder')} style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={inviteName.length < 3} onClick={() => action('/guild/invite', { characterName: inviteName }).then(() => setInviteName(''))}>{t('guild.invite')}</button>
        </div>
      )}
      <table className="admin-table member-table">
        <thead>
          <tr><th>{t('guild.th.hero')}</th><th>{t('guild.th.class')}</th><th>{t('guild.th.lv')}</th><th>{t('guild.th.contribution')}</th><th>{t('guild.th.joined')}</th><th></th></tr>
        </thead>
        <tbody>
          {data.members.map((m) => (
            <tr key={m.id}>
              <td>
                <Avatar avatar={m.avatar || `${m.class}_01`} frame={m.frame_slug || 'plain'} size={36} />
                <div>
                  <strong>{m.name}</strong>{m.current_title && <span className="muted"> · {m.current_title}</span>}
                  <div><span className={`role-pill ${m.role}`}>{t(`guild.role.${m.role}`, { defaultValue: m.role })}</span></div>
                </div>
              </td>
              <td style={{ textTransform: 'capitalize' }}>{t(`common.class.${m.class}`, { defaultValue: m.class })}</td>
              <td>{m.level}</td>
              <td className="gold">{m.contribution.toLocaleString()}</td>
              <td className="muted text-sm">{new Date(m.joined_at).toLocaleDateString()}</td>
              <td>
                {m.id !== char?.id && (
                  <>
                    {isLeader && m.role !== 'leader' && (
                      <>
                        <button className="btn btn-sm" onClick={() => action('/guild/promote', { targetId: m.id })}>↑</button>
                        {m.role === 'officer' && <button className="btn btn-sm" style={{ marginLeft: 4 }} onClick={() => action('/guild/demote', { targetId: m.id })}>↓</button>}
                      </>
                    )}
                    {(isLeader || (isOfficer && m.role === 'member')) && (
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => action('/guild/kick', { targetId: m.id })}>{t('guild.kick')}</button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChatTab({ guildId, myCharId }: { guildId: number; myCharId?: number }) {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [report, setReport] = useState<ReportTarget | null>(null);
  const lastIdRef = useRef(0);
  const streamRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await api.get(`/guild/chat?after=${lastIdRef.current}`);
      if (r.messages.length) {
        setMessages((prev) => [...prev, ...r.messages]);
        lastIdRef.current = r.messages[r.messages.length - 1].id;
      }
    } catch { /* ignore */ }
  }
  useEffect(() => {
    load();
    // SSE: щом друг член прати съобщение, дръпни новите веднага. Polling-ът
    // (4s) остава fallback при паднала връзка.
    const off = onStream('chat', load);
    const id = setInterval(load, 4000);
    return () => { off(); clearInterval(id); };
  }, [guildId]);
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    if (!text.trim()) return;
    try {
      await api.post('/guild/chat', { message: text.trim() });
      setText('');
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div>
      <div className="chat-stream" ref={streamRef}>
        {messages.length === 0 && <div className="muted">{t('guild.chat.empty')}</div>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-line ${m.character_id === myCharId ? 'me' : ''}`}>
            <Avatar avatar={m.avatar || `${m.class}_01`} frame={m.frame_slug || 'plain'} size={42} />
            <div className="who">
              <span className="name">{m.name}</span>
              <span className="meta">{t('common.lv')} {m.level} · {t(`common.class.${m.class}`, { defaultValue: m.class })}</span>
              <div className="msg">{m.message}</div>
            </div>
            <div className="when">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            {m.character_id !== myCharId && (
              <button
                className="chat-report"
                title={t('guild.chat.report', { defaultValue: 'Report message' })}
                aria-label={t('guild.chat.report', { defaultValue: 'Report message' })}
                onClick={() => setReport({ contentKind: 'chat', contentRef: `chat:${m.id}`, label: `Message from ${m.name}` })}
                style={{ background: 'none', border: 'none', color: 'var(--text-3, #7a7f8c)', cursor: 'pointer', fontSize: 13, padding: 4, alignSelf: 'center' }}
              >⚑</button>
            )}
          </div>
        ))}
      </div>
      {report && <ReportModal target={report} onClose={() => setReport(null)} />}
      <div className="chat-input">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={t('guild.chat.placeholder')} maxLength={280} />
        <button className="btn btn-primary" disabled={!text.trim()} onClick={send}>{t('guild.chat.send')}</button>
      </div>
    </div>
  );
}

function WarsTab({
  data, myGuildId, active, onDeclare, onFight,
}: {
  data: GuildData;
  myGuildId: number;
  active: any[];
  onDeclare: (target: any) => void;
  onFight: (warId: number, introTitle: string) => void;
}) {
  const { t } = useTranslation();
  const otherWars = active.filter((w) => w.attacker_guild_id !== myGuildId && w.defender_guild_id !== myGuildId);
  const myWars = data.wars.filter((w) => w.status === 'active');
  const isOfficer = data.my_role === 'leader' || data.my_role === 'officer';

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>{t('guild.wars.yourActive')}</h3>
      {myWars.length === 0 && <div className="muted" style={{ marginBottom: 16 }}>{t('guild.wars.notAtWar')}</div>}
      {myWars.map((w) => {
        const youAttacker = w.attacker_guild_id === myGuildId;
        const myColor = youAttacker ? w.attacker_color : w.defender_color;
        const enemyColor = youAttacker ? w.defender_color : w.attacker_color;
        const myName = youAttacker ? w.attacker_name : w.defender_name;
        const myTag = youAttacker ? w.attacker_tag : w.defender_tag;
        const enemyName = youAttacker ? w.defender_name : w.attacker_name;
        const enemyTag = youAttacker ? w.defender_tag : w.attacker_tag;
        const myScore = youAttacker ? w.attacker_score : w.defender_score;
        const enemyScore = youAttacker ? w.defender_score : w.attacker_score;
        const endsIn = Math.max(0, w.ends_at - Date.now());
        return (
          <div key={w.id} className="war-banner" style={{ marginBottom: 16 }}>
            <div className="war-vs">{t('guild.wars.banner')}</div>
            <div className="war-score">
              <div className="war-side">
                <div className="crest" style={{ background: `linear-gradient(135deg, ${myColor || '#d6a13d'}, #0a0610)` }}>{myTag}</div>
                <div>
                  <div><strong>{myName}</strong></div>
                  <div className="nums">{myScore}</div>
                </div>
              </div>
              <div>{t('guild.wars.vs')}</div>
              <div className="war-side right">
                <div className="crest" style={{ background: `linear-gradient(135deg, ${enemyColor || '#b6261b'}, #0a0610)` }}>{enemyTag}</div>
                <div>
                  <div><strong>{enemyName}</strong></div>
                  <div className="nums">{enemyScore}</div>
                </div>
              </div>
            </div>
            <div className="flex between" style={{ marginTop: 16 }}>
              <div className="muted text-sm">{t('guild.wars.endsIn', { hours: Math.floor(endsIn / 3600000), minutes: Math.floor((endsIn % 3600000) / 60000) })}</div>
              <button className="btn btn-primary" onClick={() => onFight(w.id, `${myName} ${t('guild.wars.vs')} ${enemyName}`)}>{t('guild.wars.strike5')}</button>
            </div>
          </div>
        );
      })}

      {isOfficer && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 10 }}>{t('guild.declareWarTitle')}</h3>
          <div className="muted text-sm" style={{ marginBottom: 12 }}>{t('guild.wars.declareCost')}</div>
          <DeclareList myGuildId={myGuildId} onDeclare={onDeclare} />
        </>
      )}

      {otherWars.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 10 }}>{t('guild.wars.otherActive')}</h3>
          {otherWars.map((w) => (
            <div key={w.id} className="card" style={{ marginBottom: 8 }}>
              <div className="flex between">
                <span><strong>&lt;{w.attacker_tag}&gt; {w.attacker_name}</strong> {t('guild.wars.vs')} <strong>&lt;{w.defender_tag}&gt; {w.defender_name}</strong></span>
                <span className="tag">{w.attacker_score} - {w.defender_score}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function DeclareList({ myGuildId, onDeclare }: { myGuildId: number; onDeclare: (g: any) => void }) {
  const { t } = useTranslation();
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    api.get('/guild/list').then((r) => setList(r.guilds.filter((g: any) => g.id !== myGuildId))).catch(() => {});
  }, [myGuildId]);
  return (
    <table className="admin-table">
      <thead><tr><th>{t('guild.th.guild')}</th><th>{t('guild.th.lv')}</th><th>{t('guild.th.members')}</th><th></th></tr></thead>
      <tbody>
        {list.map((g) => (
          <tr key={g.id}>
            <td><strong>&lt;{g.tag}&gt; {g.name}</strong></td>
            <td>{g.level}</td>
            <td>{g.member_count}/{g.member_slots}</td>
            <td><button className="btn btn-sm btn-danger" onClick={() => onDeclare(g)}>{t('guild.declareWarTitle')}</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RaidTab({
  dungeon, isOfficer, members, onChanged, onCombat, onRefreshChar,
}: {
  dungeon: any | null;
  isOfficer: boolean;
  members: any[];
  onChanged: () => Promise<any>;
  onCombat: (c: any, title: string) => void;
  onRefreshChar: () => Promise<any>;
}) {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const [bosses, setBosses] = useState<any[]>([]);
  useEffect(() => { api.get('/guild/dungeon/bosses').then((r) => setBosses(r.bosses)).catch(() => {}); }, []);

  if (!dungeon) {
    return (
      <div>
        <h3 style={{ marginBottom: 12 }}>{t('guild.raid.beginTitle')}</h3>
        <p className="muted">{t('guild.raid.pickBoss')}</p>
        <div className="grid-cards" style={{ marginTop: 16 }}>
          {bosses.map((b) => (
            <div key={b.slug} className="card">
              <strong style={{ color: 'var(--crimson-1)', fontFamily: 'var(--font-display)' }}>{b.name}</strong>
              <div className="muted text-sm">{t('guild.raid.bossMeta', { level: b.level, hp: (b.hp_per_member * Math.max(3, members.length)).toLocaleString() })}</div>
              <div className="muted text-sm">{t('guild.raid.bossAtk', { min: b.atk_min, max: b.atk_max })}</div>
              {isOfficer && (
                <button className="btn btn-primary" style={{ marginTop: 10, width: '100%' }} onClick={async () => {
                  try {
                    await api.post('/guild/dungeon/enter', { slug: b.slug });
                    toast(t('guild.raid.started'), 'success');
                    await onChanged();
                  } catch (e: any) { toast(e.message, 'error'); }
                }}>{t('guild.raid.begin')}</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const boss = bosses.find((b) => b.slug === dungeon.slug);
  const hpPct = (dungeon.boss_hp / dungeon.boss_hp_max) * 100;
  const cleared = dungeon.boss_hp <= 0;
  const contribMap: Record<string, number> = typeof dungeon.contributions === 'object' && !Array.isArray(dungeon.contributions) ? dungeon.contributions : {};
  const topContributors = Object.entries(contribMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div>
      <div className="raid-stage">
        <div className="raid-boss-name">{boss?.name || dungeon.slug}</div>
        <div className="raid-boss-bar">
          <div className="fill" style={{ width: `${hpPct}%` }} />
          <div className="label">{t('guild.raid.hpLabel', { hp: dungeon.boss_hp.toLocaleString(), max: dungeon.boss_hp_max.toLocaleString() })}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          {cleared ? (
            <>
              <button className="btn" disabled>{t('guild.raid.slain')}</button>
              {isOfficer && <button className="btn btn-primary" onClick={async () => {
                try { await api.post('/guild/dungeon/end'); toast(t('guild.raid.ended'), 'info'); onChanged(); }
                catch (e: any) { toast(e.message, 'error'); }
              }}>{t('guild.raid.end')}</button>}
            </>
          ) : (
            <button className="btn btn-primary" onClick={async () => {
              try {
                const r = await api.post('/guild/dungeon/attack');
                onCombat(r, t('guild.raid.combatTitle', { boss: boss?.name || dungeon.slug }));
                await onRefreshChar();
              } catch (e: any) { toast(e.message, 'error'); }
            }}>{t('guild.raid.strike8')}</button>
          )}
        </div>
      </div>

      {topContributors.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 10 }}>{t('guild.raid.topDamage')}</h3>
          <div className="card">
            {topContributors.map(([charId, dmg]) => {
              const member = members.find((m) => String(m.id) === charId);
              return (
                <div key={charId} className="flex between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-1)' }}>
                  <strong>{member?.name || t('guild.raid.heroNumber', { id: charId })}</strong>
                  <span className="gold">{t('guild.raid.damage', { dmg: (dmg as number).toLocaleString() })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function UpgradeTab({ data, onChanged, onRefreshChar }: { data: GuildData; onChanged: () => Promise<any>; onRefreshChar: () => Promise<any> }) {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const g = data.guild!;
  const next = g.level + 1;
  const needXp = g.next_level_xp;
  const isLeader = data.my_role === 'leader';
  const char = useStore((s) => s.character);
  const [donate, setDonate] = useState(100);
  const [currency, setCurrency] = useState<'gold' | 'gems'>('gold');

  async function doDonate() {
    try {
      const r = await api.post('/guild/donate', { amount: donate, currency });
      const tag = currency === 'gems' ? '💎' : 'g';
      toast(t('guild.upgrade.donated', { amount: donate, tag, xp: r.gold_equivalent }), 'success');
      await Promise.all([onChanged(), onRefreshChar()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function doUpgrade() {
    try {
      const r = await api.post('/guild/upgrade');
      toast(t('guild.upgrade.advanced', { level: r.level }), 'success');
      await onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const maxForCurrency = currency === 'gems' ? ((char as any)?.gems || 0) : (char?.gold || 0);
  const canAfford = (char as any) && maxForCurrency >= donate;

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>{t('guild.upgrade.donateTitle')}</h3>
      <p className="muted">
        {t('guild.upgrade.donateDesc')}
      </p>
      <div className="flex gap-sm" style={{ marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="flex" style={{ gap: 4, padding: 2, background: 'var(--surface-1)', borderRadius: 6, border: '1px solid var(--border-1)' }}>
          <button
            className={`btn btn-sm ${currency === 'gold' ? 'btn-primary' : ''}`}
            onClick={() => setCurrency('gold')}
          >{t('guild.upgrade.goldOption', { gold: char?.gold ?? 0 })}</button>
          <button
            className={`btn btn-sm ${currency === 'gems' ? 'btn-primary' : ''}`}
            onClick={() => setCurrency('gems')}
          >{t('guild.upgrade.gemsOption', { gems: (char as any)?.gems ?? 0 })}</button>
        </div>
        <input
          type="number"
          min={1}
          max={maxForCurrency || 99999}
          value={donate}
          onChange={(e) => setDonate(Number(e.target.value))}
          style={{ width: 140 }}
        />
        <button className="btn btn-primary" disabled={!canAfford} onClick={doDonate}>
          {t('guild.upgrade.donateButton', { amount: donate, tag: currency === 'gems' ? ' 💎' : 'g' })}
        </button>
      </div>

      <h3 style={{ marginTop: 28, marginBottom: 10 }}>{t('guild.upgrade.rosterTitle', { level: g.level })}</h3>
      {!needXp && <div className="muted">{t('guild.upgrade.maxRoster', { slots: g.member_slots })}</div>}
      {needXp && (
        <div className="card">
          <div className="flex between">
            <strong>{t('guild.upgrade.tierProgress', { from: g.level, to: next })}</strong>
            <span className="muted">{t('guild.upgrade.xpProgress', { xp: g.xp.toLocaleString(), need: needXp.toLocaleString() })}</span>
          </div>
          <div className="bar" style={{ marginTop: 10 }}>
            <div className="bar-fill xp" style={{ width: `${Math.min(100, (g.xp / needXp) * 100)}%` }} />
          </div>
          {isLeader && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={g.xp < needXp} onClick={doUpgrade}>{t('guild.upgrade.expand')}</button>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 28, marginBottom: 10 }}>{t('guild.upgrade.tracksTitle')}</h3>
      <p className="muted">{t('guild.upgrade.tracksDesc')}</p>
      <TrackUpgradePanel role={data.my_role} guildXp={g.xp} onChanged={onChanged} />
    </div>
  );
}

function TrackUpgradePanel({ role, guildXp, onChanged }: { role: string; guildXp: number; onChanged: () => Promise<any> }) {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const [status, setStatus] = useState<any>(null);
  async function load() {
    try { setStatus(await api.get('/guild/upgrade/status')); } catch (e: any) { toast(e.message, 'error'); }
  }
  React.useEffect(() => { load(); }, [guildXp]);

  async function upgrade(track: string) {
    try {
      const r = await api.post('/guild/upgrade/track', { track });
      toast(t('guild.tracks.advanced', { level: r.new_level }), 'success');
      await Promise.all([load(), onChanged()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  if (!status) return <div className="muted">{t('common.loading')}</div>;
  const canUpgrade = role === 'leader' || role === 'officer';
  return (
    <div className="grid-cards">
      {status.tracks.map((tr: any) => {
        const maxed = tr.level >= tr.max;
        const affordable = !maxed && status.guild_xp >= tr.next_cost;
        const pct = (tr.level / tr.max) * 100;
        return (
          <div key={tr.key} className="card" style={{ padding: 14 }}>
            <div className="flex between">
              <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{tr.label}</strong>
              <span className="tag" style={{ fontFamily: 'var(--font-mono)' }}>{t('guild.tracks.levelOf', { level: tr.level, max: tr.max })}</span>
            </div>
            <div className="muted text-sm" style={{ marginTop: 4 }}>{tr.description}</div>
            <div className="bar" style={{ marginTop: 10 }}>
              <div className="bar-fill xp" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex between" style={{ marginTop: 10 }}>
              <span className="muted text-sm">
                {maxed ? t('guild.tracks.max') : t('guild.tracks.nextCost', { cost: tr.next_cost.toLocaleString() })}
              </span>
              {canUpgrade && (
                <button className="btn btn-sm btn-primary" disabled={maxed || !affordable} onClick={() => upgrade(tr.key)}>
                  {maxed ? t('guild.tracks.maxButton') : t('guild.tracks.plusOne')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="admin-stat"><div className="label">{label}</div><div className="num">{value}</div></div>;
}
function BonusRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="guild-bonus-row">
      <div className="icon">{icon}</div>
      <div style={{ flex: 1 }}>
        <div className="label">{label}</div>
        <div className="value">{value}</div>
      </div>
    </div>
  );
}

/* ───── Vault ───── */
function VaultTab({ onRefreshChar }: { onRefreshChar: () => Promise<any> }): React.ReactElement {
  const { t } = useTranslation();
  const toast = useStore((s) => s.toast);
  const [vault, setVault] = useState<any[]>([]);
  const [canTake, setCanTake] = useState(true);
  const [myRole, setMyRole] = useState<string>('');
  const [bag, setBag] = useState<InventoryItem[]>([]);
  const [showDeposit, setShowDeposit] = useState(false);

  async function load() {
    try {
      const r = await api.get('/guild/vault');
      setVault(r.vault || []);
      setCanTake(!!r.can_take);
      setMyRole(r.my_role || '');
      const inv = await api.get('/inventory');
      setBag((inv.items || []).filter((i: InventoryItem) =>
        !i.equipped && !i.soul_bound && !i.listed && i.category !== 'potion',
      ));
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function deposit(invId: number) {
    try { await api.post('/guild/vault/deposit', { inventoryId: invId }); toast(t('guild.vault.deposited'), 'success'); setShowDeposit(false); await Promise.all([load(), onRefreshChar()]); }
    catch (e: any) { toast(e.message, 'error'); }
  }
  async function take(vaultId: number) {
    try { await api.post('/guild/vault/take', { vaultId }); toast(t('guild.vault.taken'), 'success'); await Promise.all([load(), onRefreshChar()]); }
    catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div>
      <div className="flex between" style={{ marginBottom: 14, alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>{t('guild.vault.title')}</h3>
          <div className="muted text-sm" style={{ marginTop: 4 }}>
            {t('guild.vault.desc')}
            {myRole && <span className="tag" style={{ marginLeft: 8 }}>{t('guild.vault.you', { role: t(`guild.role.${myRole}`, { defaultValue: myRole }) })}</span>}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowDeposit(true)}>{t('guild.vault.depositButton')}</button>
      </div>

      {vault.length === 0 ? (
        <div className="muted">{t('guild.vault.empty')}</div>
      ) : (
        <div className="grid-cards">
          {vault.map((v: any) => {
            const enchants = v.enchant_count || 0;
            return (
              <div key={v.vault_id} className={`card rarity-border-${v.rarity}`} style={{ padding: 14 }}>
                <div className="flex" style={{ gap: 12, alignItems: 'flex-start' }}>
                  <Sprite {...spriteForItem(v)} size={42} enchant={enchants} />
                  <div style={{ flex: 1 }}>
                    <div className={`rarity-${v.rarity}`} style={{ fontWeight: 700 }}>{v.name}</div>
                    <div className="muted text-sm" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {v.category} · {t('common.lv')} {v.level_req} · {t(`common.rarity.${v.rarity}`, { defaultValue: v.rarity })}
                    </div>
                    <div className="muted text-sm" style={{ marginTop: 4 }}>
                      {t('guild.vault.donatedBy', { name: v.depositor_name })} · {new Date(v.deposited_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  disabled={!canTake}
                  onClick={() => take(v.vault_id)}
                  style={{ width: '100%', marginTop: 10 }}
                >
                  {canTake ? t('guild.vault.take') : t('guild.vault.recruitsCannotTake')}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showDeposit && (
        <div className="modal-backdrop" onClick={() => setShowDeposit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('guild.vault.depositTitle')}</h3>
            <div className="muted text-sm" style={{ marginBottom: 10 }}>{t('guild.vault.depositDesc')}</div>
            {bag.length === 0 ? (
              <div className="muted">{t('guild.vault.noItems')}</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: 6 }}>
                {bag.map((b) => (
                  <div
                    key={b.inv_id}
                    onClick={() => deposit(b.inv_id)}
                    title={b.name}
                    style={{
                      aspectRatio: '1 / 1', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer',
                      background: 'var(--surface-1)', border: '1px solid var(--border-1)',
                    }}
                  >
                    <Sprite {...spriteForItem(b)} size={28} enchant={b.enchant_count} />
                  </div>
                ))}
              </div>
            )}
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setShowDeposit(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
