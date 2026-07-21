// Украса на фона — слой ПОД съдържанието на листа. Ползва акцентния цвят.
// Чист CSS/SVG, без външни ресурси; печата се (print-color-adjust: exact).
// opacity/scale идват от персонализацията (resolveDecor) — множител върху
// естествената прозрачност и мащаб на всеки шаблон.

interface Props {
  decor: string | undefined;
  color: string;
  /** Множител върху естествената прозрачност (1 = без промяна). */
  opacity?: number;
  /** Мащаб на шаблона (1 = без промяна). */
  scale?: number;
}

export default function BackgroundDecor({ decor, color, opacity = 1, scale = 1 }: Props) {
  if (!decor || decor === "none") return null;

  const op = opacity;
  const sc = scale;
  const mm = (n: number) => `${+(n * sc).toFixed(3)}mm`;

  const base: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
  };

  switch (decor) {
    case "dots":
      return (
        <div style={{ ...base, backgroundImage: `radial-gradient(${color} 1.2px, transparent 1.2px)`, backgroundSize: `${mm(7)} ${mm(7)}`, opacity: 0.28 * op }} />
      );
    case "grid":
      return (
        <div style={{ ...base, backgroundImage: `linear-gradient(${color} 0.3mm, transparent 0.3mm), linear-gradient(90deg, ${color} 0.3mm, transparent 0.3mm)`, backgroundSize: `${mm(8)} ${mm(8)}`, opacity: 0.2 * op }} />
      );
    case "diagonal":
      return (
        <div style={{ ...base, backgroundImage: `repeating-linear-gradient(45deg, ${color} 0, ${color} 0.4mm, transparent 0.4mm, transparent ${mm(6)})`, opacity: 0.22 * op }} />
      );
    case "stripes":
      return (
        <div style={{ ...base, backgroundImage: `repeating-linear-gradient(0deg, ${color} 0, ${color} ${mm(3)}, transparent ${mm(3)}, transparent ${mm(9)})`, opacity: 0.14 * op }} />
      );
    case "confetti":
      return (
        <div style={{
          ...base, opacity: 0.5 * op,
          backgroundImage:
            `radial-gradient(circle, ${color} 1.6mm, transparent 1.7mm), radial-gradient(circle, ${color} 1mm, transparent 1.1mm)`,
          backgroundSize: `${mm(24)} ${mm(24)}, ${mm(18)} ${mm(18)}`,
          backgroundPosition: `0 0, ${mm(9)} ${mm(12)}`,
        }} />
      );
    case "gradient":
      // color-mix вместо слепен alpha — работи при 3/6/8-цифров custom цвят.
      return (
        <div style={{ ...base, opacity: op, background: `radial-gradient(circle at 50% 18%, color-mix(in srgb, ${color} 27%, transparent), transparent 60%)` }} />
      );
    case "corners": {
      const w = mm(22);
      const off = mm(6);
      const bw = mm(0.8);
      return (
        <div style={{ ...base, opacity: 0.7 * op }}>
          {([0, 1, 2, 3] as const).map((i) => (
            <div key={i} style={{
              position: "absolute",
              top: i < 2 ? off : "auto", bottom: i >= 2 ? off : "auto",
              left: i % 2 === 0 ? off : "auto", right: i % 2 === 1 ? off : "auto",
              width: w, height: w,
              borderTop: i < 2 ? `${bw} solid ${color}` : "none",
              borderBottom: i >= 2 ? `${bw} solid ${color}` : "none",
              borderLeft: i % 2 === 0 ? `${bw} solid ${color}` : "none",
              borderRight: i % 2 === 1 ? `${bw} solid ${color}` : "none",
            }} />
          ))}
        </div>
      );
    }
    case "frame":
      return (
        <div style={{ ...base, opacity: 0.8 * op }}>
          <div style={{ position: "absolute", inset: mm(5), border: `${mm(1)} solid ${color}` }} />
          <div style={{ position: "absolute", inset: mm(7.5), border: `0.3mm solid ${color}` }} />
        </div>
      );
    default:
      return null;
  }
}
