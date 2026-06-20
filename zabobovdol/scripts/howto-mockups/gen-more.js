// Допълнителни „мокъп" екрани за ръководствата „Как да…": обаждания, имейл,
// банкомат/карта, е-услуги, настройки, достъпност, клавиатура, интернет, карти,
// всекидневни помощници и снимки. Стилизирани пресъздавания (НЕ официални екрани).
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-more.js
const { phone, I, av, tip, navTitle, setRow, toggle, render } = require("./_shell");

const S = {};
const green = "#34c759", redc = "#ff3b30";

// ═══════════ ГРУПА 1 — ОБЩУВАНЕ ═══════════

// Входящо обаждане
S["call-incoming"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#2c3e60,#16203a);color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:70px">
    <div style="font-size:15px;opacity:.8">входящо обаждане</div>
    ${av("М","#5b6b8c",96)}
    <div style="font-size:26px;font-weight:700;margin-top:18px">Мария (дъщеря)</div>
    <div style="font-size:15px;opacity:.7;margin-top:4px">мобилен • +359 88 123 4567</div>
    <div style="flex:1"></div>
    <div style="display:flex;gap:80px;padding-bottom:54px;align-items:center">
      <div style="text-align:center"><div style="width:70px;height:70px;border-radius:50%;background:${redc};display:flex;align-items:center;justify-content:center;transform:rotate(135deg)">${I.phone}</div><div style="margin-top:8px;font-size:13px">Откажи</div></div>
      <div style="text-align:center"><div class="ring ringr" style="width:70px;height:70px;border-radius:50%;background:${green};display:flex;align-items:center;justify-content:center">${I.phone}</div><div style="margin-top:8px;font-size:13px">Приеми</div></div>
    </div>
  </div>
  ${tip("Зелено = приеми • Червено = откажи","left:50%;bottom:140px;transform:translateX(-50%)")}
`);

// Запис на нов контакт
S["contact-new"] = phone(`
  <div style="background:#fff;padding:13px 14px;display:flex;align-items:center;border-bottom:1px solid #eee"><span style="color:#888;font-size:18px">✕</span><div style="flex:1;text-align:center;font-weight:700;font-size:16px;color:#111">Нов контакт</div><div class="ring" style="color:#1877f2;font-weight:700;font-size:16px;border-radius:8px;padding:2px 6px">Запази</div></div>
  <div style="background:#fff;padding:24px;text-align:center;border-bottom:8px solid #eef0f2">${av("👤","#cfd8e3",80)}</div>
  <div class="grow" style="background:#fff;padding:8px 4px">
    ${["Име|Мария Петрова","Фамилия|","Телефон|088 123 4567"].map(r=>{const[l,v]=r.split("|");return `<div style="padding:14px 18px;border-bottom:1px solid #f3f3f3"><div style="font-size:12px;color:#1877f2">${l}</div><div style="font-size:16px;color:${v?'#111':'#bbb'};margin-top:2px">${v||l}</div></div>`}).join("")}
  </div>
  ${tip("Въведете име и номер,<br>после натиснете „Запази“","right:8px;top:60px")}
`);

// Избиране на записан контакт
S["dial-contact"] = phone(`
  ${navTitle("#fff","#111","Контакти")}
  <div style="background:#fff;padding:8px 14px;border-bottom:1px solid #eee"><div style="background:#f0f2f5;border-radius:20px;padding:9px 14px;color:#888;font-size:15px;display:flex;gap:8px">${I.search} Търсене</div></div>
  <div class="grow" style="background:#fff">
    ${["Б|Боряна|#ec407a|0","Г|Георги (внук)|#42a5f5|0","М|Мария (дъщеря)|#7e57c2|1","П|Петър (зет)|#ffa726|0"].map(r=>{const[i,n,c,hl]=r.split("|");return `<div class="${hl==='1'?'ring':''}" style="display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid #f3f3f3;${hl==='1'?'border-radius:10px;margin:4px 8px;':''}">${av(i,c)}<div style="flex:1;font-size:16px;color:#111">${n}</div>${hl==='1'?`<span style="color:${green}">${I.phone}</span>`:''}</div>`}).join("")}
  </div>
  ${tip("Натиснете името → после<br>зелената слушалка, за да звъннете","left:50%;bottom:120px;transform:translateX(-50%)")}
`);

// Ново SMS
S["sms-new"] = phone(`
  ${navTitle("#fff","#111","Мария")}
  <div class="grow" style="background:#fff;padding:14px 12px;display:flex;flex-direction:column;gap:9px">
    <div style="align-self:flex-start;max-width:74%;background:#e9e9eb;padding:9px 13px;border-radius:18px;font-size:15px;color:#111">Идваш ли днес?</div>
    <div style="align-self:flex-end;max-width:74%;background:#34c759;color:#fff;padding:9px 13px;border-radius:18px;font-size:15px">Да, към 15 ч.</div>
  </div>
  <div style="background:#f7f7f8;padding:9px 10px;display:flex;align-items:center;gap:9px;border-top:1px solid #eee">
    <div style="flex:1;background:#fff;border:1px solid #ddd;border-radius:20px;padding:9px 14px;color:#111;font-size:15px">До скоро</div>
    <div class="ring ringr" style="background:#34c759;color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center">${I.send}</div></div>
  ${tip("Напишете текста и натиснете<br>стрелката за изпращане","right:8px;bottom:62px")}
`);

// Пропуснато обаждане
S["call-missed"] = phone(`
  ${navTitle("#fff","#111","Скорошни")}
  <div class="grow" style="background:#fff">
    ${[["Мария (дъщеря)","днес, 13:05","#ff3b30","Пропуснато",1],["Аптека","вчера, 10:20","#111","Изходящо",0],["Георги (внук)","вчера, 09:00","#111","Входящо",0]].map(([n,t,c,k,hl])=>`<div class="${hl?'ring':''}" style="display:flex;align-items:center;gap:14px;padding:13px 16px;border-bottom:1px solid #f3f3f3;${hl?'border-radius:10px;margin:4px 8px;':''}"><span style="color:${c}">${I.phone}</span><div style="flex:1"><div style="font-size:16px;color:${c}">${n}</div><div style="font-size:12px;color:#888">${k} • ${t}</div></div><span style="color:#1877f2">${I.phone}</span></div>`).join("")}
  </div>
  ${tip("Червеното име = пропуснато.<br>Натиснете, за да върнете обаждането","left:50%;top:120px;transform:translateX(-50%)")}
`);

// Gmail — входяща кутия
S["mail-inbox"] = phone(`
  <div style="background:#fff;padding:12px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #eee">${I.search}<div style="flex:1;color:#5f6368;font-size:16px">Търсене в пощата</div>${av("Б","#1a73e8",30)}</div>
  <div class="grow" style="background:#fff">
    ${[["НЗ","НОИ — известие","Справка за пенсия за месец...","08:14","#34a853",1],["А","Аптека Здраве","Вашата поръчка е готова","вчера","#ea4335",0],["М","Мария Петрова","Снимки от внучето 📷","пон","#7e57c2",0]].map(([i,f,s,t,c,un])=>`<div class="${un?'ring':''}" style="display:flex;gap:12px;padding:13px 14px;border-bottom:1px solid #f3f3f3;${un?'border-radius:10px;margin:4px 8px;':''}">${av(i,c,40)}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between"><span style="font-weight:${un?700:500};font-size:15px;color:#111">${f}</span><span style="font-size:12px;color:#888">${t}</span></div><div style="font-size:14px;color:#5f6368;font-weight:${un?700:400};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s}</div></div></div>`).join("")}
  </div>
  ${tip("Натиснете писмото, за да го отворите.<br>Удебеленото е непрочетено","left:50%;top:120px;transform:translateX(-50%)")}
`);

// Gmail — писане
S["mail-compose"] = phone(`
  <div style="background:#fff;padding:12px 14px;display:flex;align-items:center;gap:18px;border-bottom:1px solid #eee"><span style="color:#888;font-size:18px">←</span><div style="flex:1"></div><span style="color:#5f6368">${I.clip}</span><div class="ring ringr" style="background:#1a73e8;color:#fff;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center">${I.send}</div></div>
  <div class="grow" style="background:#fff">
    ${["До|maria@abv.bg","Тема|Поздрав"].map(r=>{const[l,v]=r.split("|");return `<div style="padding:13px 16px;border-bottom:1px solid #f0f0f0;font-size:15px"><span style="color:#888">${l}: </span><span style="color:#111">${v}</span></div>`}).join("")}
    <div style="padding:16px;font-size:16px;color:#111">Здравей, Мария!<br><br>Как сте? Очакваме ви на гости.</div>
  </div>
  ${tip("Стрелката горе вдясно = Изпрати.<br>Кламерът = прикачи снимка","right:6px;top:58px")}
`);

// Gmail — прикачване
S["mail-attach"] = phone(`
  <div style="background:#fff;padding:12px 14px;display:flex;align-items:center;gap:18px;border-bottom:1px solid #eee"><span style="color:#888;font-size:18px">←</span><div style="flex:1;color:#888;font-size:15px">Нов имейл</div><div class="ring ringr" style="color:#1a73e8;padding:3px">${I.clip}</div><span style="color:#1a73e8">${I.send}</span></div>
  <div class="grow" style="background:#fff"></div>
  <div style="background:#fff;border-top:1px solid #eee;padding:18px 16px">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:center;font-size:13px;color:#444">
      ${[["🖼️","Снимка",1],["📄","Файл",0],["📷","Камера",0]].map(([e,l,hl])=>`<div><div class="${hl?'ring ringr':''}" style="width:58px;height:58px;border-radius:50%;background:#f0f2f5;display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 6px">${e}</div>${l}</div>`).join("")}
    </div>
  </div>
  ${tip("Натиснете кламера → „Снимка“,<br>после изберете снимка","left:50%;bottom:150px;transform:translateX(-50%)")}
`);

// Gmail — спам
S["mail-spam"] = phone(`
  ${navTitle("#fff","#111","Внимание")}
  <div class="grow" style="background:#fff;padding:16px">
    <div style="background:#fff4f4;border:1px solid #ffd5d5;border-radius:12px;padding:14px;margin-bottom:14px;color:#b91c1c;font-size:14px"><b>⚠ Възможна измама (спам)</b><br>Това писмо иска пари/данни. Не натискайте връзки.</div>
    <div style="border:1px solid #eee;border-radius:12px;padding:14px">
      <div style="font-weight:700;color:#111">Спечелихте 50 000 лв!!!</div>
      <div style="font-size:13px;color:#888;margin:4px 0">от: prize-winner@xz-mail.info</div>
      <div style="font-size:14px;color:#444">Натиснете тук, за да получите наградата си веднага...</div>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px;justify-content:center">
      <div class="ring" style="background:#fff;border:1px solid #ddd;color:#b91c1c;padding:10px 18px;border-radius:10px;font-weight:700;display:flex;align-items:center;gap:8px">${I.trash} Изтрий / Спам</div>
    </div>
  </div>
  ${tip("Непознат подател + награда/пари =<br>измама. Изтрийте, без да отваряте","left:50%;top:130px;transform:translateX(-50%)")}
`);

// ═══════════ ГРУПА 2 — ПАРИ И УСЛУГИ ═══════════

// Банкомат
S["atm"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#0b3d2e,#0a2a3d);color:#fff;padding:26px 20px;display:flex;flex-direction:column">
    <div style="text-align:center;font-size:13px;opacity:.7;letter-spacing:1px">БАНКОМАТ • ATM</div>
    <div style="text-align:center;font-size:20px;font-weight:700;margin:24px 0 6px">Изберете сума</div>
    <div style="text-align:center;font-size:13px;opacity:.7;margin-bottom:20px">в лева</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${["20","50","100","200"].map((s,idx)=>`<div class="${idx===1?'ring':''}" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:18px;text-align:center;font-size:22px;font-weight:700;${idx===1?'border-radius:12px;':''}">${s} лв</div>`).join("")}
    </div>
    <div style="margin-top:18px;background:rgba(255,255,255,.12);border-radius:12px;padding:16px;text-align:center;font-size:16px">Друга сума</div>
    <div style="flex:1"></div>
    <div style="text-align:center;font-size:13px;opacity:.7">След това вземете картата и парите</div>
  </div>
  ${tip("Сложете картата → въведете ПИН →<br>изберете сума → вземете парите","left:50%;bottom:60px;transform:translateX(-50%)")}
`);

// Безопасност на банкомата
S["atm-safe"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#0b3d2e,#0a2a3d);color:#fff;padding:26px 20px;display:flex;flex-direction:column;align-items:center">
    <div style="font-size:20px;font-weight:700;margin-bottom:8px">Въведете ПИН</div>
    <div style="font-size:26px;letter-spacing:8px;margin-bottom:24px">● ● ● ●</div>
    <div style="position:relative">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${[1,2,3,4,5,6,7,8,9].concat(["",0,"⌫"]).map(n=>`<div style="width:62px;height:48px;background:rgba(255,255,255,.12);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">${n}</div>`).join("")}</div>
      <div class="ring" style="position:absolute;inset:-8px;border-radius:14px"></div>
      <div style="position:absolute;left:-6px;top:-4px;font-size:44px">✋</div>
    </div>
  </div>
  ${tip("Прикривайте клавиатурата с ръка,<br>докато въвеждате ПИН кода","left:50%;bottom:70px;transform:translateX(-50%)")}
`);

