// Пета партида „мокъп" екрани: ИЗМАМИ (примерни екрани с подчертани червени
// флагове) и ЕВРОТО (нагледни помагала). Стилизирани, обучителни — не официални
// екрани/банкноти. Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-5.js
const { phone, I, av, tip, navTitle, render } = require("./_shell");

const S = {};
const redc = "#ff3b30", green = "#34c759";

// Лента с предупреждение „измама" най-горе.
const warn = (text) => `<div style="background:#fff4f4;border-bottom:2px solid #fecaca;color:#b91c1c;padding:10px 14px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px">⚠ ${text}</div>`;
// SMS екран с подозрително съобщение.
function smsScam(sender, body, flagTip) {
  return phone(`
    ${navTitle("#fff","#111",sender)}
    ${warn("Подозрително съобщение")}
    <div class="grow" style="background:#fff;padding:16px 12px;display:flex;flex-direction:column;gap:10px">
      <div style="align-self:center;font-size:11px;color:#999">днес 11:32</div>
      <div class="ring" style="align-self:flex-start;max-width:82%;background:#e9e9eb;padding:11px 14px;border-radius:18px;font-size:15px;color:#111;line-height:1.4;border-radius:18px">${body}</div>
      <div style="align-self:flex-start;font-size:12px;color:#b91c1c;margin-top:2px">⚠ непознат подател • съкратен/чужд линк</div>
    </div>
    <div style="background:#f7f7f8;padding:9px 10px;border-top:1px solid #eee;display:flex;gap:9px"><div style="flex:1;background:#fff;border:1px solid #ddd;border-radius:20px;padding:9px 14px;color:#bbb;font-size:15px">Съобщение</div></div>
    ${tip(flagTip,"left:50%;bottom:90px;transform:translateX(-50%)")}
  `);
}
// Екран на подозрително обаждане.
function callScam(caller, sub, warnText, tipText) {
  return phone(`
    <div class="grow" style="background:linear-gradient(160deg,#3a2c2c,#1f1414);color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:54px">
      ${warn(warnText).replace('background:#fff4f4;border-bottom:2px solid #fecaca;','background:rgba(185,28,28,.25);border:1px solid rgba(248,113,113,.5);border-radius:10px;margin:0 16px;')}
      <div style="margin-top:30px">${av("?","#7a5b5b",96)}</div>
      <div style="font-size:24px;font-weight:700;margin-top:16px">${caller}</div>
      <div style="font-size:14px;opacity:.7;margin-top:4px">${sub}</div>
      <div style="flex:1"></div>
      <div style="display:flex;gap:70px;padding-bottom:50px">
        <div style="text-align:center"><div class="ring ringr" style="width:68px;height:68px;border-radius:50%;background:${redc};display:flex;align-items:center;justify-content:center;transform:rotate(135deg)">${I.phone}</div><div style="margin-top:8px;font-size:13px">Затвори</div></div>
        <div style="text-align:center"><div style="width:68px;height:68px;border-radius:50%;background:${green};display:flex;align-items:center;justify-content:center;opacity:.5">${I.phone}</div><div style="margin-top:8px;font-size:13px;opacity:.6">Приеми</div></div>
      </div>
    </div>
    ${tip(tipText,"left:50%;bottom:130px;transform:translateX(-50%)")}
  `, "#1f1414", "#fff");
}

// ═══════════ ИЗМАМИ ═══════════
S["scam-parcel-sms"] = smsScam("+359 88 320 11 ••", `Вашата пратка е задържана. Доплатете <b>1,80 лв</b> мито, за да я получите:<br><span style="color:#1a73e8;text-decoration:underline">bg-posht-dostavka.xyz/pay</span>`, "Истинският куриер НЕ иска плащане по линк.<br>Не натискайте — изтрийте съобщението");

S["scam-fake-sms"] = smsScam("Кратък номер 1ХХХ", `<b>БАНКА:</b> Сметката ви е блокирана! Влезте веднага да я отключите:<br><span style="color:#1a73e8;text-decoration:underline">secure-login-bank.info</span>`, "Банка не праща такива SMS с линк.<br>Не въвеждайте данни — обадете се на банката");

S["scam-bank-call"] = callScam("Непознат номер", "уж от „отдел Сигурност на банката“", "Банка НЕ иска кодове по телефона", "Затворете. Звъннете на банката на номера<br>от гърба на картата — не на този");

S["scam-police-call"] = callScam("Непознат номер", "представя се за „полицай/прокурор“", "Полиция/прокуратура не искат пари", "Няма такава процедура по телефона.<br>Затворете и звъннете на 112");

