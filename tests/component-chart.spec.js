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
 * window made cadence (including sparseness) visible and comparable
 * across components.
 *
 * Changed again, reported live: "component level line chart for each
 * component start with earliest reddit post (title+description)
 * sentiment and end with the latest one. not a hard 3 weeks window.
 * within this range keep CVE + changelogs vertical (everything outside
 * this window ignore it) but label range in legend." The window is now
 * each component's own earliest-to-latest Reddit post span, not a fixed
 * calendar window shared by every component - release/CVE markers
 * outside that span are still dropped, same as before, just relative to
 * the new post-derived bounds instead of a fixed one.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

// Spreads `count` posts evenly from `spreadDays` ago (first post) up to
// now (last post) - lets a test control the chart's own post-derived
// window width directly, independent of how many posts there are.
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
    // Posts span the last 10 days, so the chart's own window is roughly
    // that same span; both events land inside it too (5 and 3 days ago),
    // same reference point (Date.now() at test-run time), not a
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

test("includes every post regardless of age - the window is the posts' own earliest-to-latest span, not a fixed recency cutoff", async ({
  page,
}) => {
  // Reported live: "start with earliest reddit post... end with the
  // latest one. not a hard 3 weeks window." A post from a year ago is
  // just as much a real boundary of this component's own history as one
  // from yesterday - nothing gets dropped for being "too old."
  const pointCount = await page.evaluate(() => {
    const now = Date.now();
    const recent = Array.from({ length: 5 }, (_, i) => ({
      redditId: `recent${i}`,
      source: 'reddit',
      subreddit: 'linux',
      created_utc: new Date(now - i * 86400000).toISOString(),
      sentiment: { author: 0.1 },
    }));
    const old = Array.from({ length: 5 }, (_, i) => ({
      redditId: `old${i}`,
      source: 'reddit',
      subreddit: 'linux',
      created_utc: new Date(now - (365 + i) * 86400000).toISOString(), // about a year old
      sentiment: { author: 0.1 },
    }));
    STATE.redditBySub = new Map([['linux', [...recent, ...old]]]);
    const el = renderComponentSentimentChart({ name: 'Linux', items: [] });
    const points = el.querySelector('.component-chart-line').getAttribute('points');
    return points.trim().split(/\s+/).length;
  });
  expect(pointCount).toBe(10); // all 5 recent + all 5 year-old posts
});

