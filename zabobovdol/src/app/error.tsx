"use client";

import Link from "next/link";
import { SITE } from "@/lib/site";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-content py-16 sm:py-20">
      <div className="panel mx-auto max-w-xl px-6 py-8 text-center sm:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bobov-dol-grb-mark.png"
          alt=""
          aria-hidden
          className="mx-auto h-20 w-auto"
          width={56}
          height={80}
        />
        <h1 className="mt-6 text-2xl font-bold text-slate-900 sm:text-3xl">
          Възникна временен проблем
        </h1>
        <div aria-hidden className="rule-gold mx-auto mt-3" />
        <p className="mt-4 text-base text-slate-700">
          Извиняваме се — нещо се обърка при зареждането на страницата. Моля,
          опитайте отново след малко.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => reset()} className="btn-primary">
            Опитайте отново
          </button>
          <Link href="/" className="btn-secondary">
            Към началото
          </Link>
        </div>
        <p className="mt-6 text-base text-slate-600">
          Ако проблемът продължава, пишете ни на{" "}
          <a href={`mailto:${SITE.contact.email}`} className="link [overflow-wrap:anywhere]">
            {SITE.contact.email}
          </a>
          . При спешност — 112.
        </p>
      </div>
    </div>
  );
}
