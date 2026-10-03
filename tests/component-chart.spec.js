const { test, expect } = require('@playwright/test');

/*
 * Component-level sentiment trend chart, in each group's own summary row
 * - reported live: "for each component in the feedview add the line
 * chart with the sentiment of the last 50 reddit posts and their author
 * title+description sentiment... reuse the same pip package" (reads
 * sentiment.author, already computed server-side), plus "a subtle
 * vertical line when a release was made (green) and CVE a red vertical
 * line", "a simple timestamp", "a legend", and "use the available space
 * on the right" (the group header switches to a row layout, chart on
 * the right of the existing name/chips/sources block).
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

function makePosts(count) {
  return Array.from({ length: count }, (_, i) => ({
    redditId: `p${i}`,
    source: 'reddit',
    subreddit: 'linux',
    title: `post ${i}`,
    created_utc: new Date(Date.now() - (count - i) * 86400000).toISOString(),
    sentiment: { author: 0.1 },
  }));
}

test('renders a chart line, release/CVE markers, a date range, and a legend', async ({ page }) => {
  const html = await page.evaluate((posts) => {
    STATE.redditBySub = new Map([['linux', posts]]);
    const group = {
      name: 'Linux',
      items: [
        {
          versionProductName: 'linux',
          versionNumber: '7.1.0',
          versionReleaseDate: '20260824',
          isCve: false,
        },
        {
          versionProductName: 'linux',
          versionNumber: 'CVE-2026-1',
          versionReleaseDate: '20260913',
          isCve: true,
        },
      ],
    };
    const el = renderComponentSentimentChart(group);
    return el ? el.outerHTML : null;
  }, makePosts(40));
  expect(html).not.toBeNull();
  expect(html).toContain('component-chart-line');
  expect(html).toContain('component-chart-event release');
  expect(html).toContain('component-chart-event cve');
  expect(html).toContain('component-chart-range');
  expect(html).toContain('component-chart-legend');
  expect(html).toContain('sentiment');
  expect(html).toContain('release');
  expect(html).toContain('CVE');
});

test('uses only the most recent 50 posts, even when more are available', async ({ page }) => {
  const pointCount = await page.evaluate((posts) => {
    STATE.redditBySub = new Map([['linux', posts]]);
    const el = renderComponentSentimentChart({ name: 'Linux', items: [] });
    const points = el.querySelector('.component-chart-line').getAttribute('points');
    return points.trim().split(/\s+/).length;
  }, makePosts(80));
  expect(pointCount).toBe(50);
});

test('returns null (renders nothing) when there are fewer than 2 scored posts', async ({
  page,
}) => {
  const result = await page.evaluate((posts) => {
    STATE.redditBySub = new Map([['linux', posts]]);
    const el = renderComponentSentimentChart({ name: 'Linux', items: [] });
    return el === null;
  }, makePosts(1));
  expect(result).toBe(true);
});

test('ignores reddit posts with no computed sentiment yet', async ({ page }) => {
  const result = await page.evaluate(() => {
    const posts = [
      {
        redditId: 'a',
        source: 'reddit',
        subreddit: 'linux',
        created_utc: new Date().toISOString(),
      }, // no sentiment field
      {
        redditId: 'b',
        source: 'reddit',
        subreddit: 'linux',
        created_utc: new Date().toISOString(),
      }, // no sentiment field
    ];
    STATE.redditBySub = new Map([['linux', posts]]);
    const el = renderComponentSentimentChart({ name: 'Linux', items: [] });
    return el === null;
  });
  expect(result).toBe(true);
});

test('the summary row switches to a side-by-side layout so the chart uses the available right-hand space', async ({
  page,
}) => {
  const html = await page.evaluate((posts) => {
    STATE.redditBySub = new Map([['linux', posts]]);
    const group = { name: 'Linux', items: [] };
    const node = renderComponentNode(group, 0);
    return node.querySelector('summary').outerHTML;
  }, makePosts(40));
  expect(html).toContain('groupSummaryText');
  expect(html).toContain('component-chart-wrap');
});