S["scam-grandchild"] = phone(`
  ${navTitle("#fff","#111","Непознат номер")}
  ${warn("Класическа измама „внук в беда“")}
  <div class="grow" style="background:#fff;padding:16px 12px;display:flex;flex-direction:column;gap:10px">
    <div class="ring" style="align-self:flex-start;max-width:82%;background:#e9e9eb;padding:11px 14px;border-radius:18px;font-size:15px;color:#111;line-height:1.4;border-radius:18px">Бабо, аз съм! Смених си номера. Катастрофирах и спешно ми трябват <b>2000 лв</b>. Ще дойде мой приятел да ги вземе. Не казвай на никого!</div>
    <div style="align-self:flex-start;font-size:12px;color:#b91c1c">⚠ нов номер • спешност • тайна • пари в брой</div>
  </div>
  ${tip("Затворете и звъннете на внука/близките<br>на СТАРИЯ им номер. Това е измама","left:50%;bottom:120px;transform:translateX(-50%)")}
`);

S["scam-otp"] = phone(`
  ${navTitle("#fff","#111","Код за потвърждение")}
  <div class="grow" style="background:#fff;padding:16px 12px;display:flex;flex-direction:column;gap:12px">
    <div style="align-self:flex-start;max-width:82%;background:#e9e9eb;padding:11px 14px;border-radius:18px;font-size:15px;color:#111">Вашият код е <b>482913</b>. Не го споделяйте с никого — дори с банков служител.</div>
    <div class="ring" style="align-self:center;background:#fff4f4;border:1px solid #fecaca;border-radius:12px;padding:14px;color:#b91c1c;font-size:14px;text-align:center;max-width:90%;border-radius:12px">Ако някой ви се обади и поиска този код — <b>ЗАТВОРЕТЕ</b>. Кодът отваря сметката ви.</div>
  </div>
  ${tip("Кодът (OTP) е като ключ за дома ви.<br>Никой няма право да го иска","left:50%;top:130px;transform:translateX(-50%)")}
`);

S["scam-phishing-bank"] = phone(`
  <div style="background:#f1f3f4;padding:9px 10px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #ddd">
    <span style="color:#b91c1c;font-size:16px">⚠</span>
    <div class="ring" style="flex:1;background:#fff;border-radius:20px;padding:8px 12px;color:#b91c1c;font-size:13px;border-radius:20px">http://bank-bg-secure.<b>xyz</b></div></div>
  ${warn("Без катинарче • грешен адрес")}
  <div class="grow" style="background:#fff;padding:22px 20px">
    <div style="text-align:center;color:#0a3d6b;font-weight:800;font-size:22px;margin-bottom:20px">Вход в банка</div>
    <div style="border:1px solid #ccc;border-radius:10px;padding:13px;color:#888;margin-bottom:12px;font-size:15px">Номер на карта</div>
    <div style="border:1px solid #ccc;border-radius:10px;padding:13px;color:#888;margin-bottom:12px;font-size:15px">ПИН код</div>
    <div style="background:#0a3d6b;color:#fff;padding:13px;border-radius:10px;text-align:center;font-weight:700">Вход</div>
  </div>
  ${tip("Истинска банка: адрес с https + 🔒 и точното име.<br>Тук НЯМА катинарче и адресът е фалшив","left:50%;top:140px;transform:translateX(-50%)")}
`);

S["scam-investment"] = phone(`
  ${warn("„Лесни пари“ = измама")}
  <div class="grow" style="background:linear-gradient(160deg,#0f2e1a,#0a1f12);color:#fff;padding:24px 20px;text-align:center">
    <div style="font-size:46px">📈💰</div>
    <div style="font-size:24px;font-weight:800;margin:14px 0;color:#fde047">Печелете 300% с крипто!</div>
    <div style="font-size:15px;opacity:.9;margin-bottom:10px">Инвестирайте 200 лв днес и вземете 2000 лв до месец. Гарантирано!</div>
    <div style="font-size:13px;opacity:.7;margin-bottom:20px">⭐ „Спечелих кола!“ — Иван, Бобов дол</div>
    <div class="ring" style="background:#fde047;color:#000;padding:14px;border-radius:12px;font-weight:800;border-radius:12px">Инвестирай сега</div>
  </div>
  ${tip("Никой не гарантира печалба. Обещаят ли<br>бързи пари — измама. Не давайте пари/карта","left:50%;top:60px;transform:translateX(-50%)")}
`, "#0a1f12", "#fff");

