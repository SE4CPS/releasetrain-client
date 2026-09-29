const { test, expect } = require('@playwright/test');

/*
 * The Sources tab's "Artifact" group (see askArtifactUrl/askRenderSources
 * in ask-workflow.js): lifts a Documented source out into its own group,
 * at the top, when it actually has a real download behind it (a CVE's
 * own patchUrl, or a release whose url already points at a specific
 * commit/tag archive) - reported live: "where is the specific artifact
 * link, link to the specific code not the generic github page". A bare
 * github.com/{owner}/{repo} url counts too (see githubHeadZipUrl): a
 * screenshot of GitHub's own "Code > Download ZIP" button on that exact
 * page proved saying "no artifact" for an ordinary repo link was simply
 * wrong, so it's rewritten to a real archive/HEAD.zip download instead.
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test('a CVE with a patchUrl and a release with a commit url are lifted into Artifact', async ({
  page,
}) => {
  const html = await page.evaluate(() => {
    const sources = [
      {
        kind: 'cve',
        title: 'CVE-2026-1',
        date: '20260101',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1',
        patchUrl: 'https://vendor.example/advisory/CVE-2026-1',
      },
      {
        kind: 'release',
        title: 'linux 7.2.0',
        date: '20260927',
        url: 'https://github.com/torvalds/linux/commit/abc123',
      },
      {
        kind: 'release',
        title: 'gimp 3.0.0',
        date: '20260719',
        url: 'https://some-vendor.example/gimp/releases',
      },
    ];
    return askRenderSources(sources, null, null);
  });
  // Artifact group exists and comes before Documented in the markup.
  const artifactIdx = html.indexOf('Artifact');
  const documentedIdx = html.indexOf('Documented');
  expect(artifactIdx).toBeGreaterThan(-1);
  expect(documentedIdx).toBeGreaterThan(-1);
  expect(artifactIdx).toBeLessThan(documentedIdx);
  // The CVE's Artifact link uses patchUrl, not the generic NVD page.
  expect(html).toContain('href="https://vendor.example/advisory/CVE-2026-1"');
  // The commit-linked release is in Artifact too.
  expect(html).toContain('href="https://github.com/torvalds/linux/commit/abc123"');
  // The non-github, non-commit/archive release has no known artifact
  // download and stays out of Artifact, shown under Documented instead.
  const genericIdx = html.indexOf('href="https://some-vendor.example/gimp/releases"');
  expect(genericIdx).toBeGreaterThan(documentedIdx);
});

test('a bare github.com repo url is rewritten to a real archive/HEAD.zip download', async ({
  page,
}) => {
  // Reported live, with a screenshot of GitHub's own "Download ZIP"
  // button on that exact page: this used to be treated as "no artifact"
  // just because the url had no /commit/ or /archive/ segment, which
  // was simply not true.
  const html = await page.evaluate(() => {
    const sources = [
      {
        kind: 'release',
        title: 'linux 7.1.0',
        date: '20260719',
        url: 'https://github.com/torvalds/linux',
      },
    ];
    return askRenderSources(sources, null, null);
  });
  expect(html.indexOf('Artifact')).toBeGreaterThan(-1);
  expect(html).toContain('href="https://github.com/torvalds/linux/archive/HEAD.zip"');
  expect(html).not.toContain('Documented');
});

test('a release whose url is a tagged-release archive is also lifted into Artifact', async ({
  page,
}) => {
  // github.py's normal (non-rc) case: a real GitHub tag archive, not a
  // specific commit - "they point the github project not the branch
  // tag zip or tar file" was the real, reported gap this fixes.
  const html = await page.evaluate(() => {
    const sources = [
      {
        kind: 'release',
        title: 'linux 7.2.0',
        date: '20260927',
        url: 'https://github.com/torvalds/linux/archive/refs/tags/v7.2.0.tar.gz',
      },
    ];
    return askRenderSources(sources, null, null);
  });
  expect(html.indexOf('Artifact')).toBeGreaterThan(-1);
  expect(html).toContain(
    'href="https://github.com/torvalds/linux/archive/refs/tags/v7.2.0.tar.gz"',
  );
  expect(html).not.toContain('Documented');
});

test('a "web" search result that is a real vendor installer or app store listing is lifted into Artifact', async ({
  page,
}) => {
  // Reported live, with a real, verified example (statics.teams.cdn.
  // office.net/.../MSTeamsSetup.exe, confirmed 200 OK): a product with
  // no public code repo (Microsoft Teams) has no GitHub tag/commit to
  // point at, so the real artifact only ever shows up as a search_web
  // result (kind:"web") - a generic vendor "download" landing page
  // still doesn't count (no direct file, no app-store listing), and
  // must stay out of Artifact and out of Discussion both (it would
  // otherwise render twice, once in each).
  const html = await page.evaluate(() => {
    const sources = [
      {
        kind: 'web',
        title: 'Download Microsoft Teams',
        date: null,
        url: 'https://statics.teams.cdn.office.net/production-windows-x86/lkg/MSTeamsSetup.exe',
      },
      {
        kind: 'web',
        title: 'Microsoft Teams on the App Store',
        date: null,
        url: 'https://apps.apple.com/us/app/microsoft-teams/id1113153706',
      },
      {
        kind: 'web',
        title: 'Microsoft Teams | Download',
        date: null,
        url: 'https://www.microsoft.com/en-us/microsoft-teams/download-app',
      },
    ];
    return askRenderSources(sources, null, null);
  });
  const artifactIdx = html.indexOf('Artifact');
  const discussionIdx = html.indexOf('Discussion');
  expect(artifactIdx).toBeGreaterThan(-1);
  expect(html).toContain(
    'href="https://statics.teams.cdn.office.net/production-windows-x86/lkg/MSTeamsSetup.exe"',
  );
  expect(html).toContain('href="https://apps.apple.com/us/app/microsoft-teams/id1113153706"');
  // Each real artifact link appears exactly once, not duplicated into Discussion too.
  expect(html.split('MSTeamsSetup.exe').length - 1).toBe(1);
  expect(html.split('id1113153706').length - 1).toBe(1);
  // The generic "download" landing page (no installer file, no app
  // store) isn't a recognized artifact and stays in Discussion.
  expect(discussionIdx).toBeGreaterThan(-1);
  const genericIdx = html.indexOf(
    'href="https://www.microsoft.com/en-us/microsoft-teams/download-app"',
  );
  expect(genericIdx).toBeGreaterThan(discussionIdx);
});

test('Artifact still renders, with an explicit "none found" message, when nothing qualifies', async ({
  page,
}) => {
  // Reported live: the section disappearing entirely when nothing
  // qualified read as "missing," not as "checked, found nothing" - per
  // repeated direct request, it always renders, first, even empty.
  const html = await page.evaluate(() => {
    const sources = [
      {
        kind: 'cve',
        title: 'CVE-2026-2',
        date: '20260101',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-2',
      },
      {
        kind: 'release',
        title: 'zoom 7.2.2',
        date: '20260924',
        url: 'https://some-vendor.example/zoom/releases',
      },
    ];
    return askRenderSources(sources, null, null);
  });
  const artifactIdx = html.indexOf('Artifact');
  const documentedIdx = html.indexOf('Documented');
  expect(artifactIdx).toBeGreaterThan(-1);
  expect(documentedIdx).toBeGreaterThan(-1);
  expect(artifactIdx).toBeLessThan(documentedIdx);
  expect(html).toContain('No verified artifact link');
});
