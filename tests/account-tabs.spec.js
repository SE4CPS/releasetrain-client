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
  await expect(tabs).toHaveCount(7);

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
