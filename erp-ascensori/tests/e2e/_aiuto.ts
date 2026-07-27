// Общи помощници за E2E.

import type { Page } from "@playwright/test";

export const PASSWORD = "Ascensori!2026";
export const UTENTI = {
  MASTER: "master@erp-ascensori.local",
  ADMIN: "admin@erp-ascensori.local",
  DIREZIONE: "direzione@erp-ascensori.local",
  TECNICO: "tecnico@erp-ascensori.local",
  OPERATORE: "operatore@erp-ascensori.local",
} as const;

/** Влиза през ФОРМАТА, не през API: смисълът на този слой е самата форма. */
export async function entra(
  page: Page,
  email: string,
  password = PASSWORD,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL(/\/(dashboard|impianti|ordini|i\/)/, {
    timeout: 15_000,
  });
}

/** Уникален суфикс — фикстурите не се сблъскват между пусковете. */
let contatore = 0;
export function unico(prefisso = "E2E"): string {
  contatore += 1;
  return `${prefisso}-${Date.now().toString(36)}-${contatore}`;
}
