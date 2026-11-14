import Link from "next/link";
import { Notice } from "@/components/ui";
import { euroTodayNote } from "@/lib/howto-euro";

// Бележките към отговорите за еврото, писани преди 1 януари 2026 г. (виж
// src/lib/howto-euro.ts). Едни и същи на /evroto и в /kak-da/[slug].

/**
 * Общата бележка: отговорите са писани около смяната. На /evroto сочи към
 * каретата най-горе, в ръководство — към /evroto.
 */
export function EuroWrittenBeforeNotice({
  onEuroPage = false,
  className = "",
}: {
  onEuroPage?: boolean;
  className?: string;
}) {
  return (
    <Notice tone="info" title="Отговорите са събрани около смяната на валутата" className={className}>
      <p>
        Част от тях са писани преди 1&nbsp;януари 2026&nbsp;г. и споменават срокове, които вече
        изтекоха.{" "}
        {onEuroPage ? (
          "Какво важи днес — в каретата най-горе на страницата."
        ) : (
          <>
            Какво важи днес — на страницата{" "}
            <Link href="/evroto" className="link">
              „Еврото — въпроси и отговори“
            </Link>
            .
          </>
        )}
      </p>
    </Notice>
  );
}

/**
 * „Срокът в този отговор изтече“ + какво важи днес — само за отговорите с
 * изтекъл срок (иначе нищо).
 */
export function EuroTodayNotice({
  slug,
  withLink = false,
  className = "",
}: {
  slug: string;
  /** Връзка към /evroto (в ръководството; на самата /evroto — не). */
  withLink?: boolean;
  className?: string;
}) {
  const today = euroTodayNote(slug);
  if (!today) return null;
  return (
    <Notice tone="warning" title="Срокът в този отговор изтече" className={className}>
      <p>
        Отговорът е писан преди 1&nbsp;януари 2026&nbsp;г. Днес: {today}
      </p>
      {withLink && (
        <p>
          <Link href="/evroto" className="link inline-flex min-h-tap items-center">
            Всичко за еврото — какво важи днес
          </Link>
        </p>
      )}
    </Notice>
  );
}
