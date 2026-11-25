import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { RESOURCES } from "@/lib/admin/resources";
import { DASHBOARD, NAV_GROUPS, activeItem, matchesQuery, navFor } from "@/lib/admin/nav";

const all = NAV_GROUPS.flatMap((g) => g.items);

test("менюто: всеки ресурс от RESOURCES е в менюто точно веднъж", () => {
  for (const r of RESOURCES) {
    const n = all.filter((i) => i.href === `/admin/${r.key}`).length;
    assert.equal(n, 1, `/admin/${r.key} се среща ${n} пъти`);
  }
});

test("менюто: няма повтарящи се адреси и всяка системна страница съществува", () => {
  const hrefs = all.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  const resourceHrefs = new Set(RESOURCES.map((r) => `/admin/${r.key}`));
  for (const h of hrefs) {
    if (resourceHrefs.has(h)) continue;
    const page = join(process.cwd(), "src/app", h, "page.tsx");
    assert.ok(existsSync(page), `липсва страница за ${h}`);
  }
});

test("менюто: ADMIN вижда всичко; EDITOR — без разделите само за администратор", () => {
  const admin = navFor("ADMIN").flatMap((g) => g.items);
  const editor = navFor("EDITOR").flatMap((g) => g.items);
  assert.equal(admin.length, all.length);
  assert.ok(editor.every((i) => !i.adminOnly));
  for (const r of RESOURCES.filter((x) => x.adminOnly))
    assert.ok(!editor.some((i) => i.href === `/admin/${r.key}`), r.key);
  assert.ok(!editor.some((i) => i.href === "/admin/poshta" || i.href === "/admin/users"));
  // Празна група не се показва.
  assert.ok(navFor("EDITOR").every((g) => g.items.length > 0));
});

test("менюто: активният раздел — най-дългото съвпадение; таблото само на /admin", () => {
  const groups = navFor("ADMIN");
  assert.equal(activeItem("/admin", groups)?.item, DASHBOARD);
  assert.equal(activeItem("/admin/faq", groups)?.item.href, "/admin/faq");
  assert.equal(activeItem("/admin/faq/abc/edit", groups)?.item.href, "/admin/faq");
  assert.equal(activeItem("/admin/signali", groups)?.group?.id, "inbox");
  assert.equal(activeItem("/admin/faqx", groups), null);
  assert.equal(activeItem("/admin/nepoznato", groups), null);
});

test("менюто: търсенето е по етикет и подсказка, без значение главни букви", () => {
  const find = (q: string) => all.filter((i) => matchesQuery(i, q)).map((i) => i.href);
  assert.ok(find("ПОЩА").includes("/admin/poshta"));
  assert.ok(find("brevo").includes("/admin/poshta"));
  assert.ok(find("аптек").includes("/admin/dezhurstva"));
  assert.ok(find("как да").includes("/admin/faq"));
  assert.deepEqual(find("xyzнесъществуващо"), []);
  assert.equal(find("").length, all.length);
});