// Плащане с карта (POS)
S["pos"] = phone(`
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px">
    <div style="width:230px;background:#1f2937;border-radius:18px;padding:22px;color:#fff;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,.25)">
      <div style="font-size:13px;opacity:.7">СУМА ЗА ПЛАЩАНЕ</div>
      <div style="font-size:34px;font-weight:800;margin:6px 0">24,80 лв</div>
      <div class="ring ringr" style="width:70px;height:70px;border-radius:50%;background:#34c759;margin:18px auto 10px;display:flex;align-items:center;justify-content:center;font-size:30px">💳</div>
      <div style="font-size:15px">Допрете картата тук</div>
      <div style="font-size:12px;opacity:.7;margin-top:6px">над 100 лв — въведете ПИН</div>
    </div>
  </div>
  ${tip("Допрете картата до терминала.<br>За голяма сума въведете ПИН","left:50%;bottom:90px;transform:translateX(-50%)")}
`);

// Изгубена/блокиране на карта
S["card-lost"] = phone(`
  ${navTitle("#b91c1c","#fff","Спешно — изгубена карта")}
  <div class="grow" style="background:#fff;padding:18px">
    <div style="background:#fff4f4;border:1px solid #ffd5d5;border-radius:12px;padding:16px;color:#b91c1c;font-size:15px;margin-bottom:18px"><b>Действайте веднага.</b> Обадете се на банката си да блокира картата.</div>
    <div style="font-weight:700;color:#111;margin-bottom:10px">Стъпки:</div>
    ${["Обадете се на телефона на гърба на картата","Кажете „искам да блокирам картата“","Проверете последните плащания","Поискайте нова карта"].map((t,i)=>`<div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start"><span style="background:#b91c1c;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${i+1}</span><span style="font-size:15px;color:#333">${t}</span></div>`).join("")}
    <div class="ring" style="background:#34c759;color:#fff;padding:14px;border-radius:12px;text-align:center;font-weight:700;font-size:16px;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:10px">${I.phone} Обади се на банката</div>
  </div>
`);

// Онлайн поръчка
S["shop-order"] = phone(`
  ${navTitle("#fff","#111","Онлайн магазин")}
  <div class="grow" style="background:#fff;padding:16px">
    <div style="height:160px;border-radius:12px;background:linear-gradient(135deg,#dbeafe,#93c5fd);display:flex;align-items:center;justify-content:center;font-size:54px">🛒</div>
    <div style="font-weight:700;font-size:17px;color:#111;margin-top:12px">Зимни чехли, размер 40</div>
    <div style="font-size:22px;font-weight:800;color:#111;margin:6px 0">29,90 лв</div>
    <div style="font-size:13px;color:#34a853;margin-bottom:16px">✓ Доставка с Еконт до 2 дни</div>
    <div class="ring" style="background:#ff6f00;color:#fff;padding:15px;border-radius:12px;text-align:center;font-weight:700;font-size:17px">Купи сега</div>
    <div style="border:1px solid #ddd;color:#111;padding:13px;border-radius:12px;text-align:center;font-weight:700;font-size:16px;margin-top:10px">Добави в кошницата</div>
  </div>
  ${tip("Натиснете „Купи сега“ →<br>попълнете адрес → потвърдете","right:10px;bottom:150px")}
`);

// Проследяване на пратка
S["shop-track"] = phone(`
  ${navTitle("#c8102e","#fff","Еконт — проследяване")}
  <div style="background:#fff;padding:14px 16px;border-bottom:8px solid #eef0f2"><div style="font-size:12px;color:#888">Товарителница №</div><div style="font-size:17px;font-weight:700;color:#111">1051 2345 6789</div></div>
  <div class="grow" style="background:#fff;padding:18px 20px">
    ${[["Прието от подателя","пон, 10:20",1],["Пристигна в София","вт, 06:30",1],["В куриера за доставка","днес, 08:15",1],["Доставено до Вас","очаква се днес",0]].map(([t,d,done],i,a)=>`<div style="display:flex;gap:14px"><div style="display:flex;flex-direction:column;align-items:center"><div style="width:18px;height:18px;border-radius:50%;background:${done?'#34a853':'#fff'};border:2px solid ${done?'#34a853':'#bbb'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px">${done?'✓':''}</div>${i<a.length-1?`<div style="width:2px;flex:1;min-height:34px;background:${done?'#34a853':'#ddd'}"></div>`:''}</div><div style="padding-bottom:18px"><div style="font-size:15px;font-weight:${done?700:500};color:${done?'#111':'#888'}">${t}</div><div style="font-size:12px;color:#888">${d}</div></div></div>`).join("")}
  </div>
  ${tip("Въведете номера от SMS-а,<br>за да видите къде е пратката","left:50%;top:130px;transform:translateX(-50%)")}
`, "#fff");

// eGov.bg вход
S["egov"] = phone(`
  ${navTitle("#13399b","#fff","egov.bg")}
  <div class="grow" style="background:#fff;padding:20px">
    <div style="font-weight:700;font-size:17px;color:#111;margin-bottom:6px">Вход в електронните услуги</div>
    <div style="font-size:13px;color:#666;margin-bottom:20px">Изберете начин за идентификация:</div>
    ${[["📱","Мобилен телефон (Evrotrust/B-Trust)","най-лесно за телефон",1],["🔑","ПИК на НАП","код от НАП",0],["💳","Електронен подпис","със смарт карта",0]].map(([e,t,d,hl])=>`<div class="${hl?'ring':''}" style="display:flex;align-items:center;gap:14px;padding:15px;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:12px;${hl?'border-radius:12px;':''}"><span style="font-size:24px">${e}</span><div style="flex:1"><div style="font-weight:700;font-size:15px;color:#111">${t}</div><div style="font-size:12px;color:#888">${d}</div></div><span style="color:#13399b">${I.lock}</span></div>`).join("")}
    <div style="background:#eff6ff;border-radius:10px;padding:12px;font-size:13px;color:#1e40af">Услугите на държавата са безплатни. egov.bg никога не иска пари по телефона.</div>
  </div>
  ${tip("С телефон е най-лесно чрез<br>мобилно приложение за подпис","left:50%;top:150px;transform:translateX(-50%)")}
`);

// Здравно досие
S["health-record"] = phone(`
  ${navTitle("#0a7d4b","#fff","Здравно досие")}
  <div style="background:#fff;padding:16px;display:flex;align-items:center;gap:12px;border-bottom:8px solid #eef0f2">${av("➕","#34c759",46)}<div><div style="font-weight:700;font-size:16px;color:#111">Стойна Иванова</div><div style="font-size:13px;color:#888">ЕГН ●●●●●●●●●●</div></div></div>
  <div class="grow" style="background:#fff">
    ${[["💊","Електронни рецепти","2 активни"],["🩺","Прегледи","последен: 14.05"],["🧪","Изследвания","кръв, 10.05"],["💉","Имунизации","грип, есен 2025"]].map(([e,t,d])=>setRow(e,t,d)).join("")}
  </div>
  ${tip("Тук виждате рецептите и прегледите си.<br>Влиза се с електронна автентикация","left:50%;top:130px;transform:translateX(-50%)")}
`);

// НОИ пенсия
S["noi-pension"] = phone(`
  ${navTitle("#13399b","#fff","НОИ — моята пенсия")}
  <div class="grow" style="background:#fff;padding:18px">
    <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;border-radius:16px;padding:20px;margin-bottom:16px">
      <div style="font-size:13px;opacity:.85">Месечна пенсия</div>
      <div style="font-size:30px;font-weight:800;margin:4px 0">638,20 лв</div>
      <div style="font-size:12px;opacity:.85">изплаща се около 7-мо число</div>
    </div>
    ${[["📅","История на плащанията",""],["📄","Удостоверение за доход",""],["⚙️","Промяна на банкова сметка",""]].map(([e,t,d])=>setRow(e,t,"›")).join("")}
    <div style="background:#eff6ff;border-radius:10px;padding:12px;font-size:13px;color:#1e40af;margin-top:14px">Влиза се безопасно с ПИК на НОИ или електронен подпис.</div>
  </div>
  ${tip("Тук проверявате размера на пенсията<br>и историята на плащанията","left:50%;top:140px;transform:translateX(-50%)")}
`);

// ПИК на НАП
S["pik-nap"] = phone(`
  ${navTitle("#0a4d8c","#fff","НАП — вход с ПИК")}
  <div class="grow" style="background:#fff;padding:22px 20px">
    <div style="text-align:center;font-size:46px;margin-bottom:6px">🔑</div>
    <div style="font-weight:700;font-size:16px;color:#111;text-align:center;margin-bottom:18px">Персонален идентификационен код</div>
    <div style="font-size:12px;color:#1a73e8;margin-bottom:4px">ЕГН</div>
    <div style="border:1px solid #ccd0d5;border-radius:10px;padding:13px;font-size:16px;color:#111;margin-bottom:14px">●●●●●●●●●●</div>
    <div style="font-size:12px;color:#1a73e8;margin-bottom:4px">ПИК (12 цифри)</div>
    <div style="border:1px solid #ccd0d5;border-radius:10px;padding:13px;font-size:16px;color:#111;margin-bottom:18px">●●●● ●●●● ●●●●</div>
    <div class="ring" style="background:#0a4d8c;color:#fff;padding:14px;border-radius:10px;text-align:center;font-weight:700;font-size:16px">Вход</div>
    <div style="font-size:12px;color:#888;text-align:center;margin-top:12px">ПИК се взема безплатно от офис на НАП.</div>
  </div>
`);

// ═══════════ ГРУПА 3 — ТЕЛЕФОН И ДОСТЪПНОСТ ═══════════

// Бърз панел — Wi-Fi
S["quick-wifi"] = phone(`
  <div style="background:linear-gradient(160deg,#1e293b,#0f172a);color:#fff;padding:16px 16px 22px;flex:0 0 auto">
    <div style="text-align:center;font-size:13px;opacity:.6;margin-bottom:14px">— плъзнете надолу от горе —</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;text-align:center;font-size:12px">
      ${[["Wi-Fi",I.wifi,1],["Данни","📶",0],["Bluetooth","🔵",0],["Фенерче","🔦",0],["Звук","🔔",0],["Самолетен","✈️",0]].map(([l,ic,on])=>`<div><div class="${l==='Wi-Fi'?'ring ringr':''}" style="width:62px;height:62px;border-radius:50%;background:${on?'#1877f2':'rgba(255,255,255,.14)'};display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 6px">${ic}</div>${l}</div>`).join("")}
    </div>
  </div>
  <div class="grow" style="background:#0f172a"></div>
  ${tip("Плъзнете от горния край надолу →<br>натиснете кръгчето Wi-Fi (синьо = вкл.)","left:50%;top:150px;transform:translateX(-50%)")}
`, "#0f172a", "#fff");

// Размер на шрифта
S["font-size"] = phone(`
  ${navTitle("#fff","#111","Размер на шрифта")}
  <div style="background:#fff;padding:20px;border-bottom:8px solid #eef0f2">
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;font-size:22px;color:#111;line-height:1.4">Здравей! Така ще изглежда текстът.</div>
  </div>
  <div class="grow" style="background:#fff;padding:30px 20px">
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:15px;color:#888">А</span>
      <div style="flex:1;height:4px;background:#ddd;border-radius:2px;position:relative"><div style="position:absolute;left:0;width:72%;height:4px;background:#1877f2;border-radius:2px"></div><div class="ring ringr" style="position:absolute;left:68%;top:-12px;width:28px;height:28px;border-radius:50%;background:#1877f2;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div>
      <span style="font-size:28px;color:#888">А</span></div>
  </div>
  ${tip("Плъзнете точката надясно,<br>за да станат буквите по-големи","left:50%;bottom:130px;transform:translateX(-50%)")}
`);

// Сила на звука
S["volume"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#334155,#1e293b);color:#fff;display:flex;align-items:center;justify-content:center">
    <div style="text-align:center">
      <div style="background:rgba(255,255,255,.12);border-radius:24px;padding:20px 16px;width:90px;margin:0 auto">
        <div style="font-size:24px;margin-bottom:10px">🔊</div>
        <div style="width:14px;height:200px;background:rgba(255,255,255,.2);border-radius:8px;margin:0 auto;position:relative">
          <div class="ring" style="position:absolute;bottom:0;width:14px;height:130px;background:#fff;border-radius:8px"></div></div>
      </div>
      <div style="margin-top:16px;font-size:14px;opacity:.8">странични бутони +/−</div>
    </div>
  </div>
  ${tip("Натискайте бутона за усилване<br>отстрани на телефона","left:50%;bottom:90px;transform:translateX(-50%)")}
`, "#1e293b", "#fff");

