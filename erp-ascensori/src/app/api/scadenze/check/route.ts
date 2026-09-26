// Ръчно пускане на автоматизма за сроковете (иначе — cron на 24 ч).
import { ok, gestito } from "@/lib/api";
import { richiedeAvvioManuale } from "@/lib/automatismi";
import { controllaScadenzeTracciato } from "@/lib/scadenze-runner";

export const POST = gestito(async () => {
  await richiedeAvvioManuale();
  return ok(await controllaScadenzeTracciato());
});
