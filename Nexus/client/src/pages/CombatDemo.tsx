import React, { useEffect, useRef, useState } from 'react';
import CombatScene3D from '../combat/CombatScene3D';

/**
 * Standalone visual harness for the HD combat pipeline. Mounts the 3D
 * scene with mock fighters and auto-fires a scripted attack timeline so
 * screenshots can be captured at predictable moments without needing
 * auth, character creation, or a real fight roll.
 *
 * Reached only via /demo/combat — not linked from the UI.
 */
export default function CombatDemo(): React.ReactElement {
  const sceneRef = useRef<any>(null);
  const [phase, setPhase] = useState('idle');
  const [region, setRegion] = useState('whispering_woods');
  // Mock live HUD so the floating health bars show in the demo. The
  // puppeteer harness can drive these via window.__combatDemo.setHp.
  const [heroHp, setHeroHp] = useState(72);
  const [foeHp, setFoeHp] = useState(41);

  useEffect(() => {
    // Expose manual triggers on window so the puppeteer harness can fire
    // each beat under its own timing instead of racing the demo's auto-
    // schedule. In a regular browser session the buttons in the toolbar
    // below cover the same surface area.
    (window as any).__combatDemo = {
      attack: (opts: any) => sceneRef.current?.attack(opts),
      defeat: (side: 'hero' | 'foe') => sceneRef.current?.defeat(side),
      reset: () => sceneRef.current?.resetCamera(),
      setHp: (hero: number, foe: number) => { setHeroHp(hero); setFoeHp(foe); },
      setPhase,
    };
    return () => { delete (window as any).__combatDemo; };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'fixed', inset: 0, background: '#05060a' }}>
      <CombatScene3D
        ref={sceneRef}
        heroClass="warrior"
        foeClass="mage"
        region={region}
        heroHud={{ name: 'Aldric', level: 24, hpPct: heroHp, ghostPct: Math.min(100, heroHp + 12), hp: Math.round(heroHp * 4.8), hpMax: 480 }}
        foeHud={{ name: 'Witchling', level: 22, hpPct: foeHp, ghostPct: Math.min(100, foeHp + 18), hp: Math.round(foeHp * 4.1), hpMax: 410 }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          left: 12,
          display: 'flex',
          gap: 8,
          padding: 8,
          background: 'rgba(11,13,18,.85)',
          border: '1px solid rgba(214,161,61,.4)',
          borderRadius: 8,
          color: 'var(--text-1)',
          fontSize: 12,
          zIndex: 1000,
        }}
      >
        <span style={{ color: '#d6a13d', fontWeight: 600 }}>Combat HD demo</span>
        <span>phase: <code>{phase}</code></span>
        <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ marginLeft: 8 }}>
          <optgroup label="Act 1">
            <option value="whispering_woods">Whispering Woods</option>
            <option value="mistmoor_hills">Mistmoor Hills</option>
            <option value="crystal_caverns">Crystal Caverns</option>
            <option value="ashen_wastes">Ashen Wastes</option>
            <option value="shadowfell">Shadowfell</option>
          </optgroup>
          <optgroup label="Mid-tier">
            <option value="emberreach">Emberreach</option>
            <option value="hammerhand_pass">Hammerhand Pass</option>
            <option value="conclave_aedric">Conclave of Aedric</option>
            <option value="saltmarsh">Saltmarsh</option>
            <option value="frostvale">Frostvale</option>
            <option value="black_spire">Black Spire</option>
          </optgroup>
          <optgroup label="Divine">
            <option value="stormpeaks">The Stormpeaks</option>
            <option value="voidshade_hollow">Voidshade Hollow</option>
            <option value="mooncradle">Mooncradle</option>
            <option value="worldspine">The Worldspine</option>
            <option value="eternal_throne">The Eternal Throne</option>
          </optgroup>
        </select>
      </div>
    </div>
  );
}
