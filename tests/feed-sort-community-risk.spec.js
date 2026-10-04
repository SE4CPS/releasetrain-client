const { test, expect } = require('@playwright/test');

/*
 * "Community risk by post" (value="community-risk-post") and "Community
 * risk by comment" (value="community-risk-comment") feed sorts - reported
 * live: "add an option community risk by post and sort by posts with
 * most negative sentiments and the same for community risk by comment
 * and sort by component with the reddit post with most negative
 * comments."
 *
 * Both are the mirror image of "Most community comments"/"Most community
 * posts" (see feed-sort-comments.spec.js / feed-sort-community.spec.js):
 * those sort descending by a peak/total; these sort ASCENDING by a
 * component's single MOST NEGATIVE value, so a component sits at the top
 * because something genuinely went wrong in one post/comment, not
 * because of high engagement volume.
 *
 * - community-risk-post reads each post's own title+description score
 *   (sentiment.author).
 * - community-risk-comment reads each post's own aggregate community-
 *   comment score (sentiment.community, already computed server-side
 *   from that post's non-author replies).
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test('both new options exist in the feed sort select', async ({ page }) => {
  const options = await page.locator('#feedSortSelect option').allTextContents();
  expect(options).toContain('Community risk by post');
  expect(options).toContain('Community risk by comment');
});

test('community-risk-post orders groups by their single most negative post, ascending', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    const now = Date.now();
    // Android: posts are mildly negative at worst (-0.2).
    // Chrome: mostly positive, but ONE post is strongly negative (-0.9).
    STATE.redditBySub = new Map([
      [
        'android',
        [
          {
            redditId: 'a1',
            source: 'reddit',
            created_utc: new Date(now - 1000).toISOString(),
            sentiment: { author: -0.2 },
          },
          {
            redditId: 'a2',
            source: 'reddit',
            created_utc: new Date(now - 2000).toISOString(),
            sentiment: { author: 0.3 },
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
            sentiment: { author: 0.7 },
          },
          {
            redditId: 'c2',
            source: 'reddit',
            created_utc: new Date(now - 2000).toISOString(),
            sentiment: { author: -0.9 },
          },
        ],
      ],
    ]);
    setFeedSort('community-risk-post');
    const groups = groupByComponentName([
      { versionProductName: 'android', versionNumber: '15', versionReleaseDate: '' },
      { versionProductName: 'chrome', versionNumber: '130', versionReleaseDate: '' },
    ]);
    return groups.map((g) => ({ name: g.name, mostNegativePostScore: g._mostNegativePostScore }));
  });
  expect(order[0]).toEqual({ name: 'Chrome', mostNegativePostScore: -0.9 });
  expect(order[1]).toEqual({ name: 'Android', mostNegativePostScore: -0.2 });
});

test('community-risk-comment orders groups by their single most negative post-level community score, ascending', async ({
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
            sentiment: { author: 0.1, community: -0.1 },
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
            sentiment: { author: 0.9, community: -0.8 },
          },
        ],
      ],
    ]);
    setFeedSort('community-risk-comment');
    const groups = groupByComponentName([
      { versionProductName: 'android', versionNumber: '15', versionReleaseDate: '' },
      { versionProductName: 'chrome', versionNumber: '130', versionReleaseDate: '' },
    ]);
    return groups.map((g) => ({
      name: g.name,
      mostNegativeCommentScore: g._mostNegativeCommentScore,
    }));
  });
  // Chrome's own post+description sentiment (0.9) is very positive, but
  // its community comments are the most negative - this mode must follow
  // sentiment.community, not sentiment.author.
  expect(order[0]).toEqual({ name: 'Chrome', mostNegativeCommentScore: -0.8 });
  expect(order[1]).toEqual({ name: 'Android', mostNegativeCommentScore: -0.1 });
});

test('community-risk-post: a group with no scored posts sorts last, not first', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    const now = Date.now();
    STATE.redditBySub = new Map([
      [
        'hasdata',
        [
          {
            redditId: 'x',
            source: 'reddit',
            created_utc: new Date(now).toISOString(),
            sentiment: { author: 0.5 },
          },
        ],
      ],
    ]);
    setFeedSort('community-risk-post');
    const groups = groupByComponentName([
      { versionProductName: 'nodata', versionNumber: '1', versionReleaseDate: '' },
      { versionProductName: 'hasdata', versionNumber: '1', versionReleaseDate: '' },
    ]);
    return groups.map((g) => g.name);
  });
  // "hasdata" has a real (if mild) score; "nodata" has none at all - an
  // absent signal must not outrank a confirmed, if mild, one.
  expect(order).toEqual(['Hasdata', 'Nodata']);
});

test('community-risk-comment: a post with no community replies (null sentiment.community) is excluded, not treated as 0', async ({
  page,
}) => {
  const order = await page.evaluate(() => {
    const now = Date.now();
    STATE.redditBySub = new Map([
      [
        'noreplies',
        [
          {
            redditId: 'n',
            source: 'reddit',
            created_utc: new Date(now).toISOString(),
            sentiment: { author: 0, community: null },
          },
        ],
      ],
      [
        'hasreplies',
        [
          {
            redditId: 'h',
            source: 'reddit',
            created_utc: new Date(now).toISOString(),
            sentiment: { author: 0, community: -0.3 },
          },
        ],
      ],
    ]);
    setFeedSort('community-risk-comment');
    const groups = groupByComponentName([
      { versionProductName: 'noreplies', versionNumber: '1', versionReleaseDate: '' },
      { versionProductName: 'hasreplies', versionNumber: '1', versionReleaseDate: '' },
    ]);
    return groups.map((g) => ({ name: g.name, score: g._mostNegativeCommentScore }));
  });
  expect(order[0]).toEqual({ name: 'Hasreplies', score: -0.3 });
  expect(order[1]).toEqual({ name: 'Noreplies', score: null });
});

test('"Community risk by comment" reorders the posts inside a component too, by negative comment count descending', async ({
  page,
}) => {
  // Reported live: "for this sort the reddit posts by negative comment
  // count desc order" - same "reorders documents inside a component too"
  // treatment "Most community comments" already has, but by COUNT of
  // negative comments (sentiment.communityTrajectory entries <= -0.05,
  // the same VADER "Negative" threshold the server itself uses), not by
  // num_comments or by the aggregate sentiment.community score.
  const titles = await page.evaluate(() => {
    const now = Date.now();
    STATE.redditBySub = new Map([
      [
        'chrome',
        [
          {
            redditId: 'r1',
            source: 'reddit',
            title: 'One negative reply',
            url: 'https://reddit.com/r1',
            created_utc: new Date(now - 1000).toISOString(),
            num_comments: 10, // deliberately higher than r2's, to prove this isn't num_comments-based
            sentiment: {
              communityTrajectory: [
                { i: 0, v: -0.3 },
                { i: 1, v: 0.5 },
              ],
            },
          },
          {
            redditId: 'r2',
            source: 'reddit',
            title: 'Three negative replies',
            url: 'https://reddit.com/r2',
            created_utc: new Date(now - 60000).toISOString(),
            num_comments: 3,
            sentiment: {
              communityTrajectory: [
                { i: 0, v: -0.1 },
                { i: 1, v: -0.2 },
                { i: 2, v: -0.9 },
              ],
            },
          },
        ],
      ],
    ]);
    setFeedSort('community-risk-comment');
    const group = {
      name: 'Chrome',
      items: [{ versionProductName: 'chrome', versionNumber: '1', versionReleaseDate: '' }],
    };
    const node = renderComponentNode(group, 0);
    return Array.from(node.querySelectorAll('.titleRow a')).map((a) => a.textContent);
  });
  expect(titles[0]).toBe('Three negative replies');
  expect(titles[1]).toBe('One negative reply');
});
