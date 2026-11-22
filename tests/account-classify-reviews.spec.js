const { test, expect } = require('@playwright/test');

/*
 * Admin System overview: the "Classify second opinions" list (server
 * guardrail releaseMentionSecondOpinion, GET/PUT /api/admin/classify-
 * reviews). Each verdict shows the post, the release it names, the TF-IDF
 * score it overrode or confirmed and the reason; Correct / Wrong send the
 * review and the list reloads. The API is stubbed; only the client wiring
 * is tested.
 */

const OVERVIEW = {
  checkedAt: new Date().toISOString(),
  botHealth: {
    stale: [],
    healthy: [{ bot: 'reddit.py', lastSeen: '2026-11-22', ageDays: 0, maxDays: 3 }],
    noData: [],
  },
  sourceAttribution: { total: 100, unknown: 1, missing: 0, pct: 1 },
  storage: { storageMb: 100, limitMb: 512, pct: 0.2 },
  counts: {
    versionsTotal: 1,
    cveTotal: 0,
    releaseNotesTotal: 1,
    redditTotal: 1,
    stackoverflowTotal: 0,
    serverfaultTotal: 0,
  },
  users: { total: 1, newSinceLastLogin: 0 },
  queries: { total: 1 },
  botGapLog: { total: 0, success: 0, recent: [] },
  askStats: {
    totalLast7Days: 0,
    noVendorDetectedLast7Days: 0,
    noVendorRatePct: 0,
    abstainRatePct: 0,
  },
};

const REVIEWS = [
  {
    id: 'abc',
    title: 'PSA: kernel 7.3 in backports incompatible with zfs',
    subreddit: 'debian',
    url: 'https://www.reddit.com/r/debian/comments/abc/',
    date: '2026-11-21',
    classify: {
      releaseWarning: true,
      reason: 'incompatibility PSA',
      product: 'kernel',
      version: '7.3.5',
      tfidfScore: 0.0005,
      at: '2026-11-22T18:00:00Z',
    },
  },
  {
    id: 'def',
    title: 'Old AMD graphics and kernel 7.3',
    subreddit: 'debian',
    url: null,
    date: '2026-11-22',
    classify: {
      releaseWarning: false,
      reason: 'a hardware question',
      product: 'kernel',
      version: '7.3.5',
      tfidfScore: 0.28,
      at: '2026-11-22T18:00:01Z',
      review: { verdict: 'correct' },
    },
  },
];

async function signInAdmin(page, puts) {
  await page.addInitScript(() => {
    localStorage.setItem('rt_token', 't');
    localStorage.setItem(
      'rt_user',
      JSON.stringify({ id: '1', email: 'a@example.com', name: 'A', role: 'admin', orgs: [] }),
    );
  });
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    let body = [];
    if (/users\/me/.test(url)) body = { id: '1', email: 'a@example.com', role: 'admin' };
    else if (/admin\/overview/.test(url)) body = OVERVIEW;
    else if (/admin\/classify-reviews\/[^/?]+$/.test(url) && route.request().method() === 'PUT') {
      puts.push({
        id: decodeURIComponent(url.split('/').pop()),
        body: route.request().postDataJSON(),
      });
      body = { id: 'abc', releaseWarning: false, modelVerdict: true, review: { verdict: 'wrong' } };
    } else if (/admin\/classify-reviews/.test(url))
      body = {
        reviews: puts.length
          ? [
              {
                ...REVIEWS[0],
                classify: {
                  ...REVIEWS[0].classify,
                  releaseWarning: false,
                  review: { verdict: 'wrong' },
                },
              },
              REVIEWS[1],
            ]
          : REVIEWS,
      };
    else if (/admin\/server-alerts/.test(url)) body = { alerts: [] };
    else if (/admin\/settings/.test(url)) body = { guardrails: [], feedbackThresholds: [] };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test('the review list shows each verdict with the post, release, score and reason; Wrong sends the review and reloads', async ({
  page,
}) => {
  const puts = [];
  await signInAdmin(page, puts);
  await page.goto('/?view=account');
  const details = page.locator('#ua-dash-section').locator('xpath=ancestor::details[1]');
  const group = await details.getAttribute('data-ua-group');
  await page.locator(`[data-ua-tab="${group}"]`).click();
  if (!(await details.getAttribute('open'))) await details.locator('summary').click();
  const rows = page.locator('#ua-dash-reviews .ua-review-row');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('#ua-dash-reviews .ua-dash-bot-group-title')).toContainText(
    'Classify second opinions (2)',
  );
  const first = rows.first();
  await expect(first).toHaveClass(/ua-bot-row-stale/);
  await expect(first.locator('.ua-bot-row-name a')).toHaveAttribute(
    'href',
    'https://www.reddit.com/r/debian/comments/abc/',
  );
  await expect(first.locator('.ua-bot-row-name')).toHaveAttribute('title', 'incompatibility PSA');
  await expect(first.locator('.ua-bot-row-detail')).toHaveText(
    'kernel 7.3.5 · warning (score 0.00)',
  );
  await expect(rows.nth(1)).toHaveClass(/ua-bot-row-healthy/);
  await expect(rows.nth(1).locator('.ua-bot-row-detail')).toHaveText(
    'kernel 7.3.5 · not a warning (score 0.28) · reviewed: correct',
  );
  await first.locator('.ua-review-btn[data-verdict="wrong"]').click();
  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]).toEqual({ id: 'abc', body: { verdict: 'wrong' } });
  await expect(rows.first().locator('.ua-bot-row-detail')).toHaveText(
    'kernel 7.3.5 · not a warning (score 0.00) · reviewed: wrong',
  );
  await expect(rows.first()).toHaveClass(/ua-bot-row-healthy/);
});

test('a guardrail with a goal shows it above its description', async ({ page }) => {
  const puts = [];
  await signInAdmin(page, puts);
  await page.route(/\/api\/admin\/settings/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        guardrails: [
          {
            id: 'releaseMentionSecondOpinion',
            component: 'Classify',
            tier: 'mandatory',
            enabled: true,
            label: 'Second opinion on community posts that name a release',
            goal: 'No community warning that names a release is missed.',
            description: 'The model is asked once per release-naming post.',
          },
        ],
        feedbackThresholds: [],
      }),
    }),
  );
  await page.goto('/?view=account');
  await page.locator('[data-ua-tab="settings"]').click();
  const section = page.locator('#ua-guardrails-section').locator('xpath=ancestor::details[1]');
  if (!(await section.getAttribute('open'))) await section.locator('summary').click();
  await expect(page.locator('#ua-guardrails-section .ua-guardrail-goal')).toHaveText(
    'Goal: No community warning that names a release is missed.',
  );
});
