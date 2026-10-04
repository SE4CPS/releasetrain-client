const { test, expect } = require('@playwright/test');

/*
 * mdLite (ask-workflow.js) renders a real GFM pipe-table into an actual
 * <table>, not literal "|" text - added for Update Triage's own priority
 * table (formatTriageAnswer, releasetrain-server's ask.js), "the answer
 * should be a priority table with reasoning," reported live. Generic:
 * any answer using this same markdown table shape renders this way.
 */

async function stubApi(page) {
  await page.route(/\/api\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
}

test('a GFM pipe table renders as a real <table>, with the separator row consumed (not shown as a data row)', async ({
  page,
}) => {
  await stubApi(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });

  const html = await page.evaluate(() =>
    mdLite(
      'Here is the order:\n\n| # | Component | Reasoning |\n|---|---|---|\n| 1 | Firefox | Low risk. |\n| 2 | OpenSSL | Known CVE. |',
    ),
  );
  await page.setContent(`<div id="t">${html}</div>`);
  const table = page.locator('#t table.ask-answer-table');
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveText(['#', 'Component', 'Reasoning']);
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('td')).toHaveText(['1', 'Firefox', 'Low risk.']);
  await expect(rows.nth(1).locator('td')).toHaveText(['2', 'OpenSSL', 'Known CVE.']);
  // The lead-in prose line stays a normal paragraph, not swallowed into the table.
  await expect(page.locator('#t p')).toHaveText('Here is the order:');
});

test('text before and after a table block still renders normally', async ({ page }) => {
  await stubApi(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('#askForm')).toBeVisible({ timeout: 20_000 });

  const html = await page.evaluate(() =>
    mdLite('Intro line.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nOutro line.'),
  );
  await page.setContent(`<div id="t">${html}</div>`);
  const text = await page.locator('#t').innerText();
  expect(text).toContain('Intro line.');
  expect(text).toContain('Outro line.');
  await expect(page.locator('#t table.ask-answer-table tbody tr')).toHaveCount(1);
});
