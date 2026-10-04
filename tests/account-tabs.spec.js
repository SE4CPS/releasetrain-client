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

// Dates are computed relative to whenever the suite actually runs, not
// hardcoded to a calendar date that goes stale (and briefly collides with
// "today") as real time passes. isoAtNoonOffset() also keeps the "is this
// row today?" comparison (account.js's `toDateString()` check, which runs
// in local time) safely clear of the midnight boundary in either
// direction, instead of a bare `new Date().toISOString()` captured once
// at fixture-build time that has no buffer if the comparison runs a moment
// later and happens to straddle midnight.
function isoAtNoonOffset(daysAgo) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}
function dayStrOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

const DAILY = Array.from({ length: 14 }, (_, i) => ({
  date: dayStrOffset(13 - i),
  visits: 10 + i,
  uniques: 5 + (i % 4),
  ask: 1,
  api: 20,
}));
const VISITS = {
  days: 14,
  from: DAILY[0].date,
  to: DAILY[DAILY.length - 1].date,
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
      last: isoAtNoonOffset(2),
      page: 'home',
      browser: 'Chrome',
    },
    {
      ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      country: 'VN',
      city: 'Ho Chi Minh City',
      visits: 12,
      ask: 4,
      last: isoAtNoonOffset(9),
      page: 'shared search',
      browser: 'Firefox',
    },
    {
      ip: '81.2.69.142',
      country: 'GB',
      visits: 3,
      ask: 0,
      last: isoAtNoonOffset(0),
      page: 'docs',
      browser: 'Firefox',
    },
  ],
};

async function signIn(page, role) {
  await page.addInitScript((r) => {
    localStorage.setItem('rt_token', 't');
    localStorage.setItem(
      'rt_user',
      JSON.stringify({ id: '1', email: 'a@example.com', name: 'A', role: r, orgs: [] }),
    );
  }, role);
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

// "have all tabs closed all summary details by default" - every
// <details class="ua-admin-details"> across every account sub-tab used
// to have one section open="" by default (a different one per tab), an
// inconsistency rather than a deliberate choice. All of them now load
// collapsed; a visitor opens whichever one they actually want.
test('every admin-details accordion starts collapsed on every sub-tab', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/?view=account');
  const groups = ['account', 'saved', 'overview', 'visits', 'alerts', 'settings', 'bots', 'users'];
  for (const group of groups) {
    await page.locator(`[data-ua-tab="${group}"]`).click();
    const openCount = await page
      .locator(`details.ua-admin-details[data-ua-group="${group}"][open]`)
      .count();
    expect(openCount, `${group} tab should have no open details`).toBe(0);
  }
});

// "delete this" (the empty "Visitors, last 14 days" chart card that sat
// above the tabs) - the Visits tab's own cards/tables are unaffected,
// only the redundant top-of-page chart is gone.
test('the top-of-page visitors chart is removed; the Visits tab still works', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/?view=account');
  await expect(page.locator('#ua-visits-top')).toHaveCount(0);
  await page.locator('[data-ua-tab="visits"]').click();
  await page.locator('details[data-ua-group="visits"] summary .st-122').click();
  await expect(page.locator('#ua-visits-n-visits')).toHaveText('217');
});

test('admin sees the Visits tab', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/?view=account');
  await page.locator('[data-ua-tab="visits"]').click();
  await page.locator('details[data-ua-group="visits"] summary .st-122').click();
  await expect(page.locator('#ua-visits-n-visits')).toBeVisible();
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

for (const width of [1300, 390]) {
  test(`Visits tables never scroll sideways at ${width}px wide`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, 'admin');
    await page.goto('/?view=account');
    await page.locator('[data-ua-tab="visits"]').click();
    // The Visits accordion now starts collapsed (see "every admin-details
    // accordion starts collapsed" above) - expand it before checking the
    // tables inside it for overflow.
    await page.locator('details[data-ua-group="visits"] summary .st-122').click();
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
