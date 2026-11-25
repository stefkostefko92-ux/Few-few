import Link from 'next/link';

// Обща рамка за публичните страници-инструменти и сравненията — в света на
// лендинга (LxPage я обвива): стикер, огромно заглавие, работна повърхност
// с розова сянка и лайм лента с CTA към регистрацията.
export function ToolPage({
  eyebrow,
  title,
  intro,
  children,
  cta,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
  cta: { title: string; text: string; href: string; label: string };
}) {
  return (
    <main id="main">
      <section className="lx-wrap lx-tool-hero">
        <p className="lx-sticker">{eyebrow}</p>
        <h1 className="lx-display lx-tool-h1">{title}</h1>
        <p className="lx-tool-intro">{intro}</p>
      </section>
      <div className="lx-wrap lx-tool-body">
        <div className="lx-tool-card">{children}</div>
      </div>
      <section className="lx-tool-cta">
        <div className="lx-wrap">
          <h2 className="lx-display">{cta.title}</h2>
          <p>{cta.text}</p>
          <Link href={cta.href} className="lx-btn lx-btn-ink" data-magnet>
            {cta.label}
          </Link>
        </div>
      </section>
    </main>
  );
}
