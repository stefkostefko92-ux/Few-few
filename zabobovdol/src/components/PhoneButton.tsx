// Телефонът като бутон — най-ясното действие за възрастни: голяма цел, икона
// и номерът в единния формат. На телефон заема цялата ширина.
//   <PhoneButton phone="+359877414874" />                  → „0877 414 874“
//   <PhoneButton phone="0702 62323" label="Обадете се:" variant="primary" />
//   <PhoneButton phone="112" label="Спешност" variant="danger" />
// variant: primary — главното действие на страницата (детайл на услуга);
// secondary — телефон в списък/карта; danger — САМО за 112 и спешните.
// Брои обаждането (tel_click) чрез TelLink.

import { Phone } from "@/components/icons";
import { TelLink } from "@/components/TelLink";
import { formatPhoneBg } from "@/lib/phone";

const VARIANT = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
} as const;

export function PhoneButton({
  phone,
  label,
  variant = "secondary",
  full = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  phone: string;
  /** Текст пред номера („Обадете се:“, „Спешност“). По избор. */
  label?: string;
  variant?: keyof typeof VARIANT;
  /** true → на цялата ширина и на компютър (по подразбиране само на телефон). */
  full?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const number = formatPhoneBg(phone);
  // Без цифри (напр. „няма“) не е бутон — просто текст.
  if (!/\d/.test(phone)) return <span className={className}>{phone}</span>;
  const width = full ? "w-full" : "w-full sm:w-auto";
  return (
    <TelLink
      phone={phone}
      aria-label={ariaLabel}
      className={`${VARIANT[variant]} ${width} tabular-nums ${className}`.trim()}
    >
      <Phone className="h-5 w-5 shrink-0" aria-hidden />
      <span>
        {label ? <>{label} </> : null}
        <span className="whitespace-nowrap">{number}</span>
      </span>
    </TelLink>
  );
}
