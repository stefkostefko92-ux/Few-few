/* eslint-disable @next/next/no-img-element */

// Официалното лого на ФК „Миньор“ Бобов дол (емблема „Миньор 2019“).
// Едно място за герба — използва се в хедъра, футъра, заглавните ленти и др.
// Запазва пропорциите си; контролирайте размера чрез височина в className
// (напр. „h-12 w-auto").

export function Crest({
  className,
  title = "Герб на ФК „Миньор“ Бобов дол",
  decorative = false,
  priority = false,
}: {
  className?: string;
  title?: string;
  // Декоративен (воден знак) — скрит за екранни четци.
  decorative?: boolean;
  // За LCP елемента (голямото лого в героя) — зарежда се с приоритет.
  priority?: boolean;
}) {
  return (
    <img
      src="/logo.png"
      width={620}
      height={620}
      className={className}
      alt={decorative ? "" : title}
      aria-hidden={decorative || undefined}
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
    />
  );
}
