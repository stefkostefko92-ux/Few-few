// Многогодишни финанси (по година) за най-големите държавни предприятия.
// Източник: Годишни обобщени доклади на АППК за държавните публични
// предприятия (2022/2023/2024) — карти на отделните дружества, и
// консолидираните отчети на групата БЕХ (bgenh.com). Числата са в млн. лв.
// Приходите следват дефиницията в бележката (нетни приходи от продажби /
// общо приходи / консолидирано) — виж note за всяко предприятие.
//
// НЕ редактирай наизуст — свери с посочения доклад на АППК.

import type { FinancialYear, Source } from "./types";

export type EnterpriseFinancials = {
  series: FinancialYear[];
  note?: string;
  source: Source;
};

export const FINANCIALS: Record<string, EnterpriseFinancials> = {
  "beh": {
    series: [
      { year: "2021", revenueMln: 11189, resultMln: 1349 },
      { year: "2022", revenueMln: 21159, resultMln: 3137 },
      { year: "2023", revenueMln: 11523, resultMln: 1110 },
    ],
    note: "КОНСОЛИДИРАН, група БЕХ (АЕЦ Козлодуй, НЕК, ЕСО, Булгаргаз, Булгартрансгаз, ТЕЦ Марица изток 2, Мини Марица-изток и др.). 2024 годишен консолидиран отчет още не е публикуван.",
    source: { label: "БЕХ Годишни консолидирани финансови отчети (bgenh.com), Финансови резултати на Групата", url: "https://bgenh.com/storage/app/public/uploads/files/finans/2023/31.12/FS_consolidated_BEH_2023_EN.pdf" },
  },
  "aec-kozloduy": {
    series: [
      { year: "2021", revenueMln: 2719, resultMln: 890 },
      { year: "2022", revenueMln: 6061, resultMln: 729 },
      { year: "2023", revenueMln: 2551, resultMln: 537 },
      { year: "2024", revenueMln: 2064, resultMln: 222, employees: 3813 },
    ],
    note: "индивидуален. 2022 е пикова година (борсови цени на ел. енергия). Приходи 2022 ~6061 млн (Доклад 2022) / 6079 млн (преизчислено Доклад 2023).",
    source: { label: "АППК Годишни обобщени доклади за държавните публични предприятия 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "nek": {
    series: [
      { year: "2021", revenueMln: 4118, resultMln: 650 },
      { year: "2022", revenueMln: 5277, resultMln: 1083 },
      { year: "2023", revenueMln: 3520, resultMln: 95 },
      { year: "2024", revenueMln: 3268, resultMln: 139, employees: 1938 },
    ],
    note: "индивидуален; приходи = общо приходи (вкл. Фонд СЕС). Резултат = нетна печалба.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "eso": {
    series: [
      { year: "2021", revenueMln: 947, resultMln: 79 },
      { year: "2022", revenueMln: 1805, resultMln: 91 },
      { year: "2023", revenueMln: 1367, resultMln: 250 },
      { year: "2024", revenueMln: 1389, resultMln: 265, employees: 3186 },
    ],
    note: "Електроенергиен системен оператор; индивидуален.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "bulgargaz": {
    series: [
      { year: "2021", revenueMln: 2136, resultMln: 64 },
      { year: "2022", revenueMln: 4100, resultMln: -93 },
      { year: "2023", revenueMln: 2567, resultMln: -52 },
      { year: "2024", revenueMln: 1498, resultMln: -316 },
    ],
    note: "индивидуален. 2022 приходи се различават между докладите (4100 млн по Доклад 2023 / 4934 млн по Доклад 2022) — предпочетена по-късната одитирана стойност.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "bulgartransgaz": {
    series: [
      { year: "2021", revenueMln: 606, resultMln: 141 },
      { year: "2022", revenueMln: 1149, resultMln: 283 },
      { year: "2023", revenueMln: 976, resultMln: 211 },
      { year: "2024", revenueMln: 1122, resultMln: 307 },
    ],
    note: "индивидуален; резултат = нетна печалба.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "tec-maritsa-iztok-2": {
    series: [
      { year: "2021", revenueMln: 1342, resultMln: -137 },
      { year: "2022", revenueMln: 4009, resultMln: 1190 },
      { year: "2023", revenueMln: 1432, resultMln: 58 },
      { year: "2024", revenueMln: 1220, resultMln: -102 },
    ],
    note: "индивидуален. 2022 е пикова печалба; 2024 е загуба.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "mini-maritsa-iztok": {
    series: [
      { year: "2021", revenueMln: 605, resultMln: -17 },
      { year: "2022", revenueMln: 871, resultMln: 8 },
      { year: "2023", revenueMln: 453, resultMln: -136 },
      { year: "2024", revenueMln: 382, resultMln: -270 },
    ],
    note: "индивидуален; въгледобив.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "holding-bdz": {
    series: [
      { year: "2022", revenueMln: 15, resultMln: 5 },
      { year: "2023", revenueMln: 8, resultMln: 1 },
      { year: "2024", revenueMln: 11, resultMln: 3, employees: 83 },
    ],
    note: "ИНДИВИДУАЛЕН (само холдингът-майка, малки приходи); групата БДЖ = холдинг + БДЖ-Пътнически + БДЖ-Товарни.",
    source: { label: "АППК Годишни обобщени доклади 2023/2024, карта на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "bdz-patnicheski": {
    series: [
      { year: "2021", revenueMln: 284, resultMln: -33 },
      { year: "2022", revenueMln: 344, resultMln: -16 },
      { year: "2023", revenueMln: 314, resultMln: -38 },
      { year: "2024", revenueMln: 378, resultMln: -8, employees: 5197 },
    ],
    note: "субсидирано; резултат = нетна загуба. Приходи вкл. субсидия за текуща дейност.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "bdz-tovarni": {
    series: [
      { year: "2021", revenueMln: 129, resultMln: -7 },
      { year: "2022", revenueMln: 165, resultMln: 13 },
      { year: "2023", revenueMln: 129, resultMln: -10 },
      { year: "2024", revenueMln: 138, resultMln: -7, employees: 2089 },
    ],
    note: "индивидуален.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "nkzhi": {
    series: [
      { year: "2021", revenueMln: 513, resultMln: -14 },
      { year: "2022", revenueMln: 576, resultMln: 15 },
      { year: "2023", revenueMln: 593, resultMln: -14 },
      { year: "2024", revenueMln: 626, resultMln: -28, employees: 10437 },
    ],
    note: "ДП Национална компания Железопътна инфраструктура; субсидирано. Резултат = счетоводна нетна печалба/загуба.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "dp-rvd": {
    series: [
      { year: "2021", revenueMln: 188, resultMln: 3 },
      { year: "2022", revenueMln: 293, resultMln: 10 },
      { year: "2023", revenueMln: 342, resultMln: 18 },
      { year: "2024", revenueMln: 308, resultMln: 10, employees: 1174 },
    ],
    note: "Ръководство на въздушното движение; финансира се от такси за аеронавигационно обслужване.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "balgarski-poshti": {
    series: [
      { year: "2021", revenueMln: 224, resultMln: -14 },
      { year: "2022", revenueMln: 206, resultMln: -67 },
      { year: "2023", revenueMln: 251, resultMln: -35 },
      { year: "2024", revenueMln: 310, resultMln: 1, employees: 6623 },
    ],
    note: "универсална пощенска услуга; резултат = нетна печалба/загуба.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "dppi": {
    series: [
      { year: "2022", revenueMln: 53, resultMln: -12 },
      { year: "2023", revenueMln: 59, resultMln: -11 },
      { year: "2024", revenueMln: 68, resultMln: -20, employees: 415 },
    ],
    note: "ДППИ; управление на пристанищна инфраструктура.",
    source: { label: "АППК Годишни обобщени доклади 2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "pristanishte-varna": {
    series: [
      { year: "2021", revenueMln: 56, resultMln: -2 },
      { year: "2022", revenueMln: 73, resultMln: 8 },
      { year: "2023", revenueMln: 85, resultMln: 15 },
      { year: "2024", revenueMln: 84, resultMln: 8 },
    ],
    note: "индивидуален.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "vmz-sopot": {
    series: [
      { year: "2022", revenueMln: 524, resultMln: 82 },
      { year: "2023", revenueMln: 913, resultMln: 143 },
      { year: "2024", revenueMln: 977, resultMln: 220, employees: 4732 },
    ],
    note: "Вазовски машиностроителни заводи, Сопот; индивидуален. 2021 приход непотвърден — пропуснат.",
    source: { label: "АППК Годишни обобщени доклади 2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "dkk": {
    series: [
      { year: "2021", revenueMln: 49, resultMln: 26 },
      { year: "2022", revenueMln: 22, resultMln: 14 },
      { year: "2023", revenueMln: 53, resultMln: 14 },
      { year: "2024", revenueMln: 294, resultMln: 57 },
    ],
    note: "Държавна консолидационна компания; индивидуален. Приходите варират според дейности/сделки по години.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "balgarski-sporten-totalizator": {
    series: [
      { year: "2021", revenueMln: 294, resultMln: 5 },
      { year: "2022", revenueMln: 341, resultMln: 8 },
      { year: "2023", revenueMln: 404, resultMln: 13 },
      { year: "2024", revenueMln: 428, resultMln: 21 },
    ],
    note: "ДП; приходи = общо приходи от дейността.",
    source: { label: "АППК Годишни обобщени доклади 2022/2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "napoitelni-sistemi": {
    series: [
      { year: "2022", revenueMln: 51, resultMln: 0 },
      { year: "2023", revenueMln: 51, resultMln: 0 },
      { year: "2024", revenueMln: 62, resultMln: 0 },
    ],
    note: "силно субсидирано; резултат близо до нула (2022 +0.03, 2023 +0.004, 2024 +0.13 млн).",
    source: { label: "АППК Годишни обобщени доклади 2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
  "umbal-sv-georgi-plovdiv": {
    series: [
      { year: "2022", revenueMln: 245 },
      { year: "2023", revenueMln: 267, resultMln: 12 },
      { year: "2024", revenueMln: 308, resultMln: 15, employees: 2700 },
    ],
    note: "най-голямата държавна болница; резултат = нетна печалба. 2022 печалба непотвърдена — пропусната.",
    source: { label: "АППК Годишни обобщени доклади 2023/2024, карти на дружеството", url: "https://appk.government.bg/upload/10708/%D0%9E%D0%91%D0%9E%D0%91%D0%A9%D0%95%D0%9D+%D0%94%D0%9E%D0%9A%D0%9B%D0%90%D0%94+2024.pdf" },
  },
};
