import type { PrincipalKey } from "./types";

export type Principal = {
  key: PrincipalKey;
  name: string;
  short: string;
};

// „Принципал“ = органът, който упражнява правата на държавата като собственик
// (обикновено ресорният министър). По Закона за публичните предприятия общата
// политика и мониторингът се координират от Агенцията за публичните предприятия
// и контрол (АППК).
export const PRINCIPALS: Principal[] = [
  { key: "energetika", name: "Министър на енергетиката", short: "Енергетика" },
  {
    key: "transport",
    name: "Министър на транспорта и съобщенията",
    short: "Транспорт",
  },
  {
    key: "ikonomika",
    name: "Министър на икономиката и индустрията",
    short: "Икономика",
  },
  {
    key: "zemedelie",
    name: "Министър на земеделието и храните",
    short: "Земеделие",
  },
  {
    key: "rrb",
    name: "Министър на регионалното развитие и благоустройството",
    short: "Регионално развитие",
  },
  { key: "finansi", name: "Министър на финансите", short: "Финанси" },
  { key: "sport", name: "Министър на младежта и спорта", short: "Спорт" },
  {
    key: "osv",
    name: "Министър на околната среда и водите",
    short: "Околна среда",
  },
  { key: "zdrave", name: "Министър на здравеопазването", short: "Здравеопазване" },
  { key: "ms", name: "Министерски съвет", short: "Министерски съвет" },
];

export function principal(key: PrincipalKey): Principal {
  const p = PRINCIPALS.find((x) => x.key === key);
  if (!p) throw new Error(`Непознат принципал: ${key}`);
  return p;
}
