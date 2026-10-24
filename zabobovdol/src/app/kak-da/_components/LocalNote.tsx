import { MapPin } from "@/components/icons";
import { TelLink } from "@/components/TelLink";
import { linkifySegments } from "@/lib/linkify";
import { parseLocalNote } from "@/lib/howto-local-note";

// Текст с телефони, които се набират с едно докосване (tel:). Номерът се
// показва както е написан в текста — той вече е в българския формат.
export function Linkified({ text }: { text: string }) {
  return (
    <>
      {linkifySegments(text).map((s, i) =>
        s.kind === "tel" ? (
          <TelLink key={i} phone={s.text} className="link whitespace-nowrap">
            {s.text}
          </TelLink>
        ) : s.kind === "mailto" ? (
          <a key={i} href={s.href} className="link [overflow-wrap:anywhere]">
            {s.text}
          </a>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/**
 * „В Бобов дол“ — местната бележка към ръководство: абзаци, офисите като
 * истински списък, телефоните като връзки за обаждане и „Източник · проверено
 * на …“ на отделен ред (мета).
 */
export function LocalNote({ note, className = "" }: { note: string; className?: string }) {
  const blocks = parseLocalNote(note);
  if (blocks.length === 0) return null;
  return (
    <section aria-labelledby="v-bobov-dol" className={`callout-info ${className}`}>
      <h2
        id="v-bobov-dol"
        className="flex items-center gap-2 font-sans text-xl font-semibold text-slate-900"
      >
        <MapPin className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
        В Бобов дол
      </h2>
      <div className="mt-2 space-y-2 text-base text-slate-800">
        {blocks.map((b, i) =>
          b.kind === "ul" ? (
            <ul key={i} role="list" className="list-disc space-y-1.5 pl-6 marker:text-brand-600">
              {b.items.map((it, k) => (
                <li key={k}>
                  <Linkified text={it} />
                </li>
              ))}
            </ul>
          ) : b.kind === "source" ? (
            <p key={i} className="text-meta">
              {b.text}
            </p>
          ) : (
            <p key={i}>
              <Linkified text={b.text} />
            </p>
          ),
        )}
      </div>
    </section>
  );
}