// Не безпокойте / тих режим
S["dnd"] = phone(`
  ${navTitle("#fff","#111","Звук и вибрация")}
  <div class="grow" style="background:#fff">
    ${setRow("🌙","Не безпокойте", toggle(true), true)}
    ${setRow("🔕","Тих режим", toggle(false))}
    ${setRow("📳","Вибрация", toggle(true))}
    <div style="padding:14px 18px;font-size:13px;color:#888">„Не безпокойте“ спира звуците нощем. Будилникът пак ще звъни.</div>
  </div>
  ${tip("Плъзнете ключето вдясно (зелено),<br>за да включите режима","right:10px;top:64px")}
`);

// Screenshot
S["screenshot"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#475569,#1e293b);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px">
    <div style="font-size:17px;font-weight:700;margin-bottom:20px;text-align:center">Натиснете двата бутона<br>едновременно</div>
    <div style="display:flex;align-items:center;gap:50px">
      <div style="text-align:center"><div class="ring" style="width:14px;height:54px;background:#fff;border-radius:6px"></div><div style="font-size:12px;margin-top:8px;opacity:.8">Звук −</div></div>
      <div style="font-size:30px">+</div>
      <div style="text-align:center"><div class="ring" style="width:14px;height:54px;background:#fff;border-radius:6px"></div><div style="font-size:12px;margin-top:8px;opacity:.8">Включване</div></div>
    </div>
    <div style="margin-top:26px;font-size:14px;opacity:.8;text-align:center">Екранът мига → снимката е в галерията</div>
  </div>
  ${tip("Бутон „Звук надолу“ + „Включване“<br>натиснати заедно за миг","left:50%;bottom:80px;transform:translateX(-50%)")}
`, "#1e293b", "#fff");

// Лупа на екрана
S["magnifier"] = phone(`
  ${navTitle("#fff","#111","Лупа / Увеличение")}
  <div class="grow" style="background:#fff;padding:20px">
    <div style="border:1px solid #eee;border-radius:12px;padding:16px;position:relative;overflow:hidden">
      <div style="font-size:12px;color:#444;line-height:1.5">Дребен текст на опаковка или документ, който е труден за четене с просто око...</div>
      <div class="ring ringr" style="position:absolute;left:30%;top:20%;width:120px;height:120px;border-radius:50%;background:#fff;border:4px solid #1877f2;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#111;box-shadow:0 8px 24px rgba(0,0,0,.2)">Aa</div>
    </div>
    ${setRow("🔍","Уголемяване на екрана", toggle(true), false)}
  </div>
  ${tip("Включете „Лупа“ → насочете камерата<br>към дребния текст","left:50%;bottom:120px;transform:translateX(-50%)")}
`);

// Субтитри
S["captions"] = phone(`
  <div class="grow" style="background:#000;display:flex;flex-direction:column">
    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#fff;font-size:50px">🎬</div>
    <div style="text-align:center;padding-bottom:10px"><span style="background:rgba(0,0,0,.75);color:#fff;font-size:16px;padding:6px 12px;border-radius:6px">„Добър ден на всички зрители!“</span></div>
    <div style="background:#111;display:flex;align-items:center;gap:16px;padding:12px 16px;color:#fff">
      <span style="font-size:18px">▶</span><div style="flex:1;height:3px;background:#555;border-radius:2px"><div style="width:40%;height:3px;background:#fff;border-radius:2px"></div></div>
      <div class="ring" style="background:#fff;color:#000;font-weight:700;font-size:12px;padding:3px 6px;border-radius:4px">CC</div>
    </div>
  </div>
  ${tip("Натиснете бутона „CC“,<br>за да се появят субтитрите","right:10px;bottom:74px")}
`, "#000", "#fff");

// Светкавица при звънене
S["flash-alerts"] = phone(`
  ${navTitle("#fff","#111","Звук и известия")}
  <div class="grow" style="background:#fff">
    <div style="padding:14px 18px;font-size:13px;color:#888">За хора с намален слух — телефонът мига при обаждане.</div>
    ${setRow("⚡","Светване при звънене и SMS", toggle(true), true)}
    ${setRow("📳","Силна вибрация", toggle(true))}
    ${setRow("🔔","Усилен звук на звънене", toggle(false))}
  </div>
  ${tip("Включете ключето — светкавицата<br>ще мига при всяко обаждане","right:10px;top:110px")}
`);

// Четене на глас
S["screen-reader"] = phone(`
  ${navTitle("#fff","#111","Четене на глас")}
  <div class="grow" style="background:#fff">
    <div style="padding:14px 18px;font-size:13px;color:#888">Телефонът чете на глас това, което докоснете.</div>
    ${setRow("🗣️","Четене на глас (TalkBack/VoiceOver)", toggle(true), true)}
    ${setRow("🐢","Скорост на говора", "нормална")}
    <div style="margin:18px;background:#eef6ff;border-radius:12px;padding:16px;display:flex;align-items:center;gap:12px"><span style="font-size:26px">🔊</span><div style="font-size:14px;color:#1e40af">„Бутон. Обаждане. Натиснете два пъти, за да отворите.“</div></div>
  </div>
  ${tip("Включете ключето — телефонът<br>ще изговаря всичко на екрана","right:10px;top:110px")}
`);

// По-големи икони
S["big-icons"] = phone(`
  ${navTitle("#fff","#111","Размер на дисплея")}
  <div style="background:#fff;padding:18px;border-bottom:8px solid #eef0f2">
    <div style="display:flex;gap:18px;justify-content:center">
      ${["📞","💬","📷","⚙️"].map(e=>`<div style="width:62px;height:62px;border-radius:16px;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-size:30px">${e}</div>`).join("")}
    </div>
  </div>
  <div class="grow" style="background:#fff;padding:26px 20px">
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:18px;color:#888">▣</span>
      <div style="flex:1;height:4px;background:#ddd;border-radius:2px;position:relative"><div style="position:absolute;left:0;width:75%;height:4px;background:#1877f2;border-radius:2px"></div><div class="ring ringr" style="position:absolute;left:71%;top:-12px;width:28px;height:28px;border-radius:50%;background:#1877f2;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div>
      <span style="font-size:26px;color:#888">▣</span></div>
  </div>
  ${tip("Плъзнете надясно — иконите и<br>менютата стават по-едри","left:50%;bottom:130px;transform:translateX(-50%)")}
`);

// Контраст / четим текст
S["contrast"] = phone(`
  ${navTitle("#fff","#111","Четимост")}
  <div class="grow" style="background:#fff;padding:0">
    ${setRow("🔲","Висок контраст", toggle(true), true)}
    ${setRow("🅱️","Удебелен текст", toggle(true))}
    <div style="padding:18px">
      <div style="background:#000;color:#fff;border-radius:12px;padding:16px;font-size:17px;font-weight:700">Така текстът е по-ясен и по-четим.</div>
    </div>
  </div>
  ${tip("Включете „Висок контраст“ и<br>„Удебелен текст“ за по-ясни букви","right:10px;top:64px")}
`);

// ═══════════ ГРУПА 4 — КЛАВИАТУРА, ИНТЕРНЕТ, СНИМКИ ═══════════

const keyboard = (extra = "", hl = "") => `
  <div style="background:#d1d5db;padding:8px 5px 10px">
    ${["й ц у к е н г ш щ з","ф ы в а п р о л д ж","я ч с м и т ь б ю"].map((row,ri)=>`<div style="display:flex;justify-content:center;gap:5px;margin-bottom:7px">${ri===2?'<div style="width:34px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px">⇧</div>':''}${row.split(" ").map(k=>`<div style="flex:1;max-width:32px;height:40px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 1px 0 rgba(0,0,0,.2)">${k}</div>`).join("")}${ri===2?'<div style="width:34px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center">⌫</div>':''}</div>`).join("")}
    <div style="display:flex;gap:5px;justify-content:center">
      <div class="${hl==='123'?'ring':''}" style="width:42px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">?123</div>
      <div class="${hl==='globe'?'ring':''}" style="width:42px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#333">${I.globe}</div>
      <div style="flex:1;height:40px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#888">интервал</div>
      <div class="${hl==='mic'?'ring':''}" style="width:42px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#333">${I.mic}</div>
    </div>
    ${extra}
  </div>`;

// Копиране (маркиран текст + меню)
S["kb-copy"] = phone(`
  ${navTitle("#fff","#111","Бележки")}
  <div class="grow" style="background:#fff;padding:18px;position:relative">
    <div style="font-size:16px;color:#111;line-height:1.6">Адресът е <span style="background:#bcd8ff">ул. Първи май 12</span>, Бобов дол.</div>
    <div style="position:absolute;left:30px;top:54px;background:#333;border-radius:10px;display:flex;overflow:hidden;box-shadow:0 6px 18px rgba(0,0,0,.3)">
      <div style="padding:9px 14px;color:#fff;font-size:14px;border-right:1px solid #555">Маркирай</div>
      <div class="ring" style="padding:9px 14px;color:#fff;font-size:14px;border-right:1px solid #555;font-weight:700;border-radius:8px">Копирай</div>
      <div style="padding:9px 14px;color:#fff;font-size:14px">Сподели</div>
    </div>
  </div>
  ${tip("Задръжте пръст върху думата →<br>дръпнете да маркирате → „Копирай“","left:50%;top:130px;transform:translateX(-50%)")}
`);

// Поставяне
S["kb-paste"] = phone(`
  ${navTitle("#fff","#111","Ново съобщение")}
  <div class="grow" style="background:#fff;padding:18px;position:relative">
    <div style="border:1px solid #ddd;border-radius:10px;padding:14px;min-height:60px;color:#bbb;font-size:16px">| напишете тук…</div>
    <div style="position:absolute;left:30px;top:62px;background:#333;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.3)">
      <div class="ring" style="padding:9px 18px;color:#fff;font-size:14px;font-weight:700;border-radius:8px">Постави</div>
    </div>
  </div>
  ${keyboard()}
  ${tip("Задръжте пръст в полето →<br>натиснете „Постави“","left:50%;top:110px;transform:translateX(-50%)")}
`);

// Смяна на език (глобус)
S["kb-lang"] = phone(`
  ${navTitle("#fff","#111","Съобщение")}
  <div class="grow" style="background:#fff;padding:18px"><div style="border:1px solid #ddd;border-radius:10px;padding:14px;color:#111;font-size:16px">Здравей|</div></div>
  ${keyboard("", "globe")}
  ${tip("Натиснете глобусчето 🌐, за да<br>сменяте между български и English","left:50%;bottom:64px;transform:translateX(-50%)")}
`);

// Цифри и знаци
S["kb-numbers"] = phone(`
  ${navTitle("#fff","#111","Имейл")}
  <div class="grow" style="background:#fff;padding:18px"><div style="border:1px solid #ddd;border-radius:10px;padding:14px;color:#111;font-size:16px">ivan|</div></div>
  ${keyboard("", "123")}
  ${tip("Натиснете „?123“, за да напишете<br>цифри и знаци като @ . ,","left:50%;bottom:64px;transform:translateX(-50%)")}
`);

// Диктовка (микрофон)
S["kb-dictate"] = phone(`
  ${navTitle("#fff","#111","Съобщение")}
  <div class="grow" style="background:#fff;padding:18px"><div style="border:1px solid #ddd;border-radius:10px;padding:14px;color:#888;font-size:16px">🎙️ говорете сега…</div></div>
  ${keyboard("", "mic")}
  ${tip("Натиснете микрофона и говорете —<br>телефонът пише вместо Вас","left:50%;bottom:64px;transform:translateX(-50%)")}
`);

// Браузър — адресна лента
S["browser-url"] = phone(`
  <div style="background:#f1f3f4;padding:10px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #ddd">
    <div class="ring" style="flex:1;background:#fff;border-radius:22px;padding:10px 16px;color:#111;font-size:15px;display:flex;align-items:center;gap:8px;border-radius:22px">${I.search}<span>bobovdol.bg</span></div></div>
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#bbb">
    <div style="font-size:46px;margin-bottom:10px">🌐</div><div style="font-size:14px">Въведете адрес или дума за търсене</div>
  </div>
  ${tip("Натиснете лентата горе, напишете<br>адреса и натиснете „Enter“ / лупата","left:50%;top:120px;transform:translateX(-50%)")}
`);

// Браузър — сигурен сайт (катинарче)
S["browser-secure"] = phone(`
  <div style="background:#f1f3f4;padding:10px 12px;border-bottom:1px solid #ddd">
    <div style="background:#fff;border-radius:22px;padding:9px 14px;font-size:15px;display:flex;align-items:center;gap:8px"><span class="ring ringr" style="color:#0a7d2c;display:flex;padding:2px">${I.lock}</span><span style="color:#111">https://www.<b>nra.bg</b></span></div></div>
  <div class="grow" style="background:#fff;padding:20px">
    <div style="height:90px;border-radius:10px;background:linear-gradient(135deg,#dbeafe,#bfdbfe);margin-bottom:16px"></div>
    <div style="background:#ecfdf3;border:1px solid #abefc6;border-radius:10px;padding:14px;color:#067647;font-size:14px"><b>🔒 Сигурна връзка.</b> Катинарчето показва, че сайтът е защитен.</div>
  </div>
  ${tip("Търсете катинарчето 🔒 преди<br>адреса — значи сайтът е сигурен","left:50%;top:78px;transform:translateX(-50%)")}
`);

// YouTube — гледане
S["youtube-watch"] = phone(`
  <div style="background:#fff;padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #eee"><span style="color:#ff0000;font-size:22px">▶</span><span style="font-weight:800;font-size:18px;color:#111">YouTube</span><div style="flex:1"></div>${I.search}</div>
  <div style="background:#000;height:200px;display:flex;align-items:center;justify-content:center;position:relative"><div class="ring ringr" style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:#000">${I.play}</div></div>
  <div class="grow" style="background:#fff;padding:14px">
    <div style="font-weight:700;font-size:16px;color:#111">Стари български песни — най-доброто</div>
    <div style="font-size:13px;color:#888;margin-top:4px">1,2 млн гледания • преди 2 години</div>
  </div>
  ${tip("Натиснете триъгълника ▶,<br>за да пуснете видеото","left:50%;top:150px;transform:translateX(-50%)")}
`);

// YouTube — търсене
S["youtube-search"] = phone(`
  <div style="background:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee"><span>${I.back}</span><div class="ring" style="flex:1;background:#f0f0f0;border-radius:20px;padding:9px 14px;color:#111;font-size:15px;border-radius:20px">стари български песни</div></div>
  <div class="grow" style="background:#fff">
    ${[["Стари градски песни — сборник","45 мин"],["Народна музика на живо","1:12 ч"],["Любими шлагери от 70-те","38 мин"]].map(([t,d])=>`<div style="display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid #f3f3f3"><div style="width:120px;height:70px;border-radius:8px;background:linear-gradient(135deg,#fca5a5,#ef4444);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px">▶</div><div style="flex:1"><div style="font-size:14px;font-weight:600;color:#111">${t}</div><div style="font-size:12px;color:#888;margin-top:4px">${d}</div></div></div>`).join("")}
  </div>
  ${tip("Напишете каквото търсите и<br>натиснете лупата / „Enter“","left:50%;top:62px;transform:translateX(-50%)")}
`);

// Google Карти — търсене
S["maps-search"] = phone(`
  <div style="position:absolute;inset:0;background:linear-gradient(135deg,#e8f5e9,#c8e6c9)"></div>
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,transparent,transparent 38px,rgba(255,255,255,.5) 38px,rgba(255,255,255,.5) 40px)"></div>
  <div style="position:relative;padding:12px 14px"><div class="ring" style="background:#fff;border-radius:24px;padding:11px 16px;font-size:15px;color:#111;display:flex;align-items:center;gap:10px;box-shadow:0 4px 14px rgba(0,0,0,.15);border-radius:24px">${I.search} ул. Девети септември, Бобов дол</div></div>
  <div style="position:relative;flex:1;display:flex;align-items:center;justify-content:center"><div style="font-size:46px;filter:drop-shadow(0 6px 6px rgba(0,0,0,.3))">📍</div></div>
  ${tip("Напишете адреса в лентата горе —<br>картата показва къде е","left:50%;top:70px;transform:translateX(-50%)")}
