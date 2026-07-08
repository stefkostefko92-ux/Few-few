import Image from "next/image";

// Логото на Мастилко — маскотът (мастилена капка с етикет), качен от собственика.
// `priority` се подава САМО на херо-инстанцията (LCP) — не в хедъра/футъра.
export default function Logo({
  className = "h-8 w-8",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/mascot.png"
      alt="Мастилко — маскот"
      width={512}
      height={512}
      priority={priority}
      className={`${className} select-none`}
    />
  );
}
