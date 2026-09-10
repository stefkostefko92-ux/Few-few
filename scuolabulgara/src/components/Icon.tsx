// Illustrated brand icons (Bulgarian folk motifs), served as WebP from
// /public/assets/img/icons. They are decorative: every one sits next to its own
// text label, so alt is empty and screen readers skip them.
//
// Functional glyphs (check, arrows, chevrons, send) deliberately stay inline
// SVG elsewhere — they sit on coloured buttons and must follow `currentColor`,
// which a fixed-colour raster cannot do.
export default function Icon({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={`/assets/img/icons/${name}.webp`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
