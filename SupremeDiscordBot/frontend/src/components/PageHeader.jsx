// frontend/src/components/PageHeader.jsx
// Заглавието на всяка страница в таблото — по одобрената концепция (10.10.2026):
// чисто заглавие, едно изречение под него и действията вдясно, без икона и без
// декоративна черта. Едно място, защото до 23.10.2026 шестнайсет страници бяха
// с три различни стила (икона + черта, малко 2xl, концепцията) и всяка нова
// страница копираше която ѝ попадне. Размерът идва от `#main-content h1`.
export default function PageHeader({ title, subtitle = null, actions = null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      {/* Текстът заема свободното място, бутонът остава вдясно; под ~20rem се пренася. */}
      <div className="min-w-0 flex-1 basis-80 max-w-3xl">
        <h1 className="text-cs-text leading-tight">{title}</h1>
        {subtitle && <p className="text-cs-muted text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
