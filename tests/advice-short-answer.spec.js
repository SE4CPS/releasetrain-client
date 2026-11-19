const { test, expect } = require('@playwright/test');

// The Short answer of an update-advice question: verdict sentence, posts
// scanned (always stated, even zero), and the most useful post as a link.
test('advice short answer states the verdict, the posts scanned, and links the most useful post', async ({
  page,
}) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/', { waitUntil: 'load' });
  const html = await page.evaluate(() => {
    const res = {
      intent: 'advice',
      answer: 'x',
      sources: [],
      updateAdvice: {
        verdict: 'wait',
        product: 'Chrome',
        version: '160.0.8164',
        subreddit: 'chrome',
        postCount: 24,
        negative: 9,
        positive: 5,
        flagged: 3,
        ageDays: 4,
        scannedText:
          '24 r/chrome posts scanned since the release: 9 negative, 5 positive, 3 flagged as update risks.',
        topPost: {
          title: 'Tabs freeze after the 160 update',
          url: 'https://www.reddit.com/r/chrome/comments/abc/',
          tone: 'negative',
          isRisky: true,
          score: 120,
        },
      },
    };
    return askShortTabHtml(res, 'Should I update to the latest Chrome version?');
  });
  const el = await page.evaluate((h) => {
    const d = document.createElement('div');
    d.innerHTML = h;
    document.body.appendChild(d);
    d.id = 'tmp-short';
    return d.id;
  }, html);
  const panel = page.locator('#tmp-short');
  await expect(panel.locator('.ask-short-answer')).toHaveText(
    'Based on community feedback, wait a few days before updating to Chrome 160.0.8164.',
  );
  await expect(panel.locator('.ask-short-meta').nth(0)).toHaveText(
    '24 r/chrome posts scanned since the release: 9 negative, 5 positive, 3 flagged as update risks.',
  );
  const link = panel.locator('a.ask-short-link');
  await expect(link).toHaveText('Tabs freeze after the 160 update');
  await expect(link).toHaveAttribute('href', 'https://www.reddit.com/r/chrome/comments/abc/');
  await expect(link).toHaveAttribute('target', '_blank');
  const zero = await page.evaluate(() =>
    askShortAnswer(
      {
        intent: 'advice',
        answer: 'x',
        updateAdvice: {
          verdict: 'caution',
          product: 'Firefox',
          version: '159.0.0',
          subreddit: 'firefox',
          postCount: 0,
          ageDays: 1,
          topPost: null,
          scannedText: '0 r/firefox posts scanned since the release: no reports yet.',
        },
      },
      'q',
    ),
  );
  expect(zero).toBe(
    'Based on community feedback, nothing speaks against updating to Firefox 159.0.0 yet, but it is only 1 day old. 0 r/firefox posts scanned since the release: no reports yet.',
  );
});
