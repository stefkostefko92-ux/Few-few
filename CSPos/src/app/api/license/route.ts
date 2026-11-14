// Лиценз на касата: статус + активация срещу лицензионния сървър (store/).
// Blob-ът се проверява ОФЛАЙН с публичния ключ (LICENSE_PUBLIC_KEY) — касата
// не зависи от интернет след активацията. GET: всяка роля; POST: администратор.

import crypto from "node:crypto";
import { z } from "zod";
import { guard, jsonError, requireRole, requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting, setSetting } from "@/lib/settings";
import { licenseState } from "@/lib/license";

const LICENSE_SERVER = process.env.LICENSE_SERVER_URL ?? "https://pos.carbonstealth.eu";
const PUBLIC_KEY = process.env.LICENSE_PUBLIC_KEY; // PEM (spki)

async function deviceIdentity(): Promise<string> {
  const lic = await getSetting("license");
  if (lic.deviceId) return lic.deviceId;
  const deviceId = `csd_${crypto.randomBytes(12).toString("hex")}`;
  await setSetting("license", { ...lic, deviceId });
  return deviceId;
}

export async function GET() {
  return guard(async () => {
    await requireSession();
    const lic = await getSetting("license");
    const deviceId = await deviceIdentity();
    const state = licenseState(lic.blob || null, deviceId, PUBLIC_KEY);
    return Response.json({
      status: state.status,
      plan: state.payload?.plan ?? null,
      seats: state.payload?.seats ?? null,
      expiresAt: state.payload?.expiresAt ?? null,
      keyMasked: lic.key ? `${lic.key.slice(0, 11)}…` : null,
    });
  });
}

const schema = z.object({ key: z.string().min(10).max(40) });

export async function POST(req: Request) {
  return guard(async () => {
    const s = await requireRole("ADMIN");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) throw jsonError(400, "Невалиден лицензен ключ.");
    if (!PUBLIC_KEY) {
      throw jsonError(500, "Липсва LICENSE_PUBLIC_KEY — лицензирането не е конфигурирано.");
    }
    const deviceId = await deviceIdentity();
    const store = await getSetting("store");

    let res: globalThis.Response;
    try {
      res = await fetch(`${LICENSE_SERVER}/api/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: parsed.data.key.trim(),
          deviceId,
          deviceName: store.storeName,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw jsonError(502, "Лицензионният сървър е недостъпен. Проверете интернет връзката.");
    }
    const data = (await res.json().catch(() => ({}))) as { blob?: string; error?: string };
    if (!res.ok || !data.blob) {
      throw jsonError(res.status === 409 ? 409 : 400, data.error ?? "Активацията е отказана.");
    }

    const state = licenseState(data.blob, deviceId, PUBLIC_KEY);
    if (state.status !== "active") {
      throw jsonError(502, "Полученият лиценз не премина проверката на подписа.");
    }

    const lic = await getSetting("license");
    await setSetting("license", { ...lic, key: parsed.data.key.trim(), blob: data.blob });
    await audit(s.userId, "LICENSE_ACTIVATED", "Setting", "license", {
      plan: state.payload?.plan,
      seats: state.payload?.seats,
    });
    return Response.json({ status: "active", plan: state.payload?.plan, seats: state.payload?.seats });
  });
}
