const { test, expect } = require('@playwright/test');

test('short answer keeps the date for a when question', async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
  const res = await page.evaluate(() => {
    const answer =
      'The most recent Java update is version 26.0.2. Released on July 21, 2026 (68 days ago).';
    return {
      when: askShortAnswer({ answer }, 'When was the last java update?'),
      fact: askShortAnswer({ answer }, 'What is the latest java version?'),
    };
  });
  expect(res.when).toBe(
    'The most recent Java update is version 26.0.2. Released on July 21, 2026 (68 days ago).',
  );
  expect(res.fact).toBe('The most recent Java update is version 26.0.2.');
});
