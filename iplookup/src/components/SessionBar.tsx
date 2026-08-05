import Link from "next/link";

import LogoutButton from "./LogoutButton";
import { readSession } from "@/lib/case-context";
import { isInvestigationMode } from "@/lib/mode";
import { can } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/session";
import { cookies } from "next/headers";
import { CASE_COOKIE } from "@/lib/case-context";

/**
 * Лентата на следствения режим.
 *
 * Показва КОЙ работи и по коя преписка. Не е украса: това са двете стойности,
 * които влизат във всеки одиторски запис, и служителят трябва да ги вижда,
 * преди да търси — не да ги открива после в дневника.
 */
export default async function SessionBar() {
  if (!isInvestigationMode()) return null;

  const session = await readSession();
  if (!session) return null;

  const jar = await cookies();
  const activeCase = jar.get(CASE_COOKIE)?.value?.trim();

  return (
    <div className="border-b border-border-strong bg-surface-raised">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6">
        <span className="font-semibold text-text">
          {session.sub}
          <span className="ml-2 font-normal text-text-muted">
            {ROLE_LABEL[session.role]} · {session.unit}
          </span>
        </span>

        <span className="text-text-muted">
          Преписка:{" "}
          {activeCase ? (
            <span className="text-text">{activeCase}</span>
          ) : (
            <span className="text-warn">не е зададена</span>
          )}
        </span>

        <span className="ml-auto flex items-center gap-3">
          {can(session.role, "readAudit") ? (
            <Link href="/dnevnik" className="text-accent underline underline-offset-2">
              Дневник
            </Link>
          ) : null}
          <LogoutButton />
        </span>
      </div>
    </div>
  );
}
