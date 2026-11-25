import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1400, height: 200 } });
// Live SPA home — crop the nav bar
await p.goto('http://localhost:8199/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.screenshot({ path: 'scripts/nav-home.png', clip: { x: 0, y: 0, width: 1400, height: 64 } });
// Analyzer /test/
await p.goto('http://localhost:8199/test/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.screenshot({ path: 'scripts/nav-test.png', clip: { x: 0, y: 0, width: 1400, height: 64 } });
await b.close();
console.log('shots done');
