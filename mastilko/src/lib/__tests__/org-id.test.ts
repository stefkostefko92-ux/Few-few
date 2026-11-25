// Един субект за дружеството във всички наши продукти: @id е каноничният, който публикува самият
// carbonstealth.eu. С различен @id (напр. #org) търсачките виждат две организации вместо една.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ID } from "../site";

test("ID.org е каноничният @id на Carbon Stealth VCC от carbonstealth.eu", () => {
  assert.equal(ID.org, "https://carbonstealth.eu/#organization");
});
