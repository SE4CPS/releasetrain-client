const { test, expect } = require('@playwright/test');

/*
 * Update Triage (Arch view's 4th mode, next to Diagram/Table/Flowchart):
 * "here are my current installed software ... how would you recommend
 * updating them in which order? with reasoning", later "optimized by
 * stability, security, or both." Clicking Triage POSTs the currently
 * loaded component list to POST /api/ask/triage and renders the sorted,
 * reasoned result - see aRunTriage/aRenderTriageResult in arch.js.
 */

async function stubApi(page, triageResponse) {
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(triageResponse),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

test('clicking Triage sends the loaded components and renders a sorted, reasoned table', async ({
  page,
}) => {
  const triageResponse = {
    optimizeFor: 'both',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    results: [
      {
        name: 'Firefox',
        currentVersion: '100.0',
        latestVersion: '100.1',
        versionBump: 'patch',
        componentRiskType: 'Browser',
        cve: null,
        order: 1,
        reasoning: 'Low-risk patch, safe to apply first.',
      },
      {
        name: 'OpenSSL',
        currentVersion: '1.1.0',
        latestVersion: '3.0.0',
        versionBump: 'major',
        componentRiskType: 'OS/Hypervisor (foundational, higher blast radius if it breaks)',
        cve: { id: 'CVE-2023-1234', summary: 'Buffer overflow' },
        order: 2,
        reasoning: 'Known CVE, but a major bump on a foundational component needs staged testing.',
      },
    ],
  };
  await stubApi(page, triageResponse);
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  // `?view=arch` boots asynchronously (main.js: boot().then(...) awaits
  // aLoadPako() before its own aLoadAndRender() call renders the empty
  // state since no components are loaded yet) - waiting for #archView
  // alone does NOT mean that chain has finished. Racing it with the
  // override below intermittently lost under load (the real bug behind
  // an earlier "flaky" #a-triage failure): the app's own empty-state
  // render would land AFTER this test's override and silently clobber
  // it. Wait for the real empty state to actually show first, so the
  // override below always runs after boot has settled, never before.
  await expect(page.locator('#a-empty')).toBeVisible({ timeout: 20_000 });

  // Load the two components into A_VERSIONS the same shape aApplyInventory
  // produces, without going through a real inventory/search round trip.
  // aShowResult() is what a real load (aLoadAndRender/aLoadUpdatedToday)
  // calls to hide the "Add your own components to begin" empty state -
  // aSetMode() deliberately no-ops while that empty state is still
  // showing (see its own "empty state stays put" guard), so this has to
  // be called too, not just setting A_VERSIONS alone.
  await page.evaluate(() => {
    A_VERSIONS = [
      {
        name: 'Firefox',
        currentVersion: { versionNumber: '100.0' },
        latestVersion: { versionNumber: '100.1' },
      },
      {
        name: 'OpenSSL',
        currentVersion: { versionNumber: '1.1.0' },
        latestVersion: { versionNumber: '3.0.0' },
      },
    ];
    aShowResult();
  });

  // Diagram/Table/Flowchart/Triage are one <select> (#a-viewMode), not 4
  // separate buttons - picking "triage" fires the same aSetMode+aRunTriage
  // combo the old dedicated button used to.
  const viewMode = page.locator('#a-viewMode');
  await expect(viewMode).toBeVisible();
  const [triageRequest] = await Promise.all([
    page.waitForRequest((req) => /\/ask\/triage$/.test(req.url()) && req.method() === 'POST'),
    viewMode.selectOption('triage'),
  ]);
  const sentBody = JSON.parse(triageRequest.postData());
  expect(sentBody.optimizeFor).toBe('both');
  expect(sentBody.components).toEqual([
    { name: 'Firefox', version: '100.0' },
    { name: 'OpenSSL', version: '1.1.0' },
  ]);

  // The chip next to the mode select reflects the active mode, so it's
  // still visible at a glance without opening the dropdown.
  await expect(page.locator('#a-modeChip')).toHaveText('Triage');

  const triagePanel = page.locator('#a-triage');
  await expect(triagePanel).toBeVisible();
  await expect(triagePanel.locator('table.a-drift')).toBeVisible();
  const rows = triagePanel.locator('table.a-drift tbody tr');
  await expect(rows).toHaveCount(2);
  // Order 1 (Firefox) renders before order 2 (OpenSSL), matching the
  // server's own already-sorted response, not re-sorted client-side.
  await expect(rows.nth(0)).toContainText('Firefox');
  await expect(rows.nth(0)).toContainText('Low-risk patch, safe to apply first.');
  await expect(rows.nth(1)).toContainText('OpenSSL');
  await expect(rows.nth(1)).toContainText('CVE-2023-1234');
  await expect(rows.nth(1)).toContainText('needs staged testing');
});

test('changing "Optimize for" while a result is showing re-runs triage with the new weighting', async ({
  page,
}) => {
  const bothResponse = {
    optimizeFor: 'both',
    results: [
      {
        name: 'A',
        currentVersion: '1.0',
        latestVersion: '1.1',
        versionBump: 'patch',
        cve: null,
        order: 1,
        reasoning: 'Both-mode reasoning.',
      },
    ],
  };
  const securityResponse = {
    optimizeFor: 'security',
    results: [
      {
        name: 'A',
        currentVersion: '1.0',
        latestVersion: '1.1',
        versionBump: 'patch',
        cve: null,
        order: 1,
        reasoning: 'Security-mode reasoning.',
      },
    ],
  };
  let callCount = 0;
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      callCount += 1;
      const body = callCount === 1 ? bothResponse : securityResponse;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  // See the other test's comment: wait for boot's own async empty-state
  // render to actually land before overriding it, so the two don't race.
  await expect(page.locator('#a-empty')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    A_VERSIONS = [
      {
        name: 'A',
        currentVersion: { versionNumber: '1.0' },
        latestVersion: { versionNumber: '1.1' },
      },
    ];
    aShowResult();
  });

  await page.locator('#a-viewMode').selectOption('triage');
  await expect(page.locator('#a-triage')).toBeVisible();
  await expect(page.locator('#a-triage')).toContainText('Both-mode reasoning.');

  await page.locator('#a-triageOptimize').selectOption('security');
  await expect(page.locator('#a-triage')).toContainText('Security-mode reasoning.');
  expect(callCount).toBe(2);
});

