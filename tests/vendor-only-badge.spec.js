// Instructor, 2026-11-16: a question naming a vendor without one of its
// products gets a live hint under the input before it is submitted.
const { test, expect } = require('@playwright/test');

test('the Ask input warns when the question names a vendor but none of its products', async ({ page }) => {
  await page.route(/\/api\//, (route) => {
    if (/\/api\/ask\/brands/.test(route.request().url())) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brands: [
        { name: 'JetBrains', products: ['Rider', 'IntelliJ IDEA Ultimate', 'PyCharm Professional'] },
        { name: 'Mozilla', products: ['Firefox', 'Thunderbird'] },
      ] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });
  const badge = page.locator('#askVendorOnlyBadge');
  await page.locator('#askQuestion').fill('Whats the latest Jetbrains version?');
  await expect(badge).toHaveText('Vendor only: add a JetBrains product (e.g. Rider)');
  await page.locator('#askQuestion').fill('Whats the latest intellij version?');
  await expect(badge).toBeHidden();
  await page.locator('#askQuestion').fill('should I update mozilla?');
  await expect(badge).toHaveText('Vendor only: add a Mozilla product (e.g. Firefox)');
  await page.locator('#askQuestion').fill('latest mozilla firefox?');
  await expect(badge).toBeHidden();
});
