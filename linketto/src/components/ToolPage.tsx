import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';

// Обща рамка за публичните страници-инструменти и сравненията: заглавие
// върху милиметровката, работна повърхност и спокойна CTA към регистрацията.
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
      <section className="relative isolate overflow-hidden border-b border-line">
        <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
        <div aria-hidden className="bg-glow absolute inset-0 -z-10" />
        <Container className="max-w-4xl py-14 sm:py-20">
          <Badge tone="accent">{eyebrow}</Badge>
          <h1 className="enter mt-5 max-w-3xl text-balance text-title text-fg">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-lead text-fg-muted">{intro}</p>
        </Container>
      </section>
      <Container className="max-w-4xl py-10 sm:py-14">
        <Card variant="raised" padding="lg">
          {children}
        </Card>
      </Container>
      <section className="border-t border-line bg-surface-2/50">
        <Container className="max-w-4xl py-14 sm:py-16">
          <h2 className="max-w-xl text-balance text-heading text-fg">{cta.title}</h2>
          <p className="mt-3 max-w-xl text-lead text-fg-muted">{cta.text}</p>
          <ButtonLink href={cta.href} size="lg" className="mt-7">
            {cta.label}
          </ButtonLink>
        </Container>
      </section>
    </main>
  );
}
