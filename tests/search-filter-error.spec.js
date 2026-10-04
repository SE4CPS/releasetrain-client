const { test, expect } = require('@playwright/test');

/*
 * Reported live, with a screenshot: searching ?q=Chrome updated the URL
 * and the search box immediately, but the feed below kept showing the
 * OLD, unfiltered list (79 components) - "it should filter by q list."
 * Traced to EL.filterForm's submit handler: history.replaceState and
 * STATE.filters.components both run before the re-fetch, so a failed
 * re-fetch (e.g. a 429 from the shared rate limiter, a real, independently
 * confirmed issue this session) left the URL/search box showing the new
 * search while the stale, pre-search feed sat there untouched - the catch
 * block only updated a small status line, never clearing #feed.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
});

test('a failed search re-fetch clears the stale feed instead of leaving the old, unfiltered list on screen', async ({
  page,
}) => {
  let versionsCallCount = 0;
  await page.route(/\/v\/search/, (route) => {
    versionsCallCount += 1;
    if (versionsCallCount === 1) {
      // Initial page load: a real, unfiltered result set.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { versionProductName: 'Linux', versionNumber: '7.2.0', versionReleaseDate: '20261001' },
            { versionProductName: 'Android', versionNumber: '15', versionReleaseDate: '20261001' },
          ],
          nextCursor: null,
        }),
      });
    }
    // The search submit's own re-fetch: simulate the exact failure mode
    // reported live (a 429 from the shared rate limiter).
    return route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Too many requests, please try again shortly.' }),
    });
  });

  await page.goto('/?view=feed');
  await expect(page.locator('.feedGroup')).toHaveCount(2);

  // #filterForm/#components are the hidden internal mirror now (the
  // visible search box is #askQuestion) - set the value directly and
  // dispatch a real submit event rather than using Playwright's
  // visibility-gated fill()/click() on a hidden form.
  await page.evaluate(() => {
    document.getElementById('components').value = 'chrome';
  });
  await page.locator('#filterForm').evaluate((form) => form.requestSubmit());

  // The failed re-fetch must not leave the old Linux/Android cards on
  // screen looking like a (non-)result for the new "chrome" search.
  await expect(page.locator('.feedGroup')).toHaveCount(0);
  await expect(page.locator('#emptyState')).toHaveClass(/show/);
  await expect(page.locator('#emptyState')).toHaveClass(/emptyState-error/);
});