`, "#c8e6c9");

// Google Карти — упътване
S["maps-directions"] = phone(`
  <div style="position:absolute;inset:0;background:linear-gradient(135deg,#e8f5e9,#c8e6c9)"></div>
  <svg style="position:absolute;inset:0" width="390" height="690"><path d="M70 560 C 120 420, 250 380, 230 240 S 300 120, 320 90" stroke="#1a73e8" stroke-width="9" fill="none" stroke-linecap="round"/></svg>
  <div style="position:relative;margin-top:auto;background:#fff;border-radius:18px 18px 0 0;padding:18px;box-shadow:0 -4px 16px rgba(0,0,0,.1)">
    <div style="font-size:22px;font-weight:800;color:#111">12 мин • 850 м</div>
    <div style="font-size:14px;color:#888;margin:4px 0 14px">пеша до Аптека „Здраве“</div>
    <div class="ring" style="background:#1a73e8;color:#fff;padding:14px;border-radius:12px;text-align:center;font-weight:700;font-size:16px;border-radius:12px">▶ Старт</div>
  </div>
  ${tip("Изберете мястото → натиснете „Старт“.<br>Синята линия Ви води","left:50%;top:90px;transform:translateX(-50%)")}
`, "#c8e6c9");

// Google Карти — наблизо
S["maps-nearby"] = phone(`
  ${navTitle("#fff","#111","Аптеки наблизо")}
  <div style="height:150px;position:relative;background:linear-gradient(135deg,#e8f5e9,#c8e6c9)"><div style="position:absolute;left:40%;top:40%;font-size:30px">📍</div><div style="position:absolute;left:62%;top:60%;font-size:26px">📍</div></div>
  <div class="grow" style="background:#fff">
    ${[["Аптека Здраве","0702 2016 • 350 м • отворено",1],["Аптека Марешки","0702 8090 • 700 м • отворено",0]].map(([n,d,hl])=>`<div class="${hl?'ring':''}" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #f3f3f3;${hl?'border-radius:10px;margin:4px 8px;':''}"><span style="font-size:24px">💊</span><div style="flex:1"><div style="font-weight:700;font-size:15px;color:#111">${n}</div><div style="font-size:12px;color:#34a853">${d}</div></div><span style="color:#1a73e8">${I.pin}</span></div>`).join("")}
  </div>
  ${tip("Картата показва кои аптеки/болници<br>са най-близо до Вас","left:50%;top:130px;transform:translateX(-50%)")}
