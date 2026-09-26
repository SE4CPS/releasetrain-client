// eval.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    /* ── Eval Rewriter (admin-only) ──────────────────────────────
       No LLM grading picks a winner here -- see runRewriterAbEval's
       own comment in ask.js for why (the earlier promptfoo-based Eval
       page was removed this session for exactly the memory cost a
       second automated judge risks repeating). Both real evidence
       lists render via the same askRenderSources the Ask feature
       itself uses, side by side, for a human to read directly. */
    let ER_ACTIVE = false;
    function activateEvalRewriter() {
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      ER_ACTIVE = true;
      setViewParam("eval-rewriter");
      setDisplay(document.getElementById("evalRewriterView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("evalRewriterControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.evalRewriterLink.classList.add("nav-active");
    }
    function deactivateEvalRewriter() {
      ER_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("evalRewriterView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("evalRewriterControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.evalRewriterLink.classList.remove("nav-active");
    }
    EL.evalRewriterLink.addEventListener("click", e => {
      e.preventDefault();
      if (ER_ACTIVE) { deactivateEvalRewriter(); return; }
      activateEvalRewriter();
    });

    /* ── Eval Evaluator (admin-only) ──────────────────────────────
       Same reasoning and shape as Eval Rewriter above: no LLM grading,
       just the real raw model output next to the deterministic override
       that can replace it in production, for a human to read directly.
       See runEvaluatorEval's own comment in ask.js. */
    let EE_ACTIVE = false;
    function activateEvalEvaluator() {
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      EE_ACTIVE = true;
      setViewParam("eval-evaluator");
      setDisplay(document.getElementById("evalEvaluatorView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("evalEvaluatorControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.evalEvaluatorLink.classList.add("nav-active");
    }
    function deactivateEvalEvaluator() {
      EE_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("evalEvaluatorView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("evalEvaluatorControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.evalEvaluatorLink.classList.remove("nav-active");
    }
    EL.evalEvaluatorLink.addEventListener("click", e => {
      e.preventDefault();
      if (EE_ACTIVE) { deactivateEvalEvaluator(); return; }
      activateEvalEvaluator();
    });

    /* ── Eval Orchestrator (admin-only) ───────────────────────────
       Same reasoning and shape again: the Orchestrator's own raw
       generated answer next to the final answer after the deterministic
       version-correctness check can replace it. See runOrchestratorEval's
       own comment in ask.js. */
    let EO_ACTIVE = false;
    function activateEvalOrchestrator() {
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      EO_ACTIVE = true;
      setViewParam("eval-orchestrator");
      setDisplay(document.getElementById("evalOrchestratorView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("evalOrchestratorControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.evalOrchestratorLink.classList.add("nav-active");
    }
    function deactivateEvalOrchestrator() {
      EO_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("evalOrchestratorView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("evalOrchestratorControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.evalOrchestratorLink.classList.remove("nav-active");
    }
    EL.evalOrchestratorLink.addEventListener("click", e => {
      e.preventDefault();
      if (EO_ACTIVE) { deactivateEvalOrchestrator(); return; }
      activateEvalOrchestrator();
    });

    async function erSampleQuestion() {
      const status = document.getElementById("erStatus");
      status.textContent = "Sampling a real question…";
      try {
        const res = await uaRequest("eval-rewriter/sample");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        if (!data.question) { status.textContent = "No sample-able question found. Try again."; return; }
        document.getElementById("erQuestion").value = data.question;
        status.textContent = data.subreddit ? `Sampled from r/${data.subreddit}.` : "Sampled.";
      } catch (e) {
        status.textContent = friendlyFetchError(e).headline;
      }
    }

    // Same "dedupe by URL, title when a source has none" key
    // askRenderCompareBody's own mergedSources already uses.
    function erSourceKey(s) { return s.url || s.title || ""; }
    function erSplitCommonDelta(withSources, withoutSources) {
      const wKeys = new Set(withSources.map(erSourceKey));
      const woKeys = new Set(withoutSources.map(erSourceKey));
      return {
        common: withSources.filter(s => woKeys.has(erSourceKey(s))),
        onlyWith: withSources.filter(s => !woKeys.has(erSourceKey(s))),
        onlyWithout: withoutSources.filter(s => !wKeys.has(erSourceKey(s))),
      };
    }

    // A long ISO timestamp ("2025-12-14T10:03:28") is hard to compare
    // across a list at a glance; "Nd ago" (or "today") is not, and is
    // all this page actually needs it for. null/unparseable dates
    // (every 'web' source: webSearch.js never sets one) render as "".
    // A future-dated one (isVendorPublished content posted ahead of its
    // own release date) shows "in Nd" instead of a confusing negative.
    function erDaysAgoLabel(dateStr) {
      if (!dateStr) return "";
      const d = new Date(dateStr);
      if (isNaN(d)) return "";
      const days = Math.floor((Date.now() - d.getTime()) / 86400000);
      if (days === 0) return "today";
      return days > 0 ? `${days}d ago` : `in ${-days}d`;
    }
    // Sorts newest-first (undated sources last, so they don't scatter
    // through an otherwise chronological list) and swaps each source's
    // own long date string for the short relative label above. Both were
    // asked for together, so a reader can scan a list top-to-bottom in
    // real chronological order instead of hunting for the newest one.
    function erPrep(sources) {
      return [...sources]
        .sort((a, b) => {
          const ta = a.date ? new Date(a.date).getTime() : -Infinity;
          const tb = b.date ? new Date(b.date).getTime() : -Infinity;
          return (isNaN(tb) ? -Infinity : tb) - (isNaN(ta) ? -Infinity : ta);
        })
        .map(s => ({ ...s, date: erDaysAgoLabel(s.date) }));
    }

    async function erRunComparison() {
      const question = document.getElementById("erQuestion").value.trim();
      if (!question) { document.getElementById("erStatus").textContent = "Type or sample a question first."; return; }
      const runBtn = document.getElementById("erRunBtn");
      const status = document.getElementById("erStatus");
      const results = document.getElementById("erResults");
      runBtn.disabled = true;
      status.textContent = "Running both retrievals…";
      results.innerHTML = "";
      try {
        const res = await uaRequest("eval-rewriter/run", { method: "POST", body: JSON.stringify({ question }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        status.textContent = `Vendor: ${data.vendor || "none resolved"}${data.intent ? " · Intent: " + data.intent : ""}`;

        const withSources = data.withRewriter.sources;
        const withoutSources = data.withoutRewriter.sources;
        const { common, onlyWith, onlyWithout } = erSplitCommonDelta(withSources, withoutSources);

        const commonHtml = common.length
          ? askRenderSourceItems(erPrep(common), true)
          : `<p class="ask-muted">No overlapping sources between the two runs.</p>`;

        // With = onlyWith + common, Without = onlyWithout + common: the
        // Delta and Common sections below already fully reconstruct both
        // full lists between them, just organized by what actually
        // differs instead of repeating the overlap twice. Only their
        // summary counts are worth restating on their own; the full
        // lists themselves were pure duplication of content already
        // shown once, reported live as "too much."
        const summaryLine = `With Rewriter: ${data.withRewriter.toolCallsUsed} tool call(s), ${withSources.length} source(s) &middot; `
          + `Without: ${data.withoutRewriter.toolCallsUsed} tool call(s), ${withoutSources.length} source(s)`;

        results.innerHTML = `<div class="er-compare">
          <div class="st-216 ask-answer-card" >
            <div class="ask-answer-label">Prompt</div>
            <p class="st-217 ask-muted" >Rewriter Prompt: ${uaEsc(data.rewriterTerms.join(", "))}</p>
          </div>
          <div class="st-216 ask-answer-card" >
            <div class="ask-answer-label">Sources</div>
            <p class="st-218 ask-muted" >${summaryLine}</p>
            <div class="st-219 er-grid" >
              <div>
                <div class="ask-source-heading">With Rewrite (${onlyWith.length})</div>
                ${onlyWith.length ? askRenderSourceItems(erPrep(onlyWith), true) : `<p class="ask-muted">None.</p>`}
              </div>
              <div>
                <div class="ask-source-heading">Without Rewrite (${onlyWithout.length})</div>
                ${onlyWithout.length ? askRenderSourceItems(erPrep(onlyWithout), true) : `<p class="ask-muted">None.</p>`}
              </div>
            </div>
          </div>
          <details class="ask-answer-card">
            <summary class="st-220 ask-answer-label" >Common (${common.length}): found on both sides</summary>
            <div class="st-221" >${commonHtml}</div>
          </details>
        </div>`;
      } catch (e) {
        status.textContent = friendlyFetchError(e).headline;
      } finally {
        runBtn.disabled = false;
      }
    }

    document.getElementById("erSampleBtn").addEventListener("click", erSampleQuestion);
    document.getElementById("erRunBtn").addEventListener("click", erRunComparison);

    /* ── Eval Evaluator (admin-only) ──────────────────────────────
       Reuses GET /api/eval-rewriter/sample (see its own comment: not
       specific to any one eval page) and the same erPrep/erDaysAgoLabel
       date handling and askRenderSourceItems flat rendering Eval
       Rewriter already established. */
    async function eeSampleQuestion() {
      const status = document.getElementById("eeStatus");
      status.textContent = "Sampling a real question…";
      try {
        const res = await uaRequest("eval-rewriter/sample");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        if (!data.question) { status.textContent = "No sample-able question found. Try again."; return; }
        document.getElementById("eeQuestion").value = data.question;
        status.textContent = data.subreddit ? `Sampled from r/${data.subreddit}.` : "Sampled.";
      } catch (e) {
        status.textContent = friendlyFetchError(e).headline;
      }
    }

    function eeRenderVerdict(label, verdict) {
      const icon = verdict.sufficient ? "✅" : "⛔";
      return `<div class="ask-answer-card">
        <div class="ask-answer-label">${uaEsc(label)}</div>
        <p class="st-222" >${icon} ${verdict.sufficient ? "Sufficient" : "Insufficient"}</p>
        <p class="st-217 ask-muted" >${uaEsc(verdict.reason || "")}</p>
      </div>`;
    }

    async function eeRunComparison() {
      const question = document.getElementById("eeQuestion").value.trim();
      if (!question) { document.getElementById("eeStatus").textContent = "Type or sample a question first."; return; }
      const runBtn = document.getElementById("eeRunBtn");
      const status = document.getElementById("eeStatus");
      const results = document.getElementById("eeResults");
      runBtn.disabled = true;
      status.textContent = "Running retrieval and the Evaluator…";
      results.innerHTML = "";
      try {
        const res = await uaRequest("eval-evaluator/run", { method: "POST", body: JSON.stringify({ question }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        status.textContent = `Vendor: ${data.vendor || "none resolved"}${data.intent ? " · Intent: " + data.intent : ""}`
          + (data.overridden ? " · Overridden by the deterministic check" : " · Not overridden, the model's own verdict stood");

        results.innerHTML = `<div class="er-compare">
          <div class="st-216 ask-answer-card" >
            <div class="ask-answer-label">Prompt</div>
            <p class="st-217 ask-muted" >Rewriter Prompt: ${uaEsc(data.rewriterTerms.join(", "))}</p>
          </div>
          <div class="st-216 ask-answer-card" >
            <div class="ask-answer-label">Sources (${data.sources.length})</div>
            ${data.sources.length ? askRenderSourceItems(erPrep(data.sources)) : `<p class="ask-muted">None.</p>`}
          </div>
          <div class="er-grid">
            ${eeRenderVerdict("Raw Evaluator Verdict", data.rawVerdict)}
            ${eeRenderVerdict("Final Verdict", data.finalVerdict)}
          </div>
        </div>`;
      } catch (e) {
        status.textContent = friendlyFetchError(e).headline;
      } finally {
        runBtn.disabled = false;
      }
    }

    document.getElementById("eeSampleBtn").addEventListener("click", eeSampleQuestion);
    document.getElementById("eeRunBtn").addEventListener("click", eeRunComparison);

    /* ── Eval Orchestrator (admin-only) ───────────────────────────
       Same shared helpers as Eval Evaluator above. */
    async function eoSampleQuestion() {
      const status = document.getElementById("eoStatus");
      status.textContent = "Sampling a real question…";
      try {
        const res = await uaRequest("eval-rewriter/sample");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        if (!data.question) { status.textContent = "No sample-able question found. Try again."; return; }
        document.getElementById("eoQuestion").value = data.question;
        status.textContent = data.subreddit ? `Sampled from r/${data.subreddit}.` : "Sampled.";
      } catch (e) {
        status.textContent = friendlyFetchError(e).headline;
      }
    }

    function eoRenderAnswer(label, text) {
      return `<div class="ask-answer-card">
        <div class="ask-answer-label">${uaEsc(label)}</div>
        <p class="st-223" >${uaEsc(text)}</p>
      </div>`;
    }

    async function eoRunComparison() {
      const question = document.getElementById("eoQuestion").value.trim();
      if (!question) { document.getElementById("eoStatus").textContent = "Type or sample a question first."; return; }
      const runBtn = document.getElementById("eoRunBtn");
      const status = document.getElementById("eoStatus");
      const results = document.getElementById("eoResults");
      runBtn.disabled = true;
      status.textContent = "Running retrieval, the Evaluator, and the Orchestrator…";
      results.innerHTML = "";
      try {
        const res = await uaRequest("eval-orchestrator/run", { method: "POST", body: JSON.stringify({ question }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        status.textContent = `Vendor: ${data.vendor || "none resolved"}${data.intent ? " · Intent: " + data.intent : ""}`
          + (data.abstained ? " · Evaluator gate abstained, nothing for the Orchestrator to write from"
             : data.overridden ? " · Overridden by the deterministic version check" : " · Not overridden, the model's own answer stood");

        const answerHtml = data.abstained
          ? `<div class="ask-answer-card"><div class="ask-answer-label">Answer</div><p class="st-223" >${uaEsc(data.finalAnswer)}</p></div>`
          : `<div class="er-grid">
              ${eoRenderAnswer("Raw Orchestrator Answer", data.rawAnswer)}
              ${eoRenderAnswer("Final Answer", data.finalAnswer)}
            </div>`;

        results.innerHTML = `<div class="er-compare">
          <div class="st-216 ask-answer-card" >
            <div class="ask-answer-label">Prompt</div>
            <p class="st-217 ask-muted" >Rewriter Prompt: ${uaEsc(data.rewriterTerms.join(", "))}</p>
          </div>
          <div class="st-216 ask-answer-card" >
            <div class="ask-answer-label">Sources (${data.sources.length})</div>
            ${data.sources.length ? askRenderSourceItems(erPrep(data.sources)) : `<p class="ask-muted">None.</p>`}
          </div>
          ${answerHtml}
        </div>`;
      } catch (e) {
        status.textContent = friendlyFetchError(e).headline;
      } finally {
        runBtn.disabled = false;
      }
    }

    document.getElementById("eoSampleBtn").addEventListener("click", eoSampleQuestion);
    document.getElementById("eoRunBtn").addEventListener("click", eoRunComparison);
