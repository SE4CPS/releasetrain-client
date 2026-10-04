const { test, expect } = require('@playwright/test');

/*
 * Author-vs-community sentiment, shown below a reddit post in the
 * "Recent Updates" feed. First shipped as a two-segment bar (one
 * aggregate score per side), then a two-polyline chart plotting each
 * comment's own score over the thread's chronological order. The author
 * line always starts with the post's own title+description sentiment
 * (sentiment.author) as its first point - reported live: "since every
 * line chart starts with the author title+description, every chart
 * shall have as the first data point the author sentiment" - so the
 * author series can never be fully empty, only the community one can.
 * Tests renderSentimentBar() directly (same pattern as
 * artifact-sources.spec.js testing askRenderSources directly), since
 * feed.js's full group-rendering pipeline is a large, separate thing to
 * drive end-to-end just to exercise this one piece of DOM.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test("the author line's first point is always the post's own title+description sentiment, at x=0", async ({
  page,
}) => {
  const firstPoint = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.7,
      authorTrajectory: [],
      communityTrajectory: [{ i: 0, v: -0.2 }],
      authorHasReplies: false,
      forCommentCount: 1,
    });
    const dot = bar.querySelector('.sentiment-dot.author');
    return { x: Number(dot.getAttribute('cx')), y: Number(dot.getAttribute('cy')) };
  });
  expect(firstPoint.x).toBe(0);
  // y for a strongly positive score (0.7) should sit above the vertical
  // midline (y=15 is the zero baseline in the 0..30 viewBox).
  expect(firstPoint.y).toBeLessThan(15);
});

test('an actual author reply comment shifts to index+1, landing after the title+description anchor', async ({
  page,
}) => {
  const points = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0,
      authorTrajectory: [{ i: 0, v: 0 }],
      communityTrajectory: [],
      authorHasReplies: true,
      forCommentCount: 1,
    });
    const line = bar.querySelector('.sentiment-line.author');
    return line.getAttribute('points');
  });
  const coords = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number));
  expect(coords).toHaveLength(2);
  expect(coords[0][0]).toBe(0); // the title+description anchor
  expect(coords[1][0]).toBeGreaterThan(0); // the real comment, shifted past it
});

test('author renders a dot (not a line) when there is no reply, just the title+description anchor', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.1,
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
  expect(html).toContain('sentiment-dot author');
  expect(html).not.toContain('sentiment-line author');
  expect(html).toContain('sentiment-line community');
});

test('a community side with zero comments renders nothing for that series', async ({ page }) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.3,
      authorTrajectory: [
        { i: 0, v: 0.3 },
        { i: 1, v: 0.5 },
      ],
      communityTrajectory: [],
      authorHasReplies: true,
      forCommentCount: 2,
    });
    return bar.outerHTML;
  });
  expect(html).not.toContain('sentiment-line community');
  expect(html).not.toContain('sentiment-dot community');
  expect(html).toContain('sentiment-line author');
});

test('shows "no author reply yet" when the author never replied, even though their anchor point still renders', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.2,
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
  expect(html).toContain('sentiment-dot author');
});

test('always renders a legend identifying which color is author vs community', async ({ page }) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0,
      authorTrajectory: [],
      communityTrajectory: [],
      authorHasReplies: false,
      forCommentCount: 0,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-legend');
  expect(html).toContain('sentiment-swatch author');
  expect(html).toContain('Author');
  expect(html).toContain('sentiment-swatch community');
  expect(html).toContain('Community');
});

test('both series share one x scale, so a gap between replies is a real jump along x', async ({
  page,
}) => {
  const points = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0,
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
  const coords = points
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number));
  // anchor at x=0, then the two real comments (originally i=0 and i=4 of
  // a 5-comment thread) shifted to i=1 and i=5 of a 6-position span.
  expect(coords).toHaveLength(3);
  expect(coords[0][0]).toBe(0);
  expect(coords[2][0]).toBeGreaterThan(coords[1][0]);
  expect(coords[1][0]).toBeGreaterThan(coords[0][0]);
});

test('reference lines at +0.5 and -0.5 are present alongside the zero baseline', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0,
      authorTrajectory: [],
      communityTrajectory: [],
      authorHasReplies: false,
      forCommentCount: 0,
    });
    return bar.outerHTML;
  });
  expect((html.match(/sentiment-ref/g) || []).length).toBe(2);
  expect(html).toContain('sentiment-zero');
});

test('no visible numbers or words appear in the chart markup itself (only the legend/note text outside it)', async ({
  page,
}) => {
  const chartHtml = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.6,
      authorTrajectory: [{ i: 0, v: 0.2 }],
      communityTrajectory: [
        { i: 1, v: -0.3 },
        { i: 2, v: -0.5 },
      ],
      authorHasReplies: true,
      forCommentCount: 2,
    });
    return bar.querySelector('.sentiment-chart').outerHTML;
  });
  expect(chartHtml).not.toMatch(/>[-0-9.]+</);
});

test('a dot marks every point on a multi-point line, not just the line itself', async ({
  page,
}) => {
  // Reported live: "make a small dot for every post / comment so it is
  // clearer when a post/comment starts." Before this, a series with 2+
  // points only drew the connecting line - the single-dot fallback only
  // applied when there was exactly one point.
  const counts = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.1,
      authorTrajectory: [
        { i: 0, v: 0.2 },
        { i: 1, v: -0.1 },
      ],
      communityTrajectory: [
        { i: 0, v: -0.3 },
        { i: 1, v: 0.4 },
        { i: 2, v: 0.0 },
      ],
      authorHasReplies: true,
      forCommentCount: 3,
    });
    return {
      authorDots: bar.querySelectorAll('.sentiment-dot.author').length,
      communityDots: bar.querySelectorAll('.sentiment-dot.community').length,
      hasAuthorLine: !!bar.querySelector('.sentiment-line.author'),
      hasCommunityLine: !!bar.querySelector('.sentiment-line.community'),
    };
  });
  // authorPoints = the title+description anchor + 2 trajectory points = 3
  expect(counts.authorDots).toBe(3);
  expect(counts.communityDots).toBe(3);
  expect(counts.hasAuthorLine).toBe(true);
  expect(counts.hasCommunityLine).toBe(true);
});
