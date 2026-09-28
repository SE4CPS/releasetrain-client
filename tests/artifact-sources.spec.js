const { test, expect } = require('@playwright/test');

/*
 * The Sources tab's "Artifact" group (see askArtifactUrl/askRenderSources
 * in ask-workflow.js): lifts a Documented source out into its own group,
 * at the top, when it actually has a specific code artifact behind it
 * (a CVE's own patchUrl, or a release whose url already points at a
 * specific commit) - reported live: "where is the specific artifact
 * link, link to the specific code not the generic github page".
 */

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/');
});

test('a CVE with a patchUrl and a release with a commit url are lifted into Artifact', async ({ page }) => {
  const html = await page.evaluate(() => {
    const sources = [
      { kind: 'cve', title: 'CVE-2026-1', date: '20260101', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1', patchUrl: 'https://vendor.example/advisory/CVE-2026-1' },
      { kind: 'release', title: 'linux 7.2.0', date: '20260927', url: 'https://github.com/torvalds/linux/commit/abc123' },
      { kind: 'release', title: 'linux 7.1.0', date: '20260719', url: 'https://github.com/torvalds/linux' },
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
  // The generic-repo release (no commit in its url) stays out of Artifact,
  // still shown under Documented with its own (generic) url.
  const genericIdx = html.indexOf('href="https://github.com/torvalds/linux"');
  expect(genericIdx).toBeGreaterThan(documentedIdx);
});

test('a release whose url is a tagged-release archive is also lifted into Artifact', async ({ page }) => {
  // github.py's normal (non-rc) case: a real GitHub tag archive, not a
  // specific commit - "they point the github project not the branch
  // tag zip or tar file" was the real, reported gap this fixes.
  const html = await page.evaluate(() => {
    const sources = [
      { kind: 'release', title: 'linux 7.2.0', date: '20260927', url: 'https://github.com/torvalds/linux/archive/refs/tags/v7.2.0.tar.gz' },
    ];
    return askRenderSources(sources, null, null);
  });
  expect(html.indexOf('Artifact')).toBeGreaterThan(-1);
  expect(html).toContain('href="https://github.com/torvalds/linux/archive/refs/tags/v7.2.0.tar.gz"');
  expect(html).not.toContain('Documented');
});

test('no Artifact group when nothing has a specific artifact link', async ({ page }) => {
  const html = await page.evaluate(() => {
    const sources = [
      { kind: 'cve', title: 'CVE-2026-2', date: '20260101', url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-2' },
      { kind: 'release', title: 'zoom 7.2.2', date: '20260924', url: 'https://github.com/zoom/zoom' },
    ];
    return askRenderSources(sources, null, null);
  });
  expect(html).not.toContain('Artifact');
  expect(html).toContain('Documented');
});
