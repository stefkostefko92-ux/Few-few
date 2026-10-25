/**
 * Оценка като пет звезди — САМО визуално. Числото винаги стои като текст до
 * тях (там, където е и разкритието за непроверените оценки), затова звездите
 * са `aria-hidden`: прочетени на глас, пет „звезда“ не казват нищо повече.
 *
 * Дробната част се показва с изрязване по ширина, не със закръгляне: 4,4 и 4,6
 * не бива да изглеждат еднакво. Празните звезди са silver-600 (3,62:1 върху
 * ink-950 — над 3:1 за нетекстово съдържание по WCAG 1.4.11).
 */
const STAR =
  'M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.53L12 17.5l-5.87 3.07 1.12-6.53L2.5 9.41l6.56-.95z';

function Row({ size, className }: { size: number; className: string }) {
  return (
    <span className={`flex shrink-0 gap-0.5 ${className}`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg key={index} width={size} height={size} viewBox="0 0 24 24" className="shrink-0" fill="currentColor">
          <path d={STAR} />
        </svg>
      ))}
    </span>
  );
}

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const percent = Math.min(100, Math.max(0, (value / 5) * 100));
  return (
    <span aria-hidden="true" className="relative inline-flex align-middle">
      <Row size={size} className="text-silver-600" />
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${percent}%` }}>
        <Row size={size} className="text-cyan-300" />
      </span>
    </span>
  );
}
