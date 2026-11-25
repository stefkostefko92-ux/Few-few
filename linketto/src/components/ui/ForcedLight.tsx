// Обвивка за екрани, които още не са пренесени към дизайн системата
// (табло, админ — фази 2–3): те остават светли и в тъмна тема, за да не
// се чупи нищо. Превключвателят на тема се скрива вътре (виж globals.css).
export function ForcedLight({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-theme="light"
      data-forced-light
      className="min-h-screen bg-bg text-fg"
    >
      {children}
    </div>
  );
}
