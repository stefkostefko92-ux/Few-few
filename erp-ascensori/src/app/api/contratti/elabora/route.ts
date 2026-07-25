// Ръчно пускане на автоматизма за договорите (иначе — cron на 24 ч).
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { elaboraContrattiTracciato } from "@/lib/contratti-runner";

export const POST = gestito(async () => {
  await richiedeRuolo("RESPONSABILE");
  return ok(await elaboraContrattiTracciato());
});
