// WF-003 „HARDWARE BIOS BOOT" — кратък BIOS POST екран, докато данните се заредят.
// Показва РЕАЛНИ данни от Navigator API като хардуерен POST списък: CPU ядра, RAM,
// GPU (WEBGL_debug_renderer_info), дисплей, мрежа, батерия. Бърз (~1.5s), не блокира
// LCP — това е самият loader, разпада се веднага щом данните дойдат.
import { useEffect, useState } from 'react';

interface PostLine {
  label: string;
  value: string;
}

// Разчита GPU през WEBGL_debug_renderer_info; контекстът е за еднократно четене и се пуска.
function readGpu(): string {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'NO WEBGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const raw = ext
      ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    // подрежи дългите OEM низове
    return raw.replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 42).toUpperCase() || 'GPU';
  } catch {
    return 'GPU UNKNOWN';
  }
}

// Синхронните редове се четат веднага; батерията е async и се долепва щом резолвне.
function readSyncLines(): PostLine[] {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number };
  };
  const cores = nav.hardwareConcurrency ?? 0;
  const mem = typeof nav.deviceMemory === 'number' ? `${nav.deviceMemory} GB` : 'N/A';
  const net = nav.connection?.effectiveType?.toUpperCase() ?? 'ONLINE';
  const disp = `${screen.width}x${screen.height} @${window.devicePixelRatio || 1}X`;
  const lang = (navigator.language || 'en').toUpperCase();
  return [
    { label: 'CPU', value: cores ? `${cores} LOGICAL CORES` : 'DETECTED' },
    { label: 'GPU', value: readGpu() },
    { label: 'MEMORY', value: mem },
    { label: 'DISPLAY', value: disp },
    { label: 'NETWORK', value: net },
    { label: 'LOCALE', value: lang },
    { label: 'AUDIO', value: 'WEB AUDIO SYNTH' },
    { label: 'CORE', value: 'CARBON STEALTH VCC' },
  ];
}

export default function BootScreen(): React.JSX.Element {
  const [lines] = useState<PostLine[]>(readSyncLines);
  const [battery, setBattery] = useState<PostLine | null>(null);
  const [shown, setShown] = useState(0); // брой разкрити реда (POST стъпки)
  const total = lines.length + 1; // +1 за реда с батерията

  useEffect(() => {
    let alive = true;
    // Батерия (async, ако API е наличен) — долепя се като допълнителен POST ред.
    const navB = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    navB
      .getBattery?.()
      .then((b) => {
        if (alive) {
          setBattery({
            label: 'POWER',
            value: `${Math.round(b.level * 100)}%${b.charging ? ' CHG' : ''}`,
          });
        }
      })
      .catch(() => {
        /* API липсва — прескачаме реда */
      });

    // Разкриване ред по ред (~90ms) — целият POST < ~0.9s, не блокира.
    const iv = window.setInterval(() => {
      setShown((n) => {
        if (n >= total) {
          window.clearInterval(iv);
          return n;
        }
        return n + 1;
      });
    }, 90);

    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [total]);

  const allLines: PostLine[] = battery
    ? [...lines.slice(0, 6), battery, ...lines.slice(6)]
    : lines;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5000,
        flexDirection: 'column',
        gap: 20,
        padding: 24,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 'clamp(2.4rem, 9vw, 6rem)',
          color: 'var(--cyan)',
          letterSpacing: '-.05em',
          textShadow: '0 0 40px rgba(0,229,255,.3)',
          lineHeight: 1,
        }}
      >
        CS
      </div>

      {/* POST списък — реален хардуерен скан (WF-003) */}
      <div
        className="cs-hud"
        style={{
          width: 'min(420px, 90vw)',
          display: 'grid',
          gap: 4,
          textAlign: 'left',
        }}
      >
        {allLines.map((l, i) => (
          <div
            key={l.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              opacity: i < shown ? 1 : 0,
              transition: 'opacity .18s ease',
            }}
          >
            <span style={{ color: 'var(--placeholder)' }}>
              <span style={{ color: 'var(--green)' }}>[ OK ]</span> {l.label}
            </span>
            <span style={{ color: 'var(--text-2)' }}>{l.value}</span>
          </div>
        ))}
      </div>

      <div className="cs-hud" style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <span style={{ animation: 'cs-blink 1s infinite' }}>●</span>
        BOOTING CARBON STEALTH CORE...
      </div>
    </div>
  );
}
