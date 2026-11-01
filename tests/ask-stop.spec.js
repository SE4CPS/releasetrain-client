const { test, expect } = require('@playwright/test');

// Stop button: appears in Clear's slot while a question runs, aborts the
// in-flight request, and the UI returns to idle without an error modal.
test('Stop aborts a running question and restores the idle controls', async ({ page }) => {
  // Everything but the question itself answers instantly; POST /api/ask is
  // held open (never fulfilled) so the run stays in progress until Stop.
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  let held = null;
  await page.route(/\/api\/ask$/, (route) => {
    if (route.request().method() === 'POST') {
      held = route;
      return;
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/');

  const stop = page.locator('#askStopBtn');
  const clear = page.locator('#clearBtn');
  const submit = page.locator('#askSubmitBtn');
  await expect(stop).toBeHidden();
  await expect(clear).toBeVisible();

  await page.fill('#askQuestion', 'What is the latest Linux version?');
  await submit.click();

  await expect(stop).toBeVisible();
  await expect(clear).toBeHidden();
  await expect(submit).toBeDisabled();
  await expect.poll(() => held !== null).toBe(true);

  await stop.click();

  await expect(stop).toBeHidden();
  await expect(clear).toBeVisible();
  await expect(submit).toBeEnabled();
  // A deliberate stop is not an error: no modal, no answer rail, the
  // question stays typed for a re-run, and the run log says so.
  await expect(page.locator('#askModal')).not.toHaveClass(/open/);
  await expect(page.locator('.layout')).not.toHaveClass(/has-ask-rail/);
  await expect(page.locator('#askQuestion')).toHaveValue('What is the latest Linux version?');
  await expect(page.locator('#askConsoleFixed')).toContainText('Stopped by the viewer');
  // The browser cancelled the request itself (the server sees the socket
  // close and aborts at its next phase boundary).
  await expect.poll(() => held.request().failure() !== null).toBe(true);
});
