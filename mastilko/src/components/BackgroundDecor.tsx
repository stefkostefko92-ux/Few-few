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

  // SVG шаблон като data-URI (без външни ресурси); цветът се инжектира и
  // URL-кодира. backgroundSize в mm → печатната математика остава непокътната.
  const svg = (inner: string, w: number, h: number) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${inner}</svg>`,
    )}")`;

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
    case "waves":
      return (
        <div style={{
          ...base, opacity: 0.22 * op,
          backgroundImage: svg(`<path d='M0 6 Q10 0 20 6 T40 6' fill='none' stroke='${color}' stroke-width='1'/>`, 40, 12),
          backgroundSize: `${mm(20)} ${mm(6)}`,
        }} />
      );
    case "hearts":
      return (
        <div style={{
          ...base, opacity: 0.22 * op,
          backgroundImage: svg(`<path d='M10 17 L3.5 9.5 A4 4 0 0 1 10 5 A4 4 0 0 1 16.5 9.5 Z' fill='${color}'/>`, 20, 20),
          backgroundSize: `${mm(14)} ${mm(14)}`,
        }} />
      );
    case "stars":
      return (
        <div style={{
          ...base, opacity: 0.26 * op,
          backgroundImage: svg(`<path d='M10 1 l2.4 5.6 6 .5 -4.6 3.9 1.4 5.9 -5.2-3.2 -5.2 3.2 1.4-5.9 -4.6-3.9 6-.5z' fill='${color}'/>`, 20, 20),
          backgroundSize: `${mm(16)} ${mm(16)}`,
        }} />
      );
    case "fireworks":
      return (
        <div style={{
          ...base, opacity: 0.24 * op,
          backgroundImage: svg(
            `<g stroke='${color}' stroke-width='0.7' stroke-linecap='round'>` +
              [0, 45, 90, 135, 180, 225, 270, 315]
                .map((a) => {
                  const r = (a * Math.PI) / 180;
                  return `<line x1='15' y1='15' x2='${(15 + 11 * Math.cos(r)).toFixed(1)}' y2='${(15 + 11 * Math.sin(r)).toFixed(1)}'/>`;
                })
                .join("") +
              `</g>`,
            30, 30,
          ),
          backgroundSize: `${mm(26)} ${mm(26)}`,
        }} />
      );
    case "laurel":
      // Венец от лаврови клонки — центриран орнамент долу (не се тапицира).
      return (
        <div style={{
          ...base, opacity: 0.5 * op,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center 82%",
          backgroundSize: `${mm(80)} auto`,
          backgroundImage: svg(
            `<g fill='none' stroke='${color}' stroke-width='1.4'>` +
              `<path d='M50 78 Q26 74 16 52'/><path d='M50 78 Q74 74 84 52'/>` +
              `</g><g fill='${color}'>` +
              [0.15, 0.32, 0.49, 0.66, 0.83]
                .map((t) => {
                  const lx = 50 - t * 34 - 2, ly = 78 - Math.sin(t * 2.4) * 26 - t * 8;
                  const rx = 50 + t * 34 + 2, ry = ly;
                  return `<ellipse cx='${lx.toFixed(1)}' cy='${ly.toFixed(1)}' rx='4.2' ry='2' transform='rotate(-35 ${lx.toFixed(1)} ${ly.toFixed(1)})'/>` +
                    `<ellipse cx='${rx.toFixed(1)}' cy='${ry.toFixed(1)}' rx='4.2' ry='2' transform='rotate(35 ${rx.toFixed(1)} ${ry.toFixed(1)})'/>`;
                })
                .join("") +
              `</g>`,
            100, 90,
          ),
        }} />
      );
    case "texture":
      // Лек noise (feTurbulence) — ниска непрозрачност, за да не хаби мастило.
      return (
        <div style={{
          ...base, opacity: 0.06 * op,
          backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='120' height='120' filter='url(#n)'/></svg>`,
          )}")`,
          backgroundSize: `${mm(40)} ${mm(40)}`,
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
