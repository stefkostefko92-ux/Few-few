import type {
  AchievementView,
  Cosmetic,
  ForgotPasswordInput,
  LeaderboardEntry,
  LoginInput,
  ProductView,
  PublicUser,
  QuestView,
  RegisterInput,
  ResetPasswordInput,
  VipPerks,
  VipTier,
} from "@aso/shared";

/** Which OAuth providers the server has credentials for. */
export interface OAuthProviders {
  google: boolean;
  facebook: boolean;
}

/** A cosmetic plus the signed-in player's ownership state for it. */
export interface CosmeticView extends Cosmetic {
  owned: boolean;
  equipped: boolean;
  locked: boolean; // VIP-exclusive and the player isn't eligible
}

export interface CosmeticsResponse {
  game: string;
  gems: number;
  vipTier: VipTier;
  items: CosmeticView[];
}

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

  // Account (GDPR)
  deleteAccount: () => request<{ ok: true }>("/account/delete", { method: "POST" }),

  // Email verification & password reset
  verifyEmail: (token: string) =>
    request<{ ok: true }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  resendVerification: (email: string) =>
    request<{ ok: true }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  forgotPassword: (input: ForgotPasswordInput) =>
    request<{ ok: true }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  resetPassword: (input: ResetPasswordInput) =>
    request<{ ok: true }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // OAuth — providers list is fetched; the sign-in itself is a full-page
  // navigation to the API (see oauthStartUrl) so cookies are set server-side.
  oauthProviders: () => request<OAuthProviders>("/auth/oauth/providers"),

  // Shop (S5)
  catalog: () =>
    request<{
      products: ProductView[];
      vipPerks: Record<VipTier, VipPerks>;
      billingEnabled: boolean;
    }>("/shop/catalog"),
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
  achievements: () =>
    request<{ achievements: AchievementView[] }>("/progression/achievements"),

  // Cosmetics (gem-priced, per game)
  cosmetics: (game: string) => request<CosmeticsResponse>(`/cosmetics?game=${game}`),
  buyCosmetic: (id: string) =>
    request<{ gems: number; ownedId: string }>("/cosmetics/buy", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  equipCosmetic: (id: string) =>
    request<{ equipped: string[] }>("/cosmetics/equip", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  equippedCosmetics: () => request<{ equipped: string[] }>("/cosmetics/equipped"),

  // Friends & social
  friends: () => request<FriendsResponse>("/friends"),
  friendSearch: (q: string) =>
    request<{ users: FriendLite[] }>(`/friends/search?q=${encodeURIComponent(q)}`),
  friendRequest: (userId: string) =>
    request<{ status: string }>("/friends/request", { method: "POST", body: JSON.stringify({ userId }) }),
  friendAccept: (id: string) => request<{ ok: true }>(`/friends/${id}/accept`, { method: "POST" }),
  friendDecline: (id: string) => request<{ ok: true }>(`/friends/${id}/decline`, { method: "POST" }),
  friendRemove: (userId: string) => request<{ ok: true }>(`/friends/${userId}`, { method: "DELETE" }),

  // Notifications
  notifications: () => request<NotificationsResponse>("/notifications"),
  notificationsRead: () => request<{ ok: true }>("/notifications/read", { method: "POST" }),

  // Admin (staff only)
  adminStats: () => request<AdminStats>("/admin/stats"),
  adminUsers: (q: string) =>
    request<{ users: AdminUserRow[] }>(`/admin/users?q=${encodeURIComponent(q)}`),
  adminUser: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),
  adminUpdateUser: (id: string, patch: AdminUserPatch) =>
    request<{ user: AdminUserRow }>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  adminFlags: (status: string) =>
    request<{ flags: AdminFlag[] }>(`/admin/flags?status=${status}`),
  adminReviewFlag: (id: string, status: string) =>
    request<{ flag: AdminFlag }>(`/admin/flags/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  adminDiscord: () => request<DiscordConfig>("/admin/discord"),
  adminDiscordSave: (patch: Partial<DiscordConfig>) =>
    request<DiscordConfig>("/admin/discord", { method: "PUT", body: JSON.stringify(patch) }),
  adminDiscordTest: () =>
    request<{ sent: boolean; enabled: boolean }>("/admin/discord/test", { method: "POST" }),
  adminBroadcast: (message: string) =>
    request<{ sent: boolean }>("/admin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  adminAudit: (cursor?: string) =>
    request<{ items: AdminAuditEntry[]; nextCursor: string | null }>(
      `/admin/audit${cursor ? `?cursor=${cursor}` : ""}`,
    ),
};

export type DiscordEventKey = "registration" | "purchase" | "vip" | "flag" | "adminAction" | "broadcast";
export interface DiscordConfig {
  webhookUrl: string;
  webhookName: string;
  enabled: boolean;
  events: Record<DiscordEventKey, boolean>;
}
export interface AdminAuditEntry {
  id: string;
  actorName: string;
  action: string;
  targetId: string | null;
  detail: string;
  createdAt: string;
}

// ── Social DTOs ──────────────────────────────────────────────────────────────
export interface FriendLite {
  id: string;
  displayName: string;
  level: number;
  vipTier: string;
}
export interface FriendEntry extends FriendLite {
  friendshipId: string;
  online: boolean;
}
export interface PendingEntry extends FriendLite {
  friendshipId: string;
}
export interface FriendsResponse {
  friends: FriendEntry[];
  incoming: PendingEntry[];
  outgoing: PendingEntry[];
}
export interface NotificationItem {
  id: string;
  type: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

// ── Admin DTOs ───────────────────────────────────────────────────────────────
export interface AdminAuditRow {
  id: string;
  actorName: string;
  action: string;
  targetId: string | null;
  detail: string;
  createdAt: string;
}
export interface AdminStats {
  users: number;
  banned: number;
  newToday: number;
  openFlags: number;
  matchesToday: number;
  purchases: number;
  revenueCents: number;
  vip: Record<string, number>;
  gamesToday: Record<string, number>;
  audits: AdminAuditRow[];
}
export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  vipTier: string;
  banned: boolean;
  chips: string;
  gems: number;
  level: number;
  createdAt?: string;
  lastSeenAt?: string;
}
export interface AdminUserDetail {
  user: AdminUserRow & {
    xp?: number;
    emailVerified?: boolean;
    purchases: { id: string; status: string; createdAt: string; product: { sku: string; priceCents: number } | null }[];
    ratings: { game: string; mmr: number; games: number; wins: number }[];
    _count: { inventory: number; matches: number };
  };
  audits: AdminAuditRow[];
}
export interface AdminUserPatch {
  role?: string;
  vipTier?: string;
  banned?: boolean;
  grantChips?: number;
  grantGems?: number;
}
export interface AdminFlag {
  id: string;
  game: string;
  userAId: string;
  userBId: string;
  reason: string;
  score: number;
  details: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}

/** Full-page navigation target that begins a provider sign-in. */
export function oauthStartUrl(provider: "google" | "facebook"): string {
  return `/api/auth/oauth/${provider}/start`;
}

/** Authenticated download link for the player's GDPR data export. */
export const ACCOUNT_EXPORT_URL = "/api/account/export";
