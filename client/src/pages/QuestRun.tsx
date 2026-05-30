import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { Quest, QuestResult } from '../lib/types';
import CombatScene from '../combat/CombatScene';

export default function QuestRun({ quest, onDone }: { quest: Quest; onDone: () => void }): React.ReactElement {
  const refresh = useStore((s) => s.refreshCharacter);
  const toast = useStore((s) => s.toast);
  const showUnlocks = useStore((s) => s.showUnlocks);
  const [stage, setStage] = useState<'intro' | 'fetching' | 'combat' | 'story' | 'error'>('intro');
  const [result, setResult] = useState<QuestResult | null>(null);
  const [err, setErr] = useState('');

  async function begin() {
    setStage('fetching');
    try {
      const r = (await api.post('/quest/start', { questSlug: quest.slug })) as QuestResult;
      setResult(r);
      if (r.levelUp?.leveled) {
        toast(`Level Up! ${r.levelUp.fromLevel} → ${r.levelUp.toLevel}`, 'success');
      }
      showUnlocks((r as any).unlocked);
      await refresh();
      setStage(r.kind === 'combat' ? 'combat' : 'story');
    } catch (e: any) {
      setErr(e.message);
      setStage('error');
    }
  }

  useEffect(() => {
    // Auto-begin on mount
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === 'fetching') {
    return (
      <div className="panel">
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div className="muted" style={{ fontStyle: 'italic' }}>
            The road unwinds before you…
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="panel">
        <h2 className="panel-title">Cannot Embark</h2>
        <div className="muted" style={{ marginTop: 8 }}>{err}</div>
        <button className="btn" style={{ marginTop: 16 }} onClick={onDone}>Back</button>
      </div>
    );
  }

  if (stage === 'story' && result) {
    return (
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{quest.title}</h2>
          <span className={`tag ${result.success ? 'emerald' : 'crimson'}`}>{result.success ? 'success' : 'partial'}</span>
        </div>
        <p style={{ fontStyle: 'italic' }}>{result.narrative}</p>
        <div className="panel-divider" />
        <p>{result.resultText}</p>
        <div className="reward-row" style={{ marginTop: 16, justifyContent: 'flex-start' }}>
          {!!result.xp && <span className="reward-pill xp">+{result.xp} XP</span>}
          {!!result.gold && <span className="reward-pill gold">+{result.gold} gold</span>}
        </div>
        <div style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={onDone}>Continue</button>
        </div>
      </div>
    );
  }

  if (stage === 'combat' && result && result.hero && result.foe && result.rounds) {
    return (
      <div className="col" style={{ gap: 16 }}>
        <div className="panel" style={{ padding: 18 }}>
          <h2 className="panel-title">{quest.title}</h2>
          <p style={{ fontStyle: 'italic', marginTop: 6 }}>{result.intro || quest.intro}</p>
          <p style={{ marginTop: 6 }}>{result.narrative || quest.narrative}</p>
        </div>
        <CombatScene
          hero={result.hero}
          foe={result.foe}
          rounds={result.rounds}
          victory={result.success}
          reward={{ xp: result.xp, gold: result.gold, itemReward: result.itemReward }}
          onClose={onDone}
          introTitle={`${result.hero.name}  vs  ${result.foe.name}`}
          region={quest.region}
        />
        <div className="panel" style={{ padding: 18 }}>
          <p>{result.resultText}</p>
        </div>
      </div>
    );
  }

  // Initial intro (briefly visible before fetch starts)
  return (
    <div className="panel">
      <h2 className="panel-title">{quest.title}</h2>
      <p style={{ fontStyle: 'italic', marginTop: 6 }}>{quest.intro}</p>
      <p style={{ marginTop: 6 }}>{quest.narrative}</p>
    </div>
  );
}