test('loading a new component list while already in Triage mode can be re-run via a real button, not just the mode select', async ({
  page,
}) => {
  // Reported live, with a screenshot: picking a different machine while
  // already on Triage mode left a "Click Triage..." prompt with no way
  // to actually trigger it - the ONLY existing trigger was the mode
  // <select>'s own "change" event (switching INTO triage from something
  // else), which never fires again just because the underlying
  // component list changed. aLoadAndRender() already correctly
  // invalidates A_TRIAGE_RESULTS and re-shows the prompt when new data
  // loads while in Triage mode - the missing piece was a real, clickable
  // way to run it from that fresh prompt.
  const requests = [];
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      requests.push(JSON.parse(route.request().postData()));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          optimizeFor: 'both',
          results: [
            {
              name: 'First',
              currentVersion: '1.0',
              latestVersion: '1.0',
              versionBump: 'patch',
              cve: null,
              order: 1,
              reasoning: 'r',
            },
          ],
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#a-empty')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    A_VERSIONS = [
      {
        name: 'First',
        currentVersion: { versionNumber: '1.0' },
        latestVersion: { versionNumber: '1.0' },
      },
    ];
    aShowResult();
  });

  await page.locator('#a-viewMode').selectOption('triage');
  await expect(page.locator('#a-triage')).toContainText('First');
  expect(requests).toHaveLength(1);

  // Simulate what aLoadAndRender() does when a NEW stack/search loads
  // while already in Triage mode: new A_VERSIONS, results invalidated,
  // fresh prompt re-shown - without ever touching #a-viewMode's own value.
  await page.evaluate(() => {
    A_VERSIONS = [
      {
        name: 'Second',
        currentVersion: { versionNumber: '2.0' },
        latestVersion: { versionNumber: '2.0' },
      },
    ];
    A_TRIAGE_RESULTS = null;
    aRenderTriagePrompt();
  });
  const runBtn = page.locator('#a-triage .a-run-triage-btn');
  await expect(runBtn).toBeVisible();
  await expect(page.locator('#a-triage')).toContainText('these 1 component(s)');

  await Promise.all([
    page.waitForRequest((req) => /\/ask\/triage$/.test(req.url()) && req.method() === 'POST'),
    runBtn.click(),
  ]);
  expect(requests).toHaveLength(2);
  expect(requests[1].components).toEqual([{ name: 'Second', version: '2.0' }]);
});

