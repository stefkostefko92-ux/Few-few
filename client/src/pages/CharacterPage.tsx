import React, { useState } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { spriteFor } from '../combat/sprites';

const STATS = [
  { key: 'strength', label: 'Strength', desc: 'Raw melee damage.' },
  { key: 'dexterity', label: 'Dexterity', desc: 'Crit, dodge, ranged.' },
  { key: 'constitution', label: 'Constitution', desc: 'Health pool.' },
  { key: 'intelligence', label: 'Intelligence', desc: 'Spell power, mana.' },
  { key: 'wisdom', label: 'Wisdom', desc: 'Mana, resistance.' },
  { key: 'charisma', label: 'Charisma', desc: 'Better quest rewards.' },
] as const;

const SKILLS = [
  { key: 'skill_sword', label: 'Sword', api: 'sword' },
  { key: 'skill_axe', label: 'Axe', api: 'axe' },
  { key: 'skill_bow', label: 'Bow', api: 'bow' },
  { key: 'skill_staff', label: 'Staff', api: 'staff' },
  { key: 'skill_magic', label: 'Magic', api: 'magic' },
  { key: 'skill_stealth', label: 'Stealth', api: 'stealth' },
] as const;

export default function CharacterPage(): React.ReactElement {
  const char = useStore((s) => s.character);
  const refresh = useStore((s) => s.refreshCharacter);
  const toast = useStore((s) => s.toast);
  const [statPlan, setStatPlan] = useState<Record<string, number>>({});
  const [skillPlan, setSkillPlan] = useState<Record<string, number>>({});

  if (!char) return <div className="muted">Loading…</div>;

  const totalStat = Object.values(statPlan).reduce((a, b) => a + b, 0);
  const totalSkill = Object.values(skillPlan).reduce((a, b) => a + b, 0);

  function bumpStat(key: string, delta: number) {
    setStatPlan((p) => {
      const next = (p[key] || 0) + delta;
      if (next < 0) return p;
      if (totalStat + delta > (char?.stat_points ?? 0)) return p;
      return { ...p, [key]: next };
    });
  }

  function bumpSkill(key: string, delta: number) {
    setSkillPlan((p) => {
      const next = (p[key] || 0) + delta;
      if (next < 0) return p;
      if (totalSkill + delta > (char?.skill_points ?? 0)) return p;
      return { ...p, [key]: next };
    });
  }

  async function commitStats() {
    try {
      await api.post('/character/stats/spend', statPlan);
      setStatPlan({});
      await refresh();
      toast('Stats trained.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  async function commitSkills() {
    try {
      const body: Record<string, number> = {};
      for (const s of SKILLS) {
        const v = skillPlan[s.key];
        if (v) body[s.api] = v;
      }
      await api.post('/character/skills/spend', body);
      setSkillPlan({});
      await refresh();
      toast('Skills sharpened.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }
  async function rest() {
    try {
      await api.post('/character/rest', {});
      await refresh();
      toast('Wounds tended. HP & MP restored.', 'success');
    } catch (e: any) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Character</h2>
          <button className="btn" onClick={rest}>Rest (10 EN)</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 24 }}>
          <div className="portrait" style={{ width: 160, height: 200 }}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
              <div style={{ transform: 'scale(.82) translateY(-2%)' }}>{spriteFor(char.class)}</div>
            </div>
            <div className="badge-level">Lv {char.level}</div>
          </div>
          <div>
            <h1 style={{ color: 'var(--gold-1)' }}>{char.name}</h1>
            <div className="muted">{prettyClass(char.class)} · {char.wins}W / {char.losses}L · Rating {char.arena_rating}</div>
            <div className="panel-divider" />
            <div className="row">
              <div className="grow">
                <div className="flex between">
                  <h3>Attributes</h3>
                  <div className="muted text-sm">Available: <span className="gold">{char.stat_points - totalStat}</span></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {STATS.map((s) => {
                    const cur = (char as any)[s.key] as number;
                    const plus = statPlan[s.key] || 0;
                    return (
                      <div key={s.key} className="card" style={{ padding: 10 }}>
                        <div className="flex between" style={{ alignItems: 'center' }}>
                          <div>
                            <strong>{s.label}</strong>{' '}
                            <span className="value" style={{ fontFamily: 'var(--font-display)', color: 'var(--gold-1)' }}>{cur}</span>
                            {plus > 0 && <span className="emerald"> +{plus}</span>}
                            <div className="muted text-sm">{s.desc}</div>
                          </div>
                          <div className="flex gap-sm">
                            <button className="btn btn-sm" onClick={() => bumpStat(s.key, -1)} disabled={!plus}>−</button>
                            <button className="btn btn-sm btn-primary" onClick={() => bumpStat(s.key, +1)} disabled={totalStat >= char.stat_points}>+</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button className="btn btn-primary" onClick={commitStats} disabled={totalStat === 0}>
                    Commit ({totalStat})
                  </button>
                </div>
              </div>
              <div className="grow">
                <div className="flex between">
                  <h3>Skills</h3>
                  <div className="muted text-sm">Available: <span className="gold">{char.skill_points - totalSkill}</span></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {SKILLS.map((s) => {
                    const cur = (char as any)[s.key] as number;
                    const plus = skillPlan[s.key] || 0;
                    return (
                      <div key={s.key} className="card" style={{ padding: 10 }}>
                        <div className="flex between" style={{ alignItems: 'center' }}>
                          <div>
                            <strong>{s.label}</strong>{' '}
                            <span style={{ color: 'var(--gold-1)' }}>{cur}</span>
                            {plus > 0 && <span className="emerald"> +{plus}</span>}
                          </div>
                          <div className="flex gap-sm">
                            <button className="btn btn-sm" onClick={() => bumpSkill(s.key, -1)} disabled={!plus}>−</button>
                            <button className="btn btn-sm btn-primary" onClick={() => bumpSkill(s.key, +1)} disabled={totalSkill >= char.skill_points}>+</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button className="btn btn-primary" onClick={commitSkills} disabled={totalSkill === 0}>
                    Commit ({totalSkill})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function prettyClass(c: string) { return c[0].toUpperCase() + c.slice(1); }