S["scam-love"] = phone(`
  ${navTitle("#0084ff","#fff","Robert (нов приятел)")}
  ${warn("Иска пари, без да сте се виждали")}
  <div class="grow" style="background:#fff;padding:16px 12px;display:flex;flex-direction:column;gap:8px">
    <div style="align-self:flex-start;max-width:74%;background:#f0f0f0;padding:9px 13px;border-radius:18px;font-size:15px;color:#111">Скъпа, обичам те ❤️ Искам да дойда при теб в България</div>
    <div class="ring" style="align-self:flex-start;max-width:74%;background:#f0f0f0;padding:9px 13px;border-radius:18px;font-size:15px;color:#111;border-radius:18px">Но митницата задържа подаръка ми. Прати 800 лв да го освободя…</div>
  </div>
  ${tip("Непознат „любим“ от интернет, който иска<br>пари — винаги е измама. Не пращайте","left:50%;bottom:120px;transform:translateX(-50%)")}
`);

S["scam-remote"] = phone(`
  ${warn("Не давайте достъп до телефона си")}
  <div class="grow" style="background:#fff;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:#fff;border:2px solid #fca5a5;border-radius:18px;padding:22px;text-align:center;box-shadow:0 12px 30px rgba(0,0,0,.15);max-width:280px">
      <div style="font-size:40px">📲</div>
      <div style="font-size:17px;font-weight:700;color:#111;margin:10px 0">„Инсталирайте AnyDesk, за да ви помогнем“</div>
      <div style="font-size:14px;color:#444;margin-bottom:16px">Така измамникът вижда екрана ви и влиза в сметката ви.</div>
      <div class="ring" style="background:#0a3d2e;color:#fff;padding:12px;border-radius:10px;font-weight:700;border-radius:10px">✕ Откажи и затвори</div>
    </div>
  </div>
  ${tip("Никога не инсталирайте приложение по<br>чуждо нареждане по телефона","left:50%;top:80px;transform:translateX(-50%)")}
`);

S["scam-fake-shop"] = phone(`
  ${navTitle("#fff","#111","СУПЕР-ОФЕРТИ.xyz")}
  ${warn("Нереални цени • няма контакти")}
  <div class="grow" style="background:#fff;padding:14px">
    <div style="height:120px;border-radius:10px;background:linear-gradient(135deg,#fca5a5,#f87171);display:flex;align-items:center;justify-content:center;font-size:40px">📱</div>
    <div style="font-weight:700;font-size:16px;color:#111;margin-top:10px">Нов телефон</div>
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0"><span style="text-decoration:line-through;color:#888">1800 лв</span><span style="font-size:22px;font-weight:800;color:#dc2626">99 лв</span></div>
    <div style="font-size:12px;color:#b91c1c">⚠ само предплащане • без телефон/адрес на магазина</div>
    <div class="ring" style="background:#dc2626;color:#fff;padding:13px;border-radius:10px;text-align:center;font-weight:700;margin-top:12px;border-radius:10px">Купи с предплащане</div>
  </div>
  ${tip("Твърде ниска цена + само предплащане +<br>няма контакти = фалшив магазин","left:50%;top:130px;transform:translateX(-50%)")}
`);

S["scam-verify"] = phone(`
  ${navTitle("#0a7d4b","#fff","Как да проверя?")}
  <div class="grow" style="background:#fff;padding:18px">
    ${[["Затворете","Не продължавайте разговора/съобщението."],["Намерете официалния номер","От гърба на картата, сметката или официалния сайт."],["Звъннете сами","На официалния номер — питайте дали наистина са ви търсили."],["Питайте близък","Кажете на роднина, преди да направите нещо."]].map(([t,d],i)=>`<div style="display:flex;gap:12px;margin-bottom:14px"><span style="background:#0a7d4b;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0">${i+1}</span><div><div style="font-weight:700;color:#111">${t}</div><div style="font-size:13px;color:#666">${d}</div></div></div>`).join("")}
    <div style="background:#ecfdf3;border:1px solid #abefc6;border-radius:10px;padding:12px;color:#067647;font-size:14px">Истинските институции нямат против да затворите и да звъннете сами.</div>
  </div>
`);

