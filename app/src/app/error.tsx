"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-content py-20 text-center">
      <div className="mx-auto max-w-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bobov-dol-grb.png"
          alt=""
          aria-hidden
          className="mx-auto h-20 w-auto opacity-80"
          width={56}
          height={80}
        />
        <h1 className="mt-6 font-display text-2xl font-bold text-slate-900">
          Възникна временен проблем
        </h1>
        <p className="mt-2 text-slate-600">
          Извиняваме се — нещо се обърка при зареждането на страницата. Моля,
          опитайте отново след малко.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn-primary">
            Опитай отново
          </button>
          <Link href="/" className="btn-secondary">
            Към началото
          </Link>
        </div>
      </div>
    </div>
  );
}
