const { test, expect } = require('@playwright/test');

/*
 * "Most community posts" feed sort (value="community") - reported live:
 * "add option most community posts" (after "Most comments" turned out
 * to mean a single busy thread's peak comment count, not total
 * discussion volume - a real screenshot showed a 3-post component
 * outranking a 25-post one for exactly that reason). This mode's sort
 * key is the group's total matching Reddit post COUNT, the same number
 * the "Reddit N" chip itself shows - see groupByComponentName's own
 * comment in feed.js. Made the default sort, reported live, right after
 * being added: "and make it the default option."
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test('"Most community posts" option exists in the feed sort select', async ({ page }) => {
  const options = await page.locator('#feedSortSelect option').allTextContents();
  expect(options).toContain('Most community posts');
});

test('"Most community posts" is the default sort for a visitor with no saved preference', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    localStorage.removeItem('rt_feed_sort');
    return { sort: getFeedSort(), selectValue: document.getElementById('feedSortSelect').value };
  });
  expect(result.sort).toBe('community');
  expect(result.selectValue).toBe('community');
});

test('an existing saved preference still overrides the default', async ({ page }) => {
  const sort = await page.evaluate(() => {
    localStorage.setItem('rt_feed_sort', 'alpha');
    return getFeedSort();
  });
  expect(sort).toBe('alpha');
});

test('groupByComponentName orders groups by total matching post count, not peak comment count', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    const now = Date.now();
    // Android: 2 posts, one with a very high comment count.
    // Chrome: 5 posts, each with a modest comment count.
    // Under "comments" (peak) Android would win; under "community"
    // (total post count) Chrome should win instead.
    STATE.redditBySub = new Map([
      [
        'android',
        Array.from({ length: 2 }, (_, i) => ({
          redditId: `a${i}`,
          source: 'reddit',
          created_utc: new Date(now - i * 1000).toISOString(),
          num_comments: i === 0 ? 200 : 1,
        })),
      ],
      [
        'chrome',
        Array.from({ length: 5 }, (_, i) => ({
          redditId: `c${i}`,
          source: 'reddit',
          created_utc: new Date(now - i * 1000).toISOString(),
          num_comments: 3,
        })),
      ],
    ]);
    setFeedSort('community');
    const groups = groupByComponentName([
      { versionProductName: 'android', versionNumber: '15', versionReleaseDate: '' },
      { versionProductName: 'chrome', versionNumber: '130', versionReleaseDate: '' },
    ]);
    return groups.map((g) => ({ name: g.name, communityPostCount: g._communityPostCount }));
  });
  expect(order[0]).toEqual({ name: 'Chrome', communityPostCount: 5 });
  expect(order[1]).toEqual({ name: 'Android', communityPostCount: 2 });
});

test('a group with no matching reddit posts sorts last, with a community post count of 0', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    STATE.redditBySub = new Map();
    setFeedSort('community');
    const groups = groupByComponentName([
      { versionProductName: 'obscureapp', versionNumber: '1', versionReleaseDate: '' },
    ]);
    return groups.map((g) => g._communityPostCount);
  });
  expect(order).toEqual([0]);
});