`);

// Време
S["weather"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#4a90d9,#74b9ff);color:#fff;padding:30px 20px;text-align:center">
    <div style="font-size:18px">Бобов дол</div>
    <div style="font-size:72px;font-weight:200;margin:6px 0">18°</div>
    <div style="font-size:17px">☀️ Слънчево</div>
    <div style="font-size:13px;opacity:.85;margin-top:4px">мин. 9° • макс. 21°</div>
    <div style="display:flex;justify-content:space-between;margin-top:30px;background:rgba(255,255,255,.15);border-radius:16px;padding:16px 10px">
      ${[["Пон","☀️","21°"],["Вт","⛅","19°"],["Ср","🌧️","15°"],["Чет","☀️","20°"],["Пет","☀️","22°"]].map(([d,e,t])=>`<div style="text-align:center;font-size:13px"><div>${d}</div><div style="font-size:22px;margin:6px 0">${e}</div><div>${t}</div></div>`).join("")}
    </div>
  </div>
  ${tip("Отворете приложението „Времето“ —<br>горе е днес, долу следващите дни","left:50%;bottom:90px;transform:translateX(-50%)")}
`, "#74b9ff", "#fff");

// Будилник
S["alarm"] = phone(`
  ${navTitle("#fff","#111","Будилник")}
  <div class="grow" style="background:#fff">
    ${[["07:00","Всеки ден",1],["09:30","Лекарство",1],["06:30","Само делник",0]].map(([t,d,on])=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 18px;border-bottom:1px solid #f3f3f3"><div><div style="font-size:30px;font-weight:300;color:${on?'#111':'#bbb'}">${t}</div><div style="font-size:13px;color:#888">${d}</div></div>${toggle(on==='1'||on===1)}</div>`).join("")}
  </div>
  <div style="position:absolute;right:22px;bottom:24px"><div class="ring ringr" style="width:58px;height:58px;border-radius:50%;background:#ff6f00;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px">+</div></div>
  ${tip("Натиснете „+“ → изберете час →<br>ключето вдясно го включва","right:14px;bottom:92px")}
