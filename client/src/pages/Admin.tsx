import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { IconChart, IconBag, IconSkull, IconScroll, IconUser, IconMail, IconCog, IconBolt, IconTrash, IconCrown, IconStar } from '../lib/icons';
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
        <NavLink to="/admin/marketplace" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconBag size={16} /> <span>Marketplace</span>
        </NavLink>
        <NavLink to="/admin/guilds" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconCrown size={16} /> <span>Guilds</span>
        </NavLink>
        <NavLink to="/admin/tower" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconCrown size={16} /> <span>Tower</span>
        </NavLink>
        <NavLink to="/admin/bounties" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconSkull size={16} /> <span>Bounties</span>
        </NavLink>
        <NavLink to="/admin/battlepass" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconStar size={16} /> <span>Battle Pass</span>
        </NavLink>
        <NavLink to="/admin/trial-purchases" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconStar size={16} /> <span>Trial Cache</span>
        </NavLink>
        <NavLink to="/admin/settings" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconCog size={16} /> <span>Game Settings</span>
        </NavLink>
        <NavLink to="/admin/logs" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconChart size={16} /> <span>Event Logs</span>
        </NavLink>
        <NavLink to="/admin/webhooks" className={({ isActive }) => isActive ? 'active' : ''}>
          <IconBolt size={16} /> <span>Webhooks</span>
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
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="guilds" element={<GuildsAdmin />} />
        <Route path="tower" element={<TowerAdmin />} />
        <Route path="bounties" element={<BountiesAdmin />} />
        <Route path="battlepass" element={<BattlePassAdmin />} />
        <Route path="trial-purchases" element={<TrialCacheAdmin />} />
        <Route path="settings" element={<GameSettings />} />
        <Route path="logs" element={<EventLogs />} />
        <Route path="webhooks" element={<Webhooks />} />
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
          <tr><th>User</th><th>Email</th><th>IP / Country</th><th>Character</th><th>Lv</th><th>Gold · Gems</th><th>ELO</th><th>Last seen</th><th>Admin</th><th></th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong></td>
              <td className="muted">{u.email}</td>
              <td className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                {u.last_ip || '—'}
                {u.last_country ? <span className="tag" style={{ marginLeft: 6 }}>{u.last_country}</span> : null}
              </td>
              <td>{u.char_name || '—'} <span className="muted" style={{ textTransform: 'capitalize' }}>{u.char_class || ''}</span></td>
              <td>{u.char_level || '—'}</td>
              <td className="gold" style={{ fontFamily: 'var(--font-mono)' }}>{u.gold?.toLocaleString() || '—'} · <span style={{ color: 'var(--amethyst-1)' }}>{u.gems?.toLocaleString() || 0}</span></td>
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
/* ===== Game Settings ===== */
function GameSettings() {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState<Record<string, any>>({});

  async function load() {
    try {
      const r = await api.get('/admin/settings');
      setRows(r.settings);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function save(key: string) {
    try {
      const value = draft[key];
      await api.put(`/admin/settings/${key}`, { value });
      toast(`${key} updated.`, 'success');
      setDraft((d) => { const { [key]: _, ...rest } = d; return rest; });
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  const groups = Array.from(new Set(rows.map((r) => r.def.group)));

  return (
    <>
      <div className="admin-toolbar"><h1>Game Settings</h1></div>
      <p className="muted" style={{ marginBottom: 18 }}>
        Tunable runtime knobs — changes take effect immediately on the next request.
      </p>
      {groups.map((g) => (
        <div key={g} style={{ marginBottom: 28 }}>
          <h3 style={{ color: 'var(--gold-1)', textTransform: 'capitalize', marginBottom: 10 }}>{g}</h3>
          <table className="admin-table">
            <thead>
              <tr><th>Setting</th><th>Value</th><th>Default</th><th></th></tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.def.group === g).map((r) => {
                const editing = draft[r.def.key] !== undefined;
                const current = editing ? draft[r.def.key] : r.value;
                return (
                  <tr key={r.def.key}>
                    <td>
                      <strong>{r.def.label}</strong>
                      <div className="muted text-sm">{r.def.description}</div>
                      <code style={{ fontSize: 11, color: 'var(--text-4)' }}>{r.def.key}</code>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      {r.def.type === 'bool' ? (
                        <select
                          value={String(current)}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.def.key]: e.target.value === 'true' }))}
                          style={{ width: '100%' }}
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={r.def.type === 'string' ? 'text' : 'number'}
                          value={String(current)}
                          onChange={(e) => setDraft((d) => ({ ...d, [r.def.key]: e.target.value }))}
                          style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                        />
                      )}
                    </td>
                    <td className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                      {String(r.def.default)}{r.isDefault ? <span className="tag" style={{ marginLeft: 6 }}>using default</span> : null}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!editing}
                        onClick={() => save(r.def.key)}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

/* ===== Marketplace admin ===== */
function Marketplace() {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    try {
      const r = await api.get('/admin/marketplace');
      setRows(r.listings);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function destroy(id: number) {
    if (!confirm('Cancel this listing?')) return;
    try {
      await api.delete(`/admin/marketplace/${id}`);
      toast('Listing cancelled.', 'info');
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="admin-toolbar"><h1>Marketplace <span className="muted" style={{ fontSize: 14 }}>({rows.length})</span></h1></div>
      <table className="admin-table">
        <thead>
          <tr><th>Item</th><th>Seller</th><th>Buyer</th><th>Price</th><th>Status</th><th>Listed</th><th>Sold</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td><strong className={`rarity-${m.rarity}`}>{m.item_name}</strong></td>
              <td className="muted">{m.seller_name}</td>
              <td className="muted">{m.buyer_name || '—'}</td>
              <td className="gold" style={{ fontFamily: 'var(--font-mono)' }}>{m.price_gold.toLocaleString()}g</td>
              <td><span className={`tag ${m.status === 'active' ? 'gold' : m.status === 'sold' ? 'emerald' : 'crimson'}`}>{m.status}</span></td>
              <td className="muted text-sm">{new Date(m.listed_at).toLocaleDateString()}</td>
              <td className="muted text-sm">{m.sold_at ? new Date(m.sold_at).toLocaleDateString() : '—'}</td>
              <td>
                {m.status === 'active' && (
                  <button className="btn btn-sm btn-danger" onClick={() => destroy(m.id)}>Cancel</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ===== Event Logs ===== */
function EventLogs() {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load() {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (level) params.set('level', level);
    try {
      const r = await api.get(`/admin/logs?${params.toString()}`);
      setRows(r.logs);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, [category, level]);

  return (
    <>
      <div className="admin-toolbar">
        <h1>Event Logs <span className="muted" style={{ fontSize: 14 }}>({rows.length})</span></h1>
        <div className="flex gap-sm">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {['auth','character','combat','inventory','market','guild','payment','admin','daily','wheel','achievement','camp','system','security'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All levels</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
            <option value="debug">debug</option>
          </select>
          <button className="btn btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>
      <table className="admin-table">
        <thead>
          <tr><th>Time</th><th>Level</th><th>Category · Action</th><th>User</th><th>IP / Country</th><th>Message</th><th>WH</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <React.Fragment key={r.id}>
              <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{new Date(r.ts).toLocaleTimeString()}</td>
                <td>
                  <span className={`tag ${r.level === 'error' ? 'crimson' : r.level === 'warn' ? 'gold' : r.level === 'debug' ? '' : 'emerald'}`}>
                    {r.level}
                  </span>
                </td>
                <td><strong>{r.category}.{r.action}</strong></td>
                <td className="muted">{r.user_id ?? '—'}</td>
                <td className="muted text-sm" style={{ fontFamily: 'var(--font-mono)' }}>
                  {r.ip || '—'}{r.country ? <span className="tag" style={{ marginLeft: 4 }}>{r.country}</span> : null}
                </td>
                <td className="muted">{r.message}</td>
                <td>{r.webhook_sent ? <span className="tag emerald">✓</span> : <span className="muted text-sm">—</span>}</td>
              </tr>
              {expanded === r.id && r.meta_json && r.meta_json !== '{}' && (
                <tr><td colSpan={7} style={{ background: 'var(--bg-1)' }}>
                  <pre style={{ margin: 0, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(JSON.parse(r.meta_json), null, 2)}
                  </pre>
                </td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ===== Webhook endpoints ===== */
function Webhooks() {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  const [draft, setDraft] = useState({ url: '', secret: '', category_filter: '*', enabled: true });

  async function load() {
    try { setRows((await api.get('/admin/webhooks')).webhooks); }
    catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function add() {
    try {
      await api.post('/admin/webhooks', draft);
      toast('Webhook added.', 'success');
      setDraft({ url: '', secret: '', category_filter: '*', enabled: true });
      load();
    } catch (e: any) { toast(e.message, 'error'); }
  }
  async function del(id: number) {
    if (!confirm('Delete this webhook endpoint?')) return;
    try { await api.delete(`/admin/webhooks/${id}`); load(); }
    catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="admin-toolbar"><h1>Webhook Endpoints <span className="muted" style={{ fontSize: 14 }}>({rows.length})</span></h1></div>
      <p className="muted" style={{ marginBottom: 14 }}>
        Every event posts <code>POST {'<url>'}</code> with the full log JSON. Filter by category (e.g. <code>payment,admin</code>) or use <code>*</code> for all. If a secret is set, requests carry <code>X-Signature: sha256={'<hmac>'}</code>.
      </p>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="field-grid">
          <div className="field"><label>URL</label><input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://example.com/hooks/nexus" style={{ width: '100%' }} /></div>
          <div className="field"><label>Secret (optional)</label><input value={draft.secret} onChange={(e) => setDraft({ ...draft, secret: e.target.value })} placeholder="HMAC signing secret" style={{ width: '100%' }} /></div>
        </div>
        <div className="field-grid">
          <div className="field"><label>Category filter</label><input value={draft.category_filter} onChange={(e) => setDraft({ ...draft, category_filter: e.target.value })} placeholder="* or auth,payment,combat" style={{ width: '100%' }} /></div>
          <div className="field"><label>Enabled</label>
            <select value={draft.enabled ? 'true' : 'false'} onChange={(e) => setDraft({ ...draft, enabled: e.target.value === 'true' })} style={{ width: '100%' }}>
              <option value="true">Yes</option><option value="false">No</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" disabled={!draft.url.startsWith('http')} onClick={add}>Add Endpoint</button>
      </div>
      <table className="admin-table">
        <thead><tr><th>URL</th><th>Filter</th><th>Status</th><th>Last call</th><th>Failures</th><th></th></tr></thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id}>
              <td><code style={{ fontSize: 11 }}>{w.url}</code></td>
              <td><span className="tag">{w.category_filter}</span></td>
              <td>{w.enabled ? <span className="tag emerald">on</span> : <span className="tag">off</span>} {w.last_status ? <span className="muted text-sm" style={{ marginLeft: 6 }}>{w.last_status}</span> : null}</td>
              <td className="muted text-sm">{w.last_called_at ? new Date(w.last_called_at).toLocaleString() : '—'}</td>
              <td className="muted text-sm">{w.failures}</td>
              <td><button className="btn btn-sm btn-danger" onClick={() => del(w.id)}><IconTrash size={12} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

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

/* =====================================================================
   Guilds admin — edit per-track levels
   ===================================================================== */
function GuildsAdmin(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);

  async function load() {
    try { setRows((await api.get('/admin/guilds')).guilds); } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!edit) return;
    try {
      await api.put(`/admin/guilds/${edit.id}`, {
        attr_level: edit.attr_level,
        power_level: edit.power_level,
        defence_level: edit.defence_level,
        exp_bonus_level: edit.exp_bonus_level,
        gold_bonus_level: edit.gold_bonus_level,
        gold_level: edit.gold_level,
        xp: edit.xp,
        gold: edit.gold,
      });
      toast('Updated', 'success');
      setEdit(null);
      await load();
    } catch (e: any) { toast(e.message, 'error'); }
  }

  return (
    <>
      <h2>Guilds <span className="muted">({rows.length})</span></h2>
      <table className="data-table">
        <thead><tr><th>Name</th><th>Tag</th><th>Members</th><th>XP</th><th>Treasury</th><th>Tracks</th><th></th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              <td>{g.name}</td>
              <td className="muted">[{g.tag}]</td>
              <td>{g.member_count} / {g.slots_tier === 1 ? 10 : g.slots_tier === 2 ? 15 : g.slots_tier === 3 ? 20 : g.slots_tier === 4 ? 25 : 30}</td>
              <td>{g.xp.toLocaleString()}</td>
              <td>{g.gold.toLocaleString()}g</td>
              <td className="muted" style={{ fontFamily: 'var(--font-mono)' }}>
                B{g.attr_level} P{g.power_level} D{g.defence_level} S{g.exp_bonus_level} M{g.gold_bonus_level} V{g.gold_level}
              </td>
              <td><button className="btn btn-sm" onClick={() => setEdit({ ...g })}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <div className="modal-backdrop" onClick={() => setEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit {edit.name}</h3>
            {([
              ['attr_level', 'Bloodlines (attr) 0..100'],
              ['power_level', 'Guild Power 0..100'],
              ['defence_level', 'Guild Defence 0..100'],
              ['exp_bonus_level', 'Scholarship (XP) 0..100'],
              ['gold_bonus_level', 'Merchant Charter (gold) 0..100'],
              ['gold_level', 'Strongroom (protected gold) 0..100'],
              ['xp', 'Guild XP pool'],
              ['gold', 'Treasury gold'],
            ] as [string, string][]).map(([key, label]) => (
              <label key={key} style={{ display: 'block', marginBottom: 8 }}>
                <div className="muted text-sm">{label}</div>
                <input type="number" value={edit[key]} onChange={(e) => setEdit({ ...edit, [key]: Number(e.target.value) })} />
              </label>
            ))}
            <div className="flex gap-sm" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={save}>Save</button>
              <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* =====================================================================
   Tower admin — leaderboard + reset run
   ===================================================================== */
function TowerAdmin(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    try { setRows((await api.get('/admin/tower')).climbers); } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);
  async function resetRun(id: number) {
    if (!confirm('Reset this hero\'s current Tower run?')) return;
    try { await api.post(`/admin/tower/reset/${id}`); toast('Reset', 'success'); await load(); } catch (e: any) { toast(e.message, 'error'); }
  }
  return (
    <>
      <h2>Tower of Trials <span className="muted">({rows.length} climbers)</span></h2>
      <table className="data-table">
        <thead><tr><th>Hero</th><th>Class</th><th>Lv</th><th>Best floor</th><th>Current run</th><th>Tokens</th><th>Wards</th><th></th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="muted">{c.class}</td>
              <td>{c.level}</td>
              <td style={{ color: 'var(--gold-1)', fontFamily: 'var(--font-mono)' }}>F{c.tower_best_floor}</td>
              <td>F{c.tower_current_floor}</td>
              <td>{c.trial_tokens}</td>
              <td>{c.forge_guarantees}</td>
              <td><button className="btn btn-sm" onClick={() => resetRun(c.id)}>Reset run</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* =====================================================================
   Bounties admin — recent boards + force-clear (regenerates next call)
   ===================================================================== */
function BountiesAdmin(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    try { setRows((await api.get('/admin/bounties')).rows); } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, []);
  async function clearFor(id: number) {
    if (!confirm('Clear all stored bounties for this hero? Next /bounties call will regenerate.')) return;
    try { await api.post(`/admin/bounties/clear/${id}`); toast('Cleared', 'success'); await load(); } catch (e: any) { toast(e.message, 'error'); }
  }
  return (
    <>
      <h2>Bounty Board <span className="muted">({rows.length} records)</span></h2>
      <table className="data-table">
        <thead><tr><th>Hero</th><th>Day</th><th>Bounties</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const bs = JSON.parse(r.bounties_json || '[]');
            return (
              <tr key={i}>
                <td>{r.character_name}</td>
                <td className="muted">{new Date(r.day_index * 86_400_000).toISOString().slice(0, 10)}</td>
                <td className="muted" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  {bs.map((b: any) => `${b.tier}:${b.monster_slug}(${b.count_done}/${b.count_required})${b.claimed ? '✓' : ''}`).join(' · ')}
                </td>
                <td><button className="btn btn-sm" onClick={() => clearFor(r.character_id)}>Clear</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/* =====================================================================
   Battle Pass admin — passes per month, force-unlock premium
   ===================================================================== */
function BattlePassAdmin(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  const [monthFilter, setMonthFilter] = useState<string>('');
  async function load() {
    try {
      const r = await api.get(`/admin/battlepass${monthFilter ? `?month=${monthFilter}` : ''}`);
      setRows(r.rows);
    } catch (e: any) { toast(e.message, 'error'); }
  }
  useEffect(() => { load(); }, [monthFilter]);
  async function unlock(charId: number, month: string) {
    try { await api.post(`/admin/battlepass/unlock-premium/${charId}`, { month }); toast('Unlocked', 'success'); await load(); } catch (e: any) { toast(e.message, 'error'); }
  }
  return (
    <>
      <h2>Battle Pass <span className="muted">({rows.length} passes)</span></h2>
      <div className="flex gap-sm" style={{ marginBottom: 12 }}>
        <input placeholder="2026-05" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        <button className="btn btn-sm" onClick={load}>Filter</button>
      </div>
      <table className="data-table">
        <thead><tr><th>Hero</th><th>Month</th><th>Premium</th><th>Completed</th><th></th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const progress = JSON.parse(r.progress_json || '{}');
            const completed = Object.keys(progress).length;
            return (
              <tr key={i}>
                <td>{r.character_name}</td>
                <td className="muted" style={{ fontFamily: 'var(--font-mono)' }}>{r.month_key}</td>
                <td>{r.premium_unlocked ? <span className="tag gold">★ premium</span> : <span className="tag">free</span>}</td>
                <td>{completed} / 50</td>
                <td>{!r.premium_unlocked && <button className="btn btn-sm" onClick={() => unlock(r.character_id, r.month_key)}>Force premium</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/* =====================================================================
   Trial Cache — recent purchases
   ===================================================================== */
function TrialCacheAdmin(): React.ReactElement {
  const toast = useStore((s) => s.toast);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { (async () => {
    try { setRows((await api.get('/admin/trial-purchases')).rows); } catch (e: any) { toast(e.message, 'error'); }
  })(); }, []);
  return (
    <>
      <h2>Trial Cache Purchases <span className="muted">({rows.length})</span></h2>
      <table className="data-table">
        <thead><tr><th>Hero</th><th>Slug</th><th>Bought at</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.character_name}</td>
              <td className="muted" style={{ fontFamily: 'var(--font-mono)' }}>{r.slug}</td>
              <td className="muted">{new Date(r.bought_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
