import bcrypt from 'bcryptjs';
import db, { setSetting, getSetting } from './db.js';
import { config } from './config.js';
import { legalPages } from './content/legal.js';

const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// Структура на категориите по оригиналния сайт на СГБ
const CATEGORY_TREE = [
  { slug: 'informaciya', name: 'Информация', children: [
    { slug: 'posledna-informaciya', name: 'Последна информация' },
    { slug: 'saobshteniya', name: 'Съобщения' },
    { slug: 'video-informaciya', name: 'Видео информация' },
  ]},
  { slug: 'deinosti', name: 'Дейности', children: [
    { slug: 'kulturna-deinost', name: 'Културна дейност' },
    { slug: 'organizacionna-deinost', name: 'Организационна дейност' },
    { slug: 'kino-foto-deinost', name: 'Кино и фото любителска дейност' },
    { slug: 'turisticheska-deinost', name: 'Туристическа дейност' },
    { slug: 'sporten-ribolov', name: 'Национални събори по спортен риболов' },
    { slug: 'shahmatna-deinost', name: 'Шахматна дейност' },
    { slug: 'proizvodstveno-stopanska-deinost', name: 'Производствено-стопанска дейност' },
  ]},
  { slug: 'dokumenti', name: 'Документи', children: [
    { slug: 'ustav-na-sgb', name: 'Устав на СГБ' },
    { slug: 'resheniya-na-us', name: 'Решения на Управителния съвет' },
    { slug: 'sabraniya-na-palnomoshtnicite', name: 'Събрания на пълномощниците' },
    { slug: 'otchet-za-izpalnenie', name: 'Отчет за изпълнение' },
    { slug: 'normativni-dokumenti', name: 'Нормативни документи' },
    { slug: 'prava-zakoni', name: 'Права и закони' },
  ]},
  { slug: 'pochivni-bazi', name: 'Почивни бази', children: [] },
  { slug: 'jestov-ezik', name: 'Жестов език', children: [] },
];

function seedCategories() {
  if (db.prepare('SELECT COUNT(*) n FROM categories').get().n > 0) return;
  const insert = db.prepare(
    'INSERT INTO categories (parent_id, slug, name, sort_order, in_menu) VALUES (?,?,?,?,1)'
  );
  let order = 0;
  for (const root of CATEGORY_TREE) {
    const r = insert.run(null, root.slug, root.name, order++);
    let childOrder = 0;
    for (const child of root.children || []) {
      insert.run(r.lastInsertRowid, child.slug, child.name, childOrder++);
    }
  }
}

function seedSettings() {
  const defaults = {
    org_name: 'Съюз на глухите в България',
    org_short: 'СГБ',
    site_description: 'Официален уебсайт на Съюза на глухите в България — национална организация в защита на правата и интересите на хората с увреден слух. Новини, вестник „Тишина“, документи и дейности.',
    newspaper_name: 'Тишина',
    contact_email: 'sgb@sgbbg.com',
    contact_phone: '+359 2 980 47 78',
    contact_address: 'ул. „Денкоглу“ № 12-14',
    contact_city: 'София',
    social_facebook: '',
    social_youtube: '',
    social_instagram: '',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) === null) setSetting(k, v);
  }
}

function seedPages() {
  if (db.prepare('SELECT COUNT(*) n FROM pages').get().n > 0) return;
  const insert = db.prepare(
    'INSERT INTO pages (slug, title, body, meta_description, is_system) VALUES (?,?,?,?,1)'
  );
  for (const p of legalPages) {
    insert.run(p.slug, p.title, p.body, p.meta);
  }
}

async function seedAdmin() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) return;
  const hash = await bcrypt.hash(config.admin.password, 12);
  db.prepare(
    'INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?,?,?,?,?)'
  ).run(config.admin.username, config.admin.email, hash, 'Администратор', 'admin');
  console.log(`  → Създаден администратор: ${config.admin.username}`);
}

