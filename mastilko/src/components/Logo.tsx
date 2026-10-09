import Image from "next/image";

// Логото на Мастилко — маскотът (мастилена капка с етикет), качен от собственика.
// Фонът е премахнат (прозрачен PNG); навсякъде носи лек светло-син glow (двоен
// drop-shadow — плътно ядро + мек ореол), затова инлайн стил, за да важи във
// всички визии и над всеки className. `priority` се подава САМО на херо-
// инстанцията (LCP) — не в хедъра/футъра.
const GLOW =
  "drop-shadow(0 0 5px rgba(111,195,240,0.55)) drop-shadow(0 0 14px rgba(58,134,185,0.4))";

export default function Logo({
  className = "h-8 w-8",
  priority = false,
  // Когато до логото има видим текст „Мастилко" (хедър/футър), подай decorative,
  // за да не се дублира в достъпното име (alt="").
  decorative = false,
}: {
  className?: string;
  priority?: boolean;
  decorative?: boolean;
}) {
  return (
    <Image
      src="/mascot.webp"
      alt={decorative ? "" : "Мастилко — маскот"}
      width={384}
      height={384}
      priority={priority}
      unoptimized
      style={{ filter: GLOW }}
      className={`${className} select-none`}
    />
  );
}
