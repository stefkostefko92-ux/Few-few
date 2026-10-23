import { describe, it, expect } from "vitest";
import { upgradeStored } from "../content-upgrade";
import { defaultFor } from "../defaults";

describe("съдържание от старата версия на сайта", () => {
  it("непипан стар текст минава на новия", () => {
    const old = { badge: "Centro linguistico e culturale dal 2014", titleA: "La ", titleAccent: "lingua", titleB: " e la cultura bulgara, nel cuore di Milano." };
    const { value, changed } = upgradeStored("hero", "it", old, defaultFor("hero", "it"));
    expect(changed).toBe(true);
    expect((value as { badge: string }).badge).toBe(defaultFor("hero", "it").badge);
    expect((value as { title: string }).title).toBe("La lingua e la cultura bulgara, nel cuore di Milano.");
  });

  it("редактираното заглавие се пази, само се слива в едно поле", () => {
    const edited = { titleA: "Il ", titleAccent: "bulgaro", titleB: " per tutti." };
    const { value } = upgradeStored("hero", "it", edited, defaultFor("hero", "it"));
    expect((value as { title: string }).title).toBe("Il bulgaro per tutti.");
  });

  it("редактиран етикет НЕ се презаписва", () => {
    const { value } = upgradeStored("hero", "it", { badge: "Il mio testo", title: "X" }, defaultFor("hero", "it"));
    expect((value as { badge: string }).badge).toBe("Il mio testo");
  });

  it("редактиран график се превръща в ден/час/място", () => {
    const sched = [{ day: "DOM", time: "10–12", title: "Domenica · 10:00–12:30", place: "Altrove" }];
    const { value } = upgradeStored("dance", "it", { schedule: sched }, defaultFor("dance", "it"));
    expect((value as { schedule: unknown[] }).schedule).toEqual([{ day: "Domenica", time: "10:00–12:30", place: "Altrove" }]);
  });

  it("второ минаване не променя нищо (идемпотентно)", () => {
    const first = upgradeStored("hero", "bg", { titleA: "А", titleAccent: "Б", titleB: "В" }, defaultFor("hero", "bg"));
    const second = upgradeStored("hero", "bg", first.value, defaultFor("hero", "bg"));
    expect(second.changed).toBe(false);
  });

  it("цитатът губи тирето отпред (дизайнът го слага сам)", () => {
    const { value } = upgradeStored("school", "en", { quoteCite: "— Somebody" }, defaultFor("school", "en"));
    expect((value as { quoteCite: string }).quoteCite).toBe("Somebody");
  });
});
