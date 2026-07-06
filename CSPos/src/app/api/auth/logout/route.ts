import { destroySession, getSession, guard } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST() {
  return guard(async () => {
    const s = await getSession();
    if (s) await audit(s.userId, "LOGOUT");
    await destroySession();
    return Response.json({ ok: true });
  });
}
