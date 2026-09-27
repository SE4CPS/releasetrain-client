const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const GRAPH =
  process.env.RT_GRAPH_JSON && fs.existsSync(process.env.RT_GRAPH_JSON)
    ? fs.readFileSync(process.env.RT_GRAPH_JSON, 'utf8')
    : null;

for (const width of [1024, 1300, 1833, 2560]) {
  for (const collapsed of [false, true]) {
    test(`pipeline fills and is centered at ${width}px${collapsed ? ' (sidebar collapsed)' : ''}`, async ({
      page,
    }) => {
      test.skip(!GRAPH, 'set RT_GRAPH_JSON to a saved /api/ask/graph response');
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((c) => {
        if (c) localStorage.setItem('rt.sidebar', 'collapsed');
      }, collapsed);
      await page.route(/\/api\/ask\/graph/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: GRAPH }),
      );
      await page.route(/\/api\/(?!ask\/graph)/, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
      );
      await page.goto('/');
      const svg = page.locator('#askWorkflowDiagram svg');
      await expect(svg).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const box = (e) => e.getBoundingClientRect();
        const host = box(document.getElementById('stickyAskHeader'));
        const svgB = box(document.querySelector('#askWorkflowDiagram svg'));
        const form = box(
          document.querySelector('#askFormDesktopSlot #askForm, #askFormDesktopSlot'),
        );
        return {
          hostL: host.left,
          hostW: host.width,
          svgL: svgB.left,
          svgW: svgB.width,
          formL: form.left,
          formW: form.width,
        };
      });
      const hostCenter = m.hostL + m.hostW / 2;
      expect(m.svgW).toBeGreaterThan((m.hostW - 48) * 0.85);
      expect(Math.abs(m.svgL + m.svgW / 2 - hostCenter)).toBeLessThan(8);
      expect(Math.abs(m.formL + m.formW / 2 - hostCenter)).toBeLessThan(8);
    });
  }
}