`);

// Напомняне за лекарства
S["reminder"] = phone(`
  ${navTitle("#fff","#111","Напомняне")}
  <div class="grow" style="background:#fff;padding:18px">
    <div style="border:1px solid #eee;border-radius:14px;padding:18px;box-shadow:0 2px 8px rgba(0,0,0,.05)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:30px">💊</span><div><div style="font-weight:700;font-size:16px;color:#111">Лекарство — сутрин</div><div style="font-size:13px;color:#888">всеки ден</div></div></div>
      <div style="display:flex;align-items:center;gap:12px;font-size:15px;color:#111;padding:12px 0;border-top:1px solid #f0f0f0">${I.bell} <span style="flex:1">Час</span> <b>09:00</b></div>
      <div class="ring" style="background:#34c759;color:#fff;padding:13px;border-radius:10px;text-align:center;font-weight:700;font-size:15px;margin-top:8px;border-radius:10px">Запази напомнянето</div>
    </div>
  </div>
  ${tip("Изберете час и натиснете „Запази“ —<br>телефонът ще Ви звънне всеки ден","left:50%;bottom:120px;transform:translateX(-50%)")}
`);

// QR код
S["qr"] = phone(`
  <div class="grow" style="background:#111;display:flex;align-items:center;justify-content:center;position:relative">
    <div style="width:220px;height:220px;border:3px solid rgba(255,255,255,.4);border-radius:18px;position:relative;display:flex;align-items:center;justify-content:center">
      <div class="ring ringr" style="background:#fff;padding:14px;border-radius:8px;color:#000">${I.qr}</div>
      ${["top:-3px;left:-3px;border-top:4px solid #fff;border-left:4px solid #fff","top:-3px;right:-3px;border-top:4px solid #fff;border-right:4px solid #fff","bottom:-3px;left:-3px;border-bottom:4px solid #fff;border-left:4px solid #fff","bottom:-3px;right:-3px;border-bottom:4px solid #fff;border-right:4px solid #fff"].map(s=>`<div style="position:absolute;width:30px;height:30px;${s};border-radius:6px"></div>`).join("")}
    </div>
  </div>
  ${tip("Отворете камерата и насочете към<br>квадратчето — линкът се появява сам","left:50%;bottom:90px;transform:translateX(-50%)")}
