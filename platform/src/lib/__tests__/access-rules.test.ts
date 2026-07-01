import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveSiteRole,
  roleSatisfies,
  canAccessSite,
  type MembershipRef,
} from "@/lib/access-rules";

const memberships: MembershipRef[] = [
  { siteId: "s1", role: "MANAGER" },
  { siteId: "s2", role: "VIEWER" },
];

test("OWNER има MANAGER права до всеки сайт, дори без членство", () => {
  assert.equal(effectiveSiteRole("OWNER", [], "any"), "MANAGER");
  assert.equal(canAccessSite("OWNER", [], "any", "read"), true);
  assert.equal(canAccessSite("OWNER", [], "any", "manage"), true);
});

test("MEMBER без членство няма никакъв достъп", () => {
  assert.equal(effectiveSiteRole("MEMBER", memberships, "s3"), null);
  assert.equal(canAccessSite("MEMBER", memberships, "s3", "read"), false);
  assert.equal(canAccessSite("MEMBER", memberships, "s3", "manage"), false);
});

test("MEMBER-MANAGER може да чете и да управлява своя сайт", () => {
  assert.equal(effectiveSiteRole("MEMBER", memberships, "s1"), "MANAGER");
  assert.equal(canAccessSite("MEMBER", memberships, "s1", "read"), true);
  assert.equal(canAccessSite("MEMBER", memberships, "s1", "manage"), true);
});

test("MEMBER-VIEWER може да чете, но не да управлява", () => {
  assert.equal(effectiveSiteRole("MEMBER", memberships, "s2"), "VIEWER");
  assert.equal(canAccessSite("MEMBER", memberships, "s2", "read"), true);
  assert.equal(canAccessSite("MEMBER", memberships, "s2", "manage"), false);
});

test("roleSatisfies: null никога не удовлетворява; VIEWER само четене", () => {
  assert.equal(roleSatisfies(null, "read"), false);
  assert.equal(roleSatisfies(null, "manage"), false);
  assert.equal(roleSatisfies("VIEWER", "read"), true);
  assert.equal(roleSatisfies("VIEWER", "manage"), false);
  assert.equal(roleSatisfies("MANAGER", "read"), true);
  assert.equal(roleSatisfies("MANAGER", "manage"), true);
});

test("MEMBER не получава достъп през чуждо членство (изолация между сайтове)", () => {
  // Членство за s1/s2 не бива да дава достъп до s3 под никаква форма.
  for (const need of ["read", "manage"] as const) {
    assert.equal(canAccessSite("MEMBER", memberships, "s3", need), false);
  }
});
