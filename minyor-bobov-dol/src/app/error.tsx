"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container-content grid min-h-[55vh] place-items-center py-16 text-center">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Възникна грешка
        </h1>
        <p className="mt-2 text-slate-600">
          Нещо се обърка при зареждането на страницата. Опитайте отново.
        </p>
        <button onClick={reset} className="btn-primary mt-6">
          Опитай отново
        </button>
      </div>
    </div>
  );
}
