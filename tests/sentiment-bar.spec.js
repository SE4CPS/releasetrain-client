const { test, expect } = require('@playwright/test');

/*
 * Author-vs-community sentiment, shown below a reddit post in the
 * "Recent Updates" feed. First shipped as a two-segment bar (one
 * aggregate score per side), reported live, with a screenshot of a
 * 135-comment thread: "show a thin 2 line chart on comment sentiment
 * change" - replaced with a two-polyline chart plotting each comment's
 * own score over the thread's chronological order. Tests
 * renderSentimentBar() directly (same pattern as artifact-sources.spec.js
 * testing askRenderSources directly), since feed.js's full
 * group-rendering pipeline is a large, separate thing to drive
 * end-to-end just to exercise this one piece of DOM.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test('renders one polyline per side when each has 2+ points, no numbers or words on the chart', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      authorTrajectory: [
        { i: 0, v: 0.2 },
        { i: 2, v: 0.6 },
      ],
      communityTrajectory: [
        { i: 1, v: -0.3 },
        { i: 3, v: -0.5 },
      ],
      authorHasReplies: true,
      forCommentCount: 4,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-line author');
  expect(html).toContain('sentiment-line community');
  expect(html).not.toContain('sentiment-note');
  // No visible number/word anywhere in the chart markup itself.
  expect(html).not.toMatch(/>[-0-9.]+</);
});

test('a series with exactly one point renders a dot, not a polyline (a line needs 2+ points)', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      authorTrajectory: [{ i: 0, v: 0.4 }],
      communityTrajectory: [],
      authorHasReplies: true,
      forCommentCount: 1,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-dot author');
  expect(html).not.toContain('sentiment-line author');
  // Scoped to the chart's own series markup, not the wrapper's fixed
  // title tooltip ("Author vs. community sentiment..."), which mentions
  // both words regardless of which series actually rendered.
  expect(html).not.toContain('sentiment-line community');
  expect(html).not.toContain('sentiment-dot community');
});

test('a series with zero points renders nothing for that side', async ({ page }) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      authorTrajectory: [],
      communityTrajectory: [
        { i: 0, v: -0.2 },
        { i: 1, v: 0.1 },
      ],
      authorHasReplies: false,
      forCommentCount: 2,
    });
    return bar.outerHTML;
  });
  expect(html).not.toContain('sentiment-line author');
  expect(html).not.toContain('sentiment-dot author');
  expect(html).toContain('sentiment-line community');
});

test('shows "no author reply yet" when the author never replied in the thread', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      authorTrajectory: [],
      communityTrajectory: [
        { i: 0, v: -0.2 },
        { i: 1, v: 0.1 },
      ],
      authorHasReplies: false,
      forCommentCount: 2,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-note');
  expect(html).toContain('no author reply yet');
});

test('both series share one x scale (forCommentCount), so a gap between replies is a real jump along x', async ({
  page,
}) => {
  const points = await page.evaluate(() => {
    const bar = renderSentimentBar({
      authorTrajectory: [
        { i: 0, v: 0 },
        { i: 4, v: 0 },
      ],
      communityTrajectory: [],
      authorHasReplies: true,
      forCommentCount: 5,
    });
    const line = bar.querySelector('.sentiment-line.author');
    return line.getAttribute('points');
  });
  const [first, second] = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number));
  // i=0 -> x=0; i=4 of a 5-comment thread (span=4) -> x=full chart width.
  expect(first[0]).toBe(0);
  expect(second[0]).toBeGreaterThan(first[0]);
});
