import { describe, expect, it } from "vitest";
import { envBool } from "./env.js";

describe("envBool", () => {
  const off = envBool(false);
  const on = envBool(true);

  it("„false“ и „0“ са false — не true, както при z.coerce.boolean()", () => {
    for (const v of ["false", "FALSE", "0", "no", "off", " false "]) expect(off.parse(v)).toBe(false);
  });

  it("изричните истини са true", () => {
    for (const v of ["true", "1", "yes", "on", "True"]) expect(off.parse(v)).toBe(true);
  });

  it("липсваща или празна стойност → подразбиращото се", () => {
    expect(off.parse(undefined)).toBe(false);
    expect(off.parse("")).toBe(false);
    expect(on.parse(undefined)).toBe(true);
  });

  it("боклук се отхвърля, вместо тихо да стане true", () => {
    expect(() => off.parse("maybe")).toThrow();
  });
});
