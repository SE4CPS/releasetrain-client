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
	Retrieve(Retrieve)
	Evaluate(Evaluate)
	Orchestrate(Orchestrate)
	__end__([<p>__end__</p>]):::last
	__start__ --> Ask;
	Ask -.-> Rewrite;
	Ask -.-> Search;
	Search --> Verify;
	Verify --> Rewrite;
	Rewrite --> Retrieve;
	Retrieve --> Evaluate;
	Evaluate -.-> Retrieve;
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
  expect(await nodeClass(page, 'Retrieve')).toContain('askwfg-idle');

  await page.evaluate(() => {
    startAskWorkflow('Which is more stable, Zoom or Teams?');
    pushAskWorkflowPhase('searching', '', 'multi_agent');
    pushAskWorkflowPhase('generating', '', 'multi_agent');
    // a comparison answer: one agent (Orchestrate); the document lookup is plain code
    askWorkflowAgentKeys = ['orchestrator'];
    finishAskWorkflow();
  });
  expect(await nodeClass(page, 'Ask')).toContain('askwfg-input');
  expect(await nodeClass(page, 'Retrieve')).toContain('askwfg-input');
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
