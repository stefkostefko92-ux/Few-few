"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

async function act(
  entity: string,
  action: "PUBLISH" | "DELETE",
  id: string,
  fn: () => Promise<unknown>,
  paths: string[],
) {
  const session = await requireSession();
  if (!id) return;
  await fn();
  await audit({ userEmail: session.sub, action, entity, entityId: id, summary: `${action} ${entity}` });
  for (const p of paths) revalidatePath(p);
}

const PATHS_HELP = ["/admin/obshtnost", "/zov-za-pomosht"];
const PATHS_VOL = ["/admin/obshtnost", "/dobrovolci"];
const PATHS_MEM = ["/admin/obshtnost", "/spomeni"];
const PATHS_GAL = ["/admin/obshtnost", "/galeriya"];

export async function publishHelp(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("HelpCause", "PUBLISH", id, () => prisma.helpCause.update({ where: { id }, data: { published: true } }), PATHS_HELP);
}
export async function deleteHelp(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("HelpCause", "DELETE", id, () => prisma.helpCause.delete({ where: { id } }), PATHS_HELP);
}
export async function publishVolunteer(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("Volunteer", "PUBLISH", id, () => prisma.volunteer.update({ where: { id }, data: { published: true } }), PATHS_VOL);
}
export async function deleteVolunteer(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("Volunteer", "DELETE", id, () => prisma.volunteer.delete({ where: { id } }), PATHS_VOL);
}
export async function publishMemory(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("Memory", "PUBLISH", id, () => prisma.memory.update({ where: { id }, data: { published: true } }), PATHS_MEM);
}
export async function deleteMemory(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("Memory", "DELETE", id, () => prisma.memory.delete({ where: { id } }), PATHS_MEM);
}
export async function publishPhoto(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("GalleryPhoto", "PUBLISH", id, () => prisma.galleryPhoto.update({ where: { id }, data: { published: true } }), PATHS_GAL);
}
export async function deletePhoto(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  await act("GalleryPhoto", "DELETE", id, () => prisma.galleryPhoto.delete({ where: { id } }), PATHS_GAL);
}
