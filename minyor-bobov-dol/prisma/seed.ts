/**
 * Първоначално зареждане на базата: администраторски акаунт + примерни данни.
 * Примерните записи са ясно отбелязани и се заменят от админ панела.
 *
 * Стартиране: `npm run db:seed`
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Лек зареждач на .env (tsx не зарежда .env автоматично).
function loadEnv() {
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* липсва .env — разчитаме на средата */
  }
}

loadEnv();

const prisma = new PrismaClient();
const NOTE = " [примерни данни — заменете от админ панела]";

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@carbonstealth.eu")
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME ?? "Администратор";

  if (password.length < 10) {
    throw new Error(
      "ADMIN_PASSWORD трябва да е поне 10 знака. Задайте го в .env преди seed.",
    );
  }
  const weak = ["password", "parola", "123456", "adminadmin", "СМЕНИ_МЕ"];
  if (weak.some((w) => password.toLowerCase().includes(w.toLowerCase()))) {
    throw new Error("ADMIN_PASSWORD изглежда твърде слаба. Изберете по-силна.");
  }

  const passwordHash = await bcrypt.hash(password, 11);
  await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", active: true, name },
    create: { email, name, role: "ADMIN", passwordHash },
  });
  console.log(`✔ Администратор: ${email}`);
}

async function seedHonours() {
  const items = [
    { year: "1946", title: "Раждането на „Миньор“", description: "Дружеството приема името „Миньор“ и преминава на издръжка към мина „Бобов дол“.", order: 1 },
    { year: "1957", title: "Учредяване на ДФС „Миньор“", description: "Създадено е Доброволното физкултурно дружество „Миньор“ — основата на клуба.", order: 2 },
    { year: "1985", title: "Футболен клуб „Миньор“", description: "На основата на ДФС е образуван едноименният футболен клуб.", order: 3 },
    { year: "2004/05", title: "7-о място в „Б“ група", description: "Едно от най-силните представяния на отбора в професионалния футбол.", order: 4 },
    { year: "2004/05", title: "1/8-финал за Купата на България", description: "„Миньор“ достига до осминафиналите на турнира за Купата.", order: 5 },
    { year: "2019", title: "Пресъздаване на клуба", description: "Клубът е възстановен под името „Миньор 2019“ и продължава традицията.", order: 6 },
  ];
  for (const it of items) {
    await prisma.honourItem.create({ data: { ...it, description: (it.description ?? "") + NOTE } });
  }
  console.log(`✔ История и постижения: ${items.length} записа`);
}

async function seedStaff() {
  const staff = [
    { name: "Иван Иванов", role: "Старши треньор", order: 1 },
    { name: "Петър Петров", role: "Помощник-треньор", order: 2 },
    { name: "Георги Георгиев", role: "Президент на клуба", order: 3 },
  ];
  for (const s of staff) {
    await prisma.staff.create({ data: { ...s, bio: NOTE.trim() } });
  }
  console.log(`✔ Треньорски щаб: ${staff.length} записа`);
}

async function seedPlayers() {
  const players: {
    name: string;
    number: number;
    position: "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";
    order: number;
  }[] = [
    { name: "Стоян Стоянов", number: 1, position: "GOALKEEPER", order: 1 },
    { name: "Николай Колев", number: 4, position: "DEFENDER", order: 2 },
    { name: "Мартин Маринов", number: 5, position: "DEFENDER", order: 3 },
    { name: "Александър Димитров", number: 6, position: "DEFENDER", order: 4 },
    { name: "Кирил Кирилов", number: 8, position: "MIDFIELDER", order: 5 },
    { name: "Васил Василев", number: 10, position: "MIDFIELDER", order: 6 },
    { name: "Драгомир Тодоров", number: 7, position: "MIDFIELDER", order: 7 },
    { name: "Емил Емилов", number: 9, position: "FORWARD", order: 8 },
    { name: "Борислав Борисов", number: 11, position: "FORWARD", order: 9 },
  ];
  for (const p of players) {
    await prisma.player.create({ data: { ...p, bio: NOTE.trim() } });
  }
  console.log(`✔ Състав: ${players.length} футболисти`);
}

