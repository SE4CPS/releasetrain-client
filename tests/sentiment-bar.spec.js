const { test, expect } = require('@playwright/test');

/*
 * Author-vs-community sentiment, shown below a reddit post in the
 * "Recent Updates" feed - reported live, with a screenshot of a post
 * row: "show a sentiment below the reddit post, author vs comments."
 * Tests renderSentimentBar()/sentimentFill() directly (same pattern as
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

test('renders one fill per side, colored by sign, no text on the bars', async ({ page }) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.6,
      community: -0.5,
      authorHasReplies: true,
      forCommentCount: 3,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-fill author pos');
  expect(html).toContain('sentiment-fill community neg');
  expect(html).not.toContain('sentiment-note');
  // No visible number/word on either fill itself.
  expect(html).not.toMatch(/>[-0-9.]+</);
});

test('omits the community fill when every comment was from the author', async ({ page }) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.2,
      community: null,
      authorHasReplies: true,
      forCommentCount: 2,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-fill author');
  expect(html).not.toContain('sentiment-fill community');
});

test('shows "no author reply yet" when the author never replied in the thread', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.4,
      community: -0.2,
      authorHasReplies: false,
      forCommentCount: 2,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-note');
  expect(html).toContain('no author reply yet');
});

test('neutral scores (within +/-0.05) render as the neu class, not pos/neg', async ({ page }) => {
  const html = await page.evaluate(() => {
    const bar = renderSentimentBar({
      author: 0.02,
      community: -0.01,
      authorHasReplies: true,
      forCommentCount: 1,
    });
    return bar.outerHTML;
  });
  expect(html).toContain('sentiment-fill author neu');
  expect(html).toContain('sentiment-fill community neu');
});

test('fill width scales with magnitude via the --rt-w custom property, not an inline width', async ({
  page,
}) => {
  const widths = await page.evaluate(() => {
    const weak = renderSentimentBar({
      author: 0.1,
      community: null,
      authorHasReplies: true,
      forCommentCount: 1,
    });
    const strong = renderSentimentBar({
      author: 0.9,
      community: null,
      authorHasReplies: true,
      forCommentCount: 1,
    });
    const weakFill = weak.querySelector('.sentiment-fill');
    const strongFill = strong.querySelector('.sentiment-fill');
    return {
      weak: weakFill.style.width,
      weakVar: weakFill.style.getPropertyValue('--rt-w'),
      strong: strongFill.style.width,
      strongVar: strongFill.style.getPropertyValue('--rt-w'),
    };
  });
  // No plain inline width (this repo's CSS lint forbids it) - only the
  // --rt-w custom property, consumed by .sentiment-fill's own CSS rule.
  expect(widths.weak).toBe('');
  expect(widths.strong).toBe('');
  expect(widths.weakVar).toBe('6px');
  expect(widths.strongVar).toBe('22px');
});
