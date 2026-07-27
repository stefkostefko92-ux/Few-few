// Текущата сесия — за интерфейса (име, роля). 401 при липса.
import { ok, gestito } from "@/lib/api";
import { richiedeSessione } from "@/lib/auth";

export const GET = gestito(async () => {
  const s = await richiedeSessione();
  return ok({ id: s.sub, nome: s.nome, ruolo: s.ruolo });
});
