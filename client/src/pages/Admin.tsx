import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { IconChart, IconBag, IconSkull, IconScroll, IconUser, IconMail, IconCog } from '../lib/icons';
import '../styles/admin.css';

/* ===== Layout ===== */
export function AdminLayout(): React.ReactElement {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <h2>Admin Control</h2>
        <NavLink to="/admin" end className={({ isActive }) => isActive ? 'active' : ''}>
          <IconChart size={16} /> <span>Overview</span>
        </NavLink>
        <NavLink to="/admin/items" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconBag size={16} /> <span>Items</span>
        </NavLink>
        <NavLink to="/admin/monsters" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconSkull size={16} /> <span>Monsters</span>
        </NavLink>
        <NavLink to="/admin/quests" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconScroll size={16} /> <span>Quests</span>
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconUser size={16} /> <span>Users</span>
        </NavLink>
        <NavLink to="/admin/broadcast" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconMail size={16} /> <span>Broadcast</span>
        </NavLink>
        <NavLink to="/admin/server" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconCog size={16} /> <span>Server</span>
        </NavLink>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

export default function Admin(): React.ReactElement {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Overview />} />
        <Route path="items" element={<Items />} />
        <Route path="monsters" element={<Monsters />} />
        <Route path="quests" element={<Quests />} />
        <Route path="users" element={<Users />} />
        <Route path="broadcast" element={<Broadcast />} />
        <Route path="server" element={<Server />} />
      </Route>
    </Routes>
  );
}

