const { test, expect } = require('@playwright/test');

/*
 * Global rule: nothing in the app scrolls sideways. Layouts wrap (flex, grid,
 * overflow-wrap) or clip instead. For every view, at a desktop and a phone width,
 * the page itself must fit the window and no element may be a horizontal scroll box
 * that is actually scrolling. The API is stubbed; long values are used on purpose.
 */

const VIEWS = [
  '',
  'feed',
  'graph',
  'arch',
  'cve',
  'risk',
  'release',
  'docs',
  'changelog',
  'credits',
  'account',
];
const ACCOUNT_TABS = ['saved', 'overview', 'visits', 'alerts', 'settings', 'bots', 'users'];
const WIDTHS = [1300, 390];

const VISITS = {
  days: 14,
  from: '2026-09-14',
  to: '2026-09-27',
  totals: { visits: 5, uniques: 3, ask: 1, api: 9, unverified: 2, unverifiedIps: 1 },
  daily: [],
  pages: [{ page: 'shared search', visits: 5 }],
  referrers: [{ host: 'teams.public.onecdn.static.microsoft', visits: 5 }],
  devices: { mobile: 1, desktop: 4 },
  countries: [{ code: 'GB', visits: 5, uniques: 3, visitsPerVisitor: 1.7 }],
  visitors: [
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
  ],
};

async function stub(page) {
  await page.addInitScript(() => {
    localStorage.setItem('rt_token', 't');
    localStorage.setItem(
      'rt_user',
      JSON.stringify({ id: '1', email: 'a@example.com', name: 'A', role: 'admin', orgs: [] }),
    );
  });
  await page.route(/chart\.umd/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.Chart=function(){this.destroy=function(){}}',
    }),
  );
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    let body = [];
    if (/users\/me/.test(url)) body = { id: '1', role: 'admin' };
    else if (/admin\/visits/.test(url)) body = VISITS;
    else if (/admin\/server-alerts/.test(url))
      body = { alerts: [{ ts: '2026-09-27T01:00:00Z', level: 'warn', message: 'x'.repeat(240) }] };
    else if (/admin\/settings/.test(url)) body = { guardrails: [], feedbackThresholds: [] };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

// Runs in the page: returns every horizontal-scroll problem it can see.
function findSideScroll() {
  const problems = [];
  const root = document.documentElement;
  if (root.scrollWidth > window.innerWidth + 1) {
    problems.push(`page is ${root.scrollWidth}px wide in a ${window.innerWidth}px window`);
  }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || el.getClientRects().length === 0) continue;
    if (
      (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
      el.scrollWidth > el.clientWidth + 1
    ) {
      problems.push(
        `${el.tagName.toLowerCase()}#${el.id || ''}.${String(el.className).slice(0, 40)} scrolls sideways`,
      );
    }
  }
  return problems;
}

for (const width of WIDTHS) {
  for (const view of VIEWS) {
    test(`no sideways scrolling: ${view || 'home'} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await stub(page);
      await page.goto(view ? `/?view=${view}` : '/');
      await page.waitForTimeout(1200);
      const tabs = view === 'account' ? ACCOUNT_TABS : [''];
      for (const tab of tabs) {
        if (tab) {
          await page.evaluate((t) => document.querySelector(`[data-ua-tab="${t}"]`)?.click(), tab);
          await page.waitForTimeout(200);
        }
        const problems = await page.evaluate(findSideScroll);
        expect(
          problems,
          `${view || 'home'}${tab ? `/${tab}` : ''}: ${problems.join('; ')}`,
        ).toEqual([]);
      }
    });
  }
}
