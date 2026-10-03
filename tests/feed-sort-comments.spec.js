const { test, expect } = require('@playwright/test');

/*
 * "Most comments" feed sort - reported live: "allow me to sort by most
 * comments, add that option." A component group's sort key is its
 * single most-discussed recent post's comment count (same shape as the
 * existing "Highest risk" mode's peak-score key), not a sum across all
 * its posts - see groupByComponentName's own comment in feed.js.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test('"Most comments" option exists in the feed sort select', async ({ page }) => {
  const options = await page.locator('#feedSortSelect option').allTextContents();
  expect(options).toContain('Most comments');
});

test('groupByComponentName orders groups by their most-discussed post, with "comments" selected', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    const now = Date.now();
    STATE.redditBySub = new Map([
      [
        'android',
        [
          {
            redditId: 'a1',
            source: 'reddit',
            created_utc: new Date(now - 1000).toISOString(),
            num_comments: 50,
          },
          {
            redditId: 'a2',
            source: 'reddit',
            created_utc: new Date(now - 2000).toISOString(),
            num_comments: 3,
          },
        ],
      ],
      [
        'chrome',
        [
          {
            redditId: 'c1',
            source: 'reddit',
            created_utc: new Date(now - 1000).toISOString(),
            num_comments: 12,
          },
        ],
      ],
    ]);
    setFeedSort('comments');
    const groups = groupByComponentName([
      { versionProductName: 'android', versionNumber: '15', versionReleaseDate: '' },
      { versionProductName: 'chrome', versionNumber: '130', versionReleaseDate: '' },
    ]);
    return groups.map((g) => ({ name: g.name, commentCount: g._commentCount }));
  });
  expect(order[0]).toEqual({ name: 'Android', commentCount: 50 });
  expect(order[1]).toEqual({ name: 'Chrome', commentCount: 12 });
});

test('a group with no matching reddit posts sorts last, with a comment count of 0', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    STATE.redditBySub = new Map();
    setFeedSort('comments');
    const groups = groupByComponentName([
      { versionProductName: 'obscureapp', versionNumber: '1', versionReleaseDate: '' },
    ]);
    return groups.map((g) => g._commentCount);
  });
  expect(order).toEqual([0]);
});

test('"Most comments" reorders the posts inside a component too, not just which component leads', async ({
  page,
}) => {
  // Reported live, right after the group-level version shipped: "most
  // comments shall apply to both the component and documents inside
  // each component."
  const titles = await page.evaluate(() => {
    const now = Date.now();
    STATE.redditBySub = new Map([
      [
        'chrome',
        [
          {
            redditId: 'r1',
            source: 'reddit',
            title: 'Low comments post',
            url: 'https://reddit.com/r1',
            created_utc: new Date(now - 1000).toISOString(),
            num_comments: 1,
          },
          {
            redditId: 'r2',
            source: 'reddit',
            title: 'High comments post',
            url: 'https://reddit.com/r2',
            created_utc: new Date(now - 60000).toISOString(),
            num_comments: 6,
          },
        ],
      ],
    ]);
    setFeedSort('comments');
    const group = {
      name: 'Chrome',
      items: [{ versionProductName: 'chrome', versionNumber: '1', versionReleaseDate: '' }],
    };
    const node = renderComponentNode(group, 0);
    return Array.from(node.querySelectorAll('.titleRow a')).map((a) => a.textContent);
  });
  expect(titles[0]).toBe('High comments post');
  expect(titles[1]).toBe('Low comments post');
});