test('a visible spinner shows while a Triage request is in flight', async ({ page }) => {
  // Reported live: "if something is working show a spinner." #a-loader
  // already existed but lived inside .a-canvas, which this app hides
  // (display:none) whenever any mode other than Diagram is active -
  // toggling its own display had no visible effect while in Triage mode.
  await page.route(/\/api\//, async (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      await new Promise((r) => setTimeout(r, 300)); // hold the response open briefly
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          optimizeFor: 'both',
          results: [
            {
              name: 'A',
              currentVersion: '1',
              latestVersion: '1',
              versionBump: 'patch',
              cve: null,
              order: 1,
              reasoning: 'r',
            },
          ],
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#a-empty')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    A_VERSIONS = [
      { name: 'A', currentVersion: { versionNumber: '1' }, latestVersion: { versionNumber: '1' } },
    ];
    aShowResult();
  });

  await page.locator('#a-viewMode').selectOption('triage');
  // toBeVisible() checks real computed visibility (including an ancestor
  // display:none), not just the element's own inline style - this is
  // exactly the check that would have caught the original bug.
  await expect(page.locator('#a-loader')).toBeVisible();
  await expect(page.locator('#a-triage table.a-drift')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#a-loader')).toBeHidden();
});

test('a failed Triage request shows a real Retry button, not just an error message', async ({
  page,
}) => {
  let callCount = 0;
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (/\/ask\/triage$/.test(url)) {
      callCount += 1;
      if (callCount === 1) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'boom' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          optimizeFor: 'both',
          results: [
            {
              name: 'A',
              currentVersion: '1',
              latestVersion: '1',
              versionBump: 'patch',
              cve: null,
              order: 1,
              reasoning: 'r',
            },
          ],
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#a-empty')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    A_VERSIONS = [
      { name: 'A', currentVersion: { versionNumber: '1' }, latestVersion: { versionNumber: '1' } },
    ];
    aShowResult();
  });

  await page.locator('#a-viewMode').selectOption('triage');
  await expect(page.locator('#a-triage')).toContainText('Could not run triage');
  const retryBtn = page.locator('#a-triage .a-run-triage-btn');
  await expect(retryBtn).toBeVisible();
  await retryBtn.click();
  await expect(page.locator('#a-triage table.a-drift')).toBeVisible();
  expect(callCount).toBe(2);
});

test('picking a machine stack keeps it selected after "+ Add Stack", not reset to the placeholder', async ({
  page,
}) => {
  // Reported live: "when i pick a vm keep it selected until i change it."
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/?view=arch', { waitUntil: 'load' });
  await expect(page.locator('#archView')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const sel = document.getElementById('a-stackSelect');
    const opt = document.createElement('option');
    opt.value = 'firefox,chrome';
    opt.textContent = 'test-machine (2)';
    sel.appendChild(opt);
    sel.value = 'firefox,chrome';
  });
  await page.locator('#a-addStackBtn').click();
  await expect(page.locator('#a-stackSelect')).toHaveValue('firefox,chrome');
});
