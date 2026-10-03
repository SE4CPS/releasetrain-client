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
 *
 * Later changed from "last 50 posts" to a fixed 2-week calendar window,
 * shared by every component - reported live: "for all component level
 * linechart i want to see the cadance of reddit posts and cve/changelog
 * release from the last 2 weeks." A post-count window let a bursty
 * component collapse to a single-day range ("Oct 3 - Oct 3"); the fixed
 * window makes cadence (including sparseness) visible and comparable
 * across components.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

// Spreads `count` posts evenly from `spreadDays` ago (first post) up to
// now (last post) - lets a test control whether the posts land inside or
// outside the chart's fixed 14-day window, independent of how many there are.
function makePosts(count, spreadDays = count) {
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = count <= 1 ? 0 : (spreadDays * (count - 1 - i)) / (count - 1);
    return {
      redditId: `p${i}`,
      source: 'reddit',
      subreddit: 'linux',
      title: `post ${i}`,
      created_utc: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      sentiment: { author: 0.1 },
    };
  });
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
    // Posts span the last 10 days (inside the chart's fixed 14-day
    // window); both events land inside that window too (5 and 3 days
    // ago), same reference point (Date.now() at test-run time), not a
    // hardcoded calendar date.
    { posts: makePosts(40, 10), releaseDate: daysAgoYYYYMMDD(5), cveDate: daysAgoYYYYMMDD(3) },
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

test('only includes posts within the fixed 2-week window, dropping older ones', async ({
  page,
}) => {
  const pointCount = await page.evaluate(() => {
    const now = Date.now();
    const recent = Array.from({ length: 5 }, (_, i) => ({
      redditId: `recent${i}`,
      source: 'reddit',
      subreddit: 'linux',
      created_utc: new Date(now - i * 86400000).toISOString(), // within last 14 days
      sentiment: { author: 0.1 },
    }));
    const old = Array.from({ length: 5 }, (_, i) => ({
      redditId: `old${i}`,
      source: 'reddit',
      subreddit: 'linux',
      created_utc: new Date(now - (30 + i) * 86400000).toISOString(), // well outside the window
      sentiment: { author: 0.1 },
    }));
    STATE.redditBySub = new Map([['linux', [...recent, ...old]]]);
    const el = renderComponentSentimentChart({ name: 'Linux', items: [] });
    const points = el.querySelector('.component-chart-line').getAttribute('points');
    return points.trim().split(/\s+/).length;
  });
  expect(pointCount).toBe(5);
});

test('renders a single dot, not a line, when exactly one scored post falls in the window', async ({
  page,
}) => {
  const result = await page.evaluate(
    (posts) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const el = renderComponentSentimentChart({ name: 'Linux', items: [] });
      return {
        hasDot: !!el.querySelector('.component-chart-dot'),
        hasLine: !!el.querySelector('.component-chart-line'),
      };
    },
    makePosts(1, 1),
  );
  expect(result.hasDot).toBe(true);
  expect(result.hasLine).toBe(false);
});

test('returns null (renders nothing) when nothing falls in the last 2 weeks', async ({ page }) => {
  const result = await page.evaluate(() => {
    STATE.redditBySub = new Map([['linux', []]]);
    const el = renderComponentSentimentChart({ name: 'Linux', items: [] });
    return el === null;
  });
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
  const html = await page.evaluate(
    (posts) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = { name: 'Linux', items: [] };
      const node = renderComponentNode(group, 0);
      return node.querySelector('summary').outerHTML;
    },
    makePosts(40, 10),
  );
  expect(html).toContain('groupSummaryText');
  expect(html).toContain('component-chart-wrap');
});

test('a release/CVE outside the fixed 2-week window is dropped, not just unreachable', async ({
  page,
}) => {
  // Reported live (originally): "only show cve and change logs that are
  // inside the reddit time range." The window is now a fixed 14 days
  // (not derived from the posts), but the same exclusion still applies:
  // an event from long before/after that window must not render, and
  // must not skew the axis.
  const result = await page.evaluate(
    ({ posts, oldReleaseDate, futureCveDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          // Posts span the full 14-day window; this release is 400 days
          // old - well outside it - and this CVE is 400 days in the
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
      posts: makePosts(40, 14),
      oldReleaseDate: daysAgoYYYYMMDD(400),
      futureCveDate: daysAgoYYYYMMDD(-400),
    },
  );
  expect(result.hasRelease).toBe(false);
  expect(result.hasCve).toBe(false);
  expect(result.lineSpansFullWidth).toBe(true);
});

test("shows a release/CVE's real semantic version as a label when one is available", async ({
  page,
}) => {
  // Reported live: "if a semantic version is available show it."
  const result = await page.evaluate(
    ({ posts, releaseDate, cveDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          {
            versionProductName: 'linux',
            versionNumber: '7.1.0',
            versionReleaseDate: releaseDate,
            versionReleaseChannel: 'minor',
            isCve: false,
          },
          {
            versionProductName: 'linux',
            versionNumber: '7.0.4',
            versionReleaseDate: cveDate,
            versionReleaseChannel: 'patch',
            isCve: true,
          },
        ],
      };
      const el = renderComponentSentimentChart(group);
      return Array.from(el.querySelectorAll('.component-chart-label')).map((s) => s.textContent);
    },
    { posts: makePosts(40, 10), releaseDate: daysAgoYYYYMMDD(5), cveDate: daysAgoYYYYMMDD(3) },
  );
  expect(result).toContain('7.1.0');
  expect(result).toContain('7.0.4');
});

test('does not show a label when the version number is missing or not a real semantic version', async ({
  page,
}) => {
  const result = await page.evaluate(
    ({ posts, releaseDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          {
            versionProductName: 'linux',
            versionNumber: '',
            versionReleaseDate: releaseDate,
            isCve: false,
          },
        ],
      };
      const el = renderComponentSentimentChart(group);
      return el.querySelectorAll('.component-chart-label').length;
    },
    { posts: makePosts(40, 10), releaseDate: daysAgoYYYYMMDD(5) },
  );
  expect(result).toBe(0);
});

test('a major release also shows its month/day date alongside the version; a minor one does not', async ({
  page,
}) => {
  // Reported live: "also month, day for major updates."
  const result = await page.evaluate(
    ({ posts, majorDate, minorDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          {
            versionProductName: 'linux',
            versionNumber: '8.0.0',
            versionReleaseDate: majorDate,
            versionReleaseChannel: 'major',
            isCve: false,
          },
          {
            versionProductName: 'linux',
            versionNumber: '7.1.1',
            versionReleaseDate: minorDate,
            versionReleaseChannel: 'patch',
            isCve: false,
          },
        ],
      };
      const el = renderComponentSentimentChart(group);
      const labels = Array.from(el.querySelectorAll('.component-chart-label')).map((s) => ({
        text: s.textContent,
        isMajor: s.classList.contains('major'),
      }));
      return labels;
    },
    { posts: makePosts(40, 10), majorDate: daysAgoYYYYMMDD(5), minorDate: daysAgoYYYYMMDD(3) },
  );
  const major = result.find((l) => l.text.startsWith('8.0.0'));
  const minor = result.find((l) => l.text.startsWith('7.1.1'));
  expect(major.isMajor).toBe(true);
  expect(major.text).toContain('8.0.0');
  // Separated by the middle-dot the chart uses, with a real month/day after it.
  expect(major.text).toMatch(/^8\.0\.0 . [A-Za-z]{3} \d{1,2}$/);
  expect(minor.isMajor).toBe(false);
  expect(minor.text).toBe('7.1.1');
});