async function seedMatches() {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const at = (offsetDays: number, h: number) => {
    const d = new Date(now.getTime() + offsetDays * day);
    d.setUTCHours(h, 0, 0, 0);
    return d;
  };
  // Изиграни мачове.
  await prisma.match.create({ data: { opponent: "Велбъжд (Кюстендил)", isHome: true, kickoff: at(-14, 14), status: "FINISHED", homeGoals: 2, awayGoals: 1, round: "10 кръг", notes: NOTE.trim() } });
  await prisma.match.create({ data: { opponent: "Струмска слава (Радомир)", isHome: false, kickoff: at(-7, 16), status: "FINISHED", homeGoals: 1, awayGoals: 1, round: "11 кръг" } });
  // Предстоящи мачове.
  await prisma.match.create({ data: { opponent: "Рилски спортист (Самоков)", isHome: true, kickoff: at(4, 15), status: "SCHEDULED", round: "12 кръг" } });
  await prisma.match.create({ data: { opponent: "Германея (Сапарева баня)", isHome: false, kickoff: at(11, 16), status: "SCHEDULED", round: "13 кръг" } });
  console.log("✔ Програма: 4 мача (2 изиграни, 2 предстоящи)");
}

async function seedStandings() {
  const rows = [
    { position: 1, teamName: "Рилски спортист (Самоков)", played: 11, won: 8, drawn: 2, lost: 1, goalsFor: 24, goalsAgainst: 8, points: 26 },
    { position: 2, teamName: "Велбъжд (Кюстендил)", played: 11, won: 7, drawn: 2, lost: 2, goalsFor: 21, goalsAgainst: 11, points: 23 },
    { position: 3, teamName: "Миньор (Бобов дол)", played: 11, won: 6, drawn: 3, lost: 2, goalsFor: 18, goalsAgainst: 12, points: 21, isOwnTeam: true },
    { position: 4, teamName: "Германея (Сапарева баня)", played: 11, won: 5, drawn: 3, lost: 3, goalsFor: 17, goalsAgainst: 14, points: 18 },
    { position: 5, teamName: "Струмска слава (Радомир)", played: 11, won: 4, drawn: 4, lost: 3, goalsFor: 15, goalsAgainst: 14, points: 16 },
    { position: 6, teamName: "Бобов дол U19", played: 11, won: 2, drawn: 2, lost: 7, goalsFor: 10, goalsAgainst: 22, points: 8 },
  ];
  for (const r of rows) {
    await prisma.standingRow.create({ data: r });
  }
  console.log(`✔ Класиране: ${rows.length} отбора`);
}

async function seedPosts() {
  const posts = [
    {
      slug: "dobre-doshli",
      title: "Добре дошли в новия сайт на „Миньор“",
      excerpt: "Клубът вече има модерен официален сайт с програма, резултати, класиране и новини.",
      body:
        "## Нов дом на „миньорите“ в интернет\n\nС гордост представяме новия официален сайт на ФК „Миньор“ Бобов дол. Тук ще намерите **програмата и резултатите**, актуалното **класиране**, **състава** на отбора и последните **новини**.\n\nСайтът е дарение от [Carbon Stealth VCC](https://carbonstealth.eu)." +
        NOTE,
    },
    {
      slug: "pobeda-nad-velbazhd",
      title: "Победа с 2:1 над Велбъжд",
      excerpt: "„Миньор“ записа домакински успех пред своите привърженици.",
      body:
        "Отборът ни постигна заслужена победа с **2:1** в оспорван домакински двубой. Браво на момчетата и благодарим на феновете за подкрепата!" +
        NOTE,
    },
  ];
  const base = new Date();
  for (let i = 0; i < posts.length; i++) {
    const publishedAt = new Date(base.getTime() - i * 3 * 24 * 60 * 60 * 1000);
    await prisma.post.create({ data: { ...posts[i], published: true, publishedAt } });
  }
  console.log(`✔ Новини: ${posts.length} публикации`);
}

async function main() {
  await seedAdmin();
  await seedHonours();
  await seedStaff();
  await seedPlayers();
  await seedMatches();
  await seedStandings();
  await seedPosts();
  console.log("✓ Готово.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
