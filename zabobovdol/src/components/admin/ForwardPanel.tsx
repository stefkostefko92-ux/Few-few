import Link from "next/link";
import { Send } from "@/components/icons";

// Формичката „Изпрати сега“: получател (по подразбиране общината), бележка по
// избор и бутон. Без поща — казва го и води към „Поща (Brevo)“; за всеки случай
// остава и старият път („отвори в пощата си“).
export function ForwardPanel({
  action,
  defaultTo,
  mailOn,
  forwardedTo,
  mailtoHref,
  compact = false,
}: {
  action: (fd: FormData) => Promise<void>;
  defaultTo: string;
  mailOn: boolean;
  forwardedTo?: string;
  mailtoHref?: string;
  compact?: boolean;
}) {
  return (
    <form action={action} className={compact ? "space-y-2" : "space-y-3"}>
      {forwardedTo && (
        <p className="text-sm text-slate-600">
          Вече е препратен до <strong className="text-slate-800">{forwardedTo}</strong>. Може да го изпратите пак.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="mb-1 block text-sm font-medium text-slate-700">До</span>
          <input
            name="to"
            type="email"
            required
            defaultValue={defaultTo}
            autoComplete="off"
            spellCheck={false}
            className="input"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={!mailOn}>
          <Send aria-hidden className="h-4 w-4" />
          Изпрати сега
        </button>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-brand-700">Добави бележка към получателя</summary>
        <textarea name="note" rows={3} maxLength={2000} className="input mt-2" placeholder="Например: моля за отговор до петък." />
      </details>
      {!mailOn && (
        <p className="text-sm text-amber-800">
          Пощата на сайта не е настроена — настройте я в{" "}
          <Link href="/admin/poshta" className="font-medium underline">
            Поща (Brevo)
          </Link>
          {mailtoHref && (
            <>
              {" "}или{" "}
              <a href={mailtoHref} className="font-medium underline">
                отворете писмото в пощата си
              </a>
            </>
          )}
          .
        </p>
      )}
    </form>
  );
}

/** Съобщението след препращане (?fwd=…). */
export function forwardFlash(fwd?: string, to?: string): { ok: boolean; text: string } | null {
  switch (fwd) {
    case "ok":
      return { ok: true, text: `Изпратено до ${to ?? "получателя"} и отбелязано като „Препратен“.` };
    case "off":
      return { ok: false, text: "Пощата на сайта не е настроена — нищо не е изпратено. Настройте я в „Поща (Brevo)“." };
    case "err":
      return { ok: false, text: "Писмото не тръгна — нищо не е сменено. Проверете „Поща (Brevo)“ с пробно писмо и опитайте пак." };
    case "bad":
      return { ok: false, text: "Проверете адреса на получателя — трябва да е точно един имейл, като obshtina@primer.bg." };
    case "limit":
      return { ok: false, text: "Твърде много изпращания за кратко време. Изчакайте няколко минути." };
    case "missing":
      return { ok: false, text: "Записът вече го няма." };
    default:
      return null;
  }
}
