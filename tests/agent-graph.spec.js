const { test, expect } = require('@playwright/test');

/*
 * The agent graph above the question box is LangGraph's drawMermaid() output
 * (GET /api/ask/graph) rendered with Mermaid, with node states driven by the
 * live progress events. The API is stubbed; only the client wiring is tested.
 */

const MERMAID = `graph TD;
	__start__([<p>__start__</p>]):::first
	Ask(Ask)
	Rewrite(Rewrite)
	Search(Search)
	Verify(Verify)
	Find_Facts_and_Artifacts(Find Facts and Artifacts)
	Evaluate(Evaluate)
	Orchestrate(Orchestrate)
	__end__([<p>__end__</p>]):::last
	__start__ --> Ask;
	Ask -.-> Rewrite;
	Ask -.-> Search;
	Search --> Verify;
	Verify --> Rewrite;
	Rewrite --> Find_Facts_and_Artifacts;
	Find_Facts_and_Artifacts --> Evaluate;
	Evaluate -.-> Find_Facts_and_Artifacts;
	Evaluate -.-> Orchestrate;
	Orchestrate --> __end__;
	classDef default fill:#f2f0ff,line-height:1.2;`;

async function stubApi(page) {
  await page.route(/\/api\//, (route) => {
    const url = route.request().url();
    if (/\/ask\/graph/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ engine: 'langgraph', mermaid: MERMAID }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

const nodeClass = (page, name) =>
  page.locator(`#askWorkflowDiagram g.node[id*="flowchart-${name}-"]`).getAttribute('class');

test('draws the LangGraph graph and colors only the agents that ran', async ({ page }) => {
  const faults = [];
  page.on('pageerror', (err) => faults.push(err.message));
  await stubApi(page);
  await page.goto('/');
  await expect(page.locator('#askWorkflowDiagram svg')).toBeVisible({ timeout: 30_000 });
  expect(await nodeClass(page, 'Find_Facts_and_Artifacts')).toContain('askwfg-idle');

  await page.evaluate(() => {
    startAskWorkflow('Which is more stable, Zoom or Teams?');
    pushAskWorkflowPhase('searching', '', 'multi_agent');
    pushAskWorkflowPhase('generating', '', 'multi_agent');
    // a comparison answer: one agent (Orchestrate); the document lookup is plain code
    askWorkflowAgentKeys = ['orchestrator'];
    finishAskWorkflow();
  });
  expect(await nodeClass(page, 'Ask')).toContain('askwfg-input');
  expect(await nodeClass(page, 'Find_Facts_and_Artifacts')).toContain('askwfg-input');
  expect(await nodeClass(page, 'Orchestrate')).toContain('askwfg-done');
  expect(await nodeClass(page, 'Search')).toContain('askwfg-skipped');
  expect(faults, faults.join('\n')).toHaveLength(0);
});

test('the run log is fixed to the bottom, newest line first, and minimizes', async ({ page }) => {
  await stubApi(page);
  await page.goto('/');
  await page.evaluate(() => {
    startAskWorkflow('q');
    pushAskWorkflowPhase('rewriting', '', 'multi_agent');
    pushAskWorkflowPhase('generating', '', 'multi_agent');
  });
  const log = page.locator('#askConsoleFixed');
  await expect(log).toBeVisible();
  await expect(log.locator('div').first()).toContainText('Generating');
  await log.locator('.ask-console-close').click();
  await expect(log).toHaveClass(/ask-console-min/);
  await log.locator('.ask-console-close').click();
  await expect(log).not.toHaveClass(/ask-console-min/);
});

test("every run-log line names the component in charge, and a vendor-only answer is the Ask step's own (2026-11-16)", async ({
  page,
}) => {
  await stubApi(page);
  await page.goto('/');
  await page.evaluate(() => {
    startAskWorkflow('Whats the latest microsoft version?');
    pushAskWorkflowPhase('vendor_only', 'microsoft', 'single_agent', {
      products: 5,
      guardrail: 'vendorOnlyReply',
    });
    pushAskWorkflowPhase('generating', 'deterministic', 'single_agent');
    finishAskWorkflow();
  });
  const lines = page.locator('#askConsoleFixed > div');
  // newest first: Done, Orchestrate, Ask (vendor check), Ask (question received)
  await expect(lines).toHaveCount(4);
  await expect(lines.nth(0)).toHaveText(/Done$/);
  await expect(lines.nth(0).locator('.ac-node')).toHaveCount(0);
  await expect(lines.nth(1).locator('.ac-node')).toHaveText('Orchestrate');
  await expect(lines.nth(1)).toContainText('Writing the answer in code, no model call');
  await expect(lines.nth(2).locator('.ac-node')).toHaveText('Ask');
  await expect(lines.nth(2)).toContainText(
    '"microsoft" is a vendor with 5 tracked products, not a product',
  );
  await expect(lines.nth(2)).toContainText('guardrail vendorOnlyReply');
  await expect(lines.nth(2)).toHaveClass(/ac-guardrail/); // a guardrail stepping in is red
  await expect(lines.nth(3).locator('.ac-node')).toHaveText('Ask');
  await expect(lines.nth(3)).toContainText('Question received');
  // the Ask box carries the decision too
  await expect(page.locator('#askWorkflowDiagram g.node[id*="flowchart-Ask-"]')).toContainText(
    'vendor only',
  );
  // the web-lookup variant (vendorWebProducts) says why and that it searched
  await page.evaluate(() => {
    pushAskWorkflowPhase('vendor_only', 'Adobe', 'single_agent', {
      products: 2,
      web: 2,
      guardrail: 'vendorWebProducts',
      trigger: 'vendor_not_tracked',
    });
  });
  await expect(lines.nth(0)).toContainText(
    '"Adobe" is not tracked, so 2 products were looked up online and listed (guardrail vendorWebProducts)',
  );
  await expect(lines.nth(0)).toHaveClass(/ac-guardrail/);
});

test('the component prefix follows the phase: Search/Verify for the web check, Find Facts and Artifacts for retrieval, Model for a provider fallback', async ({
  page,
}) => {
  await stubApi(page);
  await page.goto('/');
  await page.evaluate(() => {
    startAskWorkflow('q');
    pushAskWorkflowPhase('resolving_vendor', '', 'single_agent');
    pushAskWorkflowPhase('resolving_product', null, 'single_agent', {
      vendor: 'microsoft',
      status: 'vendor_only',
      products: 8,
    });
    pushAskWorkflowPhase('web_searching', '', 'single_agent');
    pushAskWorkflowPhase('web_verifying', '', 'single_agent');
    pushAskWorkflowPhase('searching', 'search_release_notes', 'single_agent');
    pushAskWorkflowPhase('provider_fallback', 'ollama', 'single_agent', {
      reason: 'unavailable',
      to: 'groq',
    });
    pushAskWorkflowPhase('note', null, 'single_agent', {
      node: 'Find_Facts_and_Artifacts',
      text: 'round 1: 3 documents',
      short: '3 docs',
    });
  });
  const pre = page.locator('#askConsoleFixed > div .ac-node');
  await expect(pre).toHaveText([
    'Find Facts and Artifacts',
    'Model',
    'Find Facts and Artifacts',
    'Verify',
    'Search',
    'Ask',
    'Ask',
    'Ask',
  ]);
  // the Ask step is two lines: the vendor name, then what that name is
  const askLines = page.locator('#askConsoleFixed > div');
  await expect(askLines.nth(6)).toContainText('Resolving vendor name');
  await expect(askLines.nth(5)).toContainText(
    'Resolving vendor product: none named for "microsoft" (8 tracked products)',
  );
  await expect(page.locator('#askConsoleFixed > div').nth(2)).toContainText(
    'Searching release notes',
  );
  // a provider fallback is a detour (amber), not a guardrail (red)
  await expect(page.locator('#askConsoleFixed > div').nth(1)).toHaveClass(/ac-warn/);
  await expect(page.locator('#askConsoleFixed > div').nth(1)).not.toHaveClass(/ac-guardrail/);
});
