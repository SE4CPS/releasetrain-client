const { test, expect } = require('@playwright/test');

/*
 * Account page: sections are grouped into tabs, admins get extra tabs, and the
 * admin "Server alerts" list is read from GET /api/admin/server-alerts.
 * The API is stubbed; only the client wiring is tested.
 */

const ALERTS = [
  {
    ts: new Date().toISOString(),
    level: 'critical',
    host: 'vm',
    message: 'API down for 3 minutes, restarting',
  },
  {
    ts: new Date(Date.now() - 60_000).toISOString(),
    level: 'ok',
    host: 'vm',
    message: 'API recovered',
  },
];

const DAILY = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-09-${String(14 + i).padStart(2, '0')}`,
  visits: 10 + i,
  uniques: 5 + (i % 4),
  ask: 1,
  api: 20,
}));
const VISITS = {
  days: 14,
  from: '2026-09-14',
  to: '2026-09-27',
  logsFound: 2,
  totals: { visits: 217, uniques: 40, ask: 14, api: 280, unverified: 96, unverifiedIps: 12 },
  daily: DAILY,
  pages: [{ page: 'home', visits: 150 }],
  referrers: [{ host: 'google.com', visits: 20 }],
  devices: { mobile: 50, desktop: 167 },
  countries: [
    { code: 'US', visits: 150, uniques: 25 },
    { code: 'ZZ', visits: 3, uniques: 1 },
  ],
  visitors: [
    {
      ip: '138.9.74.3',
      country: 'US',
      city: 'Stockton',
      visits: 9,
      ask: 2,
      last: '2026-09-27T09:00:00Z',
      page: 'home',
      browser: 'Chrome',
    },
    {
      ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      country: 'VN',
      city: 'Ho Chi Minh City',
      visits: 12,
      ask: 4,
      last: '2026-09-20T09:00:00Z',
      page: 'shared search',
      browser: 'Firefox',
    },
    {
      ip: '81.2.69.142',
      country: 'GB',
      visits: 3,
      ask: 0,
      last: new Date().toISOString(),
      page: 'docs',
      browser: 'Firefox',
    },
  ],
};

// Chart.js comes from a CDN; replace it with a stub that records how it was called.
const FAKE_CHART =
  'window.Chart = function (ctx, cfg) { (window.__charts = window.__charts || []).push(cfg); this.destroy = function () {}; };';

async function signIn(page, role) {
  await page.addInitScript((r) => {
    localStorage.setItem('rt_token', 't');
    localStorage.setItem(
      'rt_user',
      JSON.stringify({ id: '1', email: 'a@example.com', name: 'A', role: r, orgs: [] }),
    );
  }, role);
  await page.route(/chart\.umd/, (route) =>
    route.fulfill({ contentType: 'application/javascript', body: FAKE_CHART }),
  );
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    let body = [];
    if (/users\/me/.test(url)) body = { id: '1', email: 'a@example.com', role };
    else if (/admin\/server-alerts/.test(url)) body = { alerts: ALERTS };
    else if (/admin\/visits/.test(url)) body = VISITS;
    else if (/admin\/settings/.test(url)) body = { guardrails: [], feedbackThresholds: [] };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('admin sees grouped tabs and the alert list', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/?view=account');
  const tabs = page.locator('#ua-profile-panel [data-ua-tab]:visible');
  await expect(tabs).toHaveCount(8);

  // Account tab shows only its own sections
  await expect(page.locator('details[data-ua-group="account"]').first()).toBeVisible();
  await expect(page.locator('details[data-ua-group="settings"]').first()).toBeHidden();

  // Alerts tab: rows rendered, problem count badge shown
  await page.locator('[data-ua-tab="alerts"]').click();
  await expect(page.locator('#ua-alerts-list .ua-alert-row')).toHaveCount(2);
  await expect(page.locator('#ua-alerts-list .ua-alert-critical')).toContainText('API down');
  await expect(page.locator('#ua-alerts-badge')).toHaveText('1');
  await expect(page.locator('details[data-ua-group="account"]').first()).toBeHidden();
});

test('a normal user only sees the Account and Saved tabs', async ({ page }) => {
  await signIn(page, 'user');
  await page.goto('/?view=account');
  await expect(page.locator('#ua-profile-panel [data-ua-tab]:visible')).toHaveCount(2);
  await expect(page.locator('[data-ua-tab="alerts"]')).toBeHidden();
});

test('admin sees the 14-day unique and total visitors chart, and the Visits tab', async ({
  page,
}) => {
  await signIn(page, 'admin');
  await page.goto('/?view=account');
  await expect(page.locator('#ua-visits-top')).toBeVisible();
  await expect(page.locator('#ua-visits-top-sum')).toContainText('217 visits');
  await expect.poll(() => page.evaluate(() => (window.__charts || []).length)).toBeGreaterThan(0);
  const cfg = await page.evaluate(() =>
    window.__charts.find((c) => c.data.datasets.some((d) => d.label === 'Unique visitors')),
  );
  const byLabel = Object.fromEntries(cfg.data.datasets.map((d) => [d.label, d.data]));
  expect(cfg.data.labels).toHaveLength(14);
  expect(byLabel['Total visits']).toHaveLength(14);
  expect(byLabel['Unique visitors']).toHaveLength(14);
  expect(byLabel['Total visits'][13]).toBe(23);

  await page.locator('[data-ua-tab="visits"]').click();
  await expect(page.locator('#ua-visits-n-visits')).toHaveText('217');
  await expect(page.locator('#ua-visits-n-uniques')).toHaveText('40');
  await expect(page.locator('#ua-visits-unverified')).toContainText(
    '96 page loads from 12 IP addresses',
  );
  await expect(page.locator('#ua-visits-countries')).toContainText('United States');
  await expect(page.locator('#ua-visits-countries')).toContainText('Unknown');
  await expect(page.locator('#ua-visits-visitors')).toContainText('138.9.74.3');
  await expect(page.locator('#ua-visits-visitors')).toContainText('Stockton, US');
  // rows for visitors seen today get the subtle green background; older ones do not
  await expect(page.locator('#ua-visits-visitors tr.ua-row-today')).toHaveCount(1);
  await expect(page.locator('#ua-visits-visitors tr.ua-row-today')).toContainText('81.2.69.142');
});

test('a normal user does not see the visitors chart', async ({ page }) => {
  await signIn(page, 'user');
  await page.goto('/?view=account');
  await expect(page.locator('#ua-visits-top')).toBeHidden();
});

for (const width of [1300, 390]) {
  test(`Visits tables never scroll sideways at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'admin');
    await page.goto('/?view=account');
    await page.locator('[data-ua-tab="visits"]').click();
    await expect(page.locator('#ua-visits-visitors table')).toBeVisible();
    const overflow = await page.evaluate(() =>
      ['ua-visits-countries', 'ua-visits-pages', 'ua-visits-refs', 'ua-visits-visitors'].map(
        (id) => {
          const box = document.getElementById(id);
          const table = box.querySelector('table');
          return {
            id,
            boxScrolls: box.scrollWidth > box.clientWidth + 1,
            tableWider: table
              ? table.getBoundingClientRect().right > box.getBoundingClientRect().right + 1
              : false,
          };
        },
      ),
    );
    for (const o of overflow) {
      expect(o.boxScrolls, `${o.id} scrolls sideways`).toBe(false);
      expect(o.tableWider, `${o.id} is wider than its box`).toBe(false);
    }
  });
}
