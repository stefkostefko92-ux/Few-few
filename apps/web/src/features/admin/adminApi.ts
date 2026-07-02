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
};