function seedSampleContent() {
  if (db.prepare('SELECT COUNT(*) n FROM articles').get().n > 0) return;
  const admin = db.prepare('SELECT id FROM users LIMIT 1').get();
  const cat = db.prepare("SELECT id FROM categories WHERE slug='posledna-informaciya'").get();
  const insert = db.prepare(
    `INSERT INTO articles (category_id, author_id, slug, title, excerpt, body, status, featured, meta_description, published_at)
     VALUES (?,?,?,?,?,?, 'published', ?, ?, ?)`
  );
  const samples = [
    {
      slug: 'dobre-doshli-v-noviya-sait-na-sgb',
      title: 'Добре дошли в обновения уебсайт на Съюза на глухите в България',
      excerpt: 'Представяме обновения официален уебсайт на СГБ — модерен, достъпен и удобен за мобилни устройства портал за информация, новини и електронния архив на вестник „Тишина“.',
      featured: 1,
      body: `<p>С радост Ви представяме изцяло обновения официален уебсайт на <strong>Съюза на глухите в България</strong>. Новата платформа е създадена с мисъл за достъпността, бързината и удобството на потребителите от общността на хората с увреден слух.</p>
<h2>Какво е новото</h2>
<ul>
<li>Модерен и изчистен дизайн, оптимизиран за мобилни телефони, таблети и компютри;</li>
<li>Бърз достъп до последните новини, съобщения и видео информация;</li>
<li>Електронен архив на вестник „Тишина“ с възможност за преглед и изтегляне;</li>
<li>Пълна структура с дейности, документи и нормативна уредба;</li>
<li>Подобрена откриваемост в търсачки и гласови асистенти.</li>
</ul>
<p>Съюзът на глухите в България е национално представителна организация, която защитава правата и интересите на хората с увреден слух и работи за тяхното пълноценно участие в обществения живот.</p>`,
      meta: 'Обновеният официален уебсайт на Съюза на глухите в България — новини, вестник „Тишина“, документи и дейности.',
    },
    {
      slug: 'vestnik-tishina-elektronen-arhiv',
      title: 'Вестник „Тишина“ вече е достъпен в електронен архив',
      excerpt: 'Броевете на вестник „Тишина“ — изданието на Съюза на глухите в България — вече могат да се четат и изтеглят онлайн.',
      featured: 0,
      body: `<p>Вестник <strong>„Тишина“</strong> е официалното печатно издание на Съюза на глухите в България с дългогодишна история. В новия раздел <a href="/vestnik">Вестник „Тишина“</a> ще намерите броевете в електронен формат.</p>
<p>Всеки брой може да бъде прегледан онлайн или изтеглен като PDF файл за четене на удобно за Вас устройство.</p>`,
      meta: 'Електронен архив на вестник „Тишина“ — изданието на Съюза на глухите в България.',
    },
    {
      slug: 'za-pravata-na-horata-s-uvreden-sluh',
      title: 'За правата на хората с увреден слух',
      excerpt: 'Съюзът на глухите в България работи активно за равнопоставеността, достъпността и социалното включване на хората с увреден слух.',
      featured: 0,
      body: `<p>Една от основните мисии на Съюза на глухите в България е защитата на правата на хората с увреден слух — достъп до информация, образование, заетост и обществени услуги на български жестов език.</p>
<p>В раздел <a href="/category/prava-zakoni">Права и закони</a> публикуваме актуална нормативна информация, а в <a href="/category/normativni-dokumenti">Нормативни документи</a> — материали относно жестовия език, субтитрирането и Единния европейски номер 112.</p>`,
      meta: 'Информация за правата на хората с увреден слух и дейността на Съюза на глухите в България.',
    },
  ];
  for (const s of samples) {
    insert.run(cat?.id || null, admin?.id || null, s.slug, s.title, s.excerpt, s.body, s.featured, s.meta, nowIso());
  }

  // Примерен брой на вестника
  db.prepare(
    `INSERT INTO newspapers (slug, title, issue_number, year, month, description, status, published_at)
     VALUES (?,?,?,?,?,?, 'published', ?)`
  ).run('tishina-broy-1', 'Вестник „Тишина“ — брой 1', 1, new Date().getFullYear(), new Date().getMonth() + 1,
    'Първи брой на вестник „Тишина“ в електронния архив. Качете PDF файл от администраторския панел.', nowIso());
}

export async function ensureSeed() {
  seedCategories();
  seedSettings();
  seedPages();
  await seedAdmin();
  seedSampleContent();
}

// CLI: node src/seed.js
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureSeed().then(() => {
    console.log('  ✅ Началните данни са заредени.');
    process.exit(0);
  });
}
