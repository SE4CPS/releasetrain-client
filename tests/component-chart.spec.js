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

// YYYYMMDD, relative to now (matching versionTime()'s own parsing) - not
// a fixed calendar date, so this test keeps working regardless of what
// "today" actually is whenever the suite runs, same reference point
// makePosts() already uses for the posts themselves.
function daysAgoYYYYMMDD(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
}

test('renders a chart line, release/CVE markers, a date range, and a legend', async ({ page }) => {
  const html = await page.evaluate(
    ({ posts, releaseDate, cveDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          {
            versionProductName: 'linux',
            versionNumber: '7.1.0',
            versionReleaseDate: releaseDate,
            isCve: false,
          },
          {
            versionProductName: 'linux',
            versionNumber: 'CVE-2026-1',
            versionReleaseDate: cveDate,
            isCve: true,
          },
        ],
      };
      const el = renderComponentSentimentChart(group);
      return el ? el.outerHTML : null;
    },
    // Posts span the last 40 days; both events land inside that window
    // (20 and 10 days ago respectively), same reference point (Date.now()
    // at test-run time), not a hardcoded calendar date.
    { posts: makePosts(40), releaseDate: daysAgoYYYYMMDD(20), cveDate: daysAgoYYYYMMDD(10) },
  );
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

test("a release/CVE outside the reddit posts' own time range is dropped, not just unreachable", async ({
  page,
}) => {
  // Reported live: "only show cve and change logs that are inside the
  // reddit time range." A release from long before the posts being
  // charted used to pull minT out to include it, compressing all the
  // real sentiment data into a sliver of the chart's width.
  const result = await page.evaluate(
    ({ posts, oldReleaseDate, futureCveDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          // Posts span the last 40 days; this release is 400 days old -
          // well outside that window - and this CVE is 400 days in the
          // future, also outside it.
          {
            versionProductName: 'linux',
            versionNumber: '1.0.0',
            versionReleaseDate: oldReleaseDate,
            isCve: false,
          },
          {
            versionProductName: 'linux',
            versionNumber: 'CVE-9999-1',
            versionReleaseDate: futureCveDate,
            isCve: true,
          },
        ],
      };
      const el = renderComponentSentimentChart(group);
      const line = el.querySelector('.component-chart-line');
      const xs = line
        .getAttribute('points')
        .trim()
        .split(/\s+/)
        .map((pair) => Number(pair.split(',')[0]));
      return {
        hasRelease: !!el.querySelector('.component-chart-event.release'),
        hasCve: !!el.querySelector('.component-chart-event.cve'),
        // If the out-of-range events had skewed the time axis, the real
        // posts' own points would be compressed into a narrow sliver
        // instead of spanning close to the chart's full internal width.
        lineSpansFullWidth: Math.max(...xs) - Math.min(...xs) > 500,
      };
    },
    {
      posts: makePosts(40),
      oldReleaseDate: daysAgoYYYYMMDD(400),
      futureCveDate: daysAgoYYYYMMDD(-400),
    },
  );
  expect(result.hasRelease).toBe(false);
  expect(result.hasCve).toBe(false);
  expect(result.lineSpansFullWidth).toBe(true);
});
