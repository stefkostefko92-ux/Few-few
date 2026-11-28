// frontend/src/components/RasterIcon.jsx
// Икона от PNG маска — без SVG (правилото на собственика, 2026-11-04; docs/svg-migration.md).
// Цветът следва текста (`bg-current`), затова иконата светва в синьо в активния ред на менюто
// точно като останалите. Работи навсякъде, където се подава компонент с `className`.
export function maskIcon(src) {
  function MaskIcon({ className = "" }) {
    const mask = `url(${src})`;
    return (
      <span
        aria-hidden="true"
        className={`inline-block bg-current ${className}`}
        style={{
          WebkitMaskImage: mask, maskImage: mask,
          WebkitMaskSize: "contain", maskSize: "contain",
          WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
          WebkitMaskPosition: "center", maskPosition: "center",
        }}
      />
    );
  }
  return MaskIcon;
}

/** Резервни копия — капак, кутия и стрелка нагоре (public/icons/backup.png, 96×96). */
export const BackupIcon = maskIcon("/icons/backup.png");
