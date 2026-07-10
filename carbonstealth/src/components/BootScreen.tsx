// Кратък BIOS-boot екран, докато данните се заредят (терминална естетика).
export default function BootScreen(): React.JSX.Element {
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
        gap: 16,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 900,
          fontSize: 'clamp(3rem, 12vw, 8rem)',
          color: 'var(--cyan)',
          letterSpacing: '-.05em',
          textShadow: '0 0 40px rgba(0,229,255,.3)',
        }}
      >
        CS
      </div>
      <div className="cs-hud" style={{ display: 'flex', gap: 6 }}>
        <span style={{ animation: 'cs-blink 1s infinite' }}>●</span>
        BOOTING CARBON STEALTH CORE...
      </div>
    </div>
  );
}
