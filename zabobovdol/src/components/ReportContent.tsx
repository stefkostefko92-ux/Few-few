import { AlertTriangle } from "@/components/icons";
import { SITE } from "@/lib/site";

/**
 * Механизъм „Сигнализирай за съдържание“ (notice-and-action) по чл. 16 от
 * Регламент (ЕС) 2022/2065 (Закон за цифровите услуги, DSA). Дава на всеки
 * лесно достъпен електронен канал да подаде уведомление за публикувано
 * потребителско съдържание, което смята за незаконно или неподходящо.
 * Подателят получава обосновка при евентуално премахване (чл. 17).
 */
export function ReportContent({
  subject,
  path,
}: {
  subject: string;
  path: string;
}) {
  const email = SITE.contact.email;
  const ref = `${SITE.url}${path}`;
  // Шаблонът подканя за елементите по чл. 16(2) DSA: причина, точно
  // местоположение, име и имейл на подателя, декларация за добросъвестност.
  const body = [
    "Сигнализирам следното съдържание като незаконно или неподходящо:",
    "",
    `Заглавие: „${subject}“`,
    `Адрес: ${ref}`,
    "",
    "Причина за сигнала (моля, опишете защо смятате съдържанието за незаконно/неподходящо):",
    "",
    "Вашето име:",
    "Вашият имейл за връзка:",
    "",
    "Декларирам, че подавам този сигнал добросъвестно и че информацията в него е точна.",
    "",
  ].join("\n");
  const href = email
    ? `mailto:${email}?subject=${encodeURIComponent(
        `Сигнал за съдържание: ${subject}`,
      )}&body=${encodeURIComponent(body)}`
    : "/kontakti";

  return (
    <p className="mt-3 text-xs text-slate-600">
      <a
        href={href}
        className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-brand-700"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Сигнализирай за това съдържание
      </a>
    </p>
  );
}
