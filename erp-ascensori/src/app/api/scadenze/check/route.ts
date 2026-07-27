// Ръчно пускане на автоматизма за сроковете (иначе — cron на 24 ч).
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { controllaScadenzeTracciato } from "@/lib/scadenze-runner";

export const POST = gestito(async () => {
  await richiedeRuolo("RESPONSABILE");
  return ok(await controllaScadenzeTracciato());
});
