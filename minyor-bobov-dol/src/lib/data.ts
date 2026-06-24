// Слой за достъп до публичните данни. Всяка заявка е обвита в try/catch и при
// липсваща/недостъпна база връща празна стойност — така страниците се
// рендират устойчиво (показват „празно състояние" вместо грешка).
import { prisma } from "@/lib/prisma";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

// ── Новини ──
export function getLatestPosts(take = 3) {
  return safe(
    () =>
      prisma.post.findMany({
        where: { published: true },
        orderBy: { publishedAt: "desc" },
        take,
      }),
    [],
  );
}

export function getAllPosts() {
  return safe(
    () =>
      prisma.post.findMany({
        where: { published: true },
        orderBy: { publishedAt: "desc" },
      }),
    [],
  );
}

export function getPostBySlug(slug: string) {
  return safe(
    () => prisma.post.findFirst({ where: { slug, published: true } }),
    null,
  );
}

export function getPostSlugs() {
  return safe(
    () =>
      prisma.post.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
      }),
    [],
  );
}

// ── Мачове ──
export function getNextMatch() {
  return safe(
    () =>
      prisma.match.findFirst({
        where: { published: true, status: "SCHEDULED", kickoff: { gte: startOfToday() } },
        orderBy: { kickoff: "asc" },
      }),
    null,
  );
}

export function getUpcomingMatches(take = 20) {
  return safe(
    () =>
      prisma.match.findMany({
        where: { published: true, status: { in: ["SCHEDULED", "POSTPONED"] } },
        orderBy: { kickoff: "asc" },
        take,
      }),
    [],
  );
}

export function getRecentResults(take = 5) {
  return safe(
    () =>
      prisma.match.findMany({
        where: { published: true, status: "FINISHED" },
        orderBy: { kickoff: "desc" },
        take,
      }),
    [],
  );
}

export function getAllMatches() {
  return safe(
    () =>
      prisma.match.findMany({
        where: { published: true },
        orderBy: { kickoff: "desc" },
      }),
    [],
  );
}

// ── Класиране ──
export function getStandings(season?: string) {
  return safe(
    () =>
      prisma.standingRow.findMany({
        where: { published: true, ...(season ? { season } : {}) },
        orderBy: { position: "asc" },
      }),
    [],
  );
}

// ── Състав и щаб ──
export function getActivePlayers() {
  return safe(
    () =>
      prisma.player.findMany({
        where: { active: true },
        orderBy: [{ order: "asc" }, { number: "asc" }],
      }),
    [],
  );
}

export function getStaff() {
  return safe(
    () =>
      prisma.staff.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    [],
  );
}

// ── История ──
export function getHonours() {
  return safe(
    () =>
      prisma.honourItem.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    [],
  );
}

// ── Галерия ──
export function getGallery() {
  return safe(
    () =>
      prisma.galleryPhoto.findMany({
        where: { published: true },
        orderBy: [{ album: "asc" }, { order: "asc" }],
      }),
    [],
  );
}

// ── Спонсори ──
export function getSponsors() {
  return safe(
    () =>
      prisma.sponsor.findMany({
        where: { published: true },
        orderBy: [{ tier: "asc" }, { order: "asc" }],
      }),
    [],
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
