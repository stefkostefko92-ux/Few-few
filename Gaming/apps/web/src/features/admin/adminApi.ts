import { ApiError, type AdminAuditEntry } from "../../lib/api";

/**
 * Admin-only API client. Lives beside the admin feature (not in lib/api.ts,
 * which is owned by the auth/refresh change stream) and carries the richer
 * DTOs the reworked panel needs (ban reason/expiry, pagination cursors,
 * chat reports, economy timeseries).
 */

// One in-flight refresh shared by all 401 retries (mirrors lib/api's flow).
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include", // send httpOnly auth cookies
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  // Expired access token → refresh once and retry, so staff don't see the
  // panel silently die 15 minutes into a session.
  if (res.status === 401 && !retried && (await refreshSession())) {
    return request<T>(path, init, true);
  }

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

const qs = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  vipTier: string;
  banned: boolean;
  banReason: string | null;
  banUntil: string | null;
  chips: string;
  gems: number;
  level: number;
  createdAt: string;
  lastSeenAt: string;
}

export interface AdminUsersFilter {
  q?: string;
  role?: string;
  vip?: string;
  banned?: "1" | "0" | "";
  cursor?: string;
}

export interface AdminUserDetail {
  user: AdminUserRow & {
    xp: number;
    emailVerified: boolean;
    deletedAt: string | null;
    purchases: {
      id: string;
      status: string;
      createdAt: string;
      product: { sku: string; priceCents: number };
    }[];
    ratings: { game: string; mmr: number; games: number; wins: number }[];
    _count: { inventory: number; matches: number };
  };
  audits: AdminAuditEntry[];
}

export interface AdminUserPatch {
  role?: string;
  vipTier?: string;
  banned?: boolean;
  banReason?: string;
  banUntil?: string | null;
  grantChips?: number;
  grantGems?: number;
  note?: string;
}

export interface AdminMatchItem {
  id: string;
  game: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  seat: number;
  result: string | null;
  mmrDelta: number;
  chipsDelta: string;
}

