"use client";

import { useActionState, useState } from "react";
import { formatRelative } from "@/lib/format";
import { isHttpUrl } from "@/lib/url";
import type { ActionResult } from "@/app/dashboard/sites/[slug]/actions";

const initial: ActionResult = {};

export type ContentRow = {
  id: string;
  externalId: string;
  kind: string;
  title: string;
  status: string | null;
  url: string | null;
  syncedAt: Date;
};

// Редактор на един елемент от съдържанието на свързания сайт. При запис праща
// PUT към API-то на сайта (през server action). Само за MANAGER.
export function ExternalContentEditor({
  item,
  action,
}: {
  item: ContentRow;
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <>
      <tr>
        <td className="td">
          {isHttpUrl(item.url) ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-brand-400 hover:underline"
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </td>
        <td className="td">{item.kind}</td>
        <td className="td">{item.status ?? "—"}</td>
        <td className="td">{formatRelative(item.syncedAt)}</td>
        <td className="td text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-ink-400 hover:text-white"
          >
            {open ? "Затвори" : "Редактирай"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="td bg-ink-900/40">
            <form
              action={formAction}
              className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            >
              <label className="block">
                <span className="mb-1 block text-xs text-ink-500">Заглавие</span>
                <input
                  name="title"
                  defaultValue={item.title}
                  className="input w-full"
                  placeholder="Заглавие"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-500">Статус</span>
                <select
                  name="status"
                  defaultValue={
                    item.status === "published" || item.status === "draft"
                      ? item.status
                      : ""
                  }
                  className="input"
                >
                  <option value="">— без промяна —</option>
                  <option value="published">публикуван</option>
                  <option value="draft">чернова</option>
                </select>
              </label>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Запис…" : "Запиши в сайта"}
              </button>
              {(state.error || state.ok) && (
                <p
                  className={`sm:col-span-3 text-xs ${state.error ? "text-red-400" : "text-green-400"}`}
                >
                  {state.error ?? state.ok}
                </p>
              )}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
