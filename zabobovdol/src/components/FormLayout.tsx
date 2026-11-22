// Оформлението около публичните форми (сървърни части, без състояние):
//  • FormLayout — на компютър формата вляво и колона „Какво следва“ вдясно
//    (вместо форма на 2/3 от ширината и празно място); на телефон колоната
//    е след формата — или преди нея с `asideFirst`, когато в нея е това, на
//    което се основава съгласието (напр. „Какво публикуваме“ при некролозите);
//  • NextSteps — кратките стъпки след изпращане (получаваме → преглеждаме →
//    публикуваме), за да знае човек какво да очаква.
import type { ReactNode } from "react";

export function FormLayout({
  children,
  aside,
  asideFirst = false,
  className = "",
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** На телефон колоната е над формата (и първа за екранния четец). */
  asideFirst?: boolean;
  className?: string;
}) {
  if (!aside) return <div className={`max-w-3xl ${className}`}>{children}</div>;
  const grid = `grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start ${className}`;
  if (asideFirst) {
    // Редът в DOM следва реда на телефон; на компютър колоната отива вдясно.
    return (
      <div className={grid}>
        <aside className="min-w-0 space-y-4 lg:order-2">{aside}</aside>
        <div className="min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div className={grid}>
      <div className="min-w-0">{children}</div>
      <aside className="min-w-0 space-y-4">{aside}</aside>
    </div>
  );
}

export function NextSteps({
  title = "Какво следва",
  steps,
  children,
}: {
  title?: string;
  steps: ReactNode[];
  /** Допълнително под стъпките (срок, телефон). */
  children?: ReactNode;
}) {
  return (
    <section className="panel" aria-labelledby="sledva-title">
      <h2 id="sledva-title" className="h-card">
        {title}
      </h2>
      <ol role="list" className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="step-num">
              <span className="sr-only">Стъпка </span>
              {i + 1}
            </span>
            <span className="min-w-0 pt-1 text-base text-slate-700">{s}</span>
          </li>
        ))}
      </ol>
      {children && <div className="mt-4 border-t border-slate-200 pt-4 text-base text-slate-700">{children}</div>}
    </section>
  );
}
