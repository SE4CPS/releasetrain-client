const { test, expect } = require('@playwright/test');

/*
 * The 10 least stable components (feed.js loadTopRisk, server GET
 * /api/insights/top-risk). Reported live: "by default show the 10 high risk
 * on https://releasetrain.io, not on ?view=feed", "for mobile view show only
 * the ten", "just use the pipeline ones", "every github project has an
 * emoji, add it left to the name", citations in round brackets with icons,
 * clickable CVEs, CISA exploited stated, primary sources only, and the main
 * pipeline diagram mirroring the server's summary runs.
 */

const PULLED = '2026-10-12T09:41:00.000Z';
const d = new Date();
const TODAY = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const DATA = {
  day: '2026-10-12',
  pulledAt: PULLED,
  pipeline: { running: null, queued: [] },
  components: [
    {
      rank: 1,
      name: 'redis',
      version: '8.2.2',
      stability: 0.35,
      releaseDate: TODAY,
      latest: { version: '8.4.0', date: '2026-08-18', source: 'github' },
      repo: 'redis/redis',
      primaryUrl: 'https://github.com/redis/redis/releases/tag/8.2.2',
      kevCveId: 'CVE-2025-49844',
      evidence: {
        tier: 0,
        key: 'community-version',
        label: 'community · version match',
        date: '2026-10-10',
        post: {
          title: 'Redis 8.2.2 eats memory',
          url: 'https://www.reddit.com/r/redis/comments/abc/',
          date: '2026-10-10',
          // the Classify second opinion flagged it (guardrail releaseMentionSecondOpinion)
          judged: true,
        },
      },
      communityPosts: [
        {
          subreddit: 'redis',
          title: 'Redis 8.2.2 eats memory',
          url: 'https://www.reddit.com/r/redis/comments/abc/',
          date: '2026-10-10',
          versionMatch: true,
          judged: true,
        },
        {
          subreddit: 'selfhosted',
          title: 'Redis broke my dashboard',
          url: 'https://www.reddit.com/r/selfhosted/comments/def/',
          date: '2026-10-11',
        },
      ],
      status: 'ready',
      summary: {
        kind: 'pipeline',
        answer:
          'Redis is an in-memory key-value store [Redis docs](https://redis.io/docs/). Its latest release fixes module crashes [ReleaseTrain](https://releasetrain.io/api/v/a1). Meanwhile Reddit users report memory spikes [thread](https://www.reddit.com/r/redis/comments/abc/). CVE-2025-49844 may require an update to the latest version [NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-49844).',
      },
    },
    {
      rank: 2,
      name: 'strapi',
      version: '5.55.1',
      stability: 0.58,
      releaseDate: '20240101',
      repo: 'strapi/strapi',
      primaryUrl: 'https://github.com/strapi/strapi',
      kevCveId: null,
      scoreCveId: null,
      evidence: { tier: 4, key: 'none', label: null, date: null },
      status: 'pending',
      summary: {
        kind: 'facts',
        answer: 'strapi 5.55.1 came out today [release](https://github.com/strapi/strapi).',
      },
    },
  ],
};

async function open(page, path, { pipeline, data = DATA } = {}) {
  let pipelineCalls = 0;
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (url.includes('/api/insights/top-risk')) {
      const body = pipeline ? { ...data, pipeline: pipeline(0) } : data;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    if (url.includes('/api/insights/pipeline')) {
      pipelineCalls += 1;
      const body = pipeline ? pipeline(pipelineCalls) : { running: null, queued: [] };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  // Avatar images: never hit the network in tests.
  await page.route(/github\.com\/.*\.png/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: '' }),
  );
  await page.goto(path);
  // Let startup requests settle: the app can switch views once they land.
  await page.waitForLoadState('networkidle');
  return () => pipelineCalls;
}

test('wide screen: the ten show on the home page, not on ?view=feed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/');
  await expect(page.locator('#topRiskHome')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#topRiskHome .tr-item')).toHaveCount(2);
  await expect(page.locator('#topRiskHomeDateline')).toHaveAttribute('datetime', PULLED);
  await page.goto('/?view=feed');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#topRiskHome')).toBeHidden();
  await expect(page.locator('#topRiskPanel')).toBeHidden();
  await expect(page.locator('#feedWindowLabel')).not.toContainText('least stable');
});

