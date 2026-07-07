import Image from "next/image";

// Логото на Мастилко — маскотът (мастилена капка с етикет), качен от собственика.
export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <Image
      src="/mascot.png"
      alt="Мастилко — маскот"
      width={512}
      height={512}
      className={`${className} select-none`}
    />
  );
}
