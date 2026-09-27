// ask-rail.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    // ── Inline answer rail ──────────────────────────────────────
    // A real question's answer shown beside the feed instead of in the
    // popup modal, when there's room for it. "Compare all 3" and
    // narrow screens still use the modal (see the submit handler).
    // ASK_RAIL_MIN_WIDTH must match the media query in the CSS above
    // (.layout.has-ask-rail), two numbers, not one shared constant,
    // since CSS can't read a JS value; kept in sync by this comment.
    const ASK_RAIL_MIN_WIDTH = 900;
    const ASK_RAIL_ANSWER_TRIM = 480; // chars: short enough for a ~360px column, long enough to be useful
    const askRailMql = window.matchMedia(`(min-width: ${ASK_RAIL_MIN_WIDTH}px)`);
    function canUseAskRail() {
      return askRailMql.matches;
    }
    // Moves the real #askOptionsPanel node (never a clone; appendChild/
    // insertBefore on a node already in the document relocates it,
    // preserving every listener and its element identity) between the
    // topbar's .ask-options-row and the persistent #sidebar (see its own
    // CSS) as the viewport crosses ASK_RAIL_MIN_WIDTH, per explicit
    // request ("left are the controls and everything"): the agentic-AI-
    // specific controls (model/size/pipeline, the evidence-gating
    // toggles) live on the left with the rest of the nav on a screen
    // with room for that, one constant home regardless of whether the
    // home view or an existing answer is showing (used to differ by
    // which, and land in the now-removed #askHomeControls or the top of
    // .ask-rail-header instead); a narrow screen (no persistent sidebar
    // at all, see canUseAskRail) still needs them reachable from the
    // form itself. Idempotent: checks where the node already is before
    // moving it, so calling this on every resize event costs nothing
    // once the viewport is already settled on one side.
    function relocateAskOptionsPanel() {
      const panel = document.getElementById("askOptionsPanel");
      if (!panel) return;
      if (askRailMql.matches) {
        // The <details> wrapper (see its own comment above the markup),
        // not the bare #navLinks it now contains: anchoring on the
        // inner <nav> would insert this panel inside that <details>,
        // right along with the nav links it wraps.
        const nav = document.getElementById("navLinksDetails");
        if (nav && nav.nextSibling !== panel) nav.parentElement.insertBefore(panel, nav.nextSibling);
      } else {
        // .ask-options-row holds nothing else (Clear/bookmark/submit
        // moved up to .ask-input-row, always on the input's own line,
        // see that row's own comment), so the panel is this row's only
        // possible child; appendChild is enough, no reference node needed.
        const row = document.querySelector(".ask-options-row");
        if (row && row.lastElementChild !== panel) row.appendChild(panel);
      }
    }
    relocateAskOptionsPanel();
    askRailMql.addEventListener("change", relocateAskOptionsPanel);
    // Moves the real #askForm node itself (see relocateAskOptionsPanel's
    // own comment on why moving the live node, not a clone, is safe)
    // between its original spot in the fixed topbar and
    // #askFormDesktopSlot in the normal page flow, at the same
    // ASK_RAIL_MIN_WIDTH breakpoint. Per explicit request: the topbar
    // shrinks to just brand + sign-in on a wide screen ("make the header
    // narrower"), and the question input sits about a quarter of the
    // way down the page instead of glued to the very top edge. A narrow
    // screen keeps the original, deliberate "always reachable without
    // scrolling" behavior: the form stays pinned in the topbar exactly
    // as before. .topbar-main's ResizeObserver (further down) already
    // recomputes --topbar-h whenever the topbar's own size changes, so
    // the shorter header this produces needs no separate handling here.
    function relocateAskForm() {
      const form = document.getElementById("askForm");
      const slot = document.getElementById("askFormDesktopSlot");
      const topbarMain = document.querySelector(".topbar-main");
      if (!form || !slot || !topbarMain) return;
      if (askRailMql.matches) {
        if (form.parentElement !== slot) slot.appendChild(form);
      } else if (form.parentElement !== topbarMain) {
        // #filterForm (hidden, internal-only, see its own comment) is
        // #askForm's one fixed sibling and always comes first in the
        // original markup; appending restores that same order rather
        // than needing a specific insertBefore reference.
        topbarMain.appendChild(form);
      }
    }
    relocateAskForm();
    askRailMql.addEventListener("change", relocateAskForm);
    // Paints #askWorkflowTop's persistent diagram in its dim "idle" state
    // right from page load (askWorkflowState is still null at this
    // point; renderAskWorkflowDiagram defaults to all-idle when it is),
    // rather than leaving it blank until the first question actually runs.
    renderAskWorkflowDiagram();
    // Moves .brand and .topbar-right (version number, sign-in/account
    // chip) between .topbar-main and #sidebarFooter at the bottom of the
    // persistent sidebar, same breakpoint as every other relocation here.
    // Per explicit request: once this and relocateAskForm have both run,
    // .topbar's own rule (above) hides it entirely, since nothing of its
    // content is left in it, leaving the right side as just the question
    // input. #filtersToggleBtn no longer relocates at all: it's now a
    // permanent, clearly labeled Menu item (see its own markup comment),
    // not a bare icon that used to move between the topbar and this
    // footer. #navToggle never relocates either (just hidden via CSS at
    // this width, see .topbar's own rule) and is used as the anchor for
    // restoring the other two to their exact original relative order on
    // a narrow screen: inserting each relative to the previous one this
    // way stays correct regardless of what relocateAskForm's own listener
    // (same askRailMql, registered separately) has or hasn't done to
    // #askForm yet, since insertBefore only repositions the node given to
    // it, not whatever else happens to be sitting in .topbar-main at the
    // time.
    function relocateSidebarFooter() {
      const brand = document.querySelector(".brand");
      const topbarRight = document.querySelector(".topbar-right");
      const navToggle = document.getElementById("navToggle");
      const footer = document.getElementById("sidebarFooter");
      if (!brand || !topbarRight || !navToggle || !footer) return;
      if (askRailMql.matches) {
        if (brand.parentElement !== footer) footer.appendChild(brand);
        if (topbarRight.parentElement !== footer) footer.appendChild(topbarRight);
      } else {
        const topbarMain = navToggle.parentElement;
        if (brand.previousElementSibling !== navToggle) topbarMain.insertBefore(brand, navToggle.nextSibling);
        if (topbarRight.previousElementSibling !== brand) topbarMain.insertBefore(topbarRight, brand.nextSibling);
      }
    }
    relocateSidebarFooter();
    askRailMql.addEventListener("change", relocateSidebarFooter);

    // Collapsible sidebar (desktop only; below 900px it is the slide-in drawer). The
    // state is a class on <body>, remembered in localStorage. The toggle stays visible
    // in both states, so keyboard focus is never lost when it is used.
    const sidebarCollapseBtn = document.getElementById("sidebarCollapseBtn");
    function setSidebarCollapsed(collapsed, persist) {
      document.body.classList.toggle("sidebar-collapsed", collapsed);
      if (sidebarCollapseBtn) {
        const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
        sidebarCollapseBtn.setAttribute("aria-expanded", String(!collapsed));
        sidebarCollapseBtn.setAttribute("aria-label", label);
        sidebarCollapseBtn.title = label;
      }
      if (persist) {
        try { localStorage.setItem("rt.sidebar", collapsed ? "collapsed" : "open"); } catch { /* private mode */ }
      }
      if (persist || collapsed) {
        // Charts, the graph and the run log measure themselves on resize.
        window.dispatchEvent(new Event("resize"));
        setTimeout(() => window.dispatchEvent(new Event("resize")), 260);
      }
    }
    let sidebarStored = "";
    try { sidebarStored = localStorage.getItem("rt.sidebar") || ""; } catch { /* private mode */ }
    setSidebarCollapsed(sidebarStored === "collapsed", false);
    sidebarCollapseBtn?.addEventListener("click", () => {
      setSidebarCollapsed(!document.body.classList.contains("sidebar-collapsed"), true);
    });
    // The status dot opens the Account page (useful when the rail hides the Sign in button).
    document.getElementById("authStatusDot")?.addEventListener("click", () => activateUsers());
    // Recent Reddit Update Risk Questions quick-load buttons (see their own markup
    // comment): fills #askQuestion and re-runs the same preview logic
    // typing would trigger, but never submits -- the viewer clicks Ask
    // (or presses Enter) themselves, on their own timing.
    const demoQList = document.querySelector(".demo-q-list");
    if (demoQList) demoQList.addEventListener("click", (e) => {
      const btn = e.target.closest(".demo-q-btn");
      if (!btn) return;
      const q = btn.dataset.q || "";
      const input = document.getElementById("askQuestion");
      if (!input) return;
      input.value = q;
      updateAskPreview();
      input.focus();
    });
    // Populates the list above from real Reddit data: GET
    // /api/reddit/query/questions already returns real, question-shaped
    // posts the model has flagged metadata.predicted.isUpdateRelated for
    // (see that route's own comment), newest first. Filtered further,
    // client-side, to positiveScore > 0.5 - the same "risky post"
    // threshold ask.js's own redditRisk() uses everywhere else in this
    // system ("AI-detected isUpdateRelated or score > 0.5") - then
    // sorted by date (newest first) with score as the tiebreak, per
    // explicit request. Best-effort: a failed fetch just leaves the
    // section empty rather than breaking the page.
    const REDDIT_UPDATE_Q_LIMIT = 8;
    async function loadRedditUpdateQuestions() {
      if (!demoQList) return;
      try {
        const res = await fetch(`${API_BASE}reddit/query/questions?limit=200&fields=title,url,sourceUrl,created_utc,score,subreddit,metadata.predicted`);
        if (!res.ok) return;
        const body = await res.json();
        const docs = Array.isArray(body.data) ? body.data : [];
        const risky = docs
          .map(d => ({ d, riskScore: (d.metadata && d.metadata.predicted && typeof d.metadata.predicted.positiveScore === "number") ? d.metadata.predicted.positiveScore : null }))
          .filter(({ riskScore }) => riskScore != null && riskScore > 0.5)
          .sort((a, b) => {
            const dateDiff = new Date(b.d.created_utc || 0) - new Date(a.d.created_utc || 0);
            return dateDiff !== 0 ? dateDiff : (b.riskScore - a.riskScore);
          })
          .slice(0, REDDIT_UPDATE_Q_LIMIT);
        if (!risky.length) return;
        // A real <a> can't nest inside the clickable <button> (invalid,
        // inconsistent browser handling), so the open-on-Reddit icon is a
        // sibling in its own row wrapper, not part of the button itself.
        demoQList.innerHTML = risky.map(({ d, riskScore }) => {
          const dateStr = d.created_utc ? new Date(d.created_utc).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
          const meta = [d.subreddit ? `r/${d.subreddit}` : null, `risk ${riskScore.toFixed(2)}`, dateStr].filter(Boolean).join(" &middot; ");
          const postUrl = d.url || d.sourceUrl || "";
          const link = postUrl
            ? `<a class="demo-q-link" href="${uaEsc(postUrl)}" target="_blank" rel="noopener noreferrer" title="Open on Reddit" aria-label="Open on Reddit">🔗</a>`
            : "";
          return `<div class="demo-q-row">
            <button type="button" class="demo-q-btn" data-q="${uaEsc(d.title || "")}">${uaEsc(d.title || "")}<span class="demo-q-meta">${meta}</span></button>
            ${link}
          </div>`;
        }).join("");
      } catch { /* best-effort: an empty section beats a broken page */ }
    }
    loadRedditUpdateQuestions();
    let askRailData = null; // { label, res, question } backing "Show full answer": re-renders untrimmed from the same data, no second request
    function wireAskRailBody(body) {
      askWireRateButtons(body);
      askWireAnswerReveal(body);
      askWireRailTabs(body);
      const fullBtn = body.querySelector(".ask-view-full-btn");
      if (fullBtn) fullBtn.addEventListener("click", () => {
        body.innerHTML = askRenderCard(askRailData.label, askRailData.res, { showWorkflow: true, previewQuestion: askRailData.question, activeTab: "answer" });
        wireAskRailBody(body);
        renderAskWorkflowDiagram();
      });
      // The Benchmark tab's own CTA on a normal single-pipeline answer:
      // re-runs the exact same question through Compare mode instead of
      // requiring it to be retyped with a different pipeline selected.
      const compareBtn = body.querySelector(".ask-run-compare-btn");
      if (compareBtn) compareBtn.addEventListener("click", () => {
        document.getElementById("askPreset").value = "compare";
        document.getElementById("askQuestion").value = askRailData.question;
        document.getElementById("askForm").requestSubmit();
      });
    }
    // Opened the moment a real question is submitted (see the submit
    // handler), before any answer exists yet, so the workflow diagram
    // is visible and animating from the very first phase event rather
    // than only appearing once the whole request is already done.
    // isCompare skips the single-pipeline workflow diagram (Compare mode
    // runs 5 parallel requests, not one phase-event stream to animate)
    // and labels the wait accordingly.
    // runCount: 0 for a normal single-pipeline question, else the number
    // of parallel pipelines running at once (5 for Compare, 2 for the
    // Single-vs-Multi duo demo; see the "duo" pipeline option/askRenderDuoBody).
    // Kept as a count rather than a separate isDuo boolean so the running/
    // waiting copy below reads correctly for either without a 3-way branch.
    function showAskRailRunning(question, runCount) {
      askRailData = null;
      const body = document.getElementById("askRailBody");
      const isCompare = !!runCount;
      // No separate "Thinking…" line: the live caption right below the
      // diagram already says what's happening (e.g. "Rewriter: resolving
      // vendor… 0.2s"), so a plain static "Thinking…" under that was
      // redundant, one more line for no extra information.
      const answerPanel = isCompare
        ? `<p class="ask-muted">Running ${runCount} pipelines against the same question…</p>`
        : askQueryPreviewBlockHtml(question);
      // No pipeline label yet (unresolved until the answer arrives,
      // especially for "Auto"), so just the question, no bracket. See
      // askRenderCard's own labelHtml for the question+label version
      // used once there's a real answer. The diagram itself lives in
      // the persistent #askWorkflowTop above the input, not here (see
      // that element's own comment); nothing to render inline in the
      // card any more.
      body.innerHTML = `<div class="ask-answer-card">
        <div class="ask-answer-heading"><span class="ask-answer-question">${uaEsc(question)}</span></div>
        <div class="ask-rail-tabs" role="tablist">
          <button type="button" class="ask-rail-tab active" data-tab="answer" role="tab" aria-selected="true">Answer</button>
          <button type="button" class="ask-rail-tab" data-tab="sources" role="tab" aria-selected="false">Sources</button>
          <button type="button" class="ask-rail-tab" data-tab="benchmark" role="tab" aria-selected="false">Benchmark</button>
        </div>
        <div class="ask-rail-panel" data-panel="answer">${answerPanel}</div>
        <div class="ask-rail-panel" data-panel="sources" hidden>
          <p class="ask-muted">Waiting for the answer…</p>
        </div>
        <div class="ask-rail-panel" data-panel="benchmark" hidden>
          <p class="ask-muted">${isCompare ? `Waiting for all ${runCount} to finish…` : "Waiting for the answer…"}</p>
        </div>
      </div>`;
      askWireRailTabs(body);
      $(".layout").classList.add("has-ask-rail");
      if (!isCompare) renderAskWorkflowDiagram();
    }
    function showAskRail(question, label, res) {
      askRailData = { label, res, question };
      const body = document.getElementById("askRailBody");
      body.innerHTML = askRenderCard(label, res, { trimAnswer: ASK_RAIL_ANSWER_TRIM, showWorkflow: true, previewQuestion: question });
      wireAskRailBody(body);
      $(".layout").classList.add("has-ask-rail");
      // Paints the diagram into the freshly-built container. finishAskWorkflow
      // (called right after this, in the submit handler's `finally`) will
      // render it again once the last active node flips to "done", but this
      // keeps the container from sitting blank in between.
      renderAskWorkflowDiagram();
    }
    // Compare mode's rail rendering: no live workflow diagram (5 parallel
    // requests, not one phase-event stream), just the shared 3-tab
    // Compare body (see askRenderCompareBody) with rate buttons wired.
    function showAskRailCompare(question, data) {
      askRailData = null;
      const body = document.getElementById("askRailBody");
      body.innerHTML = askRenderCompareBody(question, data, { showQuestion: true });
      askWireRateButtons(body);
      askWireAnswerReveal(body);
      askWireRailTabs(body);
      $(".layout").classList.add("has-ask-rail");
    }
    // Duo demo mode's rail rendering: same shape as showAskRailCompare
    // above, just the 2-card askRenderDuoBody instead of the 5-way
    // primary+Benchmark-tab body. No rail tabs to wire (askRenderDuoBody
    // has no tablist of its own, each card is one flat block).
    function showAskRailDuo(question, data) {
      askRailData = null;
      const body = document.getElementById("askRailBody");
      body.innerHTML = askRenderDuoBody(question, data, { showQuestion: true });
      askWireRateButtons(body);
      askWireAnswerReveal(body);
      $(".layout").classList.add("has-ask-rail");
    }
    function hideAskRail() {
      $(".layout").classList.remove("has-ask-rail");
      askRailData = null;
    }

    // A vendor/category resolved server-side (classifyAskLookup, or
    // runAsk's own vendor-check gate with Vendor check on) is replayed
    // through whichever existing mechanism already browses that data.
    // /api/v/search has no versionProductType filter, only an exact
    // versionProductName match. Fine for a category small enough for
    // the Rewriter to enumerate (categoryMembers), but "LLM" (300+ real
    // models) or "Hypervisor" have no single matching product name to
    // search for. Those two already have a dedicated, date-window-
    // independent dataset behind the existing LLM/Hypervisor toggles
    // (see ensureLlmVersionsLoaded/ensureHvVersionsLoaded above), so
    // route to that instead of a components search that would just come
    // back empty. Any other large category falls back to searching the
    // bare vendor/category label itself: the same best-effort result a
    // user typing that label into the old Search box would have gotten.
    // On the Ask home the feed is not on screen, so a question does not filter it (that
    // also kept rewriting ?q= in the URL). The feed is the Recent updates view.
    function askHomeMode() { return document.body.classList.contains("view-home") && askRailMql.matches; }
    function enterFeedView() { setViewParam("feed"); }
    function applyVendorFeedFilter(vendor, categoryType, categoryMembers) {
      if (askHomeMode()) return;
      const toggleKey = categoryType === "LLM" ? "llm" : categoryType === "Hypervisor" ? "hv" : null;
      if (toggleKey) {
        const btn = document.querySelector(`#fixedToggles [data-key="${toggleKey}"]`);
        if (btn && btn.getAttribute("aria-pressed") !== "true") btn.click();
        return;
      }
      const term = (categoryMembers && categoryMembers.length) ? categoryMembers.join(",") : (vendor || "");
      document.getElementById("components").value = term;
      document.getElementById("filterForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    // Back to a plain, unfiltered feed. Used both for a lookup with no
    // resolvable vendor and for a real question that didn't resolve one
    // either (Vendor check off, or genuinely nothing matched).
    function clearVendorFeedFilter() {
      if (askHomeMode()) return;
      document.getElementById("components").value = "";
      document.getElementById("filterForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    function runDocumentsLookup(data) {
      // Back to browsing. A lingering answer from an earlier question
      // doesn't belong beside unrelated results, and the feed gets its
      // full width back.
      hideAskRail();
      // A bare vendor/category lookup is a browse, so it opens the feed view.
      if (askRailMql.matches) enterFeedView();
      if (data.vendor) applyVendorFeedFilter(data.vendor, data.categoryType, data.categoryMembers);
      else clearVendorFeedFilter();
    }

    // Reads a text/event-stream response body one "data: {...}\n\n" event
    // at a time. A 'progress' event updates the pipeline ticker live; a
    // 'result' event is the final answer, in the same shape the plain
    // JSON response used before this endpoint could stream; an 'error'
    // event is thrown as a normal Error so the caller's own catch block
    // handles it the same way a failed fetch always has.
    // A non-JSON body (most often Nginx's own HTML error page for a
    // 502/504, when the Node backend isn't responding, or is mid-
    // restart) makes a plain `res.json()` throw its own raw parse
    // exception ("Unexpected token '<' ... is not valid JSON"), reported
    // live as exactly that showing in the answer modal. Checking the
    // content-type first turns that into a message someone can actually
    // read and act on, without changing anything for the normal case.
    async function askSafeJson(res) {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(res.ok
          ? "The server sent back something unexpected. Try again in a moment."
          : `Server error (HTTP ${res.status}). Try again in a moment.`);
      }
      return res.json();
    }
    async function consumeAskEventStream(res, preset) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult = null;
      let errorMessage = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const dataLine = rawEvent.split("\n").find(l => l.startsWith("data:"));
          if (!dataLine) continue;
          let evt;
          try { evt = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
          if (evt.type === "progress") {
            // Synthetic, not a real agent phase: the request was sent as
            // "auto", and askPhaseLabel's own multi-agent role-prefix
            // check is keyed on the exact preset string, so every phase
            // caption from here on needs the concrete pipeline Auto
            // actually picked, not the literal word "auto".
            if (evt.phase === "auto_resolved" && evt.meta && evt.meta.preset) {
              preset = evt.meta.preset;
            } else {
              pushAskWorkflowPhase(evt.phase, evt.detail, preset, evt.meta);
            }
          }
          else if (evt.type === "result") finalResult = evt;
          else if (evt.type === "error") errorMessage = evt.error || "Request failed.";
        }
      }
      if (errorMessage) throw new Error(errorMessage);
      if (!finalResult) throw new Error("Connection closed before an answer arrived.");
      return finalResult;
    }

    document.getElementById("askForm").addEventListener("submit", async e => {
      e.preventDefault();
      const question = document.getElementById("askQuestion").value.trim();
      if (!question) return;
      // The answer shows on the Ask home; every other view (feed, Docs,
      // Account, Graph, etc.) has no answer area of its own, and the
      // question input/pipeline diagram are reachable from all of them
      // (see #askWorkflowTop/#askFormDesktopSlot's own comments). Without
      // this, asking a question while on one of those other views left
      // that view's own content sitting there, with nothing to actually
      // show the running/finished rail: reported live from the Account
      // view specifically. Same deactivateActiveView() EL.homeLink's own
      // handler and #viewCloseBtn (see their own comments) both use to
      // return to the Ask home.
      deactivateActiveView();
      // Unconditional: same reasoning as EL.homeLink's own handler (a
      // stale ?q= from an earlier shared link needs clearing too, not
      // just ?view=), and a genuinely new question makes any old ?q=
      // doubly stale regardless.
      setViewParam("");
      // The pipeline diagram/input themselves are position:fixed (see
      // #stickyAskHeader's own comment), so they're always visible
      // regardless of scroll. Per explicit request ("center the input
      // on enter submit"), a viewer who submits from partway down
      // a long, scrolled view (or a scrolled-down Ask home) should land
      // back at the top for the new running answer, not stay scrolled
      // into whatever was there before. Instant, not smooth: this is a
      // reset to a known state, not a scroll a viewer should watch happen.
      window.scrollTo(0, 0);
      const preset = document.getElementById("askPreset").value;
      const provider = document.getElementById("askProvider").value;
      const size = document.getElementById("askSize").value;
      const isCompare = preset === "compare";
      // "duo": the Single-vs-Multi seminar-demo pipeline option.
      // Client-only value, never sent to the server as a preset itself.
      // It maps to the same /api/ask/compare endpoint Compare mode already
      // uses, just with 2 presets instead of 5 (see the isCompare ||
      // isDuo branch below). "compare"/"duo" are mutually exclusive, both
      // true only never happens since they're the same <select>'s value.
      const isDuo = preset === "duo";
      const vendorCheck = document.getElementById("askVendorCheck").checked;
      const temporalFilter = document.getElementById("askTemporalFilter").checked;
      const intentFilter = document.getElementById("askIntentFilter").checked;
      const resolveVendor = document.getElementById("askResolveVendor").checked;
      const resolveTemporal = document.getElementById("askResolveTemporal").checked;

      // "Compare all 5" always runs five real model calls side by side -
      // there's no plain-lookup shortcut for it, so it keeps the old
      // up-front sign-in gate. Everything else goes through /api/ask
      // itself, which decides whether the query is a bare vendor/
      // category lookup (free, no sign-in; classifyAskLookup on the
      // server) or a real question (sign-in required, a real model call)
      // See the branches below.
      if ((isCompare || isDuo) && !uaToken()) {
        alert("Sign in (Account view) to ask questions. Each answer runs a real query against the model.");
        return;
      }

      // The button's own icon/style no longer changes between idle and
      // running (see startAskWorkflow's own comment) -- per explicit
      // follow-up ("keep the state of the button the same independent
      // if it is pressed or not, do not make it a robot"), it was a
      // redundant second "something is happening" signal once the
      // pipeline diagram's own first node started reflecting that
      // instead. disabled still toggles (a real functional guard against
      // double-submit), just with no accompanying visual change.
      const btn = document.getElementById("askSubmitBtn");
      btn.disabled = true;
      startAskWorkflow(question);
      // The rail opens immediately with a running skeleton (diagram +
      // live caption, or for Compare mode a plain "Running 5 pipelines…")
      // rather than waiting for the full response. Compare mode now uses
      // the rail too when there's room for it, same as a normal question;
      // only a narrow screen still falls back to the modal (see the
      // isCompare branch below), since Compare has no live phase stream
      // either way (5 parallel requests, not one to animate).
      const useRail = canUseAskRail();
      if (useRail) showAskRailRunning(question, isCompare ? 5 : isDuo ? 2 : 0);
      let refreshQuotaAfter = true;

      try {
        if (isCompare || isDuo) {
          if (!useRail) {
            // Narrow screen: the modal fallback, using the exact same
            // rendering the rail uses (askRenderCompareBody/askRenderDuoBody),
            // one rendering, not two to keep in sync. The question itself is
            // left exactly as typed; closing/reopening the modal, or asking
            // again, should never require retyping it.
            hideAskRail();
            document.getElementById("askModalQuestion").textContent = question;
            document.getElementById("askModalBody").innerHTML = isCompare
              ? '<p class="ask-muted">Running all 5 pipelines against the same question…</p>'
              : '<p class="ask-muted">Running single-agent and multi-agent against the same question…</p>';
            askModalEl.classList.add("ask-compare-mode");
            askOverlayEl.classList.add("open");
            askModalEl.classList.add("open");
          }
          const params = new URLSearchParams({
            question,
            presets: isCompare
              ? "single_agent,multi_agent_buggy,multi_agent_fixed,multi_agent,multi_agent_feedback"
              : "single_agent,multi_agent_feedback",
            vendorCheck: String(vendorCheck), temporalFilter: String(temporalFilter), intentFilter: String(intentFilter),
            resolveVendor: String(resolveVendor), resolveTemporal: String(resolveTemporal),
            provider, size,
          });
          const res = await uaRequest("ask/compare?" + params.toString());
          const data = await askSafeJson(res);
          if (!res.ok) throw new Error(data.error || "Request failed.");
          if (useRail) {
            if (isCompare) showAskRailCompare(question, data);
            else showAskRailDuo(question, data);
          } else if (isCompare) {
            document.getElementById("askModalBody").innerHTML = askRenderCompareBody(question, data);
            askWireRateButtons(document.getElementById("askModalBody"));
            askWireAnswerReveal(document.getElementById("askModalBody"));
            askWireRailTabs(document.getElementById("askModalBody"));
          } else {
            document.getElementById("askModalBody").innerHTML = askRenderDuoBody(question, data);
            askWireRateButtons(document.getElementById("askModalBody"));
            askWireAnswerReveal(document.getElementById("askModalBody"));
          }
          // Every preset resolves the same vendor from the same catalog,
          // Vendor check being the one config that actually varies here -
          // the first successful run stands in for all three.
          const firstRun = data.runs.find(r => !r.error);
          if (firstRun && firstRun.vendor) applyVendorFeedFilter(firstRun.vendor, firstRun.categoryType, firstRun.categoryMembers);
          else clearVendorFeedFilter();
          return;
        }

        const config = { preset, vendorCheck, temporalFilter, intentFilter, resolveVendor, resolveTemporal, provider, size };
        const res = await uaRequest("ask", { method: "POST", body: JSON.stringify({ question, config }) });
        if (res.status === 401) {
          refreshQuotaAfter = false;
          // A signed-out visitor who has used up today's free questions
          // (see anonymousAskLimit in the admin Settings panel) gets a
          // JSON body naming that specifically, distinct from the plain
          // "sign in" case (anonymous questions off, or limit already 0)
          // this alert originally covered. Refreshes the note itself
          // (rather than trusting the count it already had) since a
          // second browser tab, or another visitor on the same network,
          // could have used the shared IP-based quota in the meantime.
          let anonLimitReached = false;
          try {
            const body = await res.json();
            anonLimitReached = !!body.anonymousLimitReached;
          } catch { /* non-JSON or empty 401 body: treat as the plain case below */ }
          if (anonLimitReached) {
            uaLoadAnonQuota();
            alert("You've used today's free questions. Sign in (Account view) to keep asking.");
          } else {
            alert("Sign in (Account view) to ask a real question. A plain vendor/category search doesn't need it, but a full answer runs a real query against the model.");
          }
          return;
        }
        // The fast paths (a plain lookup, a bad request) answer with a
        // normal JSON body; a real question streams progress first and
        // ends with one result (or error) event over the response body -
        // see consumeAskEventStream. Told apart by content type, since
        // the client cannot know in advance which one a given question
        // will turn out to be.
        const contentType = res.headers.get("content-type") || "";
        let data;
        if (contentType.includes("text/event-stream")) {
          data = await consumeAskEventStream(res, preset);
        } else {
          data = await askSafeJson(res);
          if (!res.ok) throw new Error(data.error || "Request failed.");
        }

        // null for a signed-in caller (see POST /api/ask in app.js), a
        // number the moment this was a completed anonymous question -
        // update the free-questions note from it directly rather than a
        // second fetch. uaAnonQuotaLimitCache is only set once
        // uaLoadAnonQuota() has actually run (bootstrap, or whenever the
        // note last showed), so this is a no-op on the rare page load
        // where that hasn't happened yet.
        if (Number.isFinite(data.anonymousQuestionsRemaining) && uaAnonQuotaLimitCache != null) {
          uaSetAnonQuotaNote(data.anonymousQuestionsRemaining, uaAnonQuotaLimitCache);
        }

        if (data.intent === "documents") {
          // A bare vendor/category name, not a question. Resolved
          // server-side, then replayed through whichever existing
          // mechanism already browses that data (see runDocumentsLookup
          // above). No modal, no model call, and no running rail either.
          // showAskRailRunning already opened one speculatively before
          // this was known (the server, not the client, decides which
          // this turns out to be), so close it rather than leaving a
          // stuck running diagram on screen.
          refreshQuotaAfter = false;
          hideAskRail();
          runDocumentsLookup(data);
          return;
        }

        // "auto" resolves to a real preset server-side (see /api/ask),
        // returned as data.config.preset; prefer that over the raw form
        // value so the label reads as the pipeline that actually ran
        // ("Multi-agent (feedback loop)"), not the literal word "auto".
        const resolvedPreset = (data.config && data.config.preset) || preset;
        // Which graph nodes were actual agents (model calls) for this run,
        // using the same rule as the "N agents" badge, so the green boxes
        // match that number. Other finished nodes are plain code steps.
        askWorkflowAgentKeys = (data.intent !== "comparison" && data.evaluatorRan)
          ? ["rewriter", "retriever", "evaluator", "orchestrator"] : ["orchestrator"];
        if (data.vendorWebVerified) askWorkflowAgentKeys.push("verify");
        renderAskWorkflowDiagram();
        // A real answer: shown inline beside the feed when there's room
        // for it, the popup modal otherwise (a narrow window, or a
        // laptop split half-screen with a chat window, say).
        if (canUseAskRail()) {
          showAskRail(question, ASK_PRESET_LABELS[resolvedPreset] || resolvedPreset, data);
        } else {
          document.getElementById("askModalQuestion").textContent = question;
          document.getElementById("askModalBody").innerHTML = askRenderCard(ASK_PRESET_LABELS[resolvedPreset] || resolvedPreset, data);
          askModalEl.classList.remove("ask-compare-mode");
          askOverlayEl.classList.add("open");
          askModalEl.classList.add("open");
          askWireRateButtons(document.getElementById("askModalBody"));
          askWireAnswerReveal(document.getElementById("askModalBody"));
        }
        // The feed follows the question: a resolved vendor/category (only
        // set when Vendor check is on) filters it to that vendor's own
        // versions/CVEs, so the answer and the browsable history sit side
        // by side; no vendor resolved (Vendor check off, or genuinely
        // nothing matched) goes back to showing everything, rather than
        // leaving a stale unrelated filter in place.
        if (data.vendor) {
          applyVendorFeedFilter(data.vendor, data.categoryType, data.categoryMembers);
          // A web-verified vendor (data.vendorWebVerified, see
          // verifyVendorViaWeb on the server) can kick off a background
          // Wikipedia-bot backfill (tryWikipediaFallback) that's still
          // running when this answer comes back -- the refresh just
          // above almost always races it and finds nothing yet, even
          // though the same vendor genuinely gets posted a few seconds
          // later. Reported live: "npm" answered correctly but the feed
          // still said "No versions found." One more refresh, given a
          // real window to let that backfill actually finish first,
          // catches it. Guarded on the search box still showing this
          // same vendor, so a search the viewer has since typed over in
          // the meantime isn't silently clobbered by a stale re-fetch.
          if (data.vendorWebVerified) {
            const resolvedVendor = data.vendor;
            setTimeout(() => {
              if (norm(EL.components.value) === norm(resolvedVendor)) {
                EL.filterForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
              }
            }, 6000);
          }
        } else {
          clearVendorFeedFilter();
        }
      } catch (err) {
        // Same reasoning as the "documents" branch above: a running rail
        // may already be open speculatively, and the error is shown in
        // the modal regardless of screen width, so a stale running
        // diagram shouldn't linger open behind it.
        hideAskRail();
        document.getElementById("askModalQuestion").textContent = question;
        document.getElementById("askModalBody").innerHTML = `<p class="ask-error">${uaEsc(err.message || "Something went wrong.")}</p>`;
        askOverlayEl.classList.add("open");
        askModalEl.classList.add("open");
      } finally {
        btn.disabled = false;
        finishAskWorkflow();
        // Every real ask attempt (success, abstain, or a rate-limit error
        // like "TPM: Limit 8000, Used 7333...") updates the provider's
        // quota. A plain document lookup or an unauthenticated attempt
        // never touched it, so skip the refresh for those.
        if (refreshQuotaAfter) askRefreshQuota();
      }
    });