test('phone: the home page shows only the ten', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/');
  await expect(page.locator('#topRiskPanel')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#topRiskPanel .tr-item')).toHaveCount(2);
  await expect(page.locator('#feed')).toBeHidden();
  await expect(page.locator('#feedPanel > .panel-header')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('pipeline paragraphs only, project icons, emoji citations, clickable CVEs, CISA stated', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/');
  const items = page.locator('#topRiskHome .tr-item');
  await expect(items).toHaveCount(2, { timeout: 20_000 });
  await expect(items.first().locator('img.tr-icon')).toHaveAttribute(
    'src',
    'https://github.com/redis.png?size=40',
  );
  // latest version in brackets after the name, with a relative day
  await expect(items.first().locator('.tr-latest')).toContainText('(latest: 8.4.0, ');
  await expect(items.first().locator('.tr-latest')).toContainText('days ago)');
  await expect(items.nth(1).locator('.tr-latest')).toHaveCount(0);
  // corner badge only on the item released today
  await expect(items.first().locator('.tr-new')).toHaveText('today');
  await expect(items.nth(1).locator('.tr-new')).toHaveCount(0);
  const story = items.first().locator('.tr-story');
  await expect(story.locator('a.tr-src')).toHaveText([
    '(🌐 source: redis.io)',
    '(💬 source: Reddit)',
    '(🔴 source: NVD)',
    '(🐙 source: GitHub)',
    '(⚠️ source: CISA)',
    // the second counted post, appended; the first is already cited in the paragraph
    '(💬 source: Reddit)',
  ]);
  await expect(story.locator('a.tr-cve').first()).toHaveAttribute(
    'href',
    'https://nvd.nist.gov/vuln/detail/CVE-2025-49844',
  );
  await expect(story.locator('a[href*="releasetrain.io"]')).toHaveCount(0);
  // the non-pipeline (fact-based) paragraph is not shown
  await expect(items.nth(1).locator('.tr-story')).toHaveText(
    'The pipeline is preparing this summary…',
  );
});

test('the main pipeline diagram mirrors the server run, then finishes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const running = {
    running: { name: 'strapi', phase: 'evaluating', detail: null, meta: { attempt: 1 } },
    queued: [],
  };
  const calls = await open(page, '/', {
    pipeline: (n) => (n <= 6 ? running : { running: null, queued: [] }),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof askWorkflowState !== 'undefined' && askWorkflowState && askWorkflowState.evaluator,
      ),
    )
    .toBe('active');
  expect(await page.evaluate(() => askWorkflowQuestion)).toBe(
    'Summarizing strapi for Recent Updates',
  );
  await expect.poll(() => page.evaluate(() => askWorkflowFinished), { timeout: 30_000 }).toBe(true);
  const after = calls();
  await page.waitForTimeout(4500);
  expect(calls()).toBe(after);
});

test('the score’s own CVE is stated when the paragraph does not mention it (ghidra 0.35 with no reason in the text)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const ghidra = {
    rank: 1,
    name: 'ghidra',
    version: '12.1.4',
    stability: 0.35,
    repo: 'NationalSecurityAgency/ghidra',
    primaryUrl: 'https://github.com/NationalSecurityAgency/ghidra',
    kevCveId: null,
    scoreCveId: 'CVE-2026-100504',
    status: 'ready',
    summary: {
      kind: 'pipeline',
      answer:
        'Ghidra is a software reverse engineering framework [GitHub](https://github.com/NationalSecurityAgency/ghidra).',
    },
  };
  await open(page, '/', { data: { ...DATA, components: [ghidra] } });
  const story = page.locator('#topRiskHome .tr-item .tr-story');
  await expect(story).toContainText(
    'NVD lists CVE-2026-100504 for this version, which lowers its stability',
    { timeout: 20_000 },
  );
  await expect(story.locator('a.tr-cve')).toHaveAttribute(
    'href',
    'https://nvd.nist.gov/vuln/detail/CVE-2026-100504',
  );
});

test('evidence tier label after the score (server guardrail recentEvidenceRanking): the post or CVE that ranked it in the tooltip, nothing for the rest', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/');
  const items = page.locator('#topRiskHome .tr-item');
  await expect(items).toHaveCount(2, { timeout: 20_000 });
  const tier = items.first().locator('.tr-tier');
  await expect(tier).toHaveText('community · version match');
  await expect(tier).toHaveClass(/tr-tier-community-version/);
  await expect(tier).toHaveAttribute(
    'title',
    'ranked by very recent evidence: community · version match, Reddit: "Redis 8.2.2 eats memory" (2026-10-10), judged a warning by Classify (second opinion)',
  );
  await expect(items.nth(1).locator('.tr-tier')).toHaveCount(0);
});

test('the community posts behind an item are cited with their thread links, and the tier label links to the ranking post', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, '/');
  const first = page.locator('#topRiskHome .tr-item').first();
  const story = first.locator('.tr-story');
  await expect(story).toContainText(
    'A r/selfhosted post flags this release: "Redis broke my dashboard" (2026-10-11)',
    { timeout: 20_000 },
  );
  // the r/redis thread is already cited inside the paragraph: not cited twice
  await expect(story).not.toContainText('A r/redis post names this version');
  const links = story.locator('a.tr-src[href^="https://www.reddit.com/"]');
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute(
    'href',
    'https://www.reddit.com/r/redis/comments/abc/',
  );
  await expect(links.nth(1)).toHaveAttribute(
    'href',
    'https://www.reddit.com/r/selfhosted/comments/def/',
  );
  await expect(links.nth(1)).toHaveText('(💬 source: Reddit)');
  await expect(first.locator('a.tr-tier-link')).toHaveAttribute(
    'href',
    'https://www.reddit.com/r/redis/comments/abc/',
  );
});
