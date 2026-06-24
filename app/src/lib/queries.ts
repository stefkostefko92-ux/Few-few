// Безопасни заявки към базата за публичните списъци. Ако няма връзка с базата
// (напр. в среда без DATABASE_URL), връщат празен резултат, а страницата показва
// празно състояние вместо да се счупи.
import { prisma } from "@/lib/prisma";

export async function safeList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

export function getPublishedEvents() {
  return safeList(() =>
    prisma.event.findMany({
      where: { published: true, startAt: { gte: startOfToday() } },
      orderBy: { startAt: "asc" },
      take: 50,
    }),
  );
}

export function getPublishedPosts() {
  return safeList(() =>
    prisma.post.findMany({
      where: { published: true },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  );
}

export function getPublishedListings() {
  return safeList(() =>
    prisma.listing.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}

export function getPublishedBusinesses() {
  return safeList(() =>
    prisma.business.findMany({
      where: { published: true },
      orderBy: [{ featured: "desc" }, { order: "asc" }, { name: "asc" }],
      take: 200,
    }),
  );
}

export function getPublishedHelpCauses() {
  return safeList(() =>
    prisma.helpCause.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}

export function getPublishedVolunteers() {
  return safeList(() =>
    prisma.volunteer.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}

export function getPublishedMemories() {
  return safeList(() =>
    prisma.memory.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}

export function getPublishedGallery() {
  return safeList(() =>
    prisma.galleryPhoto.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
  );
}

export function getPublishedRideshares() {
  return safeList(() =>
    prisma.rideshare.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  );
}

export function getPublishedScamAlerts() {
  return safeList(() =>
    prisma.scamAlert.findMany({
      where: { published: true },
      orderBy: [{ pinned: "desc" }, { order: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
  );
}

export function getPinnedScamAlert() {
  return safeList(() =>
    prisma.scamAlert.findMany({
      where: { published: true, pinned: true },
      orderBy: { order: "asc" },
      take: 1,
    }),
  ).then((rows) => rows[0] ?? null);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
