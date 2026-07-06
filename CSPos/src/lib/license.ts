// Лиценз на касата: офлайн проверка на Ed25519-подписания blob от
// лицензионния сървър (store/). Публичният ключ идва от env
// LICENSE_PUBLIC_KEY (PEM); частният никога не напуска сървъра.

import crypto from "node:crypto";

export interface LicensePayload {
  v: number;
  licenseId: string;
  plan: "monthly" | "yearly" | "lifetime";
  seats: number;
  deviceId: string;
  issuedAt: number;
  expiresAt: number | null; // null = lifetime
}

export interface LicenseState {
  status: "none" | "active" | "expired" | "invalid";
  payload?: LicensePayload;
}

export function verifyLicenseBlob(blob: string, publicKeyPem: string): LicensePayload | null {
  const parts = String(blob ?? "").split(".");
  const body = parts[0];
  const sig = parts[1];
  if (parts.length !== 2 || !body || !sig) return null;
  try {
    const ok = crypto.verify(
      null,
      Buffer.from(body),
      crypto.createPublicKey(publicKeyPem),
      Buffer.from(sig, "base64url")
    );
    if (!ok) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString()) as LicensePayload;
  } catch {
    return null;
  }
}

/** Състояние на лиценза за тази каса (deviceId трябва да съвпада). */
export function licenseState(
  blob: string | null | undefined,
  deviceId: string,
  publicKeyPem: string | undefined
): LicenseState {
  if (!blob) return { status: "none" };
  if (!publicKeyPem) return { status: "invalid" };
  const payload = verifyLicenseBlob(blob, publicKeyPem);
  if (!payload || payload.deviceId !== deviceId) return { status: "invalid" };
  if (payload.expiresAt !== null && Date.now() > payload.expiresAt) {
    return { status: "expired", payload };
  }
  return { status: "active", payload };
}
