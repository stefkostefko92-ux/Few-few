// Ръчно пускане на автоматизма за договорите (иначе — cron на 24 ч).
import { ok, gestito } from "@/lib/api";
import { richiedeAvvioManuale } from "@/lib/automatismi";
import { elaboraContrattiTracciato } from "@/lib/contratti-runner";

export const POST = gestito(async () => {
  await richiedeAvvioManuale();
  return ok(await elaboraContrattiTracciato());
});
