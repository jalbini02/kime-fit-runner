// KIME FIT runner: opens the CRM in a hidden browser with the runner key, waits while the CRM does
// its own automations (sign-ups into Leads, the app's timetable, kiosk check-ins into attendance,
// Mailchimp tags), then closes. No member data is stored here; the keys live in GitHub Secrets.
//   KIME_RUNNER_KEY    the runner key from CRM › Settings › Staff & Access (required)
//   KIME_STAFF_KEY     the staff key (Go-Live A2), so Mailchimp and messaging steps are allowed
//   CRM_SITE_PASSWORD  the Netlify password on kimefitcrm (Go-Live A1)
import { chromium } from 'playwright';

const key = (process.env.KIME_RUNNER_KEY || '').trim();
const staffKey = (process.env.KIME_STAFF_KEY || '').trim();
const sitePw = process.env.CRM_SITE_PASSWORD || '';
const base = (process.env.CRM_URL || 'https://kimefitcrm.netlify.app/').trim().replace(/#.*$/, '');
if (!key) { console.error('Missing the KIME_RUNNER_KEY secret. Settings › Secrets and variables › Actions.'); process.exit(1); }
if (!staffKey) console.warn('No KIME_STAFF_KEY secret: Mailchimp and messaging steps will be refused by the servers.');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
// The staff key goes into the CRM's own browser storage before the page runs.
if (staffKey) await context.addInitScript((k) => { try { window.localStorage.setItem('kimefit-staff-key', k); } catch (e) {} }, staffKey);
const page = await context.newPage();
page.on('dialog', (d) => d.dismiss().catch(() => {}));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Netlify site password page: fill it once, then open the CRM with the runner key.
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
const pwBox = await page.$('input[type="password"]');
// The CRM's own staff sign-in also has a password box, so only treat it as Netlify's page when the CRM isn't there.
const isCrm = await page.evaluate(() => /OPERATIONS SYSTEM|__bundler|syWarnText/.test(document.documentElement.innerHTML)).catch(() => false);
if (pwBox && !isCrm) {
  if (!sitePw) { console.error('The CRM site asks for a password. Add the CRM_SITE_PASSWORD secret.'); await browser.close(); process.exit(1); }
  await pwBox.fill(sitePw);
  await Promise.all([page.waitForLoadState('domcontentloaded').catch(() => {}), pwBox.press('Enter')]);
  await page.waitForTimeout(3000);
  if (await page.$('input[type="password"]') && !(await page.evaluate(() => /OPERATIONS SYSTEM|__bundler|syWarnText/.test(document.documentElement.innerHTML)).catch(() => false))) {
    console.error('The CRM site password was not accepted. Check the CRM_SITE_PASSWORD secret.'); await browser.close(); process.exit(1);
  }
}

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
