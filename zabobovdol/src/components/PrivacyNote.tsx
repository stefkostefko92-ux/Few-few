import Link from "next/link";

// Информация по чл. 13 GDPR в момента на събирането: под всяка публична форма
// стои кратка бележка с линк към политиката за поверителност.
export function PrivacyNote() {
  return (
    <p className="text-xs text-slate-600">
      Изпращайки формата, се съгласявате личните ви данни да бъдат обработени за
      описаната цел. Подробности — в{" "}
      <Link
        href="/poveritelnost"
        className="font-medium text-brand-700 underline underline-offset-2"
      >
        Политиката за поверителност
      </Link>
      .
    </p>
  );
}
