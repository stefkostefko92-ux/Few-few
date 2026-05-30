import React, { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Avatar from '../components/Avatar';
import CombatScene from '../combat/CombatScene';
import '../styles/guild.css';

type Tab = 'overview' | 'members' | 'chat' | 'wars' | 'raid' | 'upgrade';

interface GuildData {
  guild: any | null;
  members: any[];
  my_role: string;
  wars: any[];
  dungeon: any | null;
  invites?: any[];
}

export default function Guild(): React.ReactElement {
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
  if (!data) return <div className="muted">Loading…</div>;
  if (!data.guild) {
    return <NoGuild data={data} browse={browse || []} onChanged={load} onOpenCreate={() => setCreateOpen(true)} createOpen={createOpen} setCreateOpen={setCreateOpen} />;
  }

  const g = data.guild;
  const me = data.members.find((m) => m.id === char?.id);
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'members', label: `Members (${data.members.length}/${g.member_slots})` },
    { key: 'chat', label: 'Chat' },
    { key: 'wars', label: 'Wars' },
    { key: 'raid', label: 'Raid' },
    { key: 'upgrade', label: 'Upgrade' },
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
              <span className="muted">Lv {g.level} guild · {data.members.length}/{g.member_slots} members</span>
            </div>
            {g.motto && <div className="muted" style={{ marginTop: 6, fontStyle: 'italic' }}>"{g.motto}"</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tag gold">{g.gold.toLocaleString()} treasury gold</div>
            <div className="muted text-sm" style={{ marginTop: 4 }}>You are <strong>{data.my_role}</strong></div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="guild-tabs">
          {tabs.map((t) => (
            <div key={t.key} className={`guild-tab ${tab === t.key ? 'active' : ''}`} onClick={() => { setTab(t.key); if (t.key === 'wars') api.get('/guild/wars/active').then((r) => setActiveWars(r.wars)).catch(() => {}); }}>
              {t.label}
            </div>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab data={data} />}
        {tab === 'members' && <MembersTab data={data} onChanged={load} />}
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
            <h3>Declare War</h3>
            <p>Declare war on <strong>{warTarget.name}</strong>? Costs 500 guild gold. Lasts 24h.</p>
            <div className="actions">
              <button className="btn" onClick={() => setWarTarget(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  await api.post('/guild/wars/declare', { defenderGuildId: warTarget.id });
                  toast('War declared!', 'success');
                  setWarTarget(null);
                  load();
                  api.get('/guild/wars/active').then((r) => setActiveWars(r.wars)).catch(() => {});
                } catch (e: any) { toast(e.message, 'error'); }
              }}>Declare</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== No guild ===== */

function NoGuild({ data, browse, onChanged, createOpen, setCreateOpen }: any): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const refreshChar = useStore((s) => s.refreshCharacter);
  const [form, setForm] = useState({ name: '', tag: '', motto: '', crest_color: '#d6a13d' });

  async function create() {
    try {
      await api.post('/guild/create', form);
      toast('Guild founded!', 'success');
      setCreateOpen(false);
      await Promise.all([onChanged(), refreshChar()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function accept(inv: any) {
    try {
      await api.post('/guild/invite/accept', { inviteId: inv.id });
      toast(`Joined <${inv.tag}> ${inv.name}!`, 'success');
      onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function decline(inv: any) {
    try {
      await api.post('/guild/invite/decline', { inviteId: inv.id });
      toast('Declined.', 'info');
      onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      {data.invites && data.invites.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2 className="panel-title">Pending Invitations</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.invites.map((i: any) => (
              <div key={i.id} className="card">
                <div className="flex between" style={{ alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: 'var(--gold-1)' }}>&lt;{i.tag}&gt; {i.name}</strong>
                    <div className="muted text-sm">Lv {i.level} · Invited by {i.invited_by_name}</div>
                    {i.motto && <div className="muted text-sm" style={{ fontStyle: 'italic', marginTop: 4 }}>"{i.motto}"</div>}
                  </div>
                  <div className="flex gap-sm">
                    <button className="btn btn-sm" onClick={() => decline(i)}>Decline</button>
                    <button className="btn btn-sm btn-primary" onClick={() => accept(i)}>Accept</button>
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
            <h2 className="panel-title">Found a Guild</h2>
            <div className="panel-subtitle">Costs 1,000 gold. Requires level 5. Grants the founder leadership.</div>
          </div>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>Found Guild</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Guild Directory</h2>
        </div>
        <table className="admin-table">
          <thead>
            <tr><th>Crest</th><th>Guild</th><th>Lv</th><th>Members</th><th>Treasury</th><th>Motto</th></tr>
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
              <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>No guilds yet — be the first.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <>
          <div className="admin-overlay" onClick={() => setCreateOpen(false)} />
          <div className="admin-editor" style={{ width: 460 }}>
            <h3>Found a Guild</h3>
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={30} style={{ width: '100%' }} />
            </div>
            <div className="field-grid">
              <div className="field">
                <label>Tag (2-5 chars, A-Z 0-9)</label>
                <input value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} maxLength={5} style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>Crest color</label>
                <input type="color" value={form.crest_color} onChange={(e) => setForm({ ...form, crest_color: e.target.value })} style={{ width: '100%', height: 40 }} />
              </div>
            </div>
            <div className="field">
              <label>Motto</label>
              <input value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} maxLength={80} style={{ width: '100%' }} placeholder="Brief inspiring phrase" />
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={form.name.length < 3 || form.tag.length < 2} onClick={create}>Found · 1,000g</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== Tabs ===== */

function OverviewTab({ data }: { data: GuildData }) {
  const g = data.guild!;
  const bonus = g.bonus;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      <div>
        <h3 style={{ marginBottom: 10 }}>Stats</h3>
        <div className="guild-stat-grid">
          <Stat label="Level" value={g.level} />
          <Stat label="Members" value={`${data.members.length} / ${g.member_slots}`} />
          <Stat label="Treasury" value={`${g.gold.toLocaleString()}g`} />
          <Stat label="Guild XP" value={g.xp.toLocaleString()} />
          {g.next_level_xp ? <Stat label="To Next Level" value={`${Math.max(0, g.next_level_xp - g.xp).toLocaleString()}`} /> : null}
        </div>
      </div>
      <div>
        <h3 style={{ marginBottom: 10 }}>Active Bonuses</h3>
        <div className="guild-bonus-list">
          <BonusRow icon="✨" label="XP gain" value={`+${Math.round((bonus.xp_multiplier - 1) * 100)}%`} />
          <BonusRow icon="💰" label="Gold gain" value={`+${Math.round((bonus.gold_multiplier - 1) * 100)}%`} />
          {bonus.crit_bonus > 0 && <BonusRow icon="🗡" label="Crit chance" value={`+${Math.round(bonus.crit_bonus * 100)}%`} />}
          {bonus.dodge_bonus > 0 && <BonusRow icon="🌀" label="Dodge chance" value={`+${Math.round(bonus.dodge_bonus * 100)}%`} />}
          {bonus.hp_multiplier > 1 && <BonusRow icon="❤" label="Max HP" value={`+${Math.round((bonus.hp_multiplier - 1) * 100)}%`} />}
          <BonusRow icon="🛡" label="Member slots" value={String(bonus.member_slots)} />
        </div>
      </div>
    </div>
  );
}

function MembersTab({ data, onChanged }: { data: GuildData; onChanged: () => Promise<any> }) {
  const toast = useStore((s) => s.toast);
  const char = useStore((s) => s.character);
  const isLeader = data.my_role === 'leader';
  const isOfficer = data.my_role === 'officer';
  const [inviteName, setInviteName] = useState('');

  async function action(path: string, body: any) {
    try {
      await api.post(path, body);
      toast('Done.', 'success');
      onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <div>
      {(isLeader || isOfficer) && (
        <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Invite a hero by name…" style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={inviteName.length < 3} onClick={() => action('/guild/invite', { characterName: inviteName }).then(() => setInviteName(''))}>Invite</button>
        </div>
      )}
      <table className="admin-table member-table">
        <thead>
          <tr><th>Hero</th><th>Class</th><th>Lv</th><th>Contribution</th><th>Joined</th><th></th></tr>
        </thead>
        <tbody>
          {data.members.map((m) => (
            <tr key={m.id}>
              <td>
                <Avatar avatar={m.avatar || `${m.class}_01`} frame={m.frame_slug || 'plain'} size={36} />
                <div>
                  <strong>{m.name}</strong>{m.current_title && <span className="muted"> · {m.current_title}</span>}
                  <div><span className={`role-pill ${m.role}`}>{m.role}</span></div>
                </div>
              </td>
              <td style={{ textTransform: 'capitalize' }}>{m.class}</td>
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
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => action('/guild/kick', { targetId: m.id })}>Kick</button>
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
  const toast = useStore((s) => s.toast);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
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
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
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
        {messages.length === 0 && <div className="muted">Be the first to write in chat.</div>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-line ${m.character_id === myCharId ? 'me' : ''}`}>
            <Avatar avatar={m.avatar || `${m.class}_01`} frame={m.frame_slug || 'plain'} size={42} />
            <div className="who">
              <span className="name">{m.name}</span>
              <span className="meta">Lv {m.level} · {m.class}</span>
              <div className="msg">{m.message}</div>
            </div>
            <div className="when">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Speak to your guild…" maxLength={280} />
        <button className="btn btn-primary" disabled={!text.trim()} onClick={send}>Send</button>
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
  const otherWars = active.filter((w) => w.attacker_guild_id !== myGuildId && w.defender_guild_id !== myGuildId);
  const myWars = data.wars.filter((w) => w.status === 'active');
  const isOfficer = data.my_role === 'leader' || data.my_role === 'officer';

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>Your Active Wars</h3>
      {myWars.length === 0 && <div className="muted" style={{ marginBottom: 16 }}>You are not currently at war.</div>}
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
            <div className="war-vs">⚔ WAR ⚔</div>
            <div className="war-score">
              <div className="war-side">
                <div className="crest" style={{ background: `linear-gradient(135deg, ${myColor || '#d6a13d'}, #0a0610)` }}>{myTag}</div>
                <div>
                  <div><strong>{myName}</strong></div>
                  <div className="nums">{myScore}</div>
                </div>
              </div>
              <div>vs</div>
              <div className="war-side right">
                <div className="crest" style={{ background: `linear-gradient(135deg, ${enemyColor || '#b6261b'}, #0a0610)` }}>{enemyTag}</div>
                <div>
                  <div><strong>{enemyName}</strong></div>
                  <div className="nums">{enemyScore}</div>
                </div>
              </div>
            </div>
            <div className="flex between" style={{ marginTop: 16 }}>
              <div className="muted text-sm">Ends in {Math.floor(endsIn / 3600000)}h {Math.floor((endsIn % 3600000) / 60000)}m</div>
              <button className="btn btn-primary" onClick={() => onFight(w.id, `${myName} vs ${enemyName}`)}>Strike! (5 EN)</button>
            </div>
          </div>
        );
      })}

      {isOfficer && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 10 }}>Declare War</h3>
          <div className="muted text-sm" style={{ marginBottom: 12 }}>Costs 500 guild gold. Lasts 24 hours.</div>
          <DeclareList myGuildId={myGuildId} onDeclare={onDeclare} />
        </>
      )}

      {otherWars.length > 0 && (
        <>
          <h3 style={{ marginTop: 24, marginBottom: 10 }}>Other Active Wars</h3>
          {otherWars.map((w) => (
            <div key={w.id} className="card" style={{ marginBottom: 8 }}>
              <div className="flex between">
                <span><strong>&lt;{w.attacker_tag}&gt; {w.attacker_name}</strong> vs <strong>&lt;{w.defender_tag}&gt; {w.defender_name}</strong></span>
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
  const [list, setList] = useState<any[]>([]);
  useEffect(() => {
    api.get('/guild/list').then((r) => setList(r.guilds.filter((g: any) => g.id !== myGuildId))).catch(() => {});
  }, [myGuildId]);
  return (
    <table className="admin-table">
      <thead><tr><th>Guild</th><th>Lv</th><th>Members</th><th></th></tr></thead>
      <tbody>
        {list.map((g) => (
          <tr key={g.id}>
            <td><strong>&lt;{g.tag}&gt; {g.name}</strong></td>
            <td>{g.level}</td>
            <td>{g.member_count}/{g.member_slots}</td>
            <td><button className="btn btn-sm btn-danger" onClick={() => onDeclare(g)}>Declare War</button></td>
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
  const toast = useStore((s) => s.toast);
  const [bosses, setBosses] = useState<any[]>([]);
  useEffect(() => { api.get('/guild/dungeon/bosses').then((r) => setBosses(r.bosses)).catch(() => {}); }, []);

  if (!dungeon) {
    return (
      <div>
        <h3 style={{ marginBottom: 12 }}>Begin a Raid</h3>
        <p className="muted">Pick a boss. HP scales with guild size. Every member can contribute strikes (8 EN each).</p>
        <div className="grid-cards" style={{ marginTop: 16 }}>
          {bosses.map((b) => (
            <div key={b.slug} className="card">
              <strong style={{ color: 'var(--crimson-1)', fontFamily: 'var(--font-display)' }}>{b.name}</strong>
              <div className="muted text-sm">Lv {b.level} · {(b.hp_per_member * Math.max(3, members.length)).toLocaleString()} HP</div>
              <div className="muted text-sm">ATK {b.atk_min}-{b.atk_max}</div>
              {isOfficer && (
                <button className="btn btn-primary" style={{ marginTop: 10, width: '100%' }} onClick={async () => {
                  try {
                    await api.post('/guild/dungeon/enter', { slug: b.slug });
                    toast('Raid started!', 'success');
                    await onChanged();
                  } catch (e: any) { toast(e.message, 'error'); }
                }}>Begin Raid</button>
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
          <div className="label">{dungeon.boss_hp.toLocaleString()} / {dungeon.boss_hp_max.toLocaleString()} HP</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
          {cleared ? (
            <>
              <button className="btn" disabled>Boss Slain — Rewards Distributed</button>
              {isOfficer && <button className="btn btn-primary" onClick={async () => {
                try { await api.post('/guild/dungeon/end'); toast('Raid ended.', 'info'); onChanged(); }
                catch (e: any) { toast(e.message, 'error'); }
              }}>End Raid</button>}
            </>
          ) : (
            <button className="btn btn-primary" onClick={async () => {
              try {
                const r = await api.post('/guild/dungeon/attack');
                onCombat(r, `Raid — ${boss?.name || dungeon.slug}`);
                await onRefreshChar();
              } catch (e: any) { toast(e.message, 'error'); }
            }}>Strike! (8 EN)</button>
          )}
        </div>
      </div>

      {topContributors.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ marginBottom: 10 }}>Top Damage Dealers</h3>
          <div className="card">
            {topContributors.map(([charId, dmg]) => {
              const member = members.find((m) => String(m.id) === charId);
              return (
                <div key={charId} className="flex between" style={{ padding: '6px 0', borderBottom: '1px solid var(--border-1)' }}>
                  <strong>{member?.name || `Hero #${charId}`}</strong>
                  <span className="gold">{(dmg as number).toLocaleString()} damage</span>
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
      toast(`Donated ${donate}${tag} (${r.gold_equivalent} XP earned).`, 'success');
      await Promise.all([onChanged(), onRefreshChar()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function doUpgrade() {
    try {
      const r = await api.post('/guild/upgrade');
      toast(`Guild advanced to level ${r.level}!`, 'success');
      await onChanged();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const maxForCurrency = currency === 'gems' ? ((char as any)?.gems || 0) : (char?.gold || 0);
  const canAfford = (char as any) && maxForCurrency >= donate;

  return (
    <div>
      <h3 style={{ marginBottom: 10 }}>Donate to the Guild</h3>
      <p className="muted">
        Gold contributes 1 Guild XP per coin. Gems contribute 10× — they're the express lane to the next tier.
      </p>
      <div className="flex gap-sm" style={{ marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="flex" style={{ gap: 4, padding: 2, background: 'var(--surface-1)', borderRadius: 6, border: '1px solid var(--border-1)' }}>
          <button
            className={`btn btn-sm ${currency === 'gold' ? 'btn-primary' : ''}`}
            onClick={() => setCurrency('gold')}
          >Gold · {char?.gold ?? 0}g</button>
          <button
            className={`btn btn-sm ${currency === 'gems' ? 'btn-primary' : ''}`}
            onClick={() => setCurrency('gems')}
          >Gems · {(char as any)?.gems ?? 0} 💎</button>
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
          Donate {donate}{currency === 'gems' ? ' 💎' : 'g'}
        </button>
      </div>

      <h3 style={{ marginTop: 28, marginBottom: 10 }}>Member Slots — Roster Tier {g.level}</h3>
      {!needXp && <div className="muted">Maximum roster size reached ({g.member_slots} members).</div>}
      {needXp && (
        <div className="card">
          <div className="flex between">
            <strong>Tier {g.level} → Tier {next}</strong>
            <span className="muted">{g.xp.toLocaleString()} / {needXp.toLocaleString()} XP</span>
          </div>
          <div className="bar" style={{ marginTop: 10 }}>
            <div className="bar-fill xp" style={{ width: `${Math.min(100, (g.xp / needXp) * 100)}%` }} />
          </div>
          {isLeader && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={g.xp < needXp} onClick={doUpgrade}>Expand roster</button>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 28, marginBottom: 10 }}>Guild Tracks — 6 × 100 Levels</h3>
      <p className="muted">Spend guild XP to advance each independent track. All members share the bonuses.</p>
      <TrackUpgradePanel role={data.my_role} guildXp={g.xp} onChanged={onChanged} />
    </div>
  );
}

function TrackUpgradePanel({ role, guildXp, onChanged }: { role: string; guildXp: number; onChanged: () => Promise<any> }) {
  const toast = useStore((s) => s.toast);
  const [status, setStatus] = useState<any>(null);
  async function load() {
    try { setStatus(await api.get('/guild/upgrade/status')); } catch (e: any) { toast(e.message, 'error'); }
  }
  React.useEffect(() => { load(); }, [guildXp]);

  async function upgrade(track: string) {
    try {
      const r = await api.post('/guild/upgrade/track', { track });
      toast(`Advanced to lv ${r.new_level}.`, 'success');
      await Promise.all([load(), onChanged()]);
    } catch (e: any) { toast(e.message, 'error'); }
  }

  if (!status) return <div className="muted">Loading…</div>;
  const canUpgrade = role === 'leader' || role === 'officer';
  return (
    <div className="grid-cards">
      {status.tracks.map((t: any) => {
        const maxed = t.level >= t.max;
        const affordable = !maxed && status.guild_xp >= t.next_cost;
        const pct = (t.level / t.max) * 100;
        return (
          <div key={t.key} className="card" style={{ padding: 14 }}>
            <div className="flex between">
              <strong style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-display)' }}>{t.label}</strong>
              <span className="tag" style={{ fontFamily: 'var(--font-mono)' }}>Lv {t.level} / {t.max}</span>
            </div>
            <div className="muted text-sm" style={{ marginTop: 4 }}>{t.description}</div>
            <div className="bar" style={{ marginTop: 10 }}>
              <div className="bar-fill xp" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex between" style={{ marginTop: 10 }}>
              <span className="muted text-sm">
                {maxed ? 'MAX' : `Next: ${t.next_cost.toLocaleString()} XP`}
              </span>
              {canUpgrade && (
                <button className="btn btn-sm btn-primary" disabled={maxed || !affordable} onClick={() => upgrade(t.key)}>
                  {maxed ? '✓ Max' : '+1 Level'}
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