test('renders a single dot, not a line, when there is exactly one scored post', async ({
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

test('returns null (renders nothing) when there are no scored posts at all', async ({ page }) => {
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

test('a release/CVE outside the post-derived window is dropped, not just unreachable', async ({
  page,
}) => {
  // Reported live (originally): "only show cve and change logs that are
  // inside the reddit time range." The window is each component's own
  // earliest-to-latest post span; an event from long before/after that
  // span must not render, and must not skew the axis.
  const result = await page.evaluate(
    ({ posts, oldReleaseDate, futureCveDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          // Posts span a 14-day window of their own; this release is 400
          // days old - well outside it - and this CVE is 400 days in the
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

test('two release/CVE labels landing close together in time are staggered onto separate rows, not overlapped', async ({
  page,
}) => {
  // Reported live, with a screenshot: a release and its own CVE record
  // landing on nearly the same date rendered as garbled, overlapping
  // text ("11.2.16" smashed together with the CVE's own version number).
  const result = await page.evaluate(
    ({ posts, releaseDate, cveDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          {
            versionProductName: 'linux',
            versionNumber: '11.2.16',
            versionReleaseDate: releaseDate,
            versionReleaseChannel: 'patch',
            isCve: false,
          },
          // Same day as the release above - exactly the collision case reported live.
          {
            versionProductName: 'linux',
            versionNumber: '11.2.16',
            versionReleaseDate: cveDate,
            versionReleaseChannel: 'patch',
            isCve: true,
          },
        ],
      };
      const el = renderComponentSentimentChart(group);
      const labels = Array.from(el.querySelectorAll('.component-chart-label')).map((s) => ({
        text: s.textContent,
        top: s.style.getPropertyValue('--rt-top'),
      }));
      return labels;
    },
    { posts: makePosts(40, 10), releaseDate: daysAgoYYYYMMDD(5), cveDate: daysAgoYYYYMMDD(5) },
  );
  expect(result.length).toBe(2);
  // Both real labels still render (neither silently dropped)...
  expect(result.every((l) => l.text === '11.2.16')).toBe(true);
  // ...but on two different rows, so they don't sit on top of each other.
  expect(result[0].top).not.toBe(result[1].top);
});

test('events spread well apart in time all land on the same row (no unnecessary staggering)', async ({
  page,
}) => {
  const result = await page.evaluate(
    ({ posts, releaseDate, cveDate }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: [
          {
            versionProductName: 'linux',
            versionNumber: '7.0.0',
            versionReleaseDate: releaseDate,
            versionReleaseChannel: 'patch',
            isCve: false,
          },
          {
            versionProductName: 'linux',
            versionNumber: '7.0.1',
            versionReleaseDate: cveDate,
            versionReleaseChannel: 'patch',
            isCve: true,
          },
        ],
      };
      const el = renderComponentSentimentChart(group);
      return Array.from(el.querySelectorAll('.component-chart-label')).map((s) =>
        s.style.getPropertyValue('--rt-top'),
      );
    },
    // Posts span 14 days; release/CVE sit well inside that (not flush
    // against either edge - a release placed exactly at the oldest
    // post's own timestamp is a boundary case: versionTime() reconstructs
    // a date string at noon UTC, which can fall a few hours either side
    // of the posts' own precise min/max depending on time-of-day the
    // suite happens to run, flaking the "same row" assertion right at
    // the edge). 8 days apart is still plenty of room to confirm no
    // unnecessary staggering.
    { posts: makePosts(40, 14), releaseDate: daysAgoYYYYMMDD(10), cveDate: daysAgoYYYYMMDD(2) },
  );
  expect(result[0]).toBe(result[1]);
});

test('a dense history (e.g. 100+ CVEs) caps how many get a text label, instead of stacking into a wall', async ({
  page,
}) => {
  // Reported live, with a screenshot: Linux's own "CVE 127" rendered as
  // 15+ stacked rows of overlapping version numbers, dwarfing the rest
  // of the feed. Every event still gets its vertical tick line (checked
  // separately below) - only the TEXT label is capped.
  const result = await page.evaluate(
    ({ posts, cveDates }) => {
      STATE.redditBySub = new Map([['linux', posts]]);
      const group = {
        name: 'Linux',
        items: cveDates.map((d, i) => ({
          versionProductName: 'linux',
          versionNumber: `6.${i}.0`,
          versionReleaseDate: d,
          versionReleaseChannel: 'patch',
          isCve: true,
        })),
      };
      const el = renderComponentSentimentChart(group);
      return {
        labelCount: el.querySelectorAll('.component-chart-label').length,
        tickCount: el.querySelectorAll('.component-chart-event.cve').length,
      };
    },
    {
      // Posts span 15 days, wide enough that every CVE date below (out
      // to ~12.6 days ago) falls inside the post-derived window.
      posts: makePosts(40, 15),
      // 30 CVEs spread across the window, all with real semver numbers.
      cveDates: Array.from({ length: 30 }, (_, i) => daysAgoYYYYMMDD(1 + i * 0.4)),
    },
  );
  expect(result.tickCount).toBe(30); // every event still gets a tick line
  expect(result.labelCount).toBeLessThanOrEqual(6); // but text labels are capped
});

test('a dense history still labels its one major release, not just whichever is most recent', async ({
  page,
}) => {
  const result = await page.evaluate(
    ({ posts, majorDate, cveDates }) => {
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
          ...cveDates.map((d, i) => ({
            versionProductName: 'linux',
            versionNumber: `6.${i}.0`,
            versionReleaseDate: d,
            versionReleaseChannel: 'patch',
            isCve: true,
          })),
        ],
      };
      const el = renderComponentSentimentChart(group);
      return Array.from(el.querySelectorAll('.component-chart-label')).map((s) => s.textContent);
    },
    {
      // Posts span 15 days, wide enough that the 13-days-ago major
      // release below still falls inside the post-derived window.
      posts: makePosts(40, 15),
      // The major release is the OLDEST event here (13 days ago); every
      // CVE is more recent than it - without special-casing majors, a
      // pure most-recent-N selection would drop it entirely.
      majorDate: daysAgoYYYYMMDD(13),
      cveDates: Array.from({ length: 10 }, (_, i) => daysAgoYYYYMMDD(1 + i)),
    },
  );
  expect(result.some((t) => t.startsWith('8.0.0'))).toBe(true);
});
