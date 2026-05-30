import type {
  LeaderboardEntry,
  LoginInput,
  ProductView,
  PublicUser,
  QuestView,
  RegisterInput,
  VipPerks,
  VipTier,
} from "@aso/shared";

/** Stable error codes the API returns in `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include", // send httpOnly auth cookies
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const err =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error: { code?: string; message?: string } }).error
        : undefined;
    throw new ApiError(res.status, err?.code ?? "unknown", err?.message ?? "Request failed");
  }

  return body as T;
}

interface AuthResponse {
  user: PublicUser;
}

export const api = {
  register: (input: RegisterInput) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: LoginInput) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  me: () => request<AuthResponse>("/auth/me"),

  // Shop (S5)
  catalog: () =>
    request<{ products: ProductView[]; vipPerks: Record<VipTier, VipPerks> }>("/shop/catalog"),
  checkout: (sku: string) =>
    request<{ url: string | null }>("/shop/checkout", {
      method: "POST",
      body: JSON.stringify({ sku }),
    }),
  billingPortal: () => request<{ url: string }>("/shop/portal", { method: "POST" }),
  vipStatus: () =>
    request<{ tier: VipTier; vipUntil: string | null; perks: VipPerks }>("/shop/vip"),

  // Progression (S6)
  claimDaily: () =>
    request<{ claimed: boolean; streak: number; chips: number; gems: number }>(
      "/progression/daily",
      { method: "POST" },
    ),
  quests: () => request<{ quests: QuestView[] }>("/progression/quests"),
  progress: () =>
    request<{ xp: number; level: number; intoLevel: number; needed: number }>("/progression/me"),
  leaderboard: (game: string) =>
    request<{ game: string; entries: LeaderboardEntry[] }>(`/progression/leaderboard/${game}`),
};
