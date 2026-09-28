const { test, expect } = require('@playwright/test');

/*
 * Register form honeypot (see .ua-hp in styles.css and the matching
 * "website" field check in the server's POST /api/auth/register): a
 * hidden field real users never see or fill, meant to trip a scripted
 * signup that blindly fills every input it finds.
 */

test('the honeypot field is present but not visible or reachable by tab', async ({ page }) => {
  await page.goto('/?view=account');
  const field = page.locator('#ua-reg-website');
  await expect(field).toBeAttached();
  await expect(field).not.toBeVisible();
  await expect(field).toHaveAttribute('tabindex', '-1');
});

test('a normal registration sends an empty website field', async ({ page }) => {
  let posted = null;
  await page.route(/\/api\/auth\/register/, (route) => {
    posted = JSON.parse(route.request().postData());
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, user: { id: '1', email: posted.email, role: 'user', name: posted.name, orgs: [], inventory: [] } }),
    });
  });
  await page.goto('/?view=account');
  await page.click('#ua-tab-register');
  await page.fill('#ua-reg-email', 'real.person@gmail.com');
  await page.fill('#ua-reg-password', 'correcthorsebattery');
  await page.click('#ua-register-btn');
  await expect.poll(() => posted).not.toBeNull();
  expect(posted.website).toBe('');
});

test('a filled honeypot field is still submitted as-is (the server rejects it)', async ({ page }) => {
  let posted = null;
  await page.route(/\/api\/auth\/register/, (route) => {
    posted = JSON.parse(route.request().postData());
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid email format' }) });
  });
  await page.goto('/?view=account');
  await page.click('#ua-tab-register');
  await page.fill('#ua-reg-email', 'bot@gmail.com');
  await page.fill('#ua-reg-password', 'correcthorsebattery');
  // A real user never does this - simulates a scripted signup that
  // blindly fills every input it finds, including the hidden one.
  await page.evaluate(() => { document.getElementById('ua-reg-website').value = 'http://spam.example'; });
  await page.click('#ua-register-btn');
  await expect.poll(() => posted).not.toBeNull();
  expect(posted.website).toBe('http://spam.example');
  await expect(page.locator('#ua-register-error')).toContainText('Invalid email format');
});
