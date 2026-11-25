import { describe, expect, it } from "vitest";
import { sortBelote, sortByRank, sortHand, sortNatural, sortRummy, sortSantase } from "./sortHand";

describe("sortHand", () => {
  it("групира боите ♠ ♥ ♣ ♦ и подрежда по естествена сила", () => {
    expect(sortNatural(["7D", "KS", "2C", "AH", "TS", "9H"])).toEqual(["KS", "TS", "AH", "9H", "2C", "7D"]);
  });

  it("козът е първата група вляво", () => {
    expect(sortNatural(["KS", "AH", "2C", "7D"], "D")).toEqual(["7D", "KS", "AH", "2C"]);
  });

  it("не променя входа и е стабилна", () => {
    const hand = ["7D", "KS"];
    const out = sortNatural(hand);
    expect(hand).toEqual(["7D", "KS"]);
    expect(out).not.toBe(hand);
  });

  it("Белот: козът J 9 A T K Q 8 7, некозът A T K Q J 9 8 7", () => {
    const hand = ["7H", "8H", "QH", "KH", "TH", "AH", "9H", "JH", "JS", "AS", "TS", "9S"];
    expect(sortBelote(hand, "H")).toEqual([
      "JH", "9H", "AH", "TH", "KH", "QH", "8H", "7H",
      "AS", "TS", "JS", "9S",
    ]);
  });

  it("Белот: Всичко коз — всички бои по козовия ред", () => {
    expect(sortBelote(["AS", "JS", "9H", "TH", "7C", "JC"], "AT")).toEqual(["JS", "AS", "9H", "TH", "JC", "7C"]);
  });

  it("Белот: Без коз и наддаване — некозов ред, без коз", () => {
    const hand = ["JS", "AS", "9H", "TH", "7C", "JC"];
    const plain = ["AS", "JS", "TH", "9H", "JC", "7C"];
    expect(sortBelote(hand, "NT")).toEqual(plain);
    expect(sortBelote(hand, null)).toEqual(plain);
  });

  it("Белот: козът е вляво дори да не е най-старата боя", () => {
    expect(sortBelote(["AS", "AH", "7C", "JD", "9D"], "D")).toEqual(["JD", "9D", "AS", "AH", "7C"]);
  });

  it("Сантасе: A T K Q J 9, козът първи", () => {
    expect(sortSantase(["9S", "JH", "AH", "TS", "QH", "KS", "AS"], "H")).toEqual([
      "AH", "QH", "JH", "AS", "TS", "KS", "9S",
    ]);
  });

  it("Риба: по ранг, в ранга по боя", () => {
    expect(sortByRank(["2S", "KD", "KS", "AC", "2H", "KH"])).toEqual(["AC", "KS", "KH", "KD", "2S", "2H"]);
  });

  it("Реми: по боя възходящо (асо ниско), жокерите накрая", () => {
    expect(sortRummy(["*1", "KSa", "ASb", "TDa", "2Sa", "3Hb", "*2"])).toEqual([
      "ASb", "2Sa", "KSa", "3Hb", "TDa", "*1", "*2",
    ]);
  });

  it("скрита карта и непознат ранг отиват накрая, без да се губят", () => {
    expect(sortHand(["?", "KS", "?"])).toEqual(["KS", "?", "?"]);
    expect(sortHand(["7S", "AS"], { order: ["A"] })).toEqual(["AS", "7S"]);
  });

  it("раздаванията от e2e (belote/kent/bridge) дават очаквания показван ред", () => {
    expect(sortBelote(["QC", "KH", "8S", "TH", "7S"], null)).toEqual(["8S", "7S", "TH", "KH", "QC"]);
    expect(sortNatural(["2C", "TS", "AC", "2S"])).toEqual(["TS", "2S", "AC", "2C"]);
    expect(
      sortNatural(["2S", "5D", "QH", "AS", "4H", "5H", "2H", "JD", "TC", "9H", "KS", "JH", "6S"]),
    ).toEqual(["AS", "KS", "6S", "2S", "QH", "JH", "9H", "5H", "4H", "2H", "TC", "JD", "5D"]);
  });
});