`, "#111", "#fff");

// Калкулатор
S["calculator"] = phone(`
  <div class="grow" style="background:#111;display:flex;flex-direction:column;justify-content:flex-end;padding:14px">
    <div style="text-align:right;color:#fff;font-size:30px;padding:10px 6px 4px">128 + 47</div>
    <div style="text-align:right;color:#fff;font-size:56px;font-weight:300;padding:0 6px 14px">175</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${[["C","#a5a5a5","#000"],["±","#a5a5a5","#000"],["%","#a5a5a5","#000"],["÷","#ff9500","#fff"],["7","#333","#fff"],["8","#333","#fff"],["9","#333","#fff"],["×","#ff9500","#fff"],["4","#333","#fff"],["5","#333","#fff"],["6","#333","#fff"],["−","#ff9500","#fff"],["1","#333","#fff"],["2","#333","#fff"],["3","#333","#fff"],["+","#ff9500","#fff"]].map(([k,b,c])=>`<div style="background:${b};color:${c};height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px">${k}</div>`).join("")}
    </div>
  </div>
  ${tip("Натискайте цифрите и знаците (+ − × ÷),<br>после „=“ за резултата","left:50%;top:120px;transform:translateX(-50%)")}
`, "#000", "#fff");

// Камера — правене на снимка
S["camera"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#8d99ae,#4a5568);position:relative;display:flex;flex-direction:column">
    <div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:60px">🌳</div>
    <div style="background:rgba(0,0,0,.4);padding:18px 0;display:flex;align-items:center;justify-content:space-around">
      <div style="width:44px;height:44px;border-radius:8px;background:linear-gradient(135deg,#fca5a5,#f87171)"></div>
      <div class="ring ringr" style="width:72px;height:72px;border-radius:50%;background:#fff;border:5px solid rgba(255,255,255,.5)"></div>
      <div style="color:#fff;font-size:24px">🔄</div>
    </div>
  </div>
  ${tip("Насочете телефона и натиснете<br>големия бял кръг, за да снимате","left:50%;bottom:120px;transform:translateX(-50%)")}
`, "#4a5568", "#fff");