S["fake-banknote"] = phone(`
  ${navTitle("#fff","#111","Истинска ли е банкнотата?")}
  <div class="grow" style="background:#fff;padding:18px">
    <div style="height:130px;border-radius:10px;background:linear-gradient(135deg,#fde68a,#f59e0b);position:relative;display:flex;align-items:center;justify-content:center;color:#7c4a03;font-weight:800;font-size:22px;box-shadow:inset 0 0 0 2px rgba(0,0,0,.1)">ОБРАЗЕЦ<div style="position:absolute;right:14px;top:14px;width:40px;height:50px;background:rgba(255,255,255,.5);border-radius:4px"></div></div>
    <div style="font-weight:700;color:#111;margin:14px 0 10px">Проверете 3 неща:</div>
    ${[["👁️","Воден знак — вижда се срещу светлина"],["✨","Холограмна лента — блести при наклон"],["✋","Релеф — усеща се грапаво при докосване"]].map(([e,t])=>`<div style="display:flex;gap:12px;margin-bottom:10px;align-items:center;font-size:15px;color:#333"><span style="font-size:22px">${e}</span>${t}</div>`).join("")}
    <div style="background:#fff4f4;border:1px solid #fecaca;border-radius:10px;padding:12px;font-size:13px;color:#b91c1c">При съмнение не я приемайте. Истинските пари имат и трите белега.</div>
  </div>
  ${tip("Гледай срещу светлина, наклони и пипни.<br>Така се познава истинската банкнота","left:50%;top:160px;transform:translateX(-50%)")}
`);

// ═══════════ ЕВРОТО ═══════════
S["euro-dual-price"] = phone(`
  <div class="grow" style="background:#f3f4f6;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden;width:260px">
      <div style="background:#facc15;padding:10px;text-align:center;font-weight:800;color:#713f12">ЦЕНА</div>
      <div style="padding:22px;text-align:center">
        <div style="font-size:16px;color:#444;margin-bottom:10px">Хляб „Добруджа“</div>
        <div style="font-size:34px;font-weight:800;color:#111">1,20 лв</div>
        <div style="height:1px;background:#eee;margin:12px 0"></div>
        <div class="ring" style="font-size:30px;font-weight:800;color:#0a3d6b;border-radius:8px;display:inline-block;padding:2px 8px">0,61 €</div>
      </div>
    </div>
  </div>
  ${tip("В магазина ще виждате двете цени.<br>Курсът е фиксиран — не губите пари","left:50%;bottom:80px;transform:translateX(-50%)")}
`, "#f3f4f6");

S["euro-receipt"] = phone(`
  <div class="grow" style="background:#e5e7eb;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:#fff;width:240px;padding:20px;font-family:monospace;font-size:13px;color:#222;box-shadow:0 10px 24px rgba(0,0,0,.15)">
      <div style="text-align:center;font-weight:700;margin-bottom:8px">МАГАЗИН „ЦЕНТЪР“</div>
      <div style="border-top:1px dashed #999;border-bottom:1px dashed #999;padding:8px 0;line-height:1.8">Хляб ......... 1,20<br>Мляко ........ 2,30<br>Кафе ......... 6,50</div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-weight:700">ОБЩО ЛВ:<span>10,00 лв</span></div>
      <div class="ring" style="display:flex;justify-content:space-between;margin-top:6px;font-weight:700;color:#0a3d6b;border-radius:6px;padding:2px">ОБЩО €:<span>5,11 €</span></div>
      <div style="text-align:center;margin-top:10px;font-size:11px;color:#888">1 € = 1,95583 лв</div>
    </div>
  </div>
  ${tip("На бележката ще пише и двете суми.<br>Рестото също е по фиксирания курс","left:50%;top:70px;transform:translateX(-50%)")}
`, "#e5e7eb");