/* ===== Overview ===== */
function Overview() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.get('/admin/overview').then(setData).catch(() => {});
  }, []);
  if (!data) return <div className="muted">Loading…</div>;
  const c = data.counts;
  return (
    <>
      <div className="admin-toolbar"><h1>Server Overview</h1></div>
      <div className="admin-stat-grid">
        <Stat label="Players" num={c.characters} />
        <Stat label="Total Users" num={c.users} />
        <Stat label="Administrators" num={c.admins} />
        <Stat label="NPC Trainers" num={c.npcs} />
        <Stat label="Items" num={c.items} />
        <Stat label="Monsters" num={c.monsters} />
        <Stat label="Quests" num={c.quests} />
        <Stat label="Battles Fought" num={c.battles} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <h3 style={{ marginBottom: 10 }}>Recent Sign-Ups</h3>
          <table className="admin-table">
            <thead><tr><th>Username</th><th>Email</th><th>Joined</th><th>Admin</th></tr></thead>
            <tbody>
              {data.recentUsers.map((u: any) => (
                <tr key={u.id}>
                  <td><strong>{u.username}</strong></td>
                  <td className="muted">{u.email}</td>
                  <td className="muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td>{u.is_admin ? <span className="tag gold">admin</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h3 style={{ marginBottom: 10 }}>Top Heroes</h3>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Class</th><th>Lv</th><th>Gold</th><th>ELO</th></tr></thead>
            <tbody>
              {data.topChars.map((c: any, i: number) => (
                <tr key={i}>
                  <td><strong>{c.name}</strong>{c.is_npc ? <span className="tag" style={{ marginLeft: 6 }}>NPC</span> : null}</td>
                  <td style={{ textTransform: 'capitalize' }}>{c.class}</td>
                  <td>{c.level}</td>
                  <td className="gold">{c.gold?.toLocaleString()}</td>
                  <td>{c.arena_rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
function Stat({ label, num }: { label: string; num: number }) {
  return <div className="admin-stat"><div className="label">{label}</div><div className="num">{num.toLocaleString()}</div></div>;
}

/* ===== Generic CRUD table ===== */
function CrudTable<T extends { id: number }>(props: {
  title: string;
  fetch: () => Promise<T[]>;
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[];
  emptyTemplate: any;
  fields: FieldDef[];
  create: (data: any) => Promise<any>;
  update: (id: number, data: any) => Promise<any>;
  destroy: (id: number) => Promise<any>;
}) {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<T[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [query, setQuery] = useState('');

  async function refresh() {
    try { setRows(await props.fetch()); } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { refresh(); }, []); // eslint-disable-line

  const filtered = rows.filter((r) => {
    if (!query) return true;
    const j = JSON.stringify(r).toLowerCase();
    return j.includes(query.toLowerCase());
  });

  async function save(data: any) {
    try {
      if (editing.id) await props.update(editing.id, data);
      else await props.create(data);
      toast('Saved.', 'success');
      setEditing(null);
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  async function destroy(id: number) {
    if (!confirm('Delete this entry permanently?')) return;
    try {
      await props.destroy(id);
      toast('Deleted.', 'info');
      refresh();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="admin-toolbar">
        <h1>{props.title} <span className="muted" style={{ fontSize: 14 }}>({filtered.length})</span></h1>
        <input className="search" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn-primary" onClick={() => setEditing({ ...props.emptyTemplate })}>+ New</button>
      </div>
      <table className="admin-table">
        <thead><tr>{props.columns.map((c) => <th key={c.key}>{c.label}</th>)}<th></th></tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setEditing({ ...r })}>
              {props.columns.map((c) => (
                <td key={c.key}>{c.render ? c.render(r) : (r as any)[c.key]}</td>
              ))}
              <td>
                <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); destroy(r.id); }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <>
          <div className="admin-overlay" onClick={() => setEditing(null)} />
          <div className="admin-editor">
            <h3>{editing.id ? 'Edit' : 'Create'} {props.title.replace(/s$/, '')}</h3>
            <Editor data={editing} fields={props.fields} onChange={setEditing} />
            <div className="actions">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => save(editing)}>Save</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select';
  options?: string[];
  half?: boolean;
}

function Editor({ data, fields, onChange }: { data: any; fields: FieldDef[]; onChange: (d: any) => void }) {
  function update(k: string, v: any) {
    const next = { ...data, [k]: v };
    onChange(next);
  }
  // Group halves into rows
  const out: React.ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.half && next && next.half) {
      out.push(
        <div key={i} className="field-grid">
          <FieldEl field={f} value={data[f.key]} onChange={(v) => update(f.key, v)} />
          <FieldEl field={next} value={data[next.key]} onChange={(v) => update(next.key, v)} />
        </div>
      );
      i++;
    } else {
      out.push(<FieldEl key={i} field={f} value={data[f.key]} onChange={(v) => update(f.key, v)} />);
    }
  }
  return <>{out}</>;
}

function FieldEl({ field, value, onChange }: { field: FieldDef; value: any; onChange: (v: any) => void }) {
  return (
    <div className="field">
      <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 4 }}>{field.label}</label>
      {field.type === 'textarea' ? (
        <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={3} style={{ width: '100%' }} />
      ) : field.type === 'select' ? (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }}>
          {field.options!.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'number' ? (
        <input type="number" value={value ?? 0} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} style={{ width: '100%' }} />
      ) : (
        <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }} />
      )}
    </div>
  );
}

/* ===== Items ===== */
function Items() {
  return (
    <CrudTable
      title="Items"
      fetch={async () => (await api.get('/admin/items')).items}
      columns={[
        { key: 'name', label: 'Name', render: (r) => <strong className={`rarity-${r.rarity}`}>{r.name}</strong> },
        { key: 'category', label: 'Cat' },
        { key: 'tier', label: 'Tier' },
        { key: 'rarity', label: 'Rarity', render: (r) => <span className={`rarity-pill ${r.rarity}`}>{r.rarity}</span> },
        { key: 'level_req', label: 'Lv' },
        { key: 'atk_max', label: 'ATK' },
        { key: 'defense', label: 'DEF' },
        { key: 'buy_price', label: 'Buy' },
      ]}
      emptyTemplate={{ slug: '', name: '', category: 'weapon', sub_type: '', tier: 1, rarity: 'common', level_req: 1, class_req: '', atk_min: 0, atk_max: 0, defense: 0, hp_bonus: 0, mp_bonus: 0, str_bonus: 0, dex_bonus: 0, con_bonus: 0, int_bonus: 0, cha_bonus: 0, wis_bonus: 0, heal_hp: 0, heal_mp: 0, buy_price: 0, sell_price: 0, icon: 'sword', description: '' }}
      fields={[
        { key: 'slug', label: 'Slug', type: 'text', half: true },
        { key: 'name', label: 'Name', type: 'text', half: true },
        { key: 'category', label: 'Category', type: 'select', options: ['weapon', 'helm', 'armor', 'gloves', 'boots', 'shield', 'ring', 'amulet', 'potion', 'misc'], half: true },
        { key: 'rarity', label: 'Rarity', type: 'select', options: ['common', 'uncommon', 'rare', 'epic', 'legendary'], half: true },
        { key: 'tier', label: 'Tier', type: 'number', half: true },
        { key: 'level_req', label: 'Level requirement', type: 'number', half: true },
        { key: 'sub_type', label: 'Sub type (sword/axe/bow/staff)', type: 'text', half: true },
        { key: 'class_req', label: 'Class requirement', type: 'text', half: true },
        { key: 'atk_min', label: 'ATK min', type: 'number', half: true },
        { key: 'atk_max', label: 'ATK max', type: 'number', half: true },
        { key: 'defense', label: 'Defense', type: 'number', half: true },
        { key: 'hp_bonus', label: 'HP bonus', type: 'number', half: true },
        { key: 'mp_bonus', label: 'MP bonus', type: 'number', half: true },
        { key: 'str_bonus', label: '+STR', type: 'number', half: true },
        { key: 'dex_bonus', label: '+DEX', type: 'number', half: true },
        { key: 'con_bonus', label: '+CON', type: 'number', half: true },
        { key: 'int_bonus', label: '+INT', type: 'number', half: true },
        { key: 'wis_bonus', label: '+WIS', type: 'number', half: true },
        { key: 'cha_bonus', label: '+CHA', type: 'number', half: true },
        { key: 'heal_hp', label: 'Heal HP', type: 'number', half: true },
        { key: 'heal_mp', label: 'Restore MP', type: 'number', half: true },
        { key: 'buy_price', label: 'Buy price', type: 'number', half: true },
        { key: 'sell_price', label: 'Sell price', type: 'number', half: true },
        { key: 'description', label: 'Description', type: 'textarea' },
      ]}
      create={(d) => api.post('/admin/items', d)}
      update={(id, d) => {
        const { id: _, ...rest } = d;
        return api.put(`/admin/items/${id}`, rest);
      }}
      destroy={(id) => api.delete(`/admin/items/${id}`)}
    />
  );
}

/* ===== Monsters ===== */
function Monsters() {
  return (
    <CrudTable
      title="Monsters"
      fetch={async () => (await api.get('/admin/monsters')).monsters}
      columns={[
        { key: 'name', label: 'Name', render: (r) => <strong>{r.name}</strong> },
        { key: 'level', label: 'Lv' },
        { key: 'hp', label: 'HP' },
        { key: 'atk_max', label: 'ATK' },
        { key: 'defense', label: 'DEF' },
        { key: 'xp_reward', label: 'XP' },
        { key: 'region', label: 'Region' },
        { key: 'family', label: 'Family' },
      ]}
      emptyTemplate={{ slug: '', name: '', level: 1, hp: 20, atk_min: 2, atk_max: 4, defense: 0, speed: 5, xp_reward: 5, gold_min: 1, gold_max: 3, sprite: 'goblin', family: 'beast', region: 'whispering_woods' }}
      fields={[
        { key: 'slug', label: 'Slug', type: 'text', half: true },
        { key: 'name', label: 'Name', type: 'text', half: true },
        { key: 'level', label: 'Level', type: 'number', half: true },
        { key: 'hp', label: 'HP', type: 'number', half: true },
        { key: 'atk_min', label: 'ATK min', type: 'number', half: true },
        { key: 'atk_max', label: 'ATK max', type: 'number', half: true },
        { key: 'defense', label: 'Defense', type: 'number', half: true },
        { key: 'speed', label: 'Speed', type: 'number', half: true },
        { key: 'xp_reward', label: 'XP reward', type: 'number', half: true },
        { key: 'gold_min', label: 'Gold min', type: 'number', half: true },
        { key: 'gold_max', label: 'Gold max', type: 'number', half: true },
        { key: 'sprite', label: 'Sprite', type: 'select', options: ['goblin', 'wolf', 'rat', 'boar', 'bandit', 'troll', 'orc', 'witch', 'spider', 'golem', 'serpent', 'wraith', 'drake', 'titan', 'shadowlord', 'overlord'], half: true },
        { key: 'family', label: 'Family', type: 'select', options: ['beast', 'humanoid', 'giant', 'magic', 'construct', 'undead', 'dragon', 'demon'], half: true },
        { key: 'region', label: 'Region', type: 'select', options: ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'] },
      ]}
      create={(d) => api.post('/admin/monsters', d)}
      update={(id, d) => {
        const { id: _, ...rest } = d;
        return api.put(`/admin/monsters/${id}`, rest);
      }}
      destroy={(id) => api.delete(`/admin/monsters/${id}`)}
    />
  );
}

/* ===== Quests ===== */
function Quests() {
  return (
    <CrudTable
      title="Quests"
      fetch={async () => (await api.get('/admin/quests')).quests}
      columns={[
        { key: 'title', label: 'Title', render: (r) => <strong>{r.title}</strong> },
        { key: 'region', label: 'Region' },
        { key: 'level_req', label: 'Lv' },
        { key: 'energy_cost', label: 'EN' },
        { key: 'monster_slug', label: 'Foe' },
        { key: 'xp_reward', label: 'XP' },
        { key: 'gold_reward', label: 'Gold' },
        { key: 'item_reward', label: 'Drop' },
      ]}
      emptyTemplate={{ slug: '', title: '', region: 'whispering_woods', level_req: 1, energy_cost: 5, duration_sec: 0, intro: '', narrative: '', monster_slug: '', xp_reward: 10, gold_reward: 5, item_reward: '', success_text: '', failure_text: '' }}
      fields={[
        { key: 'slug', label: 'Slug', type: 'text', half: true },
        { key: 'title', label: 'Title', type: 'text', half: true },
        { key: 'region', label: 'Region', type: 'select', options: ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'], half: true },
        { key: 'level_req', label: 'Level req', type: 'number', half: true },
        { key: 'energy_cost', label: 'Energy cost', type: 'number', half: true },
        { key: 'monster_slug', label: 'Monster slug (blank = story)', type: 'text', half: true },
        { key: 'xp_reward', label: 'XP reward', type: 'number', half: true },
        { key: 'gold_reward', label: 'Gold reward', type: 'number', half: true },
        { key: 'item_reward', label: 'Item drop slug', type: 'text' },
        { key: 'intro', label: 'Intro text', type: 'textarea' },
        { key: 'narrative', label: 'Narrative', type: 'textarea' },
        { key: 'success_text', label: 'Success text', type: 'textarea' },
        { key: 'failure_text', label: 'Failure text', type: 'textarea' },
      ]}
      create={(d) => api.post('/admin/quests', d)}
      update={(id, d) => {
        const { id: _, ...rest } = d;
        return api.put(`/admin/quests/${id}`, rest);
      }}
      destroy={(id) => api.delete(`/admin/quests/${id}`)}
    />
  );
}

/* ===== Users ===== */
function Users() {
  const toast = useStore((s) => s.toast);
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<any | null>(null);

  async function load() {
    const r = await api.get(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    setUsers(r.users);
  }
  useEffect(() => { load(); }, [query]);

  async function toggleAdmin(u: any) {
    try {
      await api.post(`/admin/users/${u.id}/admin`, { admin: !u.is_admin });
      toast(`${u.username} ${u.is_admin ? 'demoted' : 'promoted'}.`, 'success');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function destroy(u: any) {
    if (!confirm(`Delete user "${u.username}" permanently?`)) return;
    try {
      await api.delete(`/admin/users/${u.id}`);
      toast('Deleted.', 'info');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function saveChar(c: any) {
    try {
      const { id: _, ...patch } = c;
      await api.put(`/admin/characters/${c.id}`, patch);
      toast('Saved.', 'success');
      setEditing(null);
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="admin-toolbar">
        <h1>Users <span className="muted" style={{ fontSize: 14 }}>({users.length})</span></h1>
        <input className="search" placeholder="Search username or email…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <table className="admin-table">
        <thead>
          <tr><th>User</th><th>Email</th><th>Character</th><th>Lv</th><th>Gold</th><th>ELO</th><th>Joined</th><th>Admin</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong></td>
              <td className="muted">{u.email}</td>
              <td>{u.char_name || '—'} <span className="muted" style={{ textTransform: 'capitalize' }}>{u.char_class || ''}</span></td>
              <td>{u.char_level || '—'}</td>
              <td className="gold">{u.gold?.toLocaleString() || '—'}</td>
              <td>{u.arena_rating || '—'}</td>
              <td className="muted">{new Date(u.created_at).toLocaleDateString()}</td>
              <td><button className="btn btn-sm" onClick={() => toggleAdmin(u)}>{u.is_admin ? 'Yes' : 'No'}</button></td>
              <td>
                {u.char_id && <button className="btn btn-sm" onClick={() => setEditing({ id: u.char_id, level: u.char_level, gold: u.gold, arena_rating: u.arena_rating })}>Edit</button>}
                <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => destroy(u)}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <>
          <div className="admin-overlay" onClick={() => setEditing(null)} />
          <div className="admin-editor">
            <h3>Edit character</h3>
            <Editor
              data={editing}
              fields={[
                { key: 'level', label: 'Level', type: 'number', half: true },
                { key: 'gold', label: 'Gold', type: 'number', half: true },
                { key: 'arena_rating', label: 'Arena rating', type: 'number', half: true },
                { key: 'stat_points', label: 'Stat points', type: 'number', half: true },
                { key: 'skill_points', label: 'Skill points', type: 'number', half: true },
                { key: 'energy', label: 'Energy', type: 'number', half: true },
                { key: 'hp', label: 'HP', type: 'number', half: true },
                { key: 'hp_max', label: 'HP max', type: 'number', half: true },
                { key: 'mp', label: 'MP', type: 'number', half: true },
                { key: 'mp_max', label: 'MP max', type: 'number', half: true },
                { key: 'current_title', label: 'Title', type: 'text' },
              ]}
              onChange={setEditing}
            />
            <div className="actions">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => saveChar(editing)}>Save</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ===== Broadcast ===== */
function Broadcast() {
  const toast = useStore((s) => s.toast);
  const [from, setFrom] = useState('Heralds of the Crown');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const r = await api.post('/admin/broadcast', { from_name: from, subject, body });
      toast(`Mail sent to ${r.sent} players.`, 'success');
      setSubject(''); setBody('');
    } catch (e: any) { toast(e.message, 'error'); }
    finally { setSending(false); }
  }

  return (
    <>
      <div className="admin-toolbar"><h1>Broadcast Mail</h1></div>
      <div style={{ maxWidth: 720 }}>
        <p className="muted">Send a mail to every active player. Use to announce events, balance changes, or maintenance windows.</p>
        <div className="field">
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 4 }}>From</label>
          <input value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="field">
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 4 }}>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div className="field">
          <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)', marginBottom: 4 }}>Body</label>
          <textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="btn btn-primary" disabled={sending || !subject || !body} onClick={send}>
          {sending ? 'Sending…' : 'Send to All Players'}
        </button>
      </div>
    </>
  );
}

/* ===== Server info ===== */
function Server() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/admin/server').then(setData).catch(() => {}); }, []);
  if (!data) return <div className="muted">Loading…</div>;
  return (
    <>
      <div className="admin-toolbar"><h1>Server Information</h1></div>
      <div className="admin-stat-grid">
        <Stat label="Node version" num={data.node as any} />
        <div className="admin-stat"><div className="label">Uptime</div><div className="num">{Math.floor(data.uptime_sec / 3600)}h {Math.floor((data.uptime_sec % 3600) / 60)}m</div></div>
        <Stat label="Memory (MB)" num={data.memory_mb} />
        <div className="admin-stat"><div className="label">Environment</div><div className="num">{data.env}</div></div>
        <Stat label="PID" num={data.pid} />
      </div>
    </>
  );
}
