import { qrPath, type QrEcc } from "@/lib/qr-svg";

// QR код, нарисуван на сървъра като SVG (без снимка и без външна услуга).
// Цветовете са вградени (бяло поле, черни модули), а не Tailwind класове —
// така тъмният режим не обръща кода и той остава четим и на екран, и на хартия.
export function QrCode({
  value,
  label,
  size = 224,
  ecc = "Q",
  className = "",
}: {
  /** Пълният адрес, който кодът отваря. */
  value: string;
  /** Описание за екранен четец, напр. „QR код към дежурната аптека“. */
  label: string;
  /** Размер в пиксели на екран. */
  size?: number;
  ecc?: QrEcc;
  className?: string;
}) {
  const { size: n, d } = qrPath(value, { ecc });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <title>{label}</title>
      <rect width={n} height={n} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
