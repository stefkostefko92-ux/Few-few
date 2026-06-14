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

  useEffect(() => {
    // Expose manual triggers on window so the puppeteer harness can fire
    // each beat under its own timing instead of racing the demo's auto-
    // schedule. In a regular browser session the buttons in the toolbar
    // below cover the same surface area.
    (window as any).__combatDemo = {
      attack: (opts: any) => sceneRef.current?.attack(opts),
      defeat: (side: 'hero' | 'foe') => sceneRef.current?.defeat(side),
      reset: () => sceneRef.current?.resetCamera(),
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
          <option value="whispering_woods">Whispering Woods</option>
          <option value="ashen_wastes">Ashen Wastes</option>
          <option value="shadowfell">Shadowfell</option>
          <option value="crystal_caverns">Crystal Caverns</option>
        </select>
      </div>
    </div>
  );
}
