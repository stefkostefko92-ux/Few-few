// Eternal Touch — Database seed
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌟 Seeding Eternal Touch database...');

  // Admin user — never seed a shipped/guessable default password.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@eternaltouch.it';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 10) {
    throw new Error('ADMIN_PASSWORD is missing or too short (need ≥10 chars). Set it in .env before seeding.');
  }
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      name: 'Eternal Touch Admin',
      role: 'admin'
    }
  });
  console.log(`✓ Admin: ${adminEmail}`);

  // Three collections
  const collections = [
    {
      slug: 'decorazioni',
      order: 1,
      nameIt: 'Decorazioni',
      nameBg: 'Декорации',
      nameEn: 'Decorations',
      taglineIt: 'Sculture e oggetti per la casa',
      taglineBg: 'Скулптури и предмети за дома',
      taglineEn: 'Sculptures and objects for the home',
      descriptionIt: 'Pezzi pensati per il quotidiano: una mensola, un libro, una credenza, un comodino. Animali, forme astratte, dettagli a parete. Ognuno è un piccolo gesto in più nel posto in cui vivi — fatto a mano, dipinto a mano, pensato per restare.',
      descriptionBg: 'Произведения, мислени за всекидневието: рафт, книга, скрин, нощно шкафче. Животни, абстрактни форми, детайли по стените. Всяко е малък допълнителен жест в мястото, където живееш — изработено на ръка, рисувано на ръка, мислено да остане.',
      descriptionEn: 'Pieces made for the everyday: a shelf, a book, a sideboard, a bedside table. Animals, abstract forms, wall details. Each one is a small added gesture in the place you live — hand-cast, hand-painted, made to last.',
      coverImage: '/uploads/seed/floral-vase-arrangement.jpg',
      isActive: true
    },
    {
      slug: 'bomboniere',
      order: 2,
      nameIt: 'Bomboniere',
      nameBg: 'Бонбониери',
      nameEn: 'Event Favors',
      taglineIt: 'Per battesimi, comunioni, matrimoni',
      taglineBg: 'За кръщенета, причастия, сватби',
      taglineEn: 'For christenings, communions, weddings',
      descriptionIt: 'Piccoli ricordi a tema, confezionati a mano uno per uno. Disponibili a partire da 30 pezzi, con sconti per quantità maggiori. Personalizzabili con nome e data dell\'evento, abbinabili a tutta la composizione del tavolo. Soggetti, colori e nastri li scegliamo insieme dopo un primo contatto.',
      descriptionBg: 'Малки тематични спомени, опаковани на ръка един по един. Налични от 30 броя нагоре, с отстъпки за по-големи количества. Могат да се персонализират с име и дата на събитието, да се съчетаят с цялостната композиция на масата. Образи, цветове и панделки избираме заедно след първоначален контакт.',
      descriptionEn: 'Small themed keepsakes, hand-packaged one by one. Available from 30 pieces, with discounts for larger orders. Personalised with the name and date of the event, designed to match the whole table arrangement. Subjects, colours and ribbons are chosen together after an initial conversation.',
      coverImage: '/uploads/seed/bear-cellophane-favor.jpg',
      isActive: true
    },
    {
      slug: 'personalizzate',
      order: 3,
      nameIt: 'Su Misura',
      nameBg: 'По Поръчка',
      nameEn: 'Bespoke',
      taglineIt: 'Dalla tua idea al pezzo finito',
      taglineBg: 'От твоята идея до готовото произведение',
      taglineEn: 'From your idea to the finished piece',
      descriptionIt: 'Hai un soggetto, un colore, un tema preciso? Lavoriamo a quattro mani con te — dal bozzetto al prototipo, dalla finitura al packaging. Forme animali, lettere, simboli, ricreazioni di oggetti: tutto è possibile in gesso. Ogni progetto comincia con una conversazione.',
      descriptionBg: 'Имаш идея за образ, цвят, тема? Работим заедно с теб — от скицата до прототипа, от финиша до опаковката. Животински форми, букви, символи, пресъздаване на предмети: всичко е възможно в гипс. Всеки проект започва с разговор.',
      descriptionEn: 'Have a subject, colour, or theme in mind? We work with you — from sketch to prototype, from finish to packaging. Animal shapes, letters, symbols, recreations of objects: anything is possible in gypsum. Every project begins with a conversation.',
      coverImage: '/uploads/seed/clasped-hands-heart.jpg',
      isActive: true
    }
  ];

  for (const col of collections) {
    // create-if-not-exists: never overwrite existing edits made via admin panel
    const existing = await prisma.collection.findUnique({ where: { slug: col.slug } });
    if (!existing) {
      await prisma.collection.create({ data: col });
      console.log(`✓ Collection created: ${col.nameIt}`);
    } else {
      console.log(`↷ Collection exists, preserving: ${col.nameIt}`);
    }
  }

  // Site content (hero, about, contact)
  const siteContent = [
    {
      key: 'hero.tagline',
      group: 'hero',
      valueIt: 'Atelier · Gesso · Fatto a mano',
      valueBg: 'Ателие · Гипс · Изработено на ръка',
      valueEn: 'Atelier · Gypsum · Hand-cast'
    },
    {
      key: 'hero.title',
      group: 'hero',
      type: 'html',
      valueIt: 'Fatto a mano,<br><em>per durare</em>.',
      valueBg: 'Изработено на ръка,<br><em>за да остане</em>.',
      valueEn: 'Made by hand,<br><em>to last</em>.'
    },
        {
      key: 'hero.subtitle',
      group: 'hero',
      valueIt: 'Decorazioni, bomboniere e creazioni su misura. Realizzate a mano nel nostro atelier in Bulgaria, con cura italiana per il dettaglio.',
      valueBg: 'Декорации, бонбониери и творения по поръчка. Изработени на ръка в ателието ни в България, с италианско внимание към детайла.',
      valueEn: 'Decorations, event favors and bespoke creations. Hand-cast in our atelier in Bulgaria, with Italian care for detail.'
    },
    {
      key: 'about.eyebrow',
      group: 'about',
      valueIt: 'Atelier',
      valueBg: 'Ателие',
      valueEn: 'Atelier'
    },
    {
      key: 'about.title',
      group: 'about',
      valueIt: 'Tre donne, due paesi, un\'unica mano.',
      valueBg: 'Три жени, две страни, една ръка.',
      valueEn: 'Three women, two countries, one hand.'
    },
        {
      key: 'about.body',
      group: 'about',
      type: 'html',
      valueIt: '<p>Eternal Touch è nato da un\'amicizia. Simona, Ivy e Maya — tre donne che condividono la stessa attenzione per la materia, per il gesto preciso, per il tempo speso bene.</p><p>Il nostro atelier si trova a Бобов дол, in Bulgaria, dove ogni pezzo prende forma a mano: dal primo bozzetto alla prima passata di colore, fino al nastro che lo accompagna. Una parte della produzione e della distribuzione passa per Milano, ma il cuore dell\'atelier resta sui Balcani.</p><p>Ci piacciono le cose che durano. Quelle che si tengono in mano, quelle che si tramandano, quelle che non si dimenticano.</p>',
      valueBg: '<p>Eternal Touch се роди от едно приятелство. Симона, Айви и Мая — три жени, споделящи едно и също внимание към материята, към прецизния жест, към добре прекараното време.</p><p>Ателието ни е в Бобов дол, България. Тук всяко произведение приема форма на ръка: от първата скица до първото докосване с боя, до панделката, която го придружава. Част от производството и разпространението минава през Милано, но сърцето на ателието остава тук, в Странджа на Балканите.</p><p>Обичаме нещата, които остават. Тези, които се държат в ръка, тези, които се предават, тези, които не се забравят.</p>',
      valueEn: '<p>Eternal Touch was born from a friendship. Simona, Ivy and Maya — three women who share the same attention to material, to precise gesture, to time spent well.</p><p>Our atelier is in Bobov Dol, Bulgaria. This is where every piece takes shape by hand: from the first sketch to the first stroke of colour, down to the ribbon that accompanies it. Part of our production and distribution goes through Milan, but the heart of the atelier remains here, in the Balkans.</p><p>We love things that last. The ones held in hand, the ones passed on, the ones not forgotten.</p>'
    },
        {
      key: 'about.signature',
      group: 'about',
      valueIt: '— Simona · Ivy · Maya',
      valueBg: '— Симона · Айви · Мая',
      valueEn: '— Simona · Ivy · Maya'
    },
    {
      key: 'process.eyebrow',
      group: 'process',
      valueIt: 'Il processo',
      valueBg: 'Процесът',
      valueEn: 'The process'
    },
    {
      key: 'process.title',
      group: 'process',
      valueIt: 'Quattro passi, mai di fretta.',
      valueBg: 'Четири стъпки, никога с бързане.',
      valueEn: 'Four steps, never in a hurry.'
    },
    {
      key: 'process.step1.title',
      group: 'process',
      valueIt: 'Ascolto',
      valueBg: 'Слушане',
      valueEn: 'Listen'
    },
    {
      key: 'process.step1.body',
      group: 'process',
      valueIt: 'Ogni progetto comincia con una conversazione. Ci racconti la tua idea, ti facciamo qualche domanda, e proviamo insieme una direzione.',
      valueBg: 'Всеки проект започва с разговор. Ти ни разказваш идеята, ние задаваме въпроси, и заедно търсим посока.',
      valueEn: 'Every project begins with a conversation. You tell us your idea, we ask some questions, and together we find a direction.'
    },
    {
      key: 'process.step2.title',
      group: 'process',
      valueIt: 'Stampo',
      valueBg: 'Форма',
      valueEn: 'Mould'
    },
    {
      key: 'process.step2.body',
      group: 'process',
      valueIt: 'Scegliamo o creiamo lo stampo. Silicone alimentare, dettaglio fine, durata: una buona forma è la base di un buon pezzo.',
      valueBg: 'Избираме или създаваме формата. Хранителен силикон, фин детайл, дълговечност: добрата форма е основата на доброто произведение.',
      valueEn: 'We choose or build the mould. Food-grade silicone, fine detail, durability: a good mould is the foundation of a good piece.'
    },
    {
      key: 'process.step3.title',
      group: 'process',
      valueIt: 'Colata',
      valueBg: 'Леене',
      valueEn: 'Pour'
    },
    {
      key: 'process.step3.body',
      group: 'process',
      valueIt: 'Gesso impastato a mano, colato lentamente, lasciato riposare il tempo necessario. La pazienza è metà del lavoro.',
      valueBg: 'Гипсът се смесва на ръка, лее се бавно, оставя се да почине толкова, колкото е нужно. Търпението е половината работа.',
      valueEn: 'Hand-mixed gypsum, poured slowly, left to rest as long as needed. Patience is half the work.'
    },
    {
      key: 'process.step4.title',
      group: 'process',
      valueIt: 'Rifinitura',
      valueBg: 'Финиш',
      valueEn: 'Finish'
    },
    {
      key: 'process.step4.body',
      group: 'process',
      valueIt: 'Sformatura, levigatura, pittura, sigillatura. Confezione curata. Ogni pezzo passa un\'ultima volta tra le nostre mani prima di partire.',
      valueBg: 'Изваждане от формата, полиране, рисуване, защита. Грижливо опаковане. Всяко произведение преминава последно през ръцете ни, преди да тръгне.',
      valueEn: 'Unmoulding, sanding, painting, sealing. Considered packaging. Every piece passes one last time through our hands before it leaves.'
    },
    {
      key: 'contact.eyebrow',
      group: 'contact',
      valueIt: 'Scrivici',
      valueBg: 'Пиши ни',
      valueEn: 'Write to us'
    },
    {
      key: 'contact.title',
      group: 'contact',
      valueIt: 'Raccontaci la tua idea.',
      valueBg: 'Разкажи ни идеята си.',
      valueEn: 'Tell us about your idea.'
    },
        {
      key: 'contact.subtitle',
      group: 'contact',
      valueIt: 'Una nuova decorazione, un evento da ricordare, o solo curiosità: siamo qui per ascoltare. Ti rispondiamo entro 24 ore — in bulgaro, italiano o inglese.',
      valueBg: 'Нова декорация, събитие за запомняне, или просто любопитство: тук сме, за да слушаме. Отговаряме до 24 часа — на български, италиански или английски.',
      valueEn: 'A new decoration, an event to remember, or just curiosity: we are here to listen. We reply within 24 hours — in Bulgarian, Italian or English.'
    }    ,
    {
      key: 'faq.eyebrow',
      group: 'faq',
      valueIt: 'Domande frequenti',
      valueBg: 'Често задавани въпроси',
      valueEn: 'Frequently asked questions'
    },
    {
      key: 'faq.title',
      group: 'faq',
      valueIt: 'Quello che ci chiedete spesso.',
      valueBg: 'Това, което ни питате най-често.',
      valueEn: 'What you often ask us.'
    },
    {
      key: 'faq.q1.q',
      group: 'faq',
      valueIt: 'Dove si trova l\'atelier?',
      valueBg: 'Къде се намира ателието?',
      valueEn: 'Where is the atelier?'
    },
    {
      key: 'faq.q1.a',
      group: 'faq',
      valueIt: 'L\'atelier ha sede a Бобов дол, in Bulgaria. Da qui partono tutti i pezzi finiti. Una parte della distribuzione passa anche per Milano, in Italia.',
      valueBg: 'Ателието ни е в Бобов дол, България. Оттук тръгват всички завършени произведения. Част от разпространението минава и през Милано, Италия.',
      valueEn: 'Our atelier is based in Bobov Dol, Bulgaria. Every finished piece is shipped from here. Part of our distribution also goes through Milan, Italy.'
    },
    {
      key: 'faq.q2.q',
      group: 'faq',
      valueIt: 'Quali materiali utilizzate?',
      valueBg: 'Какви материали използвате?',
      valueEn: 'Which materials do you use?'
    },
    {
      key: 'faq.q2.a',
      group: 'faq',
      valueIt: 'Lavoriamo con gesso ceramico di alta qualità, pigmenti naturali atossici e finiture opache. Per le bomboniere usiamo scatole trasparenti riciclabili e nastri in raso. Niente plastica monouso.',
      valueBg: 'Работим с висококачествен керамичен гипс, естествени нетоксични пигменти и матови финиши. За бонбониерите използваме прозрачни рециклируеми кутийки и сатенени панделки. Без пластмаса за еднократна употреба.',
      valueEn: 'We work with high-quality ceramic gypsum, natural non-toxic pigments and matte finishes. For favors we use recyclable transparent boxes and satin ribbons. No single-use plastic.'
    },
    {
      key: 'faq.q3.q',
      group: 'faq',
      valueIt: 'In quanto tempo realizzate un ordine?',
      valueBg: 'За колко време изпълнявате поръчка?',
      valueEn: 'How long does an order take?'
    },
    {
      key: 'faq.q3.a',
      group: 'faq',
      valueIt: 'I tempi dipendono dal pezzo: una decorazione singola in 1–2 settimane, un set di bomboniere da 30 pezzi in 3–4 settimane, una creazione su misura in 4–6 settimane (incluso il bozzetto). Per scadenze precise, scrivici prima di confermare l\'evento.',
      valueBg: 'Сроковете зависят от произведението: единична декорация — 1–2 седмици, комплект бонбониери от 30 броя — 3–4 седмици, творение по поръчка — 4–6 седмици (включително скица). За точни срокове ни пиши преди да потвърдиш събитието.',
      valueEn: 'Times depend on the piece: a single decoration takes 1–2 weeks, a 30-piece favor set 3–4 weeks, a bespoke creation 4–6 weeks (sketch included). For specific deadlines, write to us before confirming the event.'
    },
    {
      key: 'faq.q4.q',
      group: 'faq',
      valueIt: 'Spedite all\'estero?',
      valueBg: 'Изпращате ли в чужбина?',
      valueEn: 'Do you ship internationally?'
    },
    {
      key: 'faq.q4.a',
      group: 'faq',
      valueIt: 'Sì. Spediamo regolarmente da Bulgaria a Italia, e dall\'Italia al resto d\'Europa. Per spedizioni fuori UE, chiedici un preventivo personalizzato. Tutti i pezzi viaggiano in imballaggio rinforzato per resistere al trasporto.',
      valueBg: 'Да. Изпращаме редовно от България до Италия, и от Италия до останалата част на Европа. За пратки извън ЕС, попитай ни за персонализирана оферта. Всички произведения пътуват в подсилена опаковка, за да издържат транспорта.',
      valueEn: 'Yes. We regularly ship from Bulgaria to Italy, and from Italy to the rest of Europe. For shipments outside the EU, ask us for a custom quote. Every piece travels in reinforced packaging to withstand transport.'
    },
    {
      key: 'faq.q5.q',
      group: 'faq',
      valueIt: 'Posso ordinare un soggetto personalizzato?',
      valueBg: 'Мога ли да поръчам персонализиран образ?',
      valueEn: 'Can I order a custom subject?'
    },
    {
      key: 'faq.q5.a',
      group: 'faq',
      valueIt: 'Sì, è il nostro lavoro preferito. Forme animali, lettere, simboli, oggetti specifici per un evento — partiamo dal tuo bozzetto o dalla tua descrizione. Prima di iniziare, ti mandiamo un disegno per conferma. Dopo l\'approvazione, prepariamo lo stampo e procediamo.',
      valueBg: 'Да, това ни е любимата работа. Животински форми, букви, символи, специфични за събитие предмети — започваме от твоята скица или описание. Преди да започнем, изпращаме рисунка за потвърждение. След одобрение, подготвяме формата и продължаваме.',
      valueEn: 'Yes, this is our favourite kind of work. Animal shapes, letters, symbols, event-specific objects — we start from your sketch or description. Before starting, we send a drawing for approval. Once approved, we prepare the mould and proceed.'
    },
    {
      key: 'faq.q6.q',
      group: 'faq',
      valueIt: 'Qual è il pezzo minimo per una bomboniera?',
      valueBg: 'Какъв е минималният брой за бонбониери?',
      valueEn: 'What is the minimum quantity for favors?'
    },
    {
      key: 'faq.q6.a',
      group: 'faq',
      valueIt: 'Il minimo per le bomboniere è 30 pezzi. Per quantità superiori a 80 pezzi applichiamo uno sconto graduale. Sotto i 30 pezzi possiamo fare singoli regali su misura, ma non un set coordinato.',
      valueBg: 'Минимумът за бонбониери е 30 броя. За количества над 80 броя предлагаме постепенна отстъпка. Под 30 броя можем да направим единични подаръци по поръчка, но не и координиран комплект.',
      valueEn: 'The minimum for favors is 30 pieces. For quantities above 80 pieces we offer a graduated discount. Under 30 pieces we can make single bespoke gifts but not a coordinated set.'
    }
  ];

  let createdCount = 0, preservedCount = 0;
  for (const item of siteContent) {
    const existing = await prisma.siteContent.findUnique({ where: { key: item.key } });
    if (!existing) {
      await prisma.siteContent.create({ data: item });
      createdCount++;
    } else {
      preservedCount++;
    }
  }
  console.log(`✓ Site content: ${createdCount} created, ${preservedCount} preserved (existing admin edits kept)`);

  // === Seed products (one per collection using user-uploaded photos) ===
  const decorazioniCol = await prisma.collection.findUnique({ where: { slug: 'decorazioni' } });
  const bombonereCol   = await prisma.collection.findUnique({ where: { slug: 'bomboniere' } });
  const personalizCol  = await prisma.collection.findUnique({ where: { slug: 'personalizzate' } });

  const productSeeds = [
    // ============================================
    //  DECORAZIONI / Decorations
    // ============================================
    {
      slug: 'orsetti-in-gesso',
      collectionId: decorazioniCol.id,
      order: 1,
      nameIt: 'Orsetti in Gesso',
      nameBg: 'Гипсови Мечета',
      nameEn: 'Gypsum Bears',
      shortDescIt: 'Sculture decorative dipinte a mano',
      shortDescBg: 'Декоративни скулптури, ръчно рисувани',
      shortDescEn: 'Hand-painted decorative sculptures',
      descriptionIt: 'Una piccola famiglia di orsetti in gesso ceramico, ciascuno modellato a mano e dipinto con pigmenti naturali. La texture della pelliccia è scolpita una briciola alla volta — il risultato è un piccolo personaggio che sembra avere una storia. Disponibili in pose e colori diversi: con barile in legno, con cesto, con orsacchiotto. Perfetti per la cameretta dei bambini, come regalo di nascita, o sopra una libreria a tenere compagnia ai libri. Per la natura artigianale del lavoro, ogni orsetto è leggermente diverso dagli altri — questa è una caratteristica, non un difetto.',
      descriptionBg: 'Малко семейство мечета от керамичен гипс, всяко моделирано на ръка и рисувано с естествени пигменти. Текстурата на козината се извайва на малки части — резултатът е миниатюрно същество, което сякаш има своя история. Налични в различни пози и цветове: с дървено варелче, с кошничка, с играчка. Идеални за детска стая, като подарък за раждане, или на библиотечна полица — пазачи на книгите. Заради ръчния характер на работата, всяко мече е леко различно от останалите — това е характеристика, не недостатък.',
      descriptionEn: 'A small family of ceramic gypsum bears, each one shaped by hand and painted with natural pigments. The fur texture is sculpted crumb by crumb — the result is a small character that seems to carry its own story. Available in different poses and colours: with a wooden barrel, with a basket, with a toy. Perfect for a child\'s room, as a birth gift, or on a bookshelf to keep the books company. Because of the handcrafted nature of the work, each bear is slightly different from the others — a feature, not a flaw.',
      materials: 'Gesso ceramico, pigmenti naturali, finitura opaca / Керамичен гипс, естествени пигменти, матов финиш',
      dimensions: '8 × 6 × 5 cm',
      images: JSON.stringify(['/uploads/seed/bear-with-barrel.jpg']),
      mainImage: '/uploads/seed/bear-with-barrel.jpg',
      isActive: true,
      isFeatured: true,
      metaTitleIt: 'Orsetti in Gesso Dipinti a Mano · Eternal Touch',
      metaDescIt: 'Sculture artigianali di orsetti in gesso ceramico, modellate e dipinte a mano in Bulgaria. Per cameretta, regalo nascita, complementi d\'arredo.'
    },
    {
      slug: 'lotus-bowl',
      collectionId: decorazioniCol.id,
      order: 2,
      nameIt: 'Ciotola Loto',
      nameBg: 'Купа Лотос',
      nameEn: 'Lotus Bowl',
      shortDescIt: 'Ciotola decorativa a forma di fiore di loto',
      shortDescBg: 'Декоративна купа във форма на лотос',
      shortDescEn: 'Decorative bowl shaped like a lotus flower',
      descriptionIt: 'Una ciotola in gesso ceramico modellata a forma di fiore di loto in piena fioritura. I bordi dei petali sono rifiniti a mano con un sottile profilo dorato che cattura la luce in modo naturale. Bellissima da sola come pezzo decorativo, oppure usata per riporre piccoli oggetti — fedi, perline, candele galleggianti, conchiglie. La superficie esterna è satinata con leggero effetto pietra; l\'interno è liscio, leggermente lucido. Si abbina particolarmente bene al marmo, al legno chiaro e ai tessuti naturali.',
      descriptionBg: 'Купа от керамичен гипс, моделирана във формата на разтворен лотос. Ръбовете на венчелистчетата са доработени на ръка с тънка златна линия, която улавя светлината естествено. Красива самостоятелно като декоративен елемент, или използвана за съхранение на малки предмети — пръстени, мъниста, плаващи свещи, миди. Външната повърхност е сатенена с лек каменен ефект; вътрешната е гладка, леко лъскава. Подхожда особено добре на мрамор, светло дърво и естествени тъкани.',
      descriptionEn: 'A ceramic gypsum bowl shaped like a lotus in full bloom. The petal edges are hand-finished with a thin gold profile that catches the light naturally. Beautiful on its own as a decorative piece, or used to hold small items — rings, beads, floating candles, shells. The outer surface is satin-finished with a subtle stone effect; the inside is smooth, lightly polished. Pairs particularly well with marble, light wood, and natural textiles.',
      materials: 'Gesso ceramico, profilo dorato, finitura satinata / Керамичен гипс, златен профил, сатенен финиш',
      dimensions: '14 × 14 × 8 cm',
      images: JSON.stringify(['/uploads/seed/lotus-bowl-pebbles.jpg', '/uploads/seed/cream-bowls-pair.jpg']),
      mainImage: '/uploads/seed/lotus-bowl-pebbles.jpg',
      isActive: true,
      isFeatured: true,
      metaTitleIt: 'Ciotola Loto in Gesso · Eternal Touch',
      metaDescIt: 'Ciotola decorativa modellata a mano a forma di fiore di loto. Gesso ceramico, profilo dorato, finitura satinata.'
    },
    {
      slug: 'floral-vase-decorated',
      collectionId: decorazioniCol.id,
      order: 3,
      nameIt: 'Vaso Fiorito',
      nameBg: 'Цветна Ваза',
      nameEn: 'Flowered Vase',
      shortDescIt: 'Vaso scolpito con fiori in rilievo',
      shortDescBg: 'Ваза, релефно украсена с цветя',
      shortDescEn: 'Vase sculpted with raised flowers',
      descriptionIt: 'Un vaso in gesso ceramico interamente decorato a mano con fiori in rilievo: ogni petalo è modellato singolarmente, ogni centro è dipinto con un pigmento dorato che dona profondità all\'insieme. Il risultato è una superficie tridimensionale che cattura la luce in modo diverso a seconda dell\'ora del giorno. Pensato per ospitare un piccolo bouquet di fiori secchi o freschi — margherite, lavanda, gypsophila si abbinano in modo particolarmente bello. Una scelta elegante per il centrotavola di una cena, o come accento su una mensola alta.',
      descriptionBg: 'Ваза от керамичен гипс, изцяло декорирана на ръка с релефни цветя: всяко венчелистче е моделирано индивидуално, всеки център е рисуван със златен пигмент, който придава дълбочина на цялото. Резултатът е триизмерна повърхност, която улавя светлината по различен начин в зависимост от часа на деня. Предназначена за малък букет от изсушени или свежи цветя — маргаритки, лавандула, гипсофила се съчетават особено красиво. Елегантен избор за централна украса на маса, или като акцент на висок рафт.',
      descriptionEn: 'A ceramic gypsum vase entirely hand-decorated with raised flowers: each petal is individually shaped, each centre painted with a gold pigment that gives the whole depth. The result is a three-dimensional surface that catches the light differently throughout the day. Made to hold a small bouquet of dried or fresh flowers — daisies, lavender, gypsophila pair particularly well. An elegant choice for a dinner table centrepiece, or as an accent on a high shelf.',
      materials: 'Gesso ceramico, pigmenti naturali, dettagli dorati / Керамичен гипс, естествени пигменти, златни детайли',
      dimensions: '12 × 12 × 14 cm',
      images: JSON.stringify(['/uploads/seed/floral-vase-arrangement.jpg']),
      mainImage: '/uploads/seed/floral-vase-arrangement.jpg',
      isActive: true,
      isFeatured: false,
      metaTitleIt: 'Vaso Fiorito in Gesso · Eternal Touch',
      metaDescIt: 'Vaso decorativo modellato a mano con fiori in rilievo. Gesso ceramico, dettagli dorati.'
    },

    // ============================================
    //  BOMBONIERE / Event Favors
    // ============================================
    {
      slug: 'bomboniera-orsetto-singola',
      collectionId: bombonereCol.id,
      order: 1,
      nameIt: 'Bomboniera Orsetto',
      nameBg: 'Бонбониера Мече',
      nameEn: 'Bear Favor',
      shortDescIt: 'Bomboniera classica per battesimo o nascita',
      shortDescBg: 'Класическа бонбониера за кръщене или раждане',
      shortDescEn: 'Classic favor for christening or birth',
      descriptionIt: 'La nostra bomboniera più amata. Un orsetto in gesso color avorio, modellato a mano, avvolto in cellophane trasparente e legato con un nastro in raso doppio. All\'interno troviamo confetti, piccoli fiori, o un sacchettino di lavanda secca — a tua scelta. Adatta per battesimi, nascite, primi compleanni. Disponibile a partire da 30 pezzi, con sconti progressivi per quantità maggiori. Personalizzabile con un\'etichetta dedicata che riporta il nome del bambino e la data dell\'evento. Tempi di realizzazione: 3–4 settimane dall\'ordine confermato.',
      descriptionBg: 'Най-любимата ни бонбониера. Гипсово мече с цвят слонова кост, моделирано на ръка, увито в прозрачен целофан и завързано с двойна сатенена панделка. Вътре поставяме захаросани бадеми, малки цветчета или малко пакетче изсушена лавандула — по твой избор. Подходяща за кръщенета, раждания, първи рождени дни. Налична от 30 броя нагоре, с прогресивни отстъпки за по-големи количества. Може да се персонализира с етикет, който носи името на детето и датата на събитието. Срок за изработка: 3–4 седмици след потвърдена поръчка.',
      descriptionEn: 'Our most-loved favor. An ivory-coloured gypsum bear, hand-shaped, wrapped in clear cellophane and tied with double satin ribbon. Inside we place sugared almonds, small flowers, or a little pouch of dried lavender — your choice. Suitable for christenings, births, first birthdays. Available from 30 pieces, with progressive discounts for larger orders. Personalisable with a dedicated label bearing the child\'s name and event date. Lead time: 3–4 weeks from confirmed order.',
      materials: 'Gesso ceramico, cellophane trasparente, nastro in raso / Керамичен гипс, прозрачен целофан, сатенена панделка',
      dimensions: '7 × 5 × 5 cm',
      images: JSON.stringify(['/uploads/seed/bear-cellophane-favor.jpg', '/uploads/seed/bear-pink-ribbon.jpg']),
      mainImage: '/uploads/seed/bear-cellophane-favor.jpg',
      isActive: true,
      isFeatured: true,
      metaTitleIt: 'Bomboniera Orsetto · Eternal Touch',
      metaDescIt: 'Bomboniere artigianali con orsetto in gesso, confezionate a mano. Da 30 pezzi, personalizzabili con nome e data.'
    },
    {
      slug: 'bomboniera-bambina-rosa',
      collectionId: bombonereCol.id,
      order: 2,
      nameIt: 'Composizione Nascita Bambina',
      nameBg: 'Композиция за Раждане на Момиченце',
      nameEn: 'Baby Girl Birth Composition',
      shortDescIt: 'Centrotavola con neonata, rose e confetti',
      shortDescBg: 'Централна украса с бебе, рози и захарни бадеми',
      shortDescEn: 'Centrepiece with baby figurine, roses and almonds',
      descriptionIt: 'Una composizione importante per il giorno della nascita o del battesimo di una bambina. Una neonata in gesso, modellata in posizione raccolta su una nuvola di tulle rosa, con cuffia e calzini in lana lavorata a mano. Tutto è racchiuso in una scatola trasparente decorata con un nastro in raso e una rosa bianca, e circondato da una corona di rose vere o stabilizzate, eucalipto e gypsophila. Confetti bianchi completano il quadro. Pezzo unico realizzato su misura per ogni evento — colori, fiori e dimensioni della scatola si concordano insieme.',
      descriptionBg: 'Внушителна композиция за деня на раждане или кръщене на момиченце. Гипсово бебе, моделирано в свита поза върху облак от розов тюл, с шапчица и чорапчета от ръчно плетена вълна. Всичко е затворено в прозрачна кутия, украсена със сатенена панделка и бяла роза, и обградено с венец от истински или стабилизирани рози, евкалипт и гипсофила. Бели захарни бадеми допълват картината. Уникална творба, изработена по поръчка за всяко събитие — цветове, цветя и размери на кутията се уговарят заедно.',
      descriptionEn: 'An important composition for the day of a baby girl\'s birth or christening. A gypsum newborn, shaped in a curled position on a cloud of pink tulle, with knit hat and socks made from hand-worked wool. Everything is enclosed in a transparent box decorated with satin ribbon and a white rose, surrounded by a crown of real or preserved roses, eucalyptus and gypsophila. White sugared almonds complete the scene. A bespoke piece made to order for each event — colours, flowers and box dimensions are agreed together.',
      materials: 'Gesso ceramico, tulle, rose stabilizzate, scatola in plexiglass / Керамичен гипс, тюл, стабилизирани рози, плексигласова кутия',
      dimensions: '20 × 15 × 12 cm (variabile)',
      images: JSON.stringify(['/uploads/seed/sleeping-baby-girl-pink.jpg']),
      mainImage: '/uploads/seed/sleeping-baby-girl-pink.jpg',
      isActive: true,
      isFeatured: true,
      metaTitleIt: 'Composizione Nascita Bambina · Eternal Touch',
      metaDescIt: 'Composizione personalizzata per nascita bambina con neonata in gesso, rose e confetti. Pezzo unico su misura.'
    },
    {
      slug: 'composizione-nascita-bambino',
      collectionId: bombonereCol.id,
      order: 3,
      nameIt: 'Composizione Nascita Bambino',
      nameBg: 'Композиция за Раждане на Момченце',
      nameEn: 'Baby Boy Birth Composition',
      shortDescIt: 'Su velluto blu, con angeli e rose blu',
      shortDescBg: 'Върху синьо кадифе, с ангели и сини рози',
      shortDescEn: 'On blue velvet with angels and blue roses',
      descriptionIt: 'Una composizione luminosa e regale per la nascita o il battesimo di un bambino. Un neonato in gesso bianco riposa su un cuscinetto, vestito con cappellino e pantaloncini blu lavorati a maglia. Tutto è disposto su un drappo di velluto blu profondo e circondato da angeli alati dorati, rose blu, lavanda, gypsophila in tonalità coordinate, perle bianche. Disponibili anche con cornice in plexiglass o teca in vetro. Pezzo unico realizzato su misura — i dettagli (colore del cappellino, tipo di fiori, perline o non perline) si concordano insieme dopo un primo contatto.',
      descriptionBg: 'Светла и достолепна композиция за раждане или кръщене на момченце. Гипсово бебе в бял цвят почива върху възглавничка, облечено с плетени синя шапчица и панталонки. Всичко е разположено върху драпиран дълбок син велур и обградено с позлатени крилати ангели, сини рози, лавандула, гипсофила в съчетани тонове, бели перли. Налично и с плексигласова рамка или стъклена витрина. Уникална творба по поръчка — детайлите (цвят на шапчицата, вид на цветята, перли или не) се уговарят заедно след първоначален контакт.',
      descriptionEn: 'A bright, regal composition for the birth or christening of a baby boy. A white gypsum newborn rests on a cushion, dressed in knit blue hat and shorts. Everything is arranged on deep blue velvet drapery and surrounded by gilded winged angels, blue roses, lavender, gypsophila in matching tones, white pearls. Also available with plexiglass frame or glass dome. A bespoke piece made to order — details (hat colour, type of flowers, pearls or none) are agreed together after a first conversation.',
      materials: 'Gesso ceramico, velluto, fiori stabilizzati, perle, ali in resina dorata / Керамичен гипс, велур, стабилизирани цветя, перли, златни смолени крила',
      dimensions: '25 × 25 × 8 cm (variabile)',
      images: JSON.stringify(['/uploads/seed/sleeping-baby-boy-blue.jpg', '/uploads/seed/bear-blue-flowers.jpg']),
      mainImage: '/uploads/seed/sleeping-baby-boy-blue.jpg',
      isActive: true,
      isFeatured: true,
      metaTitleIt: 'Composizione Nascita Bambino · Eternal Touch',
      metaDescIt: 'Composizione personalizzata per nascita bambino su velluto blu con angeli e rose. Pezzo unico su misura.'
    },

    // ============================================
    //  SU MISURA / Bespoke
    // ============================================
    {
      slug: 'cuore-mani-incise',
      collectionId: personalizCol.id,
      order: 1,
      nameIt: 'Cuore con Mani',
      nameBg: 'Сърце с Ръце',
      nameEn: 'Hands & Heart',
      shortDescIt: 'Pezzo simbolo per matrimoni e anniversari',
      shortDescBg: 'Символично произведение за сватби и годишнини',
      shortDescEn: 'Symbolic piece for weddings and anniversaries',
      descriptionIt: 'Una scultura in gesso a forma di cuore, con due mani intrecciate scolpite in rilievo al centro — una con un piccolo anello dorato. Pensata per matrimoni, fidanzamenti, anniversari importanti. Diventa un piattino svuota-tasche per gli anelli sul comodino, oppure un oggetto di memoria sulla mensola del soggiorno. Personalizzabile con incisione di iniziali, data, o una piccola frase scelta da te. Possiamo anche cambiare il colore della rifinitura: avorio classico, bianco puro, oppure un rosa tenue per una versione più femminile. Tempi: 3–5 settimane dalla conferma del progetto.',
      descriptionBg: 'Гипсова скулптура във форма на сърце, с две преплетени ръце, изваяни в релеф в центъра — едната с малък златен пръстен. Мислена за сватби, годежи, важни годишнини. Превръща се в малка купичка за пръстените върху нощно шкафче, или в предмет на спомена на лавицата в дневната. Може да се персонализира с гравиране на инициали, дата или малка фраза, избрана от теб. Можем също да променим цвета на финиша: класическа слонова кост, чисто бяло или нежно розово за по-женствена версия. Срок: 3–5 седмици от потвърждаване на проекта.',
      descriptionEn: 'A heart-shaped gypsum sculpture, with two intertwined hands carved in relief at the centre — one with a small gold ring. Made for weddings, engagements, important anniversaries. Becomes a small ring tray on the bedside table, or a piece of memory on the living-room shelf. Personalisable with engraved initials, a date, or a short phrase of your choosing. We can also change the finish colour: classic ivory, pure white, or a soft pink for a more feminine version. Lead time: 3–5 weeks from project confirmation.',
      materials: 'Gesso ceramico, dettaglio dorato, finitura opaca / Керамичен гипс, златен детайл, матов финиш',
      dimensions: '14 × 13 × 3 cm',
      images: JSON.stringify(['/uploads/seed/clasped-hands-heart.jpg']),
      mainImage: '/uploads/seed/clasped-hands-heart.jpg',
      isActive: true,
      isFeatured: true,
      metaTitleIt: 'Cuore con Mani Incise · Eternal Touch',
      metaDescIt: 'Scultura in gesso a forma di cuore con mani in rilievo, personalizzabile con incisione. Per matrimoni e anniversari.'
    },
    {
      slug: 'creazione-su-misura',
      collectionId: personalizCol.id,
      order: 2,
      nameIt: 'Creazione Su Misura',
      nameBg: 'Творение по Поръчка',
      nameEn: 'Bespoke Creation',
      shortDescIt: 'Dal tuo bozzetto al pezzo finito',
      shortDescBg: 'От твоята скица до готовото произведение',
      shortDescEn: 'From your sketch to the finished piece',
      descriptionIt: 'Hai un soggetto, un colore, un tema preciso? Lavoriamo a quattro mani con te — dalla prima idea fino al pezzo finito. Forme animali, lettere, simboli, ricreazioni di oggetti, dettagli per un evento speciale: tutto è possibile in gesso. Ti inviamo bozzetti, prototipi e proviamo finiture diverse fino a quando non è esattamente come lo immaginavi. Ogni progetto comincia con una conversazione: scrivici, raccontaci la tua idea, e ti rispondiamo entro 24 ore. La consulenza iniziale e i primi due bozzetti sono sempre gratuiti. Da lì in poi concordiamo un preventivo dettagliato.',
      descriptionBg: 'Имаш идея за образ, цвят, тема? Работим заедно с теб — от първата идея до готовото произведение. Животински форми, букви, символи, пресъздаване на предмети, детайли за специално събитие: всичко е възможно в гипс. Изпращаме скици, прототипи и пробваме различни финиши, докато не е точно както си си го представял. Всеки проект започва с разговор: пиши ни, разкажи ни идеята, и ще ти отговорим до 24 часа. Първоначалната консултация и първите две скици винаги са безплатни. Оттам нататък уговаряме подробна оферта.',
      descriptionEn: 'Have a subject, colour, or theme in mind? We work with you — from first idea to finished piece. Animal shapes, letters, symbols, object recreations, details for a special event: anything is possible in gypsum. We send sketches, prototypes, and try different finishes until it\'s exactly as you imagined. Every project begins with a conversation: write to us, tell us your idea, and we reply within 24 hours. The initial consultation and the first two sketches are always free. From there we agree on a detailed quote.',
      materials: 'Gesso ceramico, pigmenti su misura, finiture concordate / Керамичен гипс, пигменти по поръчка, уговорени финиши',
      dimensions: 'Variabili — concordate per progetto / Променливи — уговаряни за всеки проект',
      images: JSON.stringify(['/uploads/seed/red-rose-bowl.jpg', '/uploads/seed/angel-heart-pendant.jpg']),
      mainImage: '/uploads/seed/red-rose-bowl.jpg',
      isActive: true,
      isFeatured: false,
      metaTitleIt: 'Creazioni in Gesso Su Misura · Eternal Touch',
      metaDescIt: 'Realizziamo creazioni in gesso su misura: forme, colori, dettagli concordati con te. Dal bozzetto al pezzo finito.'
    }
  ];

  for (const product of productSeeds) {
    const existing = await prisma.product.findUnique({ where: { slug: product.slug } });
    if (!existing) {
      await prisma.product.create({ data: product });
      console.log(`✓ Product created: ${product.nameIt}`);
    } else {
      console.log(`↷ Product exists, preserving: ${product.nameIt}`);
    }
  }

  // === Image migration ===
  // Production databases deployed in earlier versions may still reference
  // placeholder images that no longer exist on disk. We update those records
  // to point at real photos. Idempotent: once images are updated, the
  // condition no longer matches, so re-runs become no-ops.
  //
  // The migration rules are CONTEXT-AWARE:
  //   - For collections, each slug has its own canonical cover
  //   - For products, each slug has its own canonical main image
  //   - For gallery items, generic mappings apply
  // This prevents the "stale path → wrong replacement" problem.

  const STALE_PATHS = [
    '/uploads/seed/atelier-pieces.jpg',
    '/uploads/seed/orsetti-in-gesso.jpg',
    '/uploads/seed/baby-favor-single.png',
    '/uploads/seed/baby-favors-arrangement.png'
  ];

  // Per-collection canonical covers (slug → image)
  const COLLECTION_COVERS = {
    'decorazioni':    '/uploads/seed/floral-vase-arrangement.jpg',
    'bomboniere':     '/uploads/seed/bear-cellophane-favor.jpg',
    'personalizzate': '/uploads/seed/clasped-hands-heart.jpg'
  };

  // Per-product canonical main images (slug → image)
  const PRODUCT_MAIN = {
    'orsetti-in-gesso':              '/uploads/seed/bear-with-barrel.jpg',
    'lotus-bowl':                    '/uploads/seed/lotus-bowl-pebbles.jpg',
    'floral-vase-decorated':         '/uploads/seed/floral-vase-arrangement.jpg',
    'bomboniera-orsetto-singola':    '/uploads/seed/bear-cellophane-favor.jpg',
    'bomboniera-bambina-rosa':       '/uploads/seed/sleeping-baby-girl-pink.jpg',
    'composizione-nascita-bambino':  '/uploads/seed/sleeping-baby-boy-blue.jpg',
    'cuore-mani-incise':             '/uploads/seed/clasped-hands-heart.jpg',
    'creazione-su-misura':           '/uploads/seed/red-rose-bowl.jpg',
    // Legacy slugs from earlier deployments (kept here for migration only):
    'bomboniera-battesimo-rosa':     '/uploads/seed/sleeping-baby-girl-pink.jpg',
    'set-bomboniere-coordinato':     '/uploads/seed/bear-cellophane-favor.jpg'
  };

  // Generic fallback for gallery + any unmatched record
  const GENERIC_FALLBACK = '/uploads/seed/floral-vase-arrangement.jpg';

  // 1) Migrate products: any image in images[] OR mainImage that hits a stale path
  const allProducts = await prisma.product.findMany();
  for (const product of allProducts) {
    let images = [];
    try { images = JSON.parse(product.images || '[]'); } catch (e) {}
    const target = PRODUCT_MAIN[product.slug] || GENERIC_FALLBACK;
    const newImages = images.map(img => STALE_PATHS.includes(img) ? target : img);
    let mainImage = product.mainImage;
    if (STALE_PATHS.includes(mainImage)) mainImage = target;
    if (JSON.stringify(images) !== JSON.stringify(newImages) || mainImage !== product.mainImage) {
      const seen = new Set();
      const dedup = newImages.filter(i => i && !seen.has(i) && seen.add(i));
      await prisma.product.update({
        where: { id: product.id },
        data: { images: JSON.stringify(dedup), mainImage: mainImage || dedup[0] || null }
      });
      console.log(`✓ Product image migrated: ${product.slug} → ${target.split('/').pop()}`);
    }
  }

  // 2) Migrate collections: stale coverImage → canonical for that slug
  const allCollections = await prisma.collection.findMany();
  for (const col of allCollections) {
    if (!col.coverImage || !STALE_PATHS.includes(col.coverImage)) continue;
    const target = COLLECTION_COVERS[col.slug] || GENERIC_FALLBACK;
    await prisma.collection.update({
      where: { id: col.id },
      data: { coverImage: target }
    });
    console.log(`✓ Collection cover migrated: ${col.slug} → ${target.split('/').pop()}`);
  }

  // 3) Migrate gallery items: stale image → generic fallback
  // (Gallery is a curated showcase — admin can re-curate via the UI)
  const allGallery = await prisma.galleryItem.findMany();
  for (const g of allGallery) {
    if (!g.image || !STALE_PATHS.includes(g.image)) continue;
    await prisma.galleryItem.update({
      where: { id: g.id },
      data: { image: GENERIC_FALLBACK }
    });
    console.log(`✓ Gallery image migrated: ${g.id.slice(0, 8)} → ${GENERIC_FALLBACK.split('/').pop()}`);
  }


  // Gallery seed items
  const gallerySeeds = [
    {
      image: '/uploads/seed/floral-vase-arrangement.jpg',
      titleBg: 'Цветна ваза с маргаритки',
      titleIt: 'Vaso fiorito con margherite',
      titleEn: 'Flowered vase with daisies',
      captionBg: 'Релефни цветя, златни центрове, истински маргаритки и лавандула.',
      captionIt: 'Fiori in rilievo, centri dorati, margherite vere e lavanda.',
      captionEn: 'Raised flowers, gold centres, real daisies and lavender.',
      order: 1
    },
    {
      image: '/uploads/seed/lotus-bowl-pebbles.jpg',
      titleBg: 'Купа Лотос',
      titleIt: 'Ciotola Loto',
      titleEn: 'Lotus Bowl',
      captionBg: 'Венчелистчета със златен ръб, сатенена външна повърхност.',
      captionIt: 'Petali con bordo dorato, superficie esterna satinata.',
      captionEn: 'Petals with gold edges, satin outer surface.',
      order: 2
    },
    {
      image: '/uploads/seed/clasped-hands-heart.jpg',
      titleBg: 'Сърце с преплетени ръце',
      titleIt: 'Cuore con mani intrecciate',
      titleEn: 'Heart with intertwined hands',
      captionBg: 'Символично произведение за сватби и годежи.',
      captionIt: 'Pezzo simbolo per matrimoni e fidanzamenti.',
      captionEn: 'A symbolic piece for weddings and engagements.',
      order: 3
    },
    {
      image: '/uploads/seed/sleeping-baby-girl-pink.jpg',
      titleBg: 'Композиция за раждане — момиченце',
      titleIt: 'Composizione nascita — bambina',
      titleEn: 'Birth composition — baby girl',
      captionBg: 'Розов тюл, рози, бели захарни бадеми, плексигласова кутия.',
      captionIt: 'Tulle rosa, rose, confetti bianchi, scatola in plexiglass.',
      captionEn: 'Pink tulle, roses, white sugared almonds, plexiglass box.',
      order: 4
    },
    {
      image: '/uploads/seed/sleeping-baby-boy-blue.jpg',
      titleBg: 'Композиция за раждане — момченце',
      titleIt: 'Composizione nascita — bambino',
      titleEn: 'Birth composition — baby boy',
      captionBg: 'Кадифена основа, златни ангелски крила, лавандула.',
      captionIt: 'Base in velluto, ali d\'angelo dorate, lavanda.',
      captionEn: 'Velvet base, gold angel wings, lavender.',
      order: 5
    },
    {
      image: '/uploads/seed/bear-with-barrel.jpg',
      titleBg: 'Мече с дървено варелче',
      titleIt: 'Orsetto con barile',
      titleEn: 'Bear with barrel',
      captionBg: 'Текстура на козината, изваяна на ръка.',
      captionIt: 'Texture della pelliccia scolpita a mano.',
      captionEn: 'Fur texture sculpted by hand.',
      order: 6
    },
    {
      image: '/uploads/seed/bear-cellophane-favor.jpg',
      titleBg: 'Бонбониера мече',
      titleIt: 'Bomboniera orsetto',
      titleEn: 'Bear favor',
      captionBg: 'Слонова кост, опаковано в целофан, двойна сатенена панделка.',
      captionIt: 'Avorio, in cellophane, nastro in raso doppio.',
      captionEn: 'Ivory, wrapped in cellophane, double satin ribbon.',
      order: 7
    },
    {
      image: '/uploads/seed/bear-pink-ribbon.jpg',
      titleBg: 'Мече с розова панделка',
      titleIt: 'Orsetto con nastro rosa',
      titleEn: 'Bear with pink ribbon',
      captionBg: 'Версия за момиченце с розов сатен и кристали.',
      captionIt: 'Versione bambina con raso rosa e cristalli.',
      captionEn: 'Baby girl version with pink satin and crystals.',
      order: 8
    },
    {
      image: '/uploads/seed/bear-blue-flowers.jpg',
      titleBg: 'Мече със сини цветя',
      titleIt: 'Orsetto su fiori blu',
      titleEn: 'Bear on blue flowers',
      captionBg: 'Композиция за момченце на сребриста основа.',
      captionIt: 'Composizione bambino su base argentata.',
      captionEn: 'Baby boy composition on a silvered base.',
      order: 9
    },
    {
      image: '/uploads/seed/bear-on-flower-base.jpg',
      titleBg: 'Мече върху цветен пиедестал',
      titleIt: 'Orsetto su piedistallo fiorito',
      titleEn: 'Bear on flowered pedestal',
      captionBg: 'С перли и кристали — за специални събития.',
      captionIt: 'Con perle e cristalli — per eventi speciali.',
      captionEn: 'With pearls and crystals — for special events.',
      order: 10
    },
    {
      image: '/uploads/seed/red-rose-bowl.jpg',
      titleBg: 'Червена роза в купичка',
      titleIt: 'Rosa rossa nella ciotola',
      titleEn: 'Red rose in bowl',
      captionBg: 'Изваяна роза с металик ефект върху мраморна основа.',
      captionIt: 'Rosa scolpita con effetto metallico su marmo.',
      captionEn: 'Sculpted rose with metallic finish on marble.',
      order: 11
    },
    {
      image: '/uploads/seed/pink-rose-bud.jpg',
      titleBg: 'Розова розова пъпка',
      titleIt: 'Bocciolo di rosa rosa',
      titleEn: 'Pink rose bud',
      captionBg: 'Малка скулптура върху розов органзов воал.',
      captionIt: 'Piccola scultura su velo di organza rosa.',
      captionEn: 'A small sculpture on pink organza veil.',
      order: 12
    },
    {
      image: '/uploads/seed/tulip-bouquet-vase.jpg',
      titleBg: 'Букет лалета в гипсова ваза',
      titleIt: 'Bouquet di tulipani in vaso',
      titleEn: 'Tulip bouquet in vase',
      captionBg: 'Десет лалета, всяко различно — изваяни един по един.',
      captionIt: 'Dieci tulipani, ognuno diverso — scolpiti uno a uno.',
      captionEn: 'Ten tulips, each different — sculpted one by one.',
      order: 13
    },
    {
      image: '/uploads/seed/angel-heart-pendant.jpg',
      titleBg: 'Ангел със сърце',
      titleIt: 'Angelo con cuore',
      titleEn: 'Angel with heart',
      captionBg: 'Минималистична форма, изрязано сърце, окачен орнамент.',
      captionIt: 'Forma minimale, cuore traforato, ornamento da appendere.',
      captionEn: 'Minimal shape, cut-out heart, hanging ornament.',
      order: 14
    },
    {
      image: '/uploads/seed/daisy-flower-pin.jpg',
      titleBg: 'Брошка маргаритка',
      titleIt: 'Spilla margherita',
      titleEn: 'Daisy pin',
      captionBg: 'Миниатюрна скулптура със сребрист венец и златен център.',
      captionIt: 'Miniatura con corolla argentata e centro dorato.',
      captionEn: 'Miniature with silvered petals and gold centre.',
      order: 15
    },
    {
      image: '/uploads/seed/cream-bowls-pair.jpg',
      titleBg: 'Двойка кремави купички',
      titleIt: 'Coppia di ciotole crema',
      titleEn: 'Pair of cream bowls',
      captionBg: 'Различни форми, една и съща ръка — за дребни предмети.',
      captionIt: 'Forme diverse, stessa mano — per piccoli oggetti.',
      captionEn: 'Different shapes, same hand — for small objects.',
      order: 16
    }
  ];

  // Only seed gallery if empty (don't overwrite user uploads)
  const existingGallery = await prisma.galleryItem.count();
  if (existingGallery === 0) {
    for (const item of gallerySeeds) {
      await prisma.galleryItem.create({ data: item });
    }
    console.log(`✓ Gallery: ${gallerySeeds.length} seed items`);
  } else {
    console.log(`✓ Gallery: ${existingGallery} items (already seeded)`);
  }

  console.log('\n✨ Seed complete!');
  console.log(`\nAdmin login:`);
  console.log(`  URL:      https://eternaltouch.it/admin/login`);
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