export interface AdminAuditFilter {
  action?: string;
  actor?: string;
  targetId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

export interface ChatReportItem {
  id: string;
  matchId: string;
  fromUserId: string;
  fromName: string | null;
  targetSeat: number | null;
  text: string;
  status: string;
  createdAt: string;
}

export interface EconomyPoint {
  day: string;
  dau: number;
  registrations: number;
  matches: number;
  purchases: number;
  revenueCents: number;
}

export interface EconomyResponse {
  days: number;
  series: EconomyPoint[];
  topGames: { game: string; matches: number }[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface LiveRoomSeat {
  seat: number;
  displayName: string;
  isBot: boolean;
  connected: boolean;
  substituted: boolean;
}
export interface LiveRoom {
  matchId: string;
  game: string;
  ply: number;
  ageMs: number;
  turn: number | null;
  seats: LiveRoomSeat[];
}

export interface AdminProduct {
  id: string;
  kind: string;
  sku: string;
  priceCents: number;
  gems: number | null;
  chips: number | null;
  cosmeticId: string | null;
  active: boolean;
}
export interface ProductCreate {
  sku: string;
  kind: string;
  priceCents: number;
  gems?: number | null;
  chips?: number | null;
  cosmeticId?: string | null;
  active?: boolean;
}
export interface ProductPatch {
  priceCents?: number;
  gems?: number | null;
  chips?: number | null;
  cosmeticId?: string | null;
  active?: boolean;
}

export interface OrderItem {
  id: string;
  stripeId: string;
  status: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  sku: string | null;
  kind: string | null;
  priceCents: number;
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
}

// ── Разширен CRUD (сезони, мачове, данни на играч) ──────────────────────────

export interface AdminSeason {
  id: string;
  index: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export interface AdminMatchesFilter {
  game?: string;
  userId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}
export interface AdminMatchRow {
  id: string;
  game: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  players: number;
}
export interface AdminMatchDetail {
  id: string;
  game: string;
  mode: string;
  seed: string | null;
  seedHidden: boolean;
  startedAt: string;
  endedAt: string | null;
  players: {
    id: string;
    userId: string;
    displayName: string | null;
    seat: number;
    result: string | null;
    mmrDelta: number;
    chipsDelta: string;
  }[];
}

export interface AdminInventoryItem {
  id: string;
  cosmeticId: string;
  equipped: boolean;
  name: string | null;
  game: string | null;
  type: string | null;
}
export interface AdminAchievement {
  key: string;
  unlockedAt: string;
  title: string | null;
  icon: string | null;
}
export interface AdminQuest {
  id: string;
  key: string;
  period: string;
  progress: number;
  target: number;
  completedAt: string | null;
}
export interface AdminRating {
  game: string;
  mmr: number;
  games: number;
  wins: number;
}
export interface AdminNotification {
  id: string;
  type: string;
  data: { title?: string; body?: string; kind?: string } | null;
  readAt: string | null;
  createdAt: string;
}
export interface AdminSubscription {
  id: string;
  stripeSubId: string;
  tier: string;
  status: string;
  currentPeriodEnd: string;
}

type Ok = { ok: true };
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

// ── Calls ────────────────────────────────────────────────────────────────────

export const adminApi = {
  users: (filter: AdminUsersFilter) =>
    request<{ users: AdminUserRow[]; nextCursor: string | null }>(`/admin/users${qs({ ...filter })}`),
  user: (id: string) => request<AdminUserDetail>(`/admin/users/${id}`),
  updateUser: (id: string, patch: AdminUserPatch) =>
    request<{ user: AdminUserRow }>(`/admin/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  userMatches: (id: string, cursor?: string) =>
    request<Page<AdminMatchItem>>(`/admin/users/${id}/matches${qs({ cursor })}`),
  audit: (filter: AdminAuditFilter) =>
    request<Page<AdminAuditEntry>>(`/admin/audit${qs({ ...filter })}`),
  reports: (status: string, cursor?: string) =>
    request<Page<ChatReportItem>>(`/admin/reports${qs({ status, cursor })}`),
  resolveReport: (id: string, status: "OPEN" | "RESOLVED" | "DISMISSED") =>
    request<{ report: ChatReportItem }>(`/admin/reports/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  timeseries: (days = 14) => request<EconomyResponse>(`/admin/stats/timeseries${qs({ days })}`),

  // Live tables (§14)
  rooms: () => request<{ rooms: LiveRoom[]; reachable: boolean }>("/admin/rooms"),

  // Store products
  products: () => request<{ products: AdminProduct[] }>("/admin/products"),
  createProduct: (input: ProductCreate) =>
    request<{ product: AdminProduct }>("/admin/products", { method: "POST", body: JSON.stringify(input) }),
  updateProduct: (id: string, patch: ProductPatch) =>
    request<{ product: AdminProduct }>(`/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  // Orders / refunds
  orders: (status: string, cursor?: string) =>
    request<Page<OrderItem>>(`/admin/orders${qs({ status, cursor })}`),
  refundOrder: (id: string, clawback: boolean) =>
    request<{ ok: true; clawedGems: number; clawedChips: number }>(`/admin/orders/${id}/refund`, {
      method: "POST",
      body: JSON.stringify({ clawback }),
    }),

  // In-app announcements
  announcements: () => request<{ items: AdminAnnouncement[] }>("/admin/announcements"),
  createAnnouncement: (input: { title: string; body: string; expiresAt?: string | null }) =>
    request<{ announcement: AdminAnnouncement }>("/admin/announcements", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  setAnnouncementActive: (id: string, active: boolean) =>
    request<{ announcement: AdminAnnouncement }>(`/admin/announcements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),
  // Сезони
  seasons: () => request<{ items: AdminSeason[] }>("/admin/seasons"),
  createSeason: (input: { index: number; startsAt: string; endsAt: string }) =>
    request<{ season: AdminSeason }>("/admin/seasons", json("POST", input)),
  updateSeason: (id: string, patch: { startsAt?: string; endsAt?: string }) =>
    request<{ season: AdminSeason }>(`/admin/seasons/${id}`, json("PATCH", patch)),
  activateSeason: (id: string) => request<{ season: AdminSeason }>(`/admin/seasons/${id}/activate`, json("POST")),
  deleteSeason: (id: string) => request<Ok>(`/admin/seasons/${id}`, json("DELETE")),

  // Мачове
  matches: (filter: AdminMatchesFilter) => request<Page<AdminMatchRow>>(`/admin/matches${qs({ ...filter })}`),
  match: (id: string) => request<{ match: AdminMatchDetail }>(`/admin/matches/${id}`),

  // Данни на играч
  userInventory: (id: string) => request<{ items: AdminInventoryItem[] }>(`/admin/users/${id}/inventory`),
  grantCosmetic: (id: string, cosmeticId: string) =>
    request<unknown>(`/admin/users/${id}/inventory`, json("POST", { cosmeticId })),
  revokeCosmetic: (id: string, itemId: string) => request<Ok>(`/admin/users/${id}/inventory/${itemId}`, json("DELETE")),
  userAchievements: (id: string) => request<{ items: AdminAchievement[] }>(`/admin/users/${id}/achievements`),
  grantAchievement: (id: string, key: string) =>
    request<unknown>(`/admin/users/${id}/achievements`, json("POST", { key })),
  revokeAchievement: (id: string, key: string) =>
    request<Ok>(`/admin/users/${id}/achievements/${encodeURIComponent(key)}`, json("DELETE")),
  userQuests: (id: string) => request<{ items: AdminQuest[] }>(`/admin/users/${id}/quests`),
  resetQuest: (id: string, questId: string) => request<Ok>(`/admin/users/${id}/quests/${questId}`, json("DELETE")),
  userRatings: (id: string) => request<{ items: AdminRating[] }>(`/admin/users/${id}/ratings`),
  setRating: (id: string, game: string, body: { mmr: number } | { reset: true }) =>
    request<{ rating: AdminRating }>(`/admin/users/${id}/ratings/${game}`, json("PATCH", body)),
  userNotifications: (id: string) => request<{ items: AdminNotification[] }>(`/admin/users/${id}/notifications`),
  sendNotification: (id: string, input: { title: string; body: string }) =>
    request<unknown>(`/admin/users/${id}/notifications`, json("POST", input)),
  userSubscription: (id: string) =>
    request<{ subscription: AdminSubscription | null }>(`/admin/users/${id}/subscription`),
  eraseUser: (id: string, confirmEmail: string) => request<Ok>(`/admin/users/${id}`, json("DELETE", { confirmEmail })),

  // Твърдо изтриване
  deleteAnnouncement: (id: string) => request<Ok>(`/admin/announcements/${id}`, json("DELETE")),
  deleteProduct: (id: string) => request<Ok>(`/admin/products/${id}`, json("DELETE")),
};