S["euro-banknotes"] = phone(`
  ${navTitle("#0a3d6b","#fff","Евробанкноти (примерни)")}
  <div class="grow" style="background:#fff;padding:16px">
    ${[["5","#9aa0a6","сиво"],["10","#e35d6a","червено"],["20","#3b82f6","синьо"],["50","#f0923f","оранжево"],["100","#5cb85c","зелено"],["200","#e8c14a","жълто"]].map(([d,c,n])=>`<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px"><div style="width:130px;height:46px;border-radius:6px;background:${c};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:20px;box-shadow:0 2px 4px rgba(0,0,0,.15)">${d} €</div><div style="font-size:14px;color:#444">${d} евро • ${n}</div></div>`).join("")}
    <div style="font-size:12px;color:#888;margin-top:6px">Това са примерни изображения за разпознаване по цвят — не точни копия.</div>
  </div>
`);

S["euro-coins"] = phone(`
  ${navTitle("#0a3d6b","#fff","Евромонети")}
  <div class="grow" style="background:#fff;padding:18px">
    <div style="font-size:14px;color:#444;margin-bottom:12px">8 монети — от 1 цент до 2 евро:</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;text-align:center">
      ${[["1c","#b87333"],["2c","#b87333"],["5c","#b87333"],["10c","#d4af37"],["20c","#d4af37"],["50c","#d4af37"],["1 €","#c0c0c0"],["2 €","#d4af37"]].map(([d,c])=>`<div><div style="width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #fff5, ${c});display:flex;align-items:center;justify-content:center;font-weight:800;color:#5b4a1a;font-size:14px;margin:0 auto;box-shadow:0 2px 4px rgba(0,0,0,.2)">${d}</div></div>`).join("")}
    </div>
    <div style="font-size:13px;color:#444;margin-top:18px">💡 100 цента = 1 евро (както 100 стотинки = 1 лев).</div>
  </div>
`);

S["euro-atm"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#0b3d5c,#0a2333);color:#fff;padding:26px 20px;display:flex;flex-direction:column">
    <div style="text-align:center;font-size:13px;opacity:.7;letter-spacing:1px">БАНКОМАТ</div>
    <div style="text-align:center;font-size:20px;font-weight:700;margin:22px 0 18px">Изберете сума в ЕВРО</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${["10 €","20 €","50 €","100 €"].map((s,i)=>`<div class="${i===1?'ring':''}" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:18px;text-align:center;font-size:22px;font-weight:700;${i===1?'border-radius:12px;':''}">${s}</div>`).join("")}
    </div>
    <div style="flex:1"></div>
    <div style="text-align:center;font-size:13px;opacity:.75">След 2026 банкоматите дават евро</div>
  </div>
  ${tip("Тегли се по същия начин — само че<br>сумите вече са в евро","left:50%;bottom:64px;transform:translateX(-50%)")}
`, "#0a2333", "#fff");

S["euro-rate"] = phone(`
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px">
    <div style="background:linear-gradient(135deg,#0a3d6b,#1565c0);color:#fff;border-radius:20px;padding:28px 24px;text-align:center;width:100%;box-shadow:0 12px 30px rgba(0,0,0,.15)">
      <div style="font-size:15px;opacity:.85">Фиксиран курс — за всичко</div>
      <div class="ring" style="font-size:30px;font-weight:800;margin:12px 0;border-radius:10px;display:inline-block;padding:4px 10px">1 € = 1,95583 лв</div>
    </div>
    <div style="margin-top:20px;width:100%;background:#f0f6ff;border-radius:14px;padding:16px;font-size:15px;color:#0a3d6b">
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span>100 лв</span><b>≈ 51,13 €</b></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #d6e4ff"><span>50 €</span><b>≈ 97,79 лв</b></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #d6e4ff"><span>1000 лв</span><b>≈ 511,29 €</b></div>
    </div>
    <div style="font-size:12px;color:#888;margin-top:12px;text-align:center">Грубо наум: лев ≈ половин евро</div>
  </div>
  ${tip("Курсът е един и същ навсякъде —<br>сумата ви остава същата","left:50%;top:70px;transform:translateX(-50%)")}
`);

S["euro-dual-period"] = phone(`
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px">
    <div style="font-size:54px;margin-bottom:8px">👛</div>
    <div style="font-size:18px;font-weight:700;color:#111;text-align:center;margin-bottom:6px">Първите седмици — и левове, и евро</div>
    <div style="font-size:14px;color:#666;text-align:center;margin-bottom:20px">До 31 януари 2026 плащате с двете. Рестото ви връщат в евро.</div>
    <div style="display:flex;gap:16px">
      <div style="text-align:center"><div style="width:90px;height:50px;border-radius:6px;background:#5cb85c;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800">лв ✓</div><div style="font-size:12px;color:#444;margin-top:6px">до 31.01.2026</div></div>
      <div style="text-align:center"><div style="width:90px;height:50px;border-radius:6px;background:#0a3d6b;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800">€ ✓</div><div style="font-size:12px;color:#444;margin-top:6px">винаги</div></div>
    </div>
    <div style="background:#fffbea;border:1px solid #fde68a;border-radius:10px;padding:12px;font-size:13px;color:#854d0e;margin-top:20px;text-align:center">Левовете в банка/поща се обменят безплатно до 30 юни 2026, а в БНБ — безсрочно.</div>
  </div>
  ${tip("Не бързайте да обменяте — има време.<br>Никой не идва вкъщи да „обменя“","left:50%;bottom:60px;transform:translateX(-50%)")}
`);

render(S).catch((e) => { console.error(e); process.exit(1); });
