import { chromium } from 'playwright';
const S={
 blog:{en:['BLOG & GUIDES','Practical guides on web, e-commerce & software'],bg:['БЛОГ & РЕСУРСИ','Ръководства за уеб, e-commerce и софтуер']},
 glossario:{en:['GLOSSARY','What is X? Clear web & tech definitions'],bg:['РЕЧНИК','Какво е X? Ясни дефиниции за уеб']},
 confronti:{en:['COMPARISONS','X vs Y — choose the right technology'],bg:['СРАВНЕНИЯ','X срещу Y — избери правилната технология']},
 settori:{en:['SOLUTIONS BY INDUSTRY','Websites & software for your sector'],bg:['РЕШЕНИЯ ПО БРАНШ','Сайтове и софтуер за твоя бранш']},
 strumenti:{en:['FREE TOOLS','Quote calculator · Meta tag generator'],bg:['БЕЗПЛАТНИ ИНСТРУМЕНТИ','Калкулатор оферта · Генератор meta tag']},
 casestudy:{en:['CASE STUDIES','Real projects: web, ERP, marketplace, gaming'],bg:['КЕЙС СТУДИИ','Реални проекти: уеб, ERP, маркетплейс']},
 servizi:{en:['SERVICES','Web · E-commerce · Software · ERP · Apps'],bg:['УСЛУГИ','Уеб · E-commerce · Софтуер · ERP · Приложения']},
 geo:{en:['SERVICE AREAS','Websites & software in Italy and Bulgaria'],bg:['ОБСЛУЖВАНИ РАЙОНИ','Сайтове и софтуер в Италия и България']},
};
function tpl(label,title){return `<!doctype html><html><head><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600&family=Inter+Tight:wght@600&family=Space+Mono&display=swap" rel=stylesheet>
<style>*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px}
body{background:#0A0C0E;background-image:linear-gradient(rgba(201,209,214,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(201,209,214,.05) 1px,transparent 1px);background-size:60px 60px;
font-family:'Space Grotesk','Inter Tight',sans-serif;color:#E6EBEE;padding:72px;position:relative;overflow:hidden}
.bar{position:absolute;top:0;left:0;right:0;height:6px;background:linear-gradient(90deg,transparent,#00e5ff,transparent)}
.eyebrow{font-family:'Space Mono',monospace;font-size:22px;letter-spacing:.3em;color:#00e5ff;margin-bottom:26px}
h1{font-size:74px;font-weight:600;line-height:1.03;letter-spacing:-.02em;max-width:1010px}
.foot{position:absolute;left:72px;bottom:64px;display:flex;align-items:center;gap:16px;font-family:'Space Mono',monospace}
.dot{width:14px;height:14px;background:#00e5ff;border-radius:50%}.brand{font-size:26px;letter-spacing:.15em;color:#C9D1D6}.tld{color:#00e5ff}
.tol{position:absolute;right:72px;bottom:64px;font-family:'Space Mono',monospace;font-size:20px;color:#7C868D;letter-spacing:.2em}
</style></head><body><div class=bar></div><div class=eyebrow>// ${label}</div><h1>${title}</h1>
<div class=foot><div class=dot></div><span class=brand>CARBON STEALTH <span class=tld>· carbonstealth.eu</span></span></div><div class=tol>±0.02 TOL</div></body></html>`}
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const pg=await b.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
let n=0;
for(const [sec,langs] of Object.entries(S)){for(const [lang,[label,title]] of Object.entries(langs)){
  await pg.setContent(tpl(label,title),{waitUntil:'load'});await pg.waitForTimeout(450);
  await pg.screenshot({path:`public/og/og-${sec}-${lang}.png`});n++;
}}
await b.close();console.log('rendered '+n+' per-language OG images');
