// Ръчно пускане на прочистването по срок (иначе — cron, седмично).
// Само MASTER: това е ЕДИНСТВЕНИЯТ път, по който редове напускат одита.
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { applicaRetentionTracciato } from "@/lib/retention-runner";
import { soglie } from "@/lib/retention-logic";

/** Какво БИ се изтрило — за преглед, без да се пипа нищо. */
export const GET = gestito(async () => {
  await richiedeRuolo("ADMIN");
  return ok({ soglie: soglie(new Date()) });
});

export const POST = gestito(async () => {
  await richiedeRuolo("MASTER");
  return ok(await applicaRetentionTracciato());
});
