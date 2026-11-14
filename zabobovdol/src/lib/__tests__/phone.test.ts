import test from "node:test";
import assert from "node:assert/strict";
import { formatPhoneBg, isDialablePhone, nationalDigits, splitPhones } from "@/lib/phone";

test("formatPhoneBg: мобилни от +359, 00359 и 0 → „0XXX XXX XXX“", () => {
  assert.equal(formatPhoneBg("+359877414874"), "0877 414 874");
  assert.equal(formatPhoneBg("+359 877 414 874"), "0877 414 874");
  assert.equal(formatPhoneBg("00359888123456"), "0888 123 456");
  assert.equal(formatPhoneBg("0877414874"), "0877 414 874");
  assert.equal(formatPhoneBg("0882 91 23 30"), "0882 912 330");
  assert.equal(formatPhoneBg("0893 270013"), "0893 270 013");
  assert.equal(formatPhoneBg("098-123-4567"), "0981 234 567");
});

test("formatPhoneBg: Бобов дол 0702 и други малки места → „0702 6 23 23“", () => {
  assert.equal(formatPhoneBg("0702 62323"), "0702 6 23 23");
  assert.equal(formatPhoneBg("0702 6 34 69"), "0702 6 34 69");
  assert.equal(formatPhoneBg("070262026"), "0702 6 20 26");
  assert.equal(formatPhoneBg("+359 702 62112"), "0702 6 21 12");
  assert.equal(formatPhoneBg("0701 50602"), "0701 5 06 02");
});

test("formatPhoneBg: областни градове, София и националните 0700", () => {
  assert.equal(formatPhoneBg("078 559 700"), "078 55 97 00");
  assert.equal(formatPhoneBg("078 52 31 80"), "078 52 31 80");
  assert.equal(formatPhoneBg("+35932600000"), "032 60 00 00");
  assert.equal(formatPhoneBg("02 931 11 11"), "02 931 11 11");
  assert.equal(formatPhoneBg("029311111"), "02 931 11 11");
  assert.equal(formatPhoneBg("0700 10 375"), "0700 10 375");
  assert.equal(formatPhoneBg("070011311"), "0700 11 311");
  assert.equal(formatPhoneBg("0800 18 100"), "0800 18 100");
});

test("formatPhoneBg: кратките номера остават без промяна", () => {
  assert.equal(formatPhoneBg("112"), "112");
  assert.equal(formatPhoneBg("150"), "150");
  assert.equal(formatPhoneBg("166"), "166");
  assert.equal(formatPhoneBg(" 112 "), "112");
});

test("formatPhoneBg: непознатото се връща непроменено", () => {
  // Непълен номер (8 цифри с код 0702).
  assert.equal(formatPhoneBg("0702 2016"), "0702 2016");
  // Мобилен с липсваща цифра — не гадаем.
  assert.equal(formatPhoneBg("0888 12345"), "0888 12345");
  // Чужд номер.
  assert.equal(formatPhoneBg("+44 20 7946 0958"), "+44 20 7946 0958");
  assert.equal(formatPhoneBg("0044 20 7946 0958"), "0044 20 7946 0958");
  // Думи и няколко номера в едно поле.
  assert.equal(formatPhoneBg("0702 62323 (централа)"), "0702 62323 (централа)");
  assert.equal(formatPhoneBg("0702 62323, 0702 62115"), "0702 62323, 0702 62115");
  // „+“ не в началото / празно.
  assert.equal(formatPhoneBg("0702+62323"), "0702+62323");
  assert.equal(formatPhoneBg(""), "");
  assert.equal(formatPhoneBg("—"), "—");
});

test("isDialablePhone: грешна дължина или примерен номер → не е бутон", () => {
  for (const ok of [
    "112",
    "150",
    "1470",
    "0702 62323",
    "0702 6 23 23",
    "+359 877 414 874",
    "0877414874",
    "02 931 11 11",
    "078 559 700",
    "0700 14 802",
    "+44 20 7946 0958", // чужд — не съдим
    "0702 62323 (централа)", // с думи — не съдим
  ]) {
    assert.equal(isDialablePhone(ok), true, ok);
  }
  for (const bad of ["0702 2016", "0702 2000", "0702 2526", "000 000 000", "0888 12345", "62323", "0877 414 874 1"]) {
    assert.equal(isDialablePhone(bad), false, bad);
  }
});

test("nationalDigits дава националния запис само с цифри", () => {
  assert.equal(nationalDigits("+359 (877) 414-874"), "0877414874");
  assert.equal(nationalDigits("00359 702 62323"), "070262323");
  assert.equal(nationalDigits("+44 20 7946 0958"), null);
  assert.equal(nationalDigits("няма"), null);
});

test("кратките европейски 116 XXX са верни и остават без промяна", () => {
  for (const n of ["116 111", "116000", "116 123"]) {
    assert.equal(isDialablePhone(n), true, n);
    assert.equal(formatPhoneBg(n), n);
  }
});

test("splitPhones: няколко номера в едно поле → всеки поотделно", () => {
  assert.deepEqual(splitPhones("0888 123 456 / 0702 62323"), ["0888 123 456", "0702 62323"]);
  assert.deepEqual(splitPhones("0888123456/0888654321"), ["0888123456", "0888654321"]);
  assert.deepEqual(splitPhones("0702 62323, 0702 62115"), ["0702 62323", "0702 62115"]);
  assert.deepEqual(splitPhones("0702 62323; 0888 123 456"), ["0702 62323", "0888 123 456"]);
  // Само абонатният номер → кодът на предния.
  assert.deepEqual(splitPhones("0702 62323 / 62324"), ["0702 62323", "0702 62324"]);
  assert.deepEqual(splitPhones("078 55 97 00 / 55 97 01"), ["078 55 97 00", "078 55 97 01"]);
  // „/“ като разделител на кода — един номер.
  assert.deepEqual(splitPhones("0702/6 23 23"), ["0702/6 23 23"]);
  assert.deepEqual(splitPhones("02/931 11 11"), ["02/931 11 11"]);
  assert.deepEqual(splitPhones("0877 414 874"), ["0877 414 874"]);
});

test("няколко номера: не се слепват в един невалиден, всеки се съди поотделно", () => {
  for (const raw of ["0888 123 456 / 0702 62323", "0888123456/0888654321", "0702 62323 / 62324"]) {
    assert.equal(nationalDigits(raw), null, raw);
    assert.equal(isDialablePhone(raw), true, raw);
    assert.equal(formatPhoneBg(raw), raw);
    for (const p of splitPhones(raw)) assert.equal(isDialablePhone(p), true, p);
  }
  assert.equal(nationalDigits("0702/6 23 23"), "070262323");
  assert.equal(formatPhoneBg("0702/6 23 23"), "0702 6 23 23");
});
