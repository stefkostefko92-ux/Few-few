// Не „Route.tsx“: на файлова система без главни/малки букви Next би го приел
// за route handler („route.tsx“) до page.tsx.
/**
 * Маршрутът „Бобов дол → Дупница“ в един формат навсякъде (списък, H1, трохи):
 * стрелката е за окото, четецът чува „Бобов дол до Дупница“.
 */
export function Route({ from, to }: { from: string; to: string }) {
  return (
    <>
      {from} <span aria-hidden="true">→</span>
      <span className="sr-only">до</span> {to}
    </>
  );
}

/** Същият маршрут като обикновен текст — за <title>, описание и споделяне. */
export function routeText(from: string, to: string): string {
  return `от ${from} до ${to}`;
}
