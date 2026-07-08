import type { Metadata } from "next";
import { Suspense } from "react";
import VizitkaImport from "@/components/VizitkaImport";

export const metadata: Metadata = {
  title: "Внасяне на визитка",
  description: "Пренасяне на визитка от Визитка към Мастилко за печат.",
  robots: { index: false, follow: false },
};

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Suspense fallback={<p className="text-ink-soft">Зареждане…</p>}>
        <VizitkaImport />
      </Suspense>
    </div>
  );
}