// Изрязване
S["photo-crop"] = phone(`
  ${navTitle("#111","#fff","Изрязване")}
  <div class="grow" style="background:#000;display:flex;align-items:center;justify-content:center;position:relative">
    <div style="width:240px;height:300px;background:linear-gradient(135deg,#fbbf24,#f59e0b);position:relative">
      <div class="ring" style="position:absolute;inset:30px;border:2px solid #fff;box-shadow:0 0 0 2000px rgba(0,0,0,.5)"></div>
      ${["top:22px;left:22px","top:22px;right:22px","bottom:22px;left:22px","bottom:22px;right:22px"].map(s=>`<div style="position:absolute;width:20px;height:20px;border:3px solid #fff;${s}"></div>`).join("")}
    </div>
  </div>
  <div style="background:#111;color:#fff;display:flex;justify-content:space-between;padding:16px 24px;font-size:15px"><span>Отказ</span><span class="ring" style="color:#34c759;font-weight:700;border-radius:6px;padding:2px 8px">Готово</span></div>
  ${tip("Дръпнете ъглите на рамката,<br>после натиснете „Готово“","left:50%;top:120px;transform:translateX(-50%)")}
`, "#111", "#fff");

// Завъртане
S["photo-rotate"] = phone(`
  ${navTitle("#111","#fff","Завъртане")}
  <div class="grow" style="background:#000;display:flex;align-items:center;justify-content:center"><div style="width:200px;height:260px;background:linear-gradient(135deg,#60a5fa,#3b82f6);border-radius:6px;transform:rotate(-6deg);display:flex;align-items:center;justify-content:center;font-size:40px">🏞️</div></div>
  <div style="background:#111;padding:18px;display:flex;justify-content:center;gap:40px;color:#fff">
    <div class="ring ringr" style="width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:24px">↺</div>
    <div style="width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-size:24px">↻</div>
  </div>
  ${tip("Натискайте кръгчето със стрелка,<br>докато снимката се изправи","left:50%;bottom:120px;transform:translateX(-50%)")}
`, "#111", "#fff");

// Няколко снимки наведнъж
S["photo-multi"] = phone(`
  ${navTitle("#fff","#111","Изберете снимки")}
  <div class="grow" style="background:#fff;padding:3px">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px">
      ${[["#fbbf24",1],["#60a5fa",1],["#34d399",0],["#f87171",1],["#a78bfa",0],["#fb923c",0],["#22d3ee",0],["#f472b6",0],["#4ade80",0]].map(([c,sel])=>`<div style="aspect-ratio:1;background:${c};position:relative;display:flex;align-items:center;justify-content:center;font-size:24px">🖼️${sel?`<div style="position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;background:#1877f2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;border:2px solid #fff">✓</div>`:''}</div>`).join("")}
    </div>
  </div>
  <div style="background:#fff;padding:12px 14px;border-top:1px solid #eee;display:flex;align-items:center;gap:12px"><span style="font-size:14px;color:#888">избрани: 3</span><div style="flex:1"></div><div class="ring" style="background:#1877f2;color:#fff;padding:10px 22px;border-radius:10px;font-weight:700;font-size:15px;border-radius:10px">Изпрати</div></div>
  ${tip("Докоснете няколко снимки (появява се ✓),<br>после натиснете „Изпрати“","left:50%;bottom:74px;transform:translateX(-50%)")}
`);

render(S).catch((e) => { console.error(e); process.exit(1); });
