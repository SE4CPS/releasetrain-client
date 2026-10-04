const { test, expect } = require('@playwright/test');

/*
 * Arch view's #a-stackSelect/#a-addStackBtn: picking a machine from
 * Installed versions merges its components into the search box. Split
 * out of triage.spec.js when Update Triage moved out of the Arch view
 * into its own top-level view (see triage.js) - this behavior is
 * Arch-specific (#a-stackSelect feeds a search box; Triage's own
 * #t-stackSelect, in triage.js, looks a machine up directly instead).
 */

test('picking a machine stack keeps it selected after "+ Add Stack", not reset to the placeholder', async ({
  page,
}) => {
  // Reported live: "when i pick a vm keep it selected until i change it."
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const sel = document.getElementById('a-stackSelect');
    const opt = document.createElement('option');
    opt.value = 'firefox,chrome';
    opt.textContent = 'test-machine (2)';
    sel.appendChild(opt);
    sel.value = 'firefox,chrome';
  });
  await page.locator('#a-addStackBtn').click();
  await expect(page.locator('#a-stackSelect')).toHaveValue('firefox,chrome');
});
