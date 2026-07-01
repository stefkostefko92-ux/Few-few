"use client";

import { useActionState } from "react";
import type { PageActionResult } from "@/app/dashboard/sites/[slug]/pages/actions";

const initial: PageActionResult = {};

type Init = {
  showInNav: boolean;
  navOrder: number;
  seoTitle: string;
  seoDescription: string;
  publishAt: string; // YYYY-MM-DDTHH:mm или ""
};

export function PageSettingsForm({
  action,
  init,
}: {
  action: (prev: PageActionResult, formData: FormData) => Promise<PageActionResult>;
  init: Init;
}) {
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-ink-200">
        <input type="checkbox" name="showInNav" defaultChecked={init.showInNav} />
        Показвай в менюто на сайта
      </label>
      <label className="block">
        <span className="label">Ред в менюто (по-малко = по-напред)</span>
        <input type="number" name="navOrder" defaultValue={init.navOrder} className="input w-32" />
      </label>
      <label className="block">
        <span className="label">SEO заглавие (по избор, до 70 знака)</span>
        <input name="seoTitle" defaultValue={init.seoTitle} maxLength={70} className="input" />
      </label>
      <label className="block">
        <span className="label">SEO описание (по избор, до 160 знака)</span>
        <textarea name="seoDescription" defaultValue={init.seoDescription} maxLength={160} rows={2} className="input" />
      </label>
      <label className="block">
        <span className="label">Насрочено публикуване (по избор)</span>
        <input type="datetime-local" name="publishAt" defaultValue={init.publishAt} className="input" />
        <span className="mt-1 block text-[11px] text-ink-600">
          Оставете празно за ръчно публикуване. При зададено време системата ще публикува страницата автоматично.
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button className="btn-primary px-4 py-2 text-sm" disabled={pending}>
          {pending ? "Запазване…" : "Запази"}
        </button>
        {state.ok && <span className="text-sm text-green-400">{state.ok}</span>}
        {state.error && <span className="text-sm text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
