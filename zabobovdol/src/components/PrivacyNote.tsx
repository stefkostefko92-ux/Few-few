import Link from "next/link";
import type { ReactNode } from "react";

// Информация по чл. 13 GDPR в момента на събирането: под всяка публична форма
// стои ЕДНА кратка бележка с връзка към политиката за поверителност. Ако
// формата има своя бележка („Сигналите се преглеждат…“, „Обявата е
// публична“), тя е `lead` — в същото изречение, а не втори правен текст.
export function PrivacyNote({ lead }: { lead?: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-slate-600">
      {lead && <>{lead} </>}
      Изпращайки формата, се съгласявате личните ви данни да бъдат обработени за
      описаната цел. Подробности — в{" "}
      <Link href="/poveritelnost" className="link">
        Политиката за поверителност
      </Link>
      .
    </p>
  );
}
