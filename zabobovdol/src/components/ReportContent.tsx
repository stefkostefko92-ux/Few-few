import { AlertTriangle } from "@/components/icons";
import { SITE } from "@/lib/site";
import { UI_LABEL } from "@/lib/ui-labels";

/**
 * Механизъм „Сигнализирайте за съдържание“ (notice-and-action) по чл. 16 от
 * Регламент (ЕС) 2022/2065 (Закон за цифровите услуги, DSA). Дава на всеки
 * лесно достъпен електронен канал да подаде уведомление за публикувано
 * потребителско съдържание, което смята за незаконно или неподходящо.
 * Подателят получава обосновка при евентуално премахване (чл. 17).
 * Показва се само където има съдържание (не на празен списък).
 */
export function ReportContent({
  subject,
  path,
  className = "mt-3",
}: {
  subject: string;
  path: string;
  className?: string;
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
    <p className={`no-print text-base text-slate-600 ${className}`}>
      <a
        href={href}
        className="link-quiet inline-flex min-h-tap items-center gap-1.5 font-medium text-slate-700"
      >
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
        {UI_LABEL.report}
      </a>
    </p>
  );
}
