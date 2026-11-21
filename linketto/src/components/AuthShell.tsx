import { Card } from '@/components/ui/Card';

// Обща рамка за вход/регистрация: спокойна карта върху милиметровката на
// системата. Логото вече е в хедъра, така че картата носи само задачата.
export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className="relative isolate flex min-h-[calc(100vh-var(--header-h))] items-start justify-center px-4 pb-16 pt-12 sm:items-center sm:pt-16"
    >
      <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
      <div aria-hidden className="bg-glow absolute inset-0 -z-10" />
      <Card
        variant="raised"
        padding="lg"
        className="enter w-full max-w-[26rem] shadow-e3"
      >
        <h1 className="text-heading text-fg">{title}</h1>
        {children}
        <div className="mt-7 border-t border-line pt-5 text-body text-fg-2">
          {footer}
        </div>
      </Card>
    </main>
  );
}
