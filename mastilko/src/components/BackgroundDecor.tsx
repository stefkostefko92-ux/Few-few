// Украса на фона — слой ПОД съдържанието на листа. Ползва акцентния цвят.
// Чист CSS/SVG, без външни ресурси; печата се (print-color-adjust: exact).

interface Props {
  decor: string | undefined;
  color: string;
}

export default function BackgroundDecor({ decor, color }: Props) {
  if (!decor || decor === "none") return null;

  const base: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    zIndex: 0,
  };

  switch (decor) {
    case "dots":
      return (
        <div style={{ ...base, backgroundImage: `radial-gradient(${color} 1.2px, transparent 1.2px)`, backgroundSize: "7mm 7mm", opacity: 0.28 }} />
      );
    case "grid":
      return (
        <div style={{ ...base, backgroundImage: `linear-gradient(${color} 0.3mm, transparent 0.3mm), linear-gradient(90deg, ${color} 0.3mm, transparent 0.3mm)`, backgroundSize: "8mm 8mm", opacity: 0.2 }} />
      );
    case "diagonal":
      return (
        <div style={{ ...base, backgroundImage: `repeating-linear-gradient(45deg, ${color} 0, ${color} 0.4mm, transparent 0.4mm, transparent 6mm)`, opacity: 0.22 }} />
      );
    case "stripes":
      return (
        <div style={{ ...base, backgroundImage: `repeating-linear-gradient(0deg, ${color} 0, ${color} 3mm, transparent 3mm, transparent 9mm)`, opacity: 0.14 }} />
      );
    case "confetti":
      return (
        <div style={{
          ...base, opacity: 0.5,
          backgroundImage:
            `radial-gradient(circle, ${color} 1.6mm, transparent 1.7mm), radial-gradient(circle, ${color} 1mm, transparent 1.1mm)`,
          backgroundSize: "24mm 24mm, 18mm 18mm",
          backgroundPosition: "0 0, 9mm 12mm",
        }} />
      );
    case "gradient":
      return (
        <div style={{ ...base, background: `radial-gradient(circle at 50% 18%, ${color}44, transparent 60%)` }} />
      );
    case "corners":
      return (
        <div style={base}>
          {([["6mm", "6mm", "0 0"], ["6mm", "auto", "0 0"], ["auto", "6mm", "0 0"], ["auto", "auto", "0 0"]] as const).map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              top: i < 2 ? "6mm" : "auto", bottom: i >= 2 ? "6mm" : "auto",
              left: i % 2 === 0 ? "6mm" : "auto", right: i % 2 === 1 ? "6mm" : "auto",
              width: "22mm", height: "22mm",
              borderTop: i < 2 ? `0.8mm solid ${color}` : "none",
              borderBottom: i >= 2 ? `0.8mm solid ${color}` : "none",
              borderLeft: i % 2 === 0 ? `0.8mm solid ${color}` : "none",
              borderRight: i % 2 === 1 ? `0.8mm solid ${color}` : "none",
              opacity: 0.7,
            }} />
          ))}
        </div>
      );
    case "frame":
      return (
        <div style={base}>
          <div style={{ position: "absolute", inset: "5mm", border: `1mm solid ${color}`, opacity: 0.8 }} />
          <div style={{ position: "absolute", inset: "7.5mm", border: `0.3mm solid ${color}`, opacity: 0.8 }} />
        </div>
      );
    default:
      return null;
  }
}
