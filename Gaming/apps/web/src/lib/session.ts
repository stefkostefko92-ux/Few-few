import type { PublicUser } from "@aso/shared";
import { api } from "./api";
import { disconnectSocket } from "./socket";
import { useAuthStore, useCosmeticsStore, useLobbyStore, useMatchStore } from "./store";

/**
 * Единственото място за прехода „вход“ ↔ „изход“ в клиентското състояние.
 * Всеки път към сесия (възстановяване през /me, вход с парола, регистрация)
 * минава през `afterLogin`, а всеки изход (бутон, изтриване на акаунт) — през
 * `afterLogout`, за да не остават данни от предишния играч (облици, стая, мач).
 */

/** Записва потребителя и зарежда облеклите му облици (best-effort). */
export async function afterLogin(user: PublicUser): Promise<void> {
  useAuthStore.getState().setUser(user);
  try {
    const { equipped } = await api.equippedCosmetics();
    // Междувременно може да е излязъл или да е влязъл друг — не пишем чужди облици.
    if (useAuthStore.getState().user?.id === user.id) {
      useCosmeticsStore.getState().setEquipped(equipped);
    }
  } catch {
    // Облиците са украса — без тях играта пак върви с темите по подразбиране.
  }
}

/** Нулира всичко, вързано за сесията: сокет, облици, стая, мач и потребител. */
export function afterLogout(): void {
  disconnectSocket(); // следващият вход прави ново ръкостискане
  useCosmeticsStore.getState().setEquipped([]);
  useLobbyStore.getState().setLobby(null);
  useMatchStore.getState().clearMatch();
  useAuthStore.getState().setUser(null);
}
