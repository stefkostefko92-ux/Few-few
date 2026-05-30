import React from 'react';
import { Link } from 'react-router-dom';

export default function Help(): React.ReactElement {
  return (
    <div className="col" style={{ gap: 24 }}>
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">How to Play Nexus Dominion</h2>
          <div className="panel-subtitle">A short guide to your first hours in the realm.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <Step n={1} title="Read the quest board">
            Open <Link to="/app/quests">Quests</Link>. Each quest costs Energy and rewards XP and gold.
            Hover over a card to see its rewards, region, and minimum level.
          </Step>
          <Step n={2} title="Win the fight">
            Combat is server-authoritative and turn-based. Speed determines initiative; STR/INT/DEX shape your damage;
            CON expands your HP. Watch class-specific impact effects on every blow.
          </Step>
          <Step n={3} title="Spend points">
            Each level grants 3 stat points and 2 skill points. Visit <Link to="/app/character">Character</Link> to
            allocate them — train weapon skills that match your class for the strongest scaling.
          </Step>
          <Step n={4} title="Upgrade your gear">
            Loot drops from quests. Sell what you don't need and buy the rest from the
            <Link to="/app/shop"> Merchant</Link>. Equipment goes in 8 slots; rarer rarities glow.
          </Step>
          <Step n={5} title="Test your steel">
            When ready, enter the <Link to="/app/arena">Arena</Link>. ELO matchmaking pairs you against opponents your level.
            Rating climbs and falls based on outcomes.
          </Step>
          <Step n={6} title="Rest and recover">
            Energy slowly regenerates over time. If you're wounded, head to <Link to="/app/character">Character</Link>
            and click <strong>Rest</strong> to fully heal for 10 Energy.
          </Step>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Classes</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <ClassRow name="Warrior" desc="Sword & shield. High HP, steady damage, blocks more." />
          <ClassRow name="Ranger" desc="Bow. High dexterity, high crit, strikes first more often." />
          <ClassRow name="Mage" desc="Staff. Glass cannon. Highest top-end damage." />
          <ClassRow name="Rogue" desc="Dagger. Dodge and crit. Strikes from shadow." />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Combat Mechanics</h2>
        </div>
        <ul style={{ lineHeight: 1.8 }}>
          <li><strong>Initiative</strong>: higher speed (driven by DEX) acts first.</li>
          <li><strong>Damage</strong>: rolls between your <em>ATK_min</em> and <em>ATK_max</em>. Class-specific stat (STR/DEX/INT) adds the rest.</li>
          <li><strong>Critical hits</strong>: ×1.8 damage. Crit chance scales with DEX and weapon skill.</li>
          <li><strong>Defense</strong>: diminishing returns — <code>damage × 1 - DEF/(DEF+50)</code>.</li>
          <li><strong>Dodge</strong>: prevents a hit entirely. Scales with DEX and Stealth skill.</li>
          <li><strong>Block</strong>: occasional 60% damage reduction for shielded fighters.</li>
          <li><strong>Loss penalty</strong>: −10% gold, dropped to 1 HP (never killed permanently).</li>
        </ul>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Tips</h2>
        </div>
        <ul style={{ lineHeight: 1.8 }}>
          <li>Equip everything you can the moment you can — stat bonuses stack.</li>
          <li>Carry potions; they can save you mid-quest.</li>
          <li>Crit happens; bring more HP than you think you need.</li>
          <li>Rest before tougher quests; entering wounded is risky.</li>
          <li>The <Link to="/app/world">World Map</Link> shows where each region's level range lives.</li>
          <li>Past fights can be re-watched in <Link to="/app/history">Battle History</Link>.</li>
        </ul>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ position: 'relative', paddingLeft: 48 }}>
      <div style={{
        position: 'absolute',
        left: 14,
        top: 14,
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: 'linear-gradient(180deg, var(--gold-2), var(--gold-3))',
        color: '#181307',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        display: 'grid',
        placeItems: 'center',
        fontSize: 13,
      }}>{n}</div>
      <strong style={{ color: 'var(--gold-1)' }}>{title}</strong>
      <div className="muted text-sm" style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function ClassRow({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="card">
      <strong style={{ color: 'var(--gold-1)' }}>{name}</strong>
      <div className="muted text-sm" style={{ marginTop: 4 }}>{desc}</div>
    </div>
  );
}
