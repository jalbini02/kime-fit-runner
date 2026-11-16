// KIME FIT runner: opens the CRM in a hidden browser with the runner key, waits while the CRM does
// its own automations (sign-ups into Leads, the app's timetable, kiosk check-ins into attendance,
// Mailchimp tags), then closes. No member data is stored here; the key lives in GitHub Secrets.
import { chromium } from 'playwright';

const key = (process.env.KIME_RUNNER_KEY || '').trim();
const base = (process.env.CRM_URL || 'https://kimefitcrm.netlify.app/').trim().replace(/#.*$/, '');
if (!key) { console.error('Missing the KIME_RUNNER_KEY secret. Settings › Secrets and variables › Actions.'); process.exit(1); }

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(base + '#runner=' + key, { waitUntil: 'domcontentloaded', timeout: 90000 });
let status = 'waiting';
for (let i = 0; i < 90 && status === 'waiting'; i++) {
  await page.waitForTimeout(2000);
  status = await page.evaluate(() => (window.KIME_RUNNER || {}).status || 'waiting').catch(() => 'waiting');
}
console.log('Runner status:', status);
if (status !== 'ok') {
  console.error(status === 'bad key' ? 'The key does not match. Make a new one in the CRM (Settings › Staff & Access) and update the secret.'
    : status === 'no key set' ? 'No runner key in the CRM yet. Make one in Settings › Staff & Access.'
    : 'The CRM did not finish loading.');
  await browser.close(); process.exit(1);
}
await page.waitForTimeout(120000);
console.log('Page errors:', errors.length ? errors.slice(0, 5).join(' | ') : 'none');
await browser.close();
