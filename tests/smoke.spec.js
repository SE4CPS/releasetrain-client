const { test, expect } = require('@playwright/test');

/*
 * Smoke coverage: every top-level view activates without an uncaught JavaScript
 * error and reveals its container. The REST API is stubbed so the run is
 * hermetic and boot() resolves deterministically; this is a wiring check, not
 * an integration test. It stands in for the manual "does the giant inline
 * script still parse and wire up" check until src/index.html is modularised.
 */

// Minimal but shape-correct responses for every endpoint boot() and the views touch.
async function stubApi(page) {
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    let body = { data: [], nextCursor: null };
    if (/\/v\/count/.test(url)) body = { totalVersions: 0, cveCount: 0, nonCveCount: 0 };
    else if (/\/reddit\/count/.test(url))
      body = { totalRedditPosts: 0, redditCount: 0, stackoverflowCount: 0 };
    else if (/\/c\/names/.test(url)) body = [];
    else if (/\/aggregate\//.test(url)) body = { days: [] };
    else if (/\/events\/search\/top/.test(url)) body = { data: [] };
    else if (/\/reddit(\?|$)/.test(url)) body = [];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

const VIEWS = [
  { view: '', selector: '#feedPanel' },
  { view: 'graph', selector: '#graphView' },
  { view: 'arch', selector: '#archView' },
  { view: 'cve', selector: '#cveView' },
  { view: 'risk', selector: '#dashboardView' },
  { view: 'release', selector: '#networkView' },
  { view: 'docs', selector: '#docsView' },
  { view: 'changelog', selector: '#changelogView' },
  { view: 'credits', selector: '#ackView' },
  { view: 'account', selector: '#usersView' },
];

for (const { view, selector } of VIEWS) {
  const label = view || 'feed';
  test(`view "${label}" activates clean`, async ({ page }) => {
    const faults = [];
    page.on('pageerror', (err) => faults.push(`pageerror: ${err.message}`));
    await stubApi(page);

    await page.goto(view ? `/?view=${view}` : '/', { waitUntil: 'load' });
    await expect(page.locator(selector)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000); // let any post-activate async settle

    expect(faults, faults.join('\n')).toHaveLength(0);
  });
}

test('shareable filter params are applied on load', async ({ page }) => {
  await stubApi(page);
  await page.goto('/?type=hv', { waitUntil: 'load' });
  await expect(page.locator('.toggle[data-key="hv"]')).toHaveAttribute('aria-pressed', 'true', {
    timeout: 20_000,
  });
});
