// ask-workflow.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    // ── Agent workflow diagram (live phase → node highlighting) ─────
    // Always the full, complete pipeline shape: Vendor, Rewriter, Web
    // Search, Verify, Retriever, Evaluator, Orchestrator (with a feedback
    // edge back to Retriever) -- every node this architecture can ever
    // touch, always rendered, per explicit request ("show the whole
    // pipeline including feedback loops and web search etc"). A prior
    // version swapped between this full 7-node list and a plain 5-node
    // one (Vendor/Rewriter/Retriever/Evaluator/Orchestrator, Web Search/
    // Verify spliced out) depending on whether THIS run happened to
    // escalate vendor resolution to a real web search -- removed, since
    // a viewer unfamiliar with the architecture should see its whole
    // shape up front, not a diagram that silently grows an extra 2 nodes
    // only on some questions. A preset that doesn't genuinely delegate to
    // separate roles (Single-agent, Multi-agent buggy/fixed), or a run
    // that never escalates to a web search, just leaves those nodes idle
    // the whole time: "highlight only the roles actually used this run"
    // still falls out naturally from which phase events actually arrive,
    // no per-preset/per-run case needed to decide which list to show.
    // Vendor resolution gets its own node, separate from Rewriter, even
    // though it's the very first thing to run: it's a plain deterministic
    // catalog lookup on EVERY architecture (see the "Vendor resolution"
    // row of the Model vs Rules tab, askRenderModelVsRules), never a real
    // Rewriter LLM call. A prior version mapped resolving_vendor onto the
    // same "rewriter" node, so a single-loop run (no real Rewriter step at
    // all, confirmed by that same tab) still showed a "Rewriter" box
    // completing with a real elapsed time, reported live as a flat
    // contradiction between this diagram and the Model vs Rules tab right
    // next to it.
    // Lives in the persistent #askWorkflowTop, above the input (see that
    // element's own comment), not in the answer rail.
    let askWorkflowState = null;      // { vendor, rewriter, retriever, classify, evaluator, orchestrator, websearch, verify } -> idle|active|done
    let askWorkflowTiming = null;     // { vendor, rewriter, retriever, classify, evaluator, orchestrator, websearch, verify } -> { startedAt, doneMs } | null
    let askWorkflowLabel = "";        // current phase's own label (askPhaseLabel), shown under the diagram
    let askWorkflowStartedAt = null;  // for the caption's live elapsed-seconds tick
    let askWorkflowTickTimer = null;
    // The literal question this run started for, shown as the "User
    // Question" node's own hover title (see renderAskWorkflowDiagram) --
    // full text on hover rather than in the node's own label, which
    // stays a short, fixed, non-wrapping string like every other node.
    let askWorkflowQuestion = "";
    let askWorkflowNotes = {};        // node name -> short detail shown under the box
    let askWorkflowLog = [];          // console lines for the Short answer tab
    let askWorkflowAgentKeys = null;  // set when the answer arrives; null while running
    let askWorkflowFinished = false;  // true once the run is over (unvisited nodes turn "skipped")

    const ASK_WORKFLOW_PHASE_NODE = {
      resolving_vendor: "vendor", rewriting: "rewriter",
      searching: "retriever",
      // classifying_sources (see classifySourcesTrust on the server): a
      // new deterministic step between Retriever and Evaluator, its own
      // "classify" node below - not folded into "verify" (that node is
      // specifically the earlier vendor-web-verification step, a
      // different mechanism entirely; see that node's own history).
      classifying_sources: "classify",
      evaluating: "evaluator", retrying: "evaluator", widening: "evaluator",
      generating: "orchestrator",
      web_searching: "websearch", web_verifying: "verify",
    };

    // Plain text "nouns and edges" per explicit request: no mermaid, no
    // per-node box, just each role's name joined by a plain arrow
    // character, colored by its own idle/active/done state. Renders
    // synchronously (no async library load, unlike the mermaid version
    // this replaced), so askWorkflowRenderSeq's "a slow render might
    // land out of order" guard is no longer needed.
    // Always the full 7-node pipeline (see the comment block above) --
    // no separate plain/escalated variant any more.
    const ASK_WORKFLOW_NODES = [
      // Labeled "Ask", not "Vendor" (the internal state key, still
      // "vendor", is unchanged -- it still lights up on the real
      // resolving_vendor phase event same as before): per explicit
      // request, this first node is what a viewer sees light up the
      // instant they submit (see startAskWorkflow's own comment), so it
      // reads better as "the question just came in" than a term
      // ("Vendor") a general audience has no reason to already know.
      // Every node name is a verb (Ask/Rewrite/Search/Verify/Retrieve/
      // Evaluate/Orchestrate), not a noun, per explicit follow-up
      // request -- shorter labels, same reasoning. (Retrieve's own box
      // now reads "Find Facts and Artifacts" instead, per a later,
      // more specific explicit request - see the retriever entry's own
      // comment for why this one node's `name` here looks different
      // from what's actually shown on the box.)
      { key: "vendor", name: "Ask" },
      { key: "rewriter", name: "Rewrite" },
      { key: "websearch", name: "Search" },
      { key: "verify", name: "Verify" },
      // `name` here is NOT the box's displayed text (that's
      // "Find Facts and Artifacts", set server-side in
      // langgraphLoop.js's PIPELINE_NODES and rendered by Mermaid as
      // the node's raw, unescaped label) - it's the SAME escaped form
      // Mermaid itself derives to build the diagram's own node id
      // (spaces -> underscores, see graph_mermaid.cjs's
      // _escapeNodeLabel, confirmed against that package's real source
      // before this rename), used here to find this node's box in the
      // rendered SVG (flowchart-${n.name}-) and as the matching key for
      // this node's own "note" events from the server (see ask.js's
      // matching node: 'Find_Facts_and_Artifacts' comment).
      { key: "retriever", name: "Find_Facts_and_Artifacts" },
      // Classify (see classifySourcesTrust on the server): checks each
      // retrieved source's own url and classifies how trustworthy it is,
      // before Evaluate ever scores them. A different "Verify" than the
      // node above (that one is vendor-web-verification, not source
      // trust), so this one is named "Classify" instead of reusing the
      // word, per the same verb-only-labels convention as every node
      // here.
      { key: "classify", name: "Classify" },
      { key: "evaluator", name: "Evaluate" },
      { key: "orchestrator", name: "Orchestrate" },
    ];
    // A node that completed in well under a second still deserves a
    // real, honest reading rather than "0.0s". One decimal place is
    // the finest granularity worth showing a reader here.
    function askWorkflowNodeSeconds(node) {
      const t = askWorkflowTiming && askWorkflowTiming[node];
      if (!t) return null;
      const ms = t.doneMs != null ? t.doneMs : Date.now() - t.startedAt;
      return (ms / 1000).toFixed(1) + "s";
    }
    // Renders into #askWorkflowTop's persistent #askWorkflowDiagram (see
    // that element's own comment): one instance, always present, not
    // rebuilt per answer. Defaults to an all-idle state when no question
    // has run yet (askWorkflowState is still null at page load) so the
    // diagram shows its dim "inactive hacker colors" from the start
    // rather than sitting blank until the first question.
    // A robot sits in front of every node's name, per explicit request;
    // only the robot itself blinks while that one node is "active" (a
    // separate inner span the blink animation targets, see
    // .askwf-robot-active's own CSS comment) -- the node's own name/timer
    // text next to it stays fully static, unaffected, per direct
    // follow-up ("only blink the robot in front, this way the text stays
    // static").
    // The pipeline drawing is LangGraph's own drawMermaid() output, fetched
    // once from GET /api/ask/graph and drawn by Mermaid (standard libraries,
    // no hand-built diagram). Every call after that only restyles the
    // existing SVG nodes from the live state, so it is cheap to run on the
    // 250 ms tick. If the server cannot provide the graph (LangGraph not
    // installed there), the plain text row below is the fallback.
    let askGraphSvg = null;
    let askGraphLoading = false;
    let askGraphRetryMs = 1500;
    const ASK_GRAPH_CACHE_KEY = "rt.askGraphMermaid";
    function askEnsureMermaid() {
      return new Promise((resolve, reject) => {
        if (window.mermaid) return resolve();
        const sc = document.createElement("script");
        sc.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
        sc.crossOrigin = "anonymous";
        sc.onload = resolve; sc.onerror = reject;
        document.head.appendChild(sc);
      });
    }
    async function askDrawGraph(mermaidText) {
      await askEnsureMermaid();
      window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", flowchart: { curve: "linear", htmlLabels: false } });
      const text = String(mermaidText || "").replace(/graph TD;/, "graph LR;").replace(/<p>__start__<\/p>/, "Start").replace(/<p>__end__<\/p>/, "End");
      // parse() throws on bad input without touching the page; render() would
      // paint Mermaid's own error graphic into the body.
      await window.mermaid.parse(text);
      const out = await window.mermaid.render("askLangGraphSvg", text);
      askGraphSvg = out.svg;
      const el = document.getElementById("askWorkflowDiagram");
      if (el) el.innerHTML = askGraphSvg;
      renderAskWorkflowDiagram();
    }
    // Draws the last graph seen (kept in localStorage) right away, then
    // refreshes it from the server. A failed fetch (server restarting) is
    // retried with backoff instead of giving up, so there is no second,
    // hand-built version of the diagram to fall back to.
    function loadAskGraph() {
      if (askGraphSvg || askGraphLoading) return;
      askGraphLoading = true;
      let cached = null;
      try { cached = localStorage.getItem(ASK_GRAPH_CACHE_KEY); } catch {}
      const fetchIt = () => uaRequest("ask/graph").then(r => r.ok ? r.json() : Promise.reject(new Error("graph")));
      const go = async () => {
        try {
          if (cached) await askDrawGraph(cached);
          const g = await fetchIt();
          try { localStorage.setItem(ASK_GRAPH_CACHE_KEY, g.mermaid); } catch {}
          if (!cached || cached !== g.mermaid) await askDrawGraph(g.mermaid);
          askGraphLoading = false;
        } catch (e) {
          if (askGraphSvg) { askGraphLoading = false; return; }
          setTimeout(() => { askGraphLoading = false; askGraphRetryMs = Math.min(askGraphRetryMs * 2, 15000); loadAskGraph(); }, askGraphRetryMs);
        }
      };
      go();
    }
    function renderAskWorkflowDiagram() {
      const el = document.getElementById("askWorkflowDiagram");
      if (!el) return;
      const state = askWorkflowState || {
        vendor: "idle", rewriter: "idle", retriever: "idle", classify: "idle",
        evaluator: "idle", orchestrator: "idle", websearch: "idle", verify: "idle",
      };
      if (!askGraphSvg) { loadAskGraph(); return; }
      if (!el.querySelector("svg")) el.innerHTML = askGraphSvg;
      for (const n of ASK_WORKFLOW_NODES) {
        const g = el.querySelector(`g.node[id*="flowchart-${n.name}-"]`);
        if (!g) continue;
        let st = state[n.key] || "idle";
        if (askWorkflowFinished && st === "idle" && n.key !== "vendor") st = "skipped";
        // "Ask" is the incoming question, not an agent: it never turns
        // green, so the green boxes are exactly the agents counted in
        // the "N agents" badge.
        if (n.key === "vendor" && st === "done") st = "input";
        // A finished node that made no model call is a code step, not an agent.
        const isCodeStep = st === "done" && askWorkflowAgentKeys && !askWorkflowAgentKeys.includes(n.key);
        if (isCodeStep) st = "input";
        g.setAttribute("class", `node default askwfg-${st}`);
        // Center the label in its box by measuring both on screen (Mermaid
        // measured the text before the page font applied); retried until
        // the diagram is actually visible and measurable.
        const lab0 = g.querySelector("text:not(.askwf-secs)");
        const rect0 = g.querySelector("rect");
        if (lab0 && rect0 && !lab0.dataset.centered) {
          const lr = lab0.getBoundingClientRect(), rr = rect0.getBoundingClientRect();
          const sc = rect0.getScreenCTM();
          if (lr.width > 0 && rr.width > 0 && sc && sc.a) {
            const dx = (rr.left + rr.width / 2 - (lr.left + lr.width / 2)) / sc.a;
            const dy = (rr.top + rr.height / 2 - (lr.top + lr.height / 2)) / sc.d;
            lab0.setAttribute("transform", `translate(${dx} ${dy})`);
            lab0.dataset.centered = "1";
          }
        }
        const secs = askWorkflowNodeSeconds(n.key);
        // The node's own label stays as LangGraph drew it; the elapsed
        // time is a small separate text under the box.
        let t = g.querySelector("text.askwf-secs");
        if (!t) {
          const r0 = g.querySelector("rect");
          const rw = +r0.getAttribute("width"), rh = +r0.getAttribute("height");
          const box = { x: +r0.getAttribute("x") || 0, y: +r0.getAttribute("y") || 0, width: rw, height: rh };
          t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("class", "askwf-secs");
          t.setAttribute("text-anchor", "middle");
          t.setAttribute("x", box.x + box.width / 2);
          t.setAttribute("y", box.y + box.height + 13);
          g.appendChild(t);
        }
        const note = askWorkflowNotes[n.name];
        t.textContent = st === "skipped" ? "skipped" : (isCodeStep && !askWorkflowNotes[n.name]) ? [secs, "code"].join(" · ") : [secs, note].filter(Boolean).join(" · ");
      }
    }
    // Writes into #askBenchmarkLiveStatus (see its own CSS comment), not a
    // single persistent element: that span lives inside whichever card is
    // currently in the rail (the running skeleton, then the final answer
    // card), both of which get fully replaced via innerHTML at various
    // points, so it's looked up fresh on every tick rather than cached.
    function renderAskWorkflowCaption() {
      const el = document.getElementById("askBenchmarkLiveStatus");
      if (!el) return;
      if (!askWorkflowLabel) { el.textContent = ""; return; }
      const secs = askWorkflowStartedAt ? ((Date.now() - askWorkflowStartedAt) / 1000).toFixed(1) + "s" : "";
      el.textContent = `${askWorkflowLabel}… ${secs}`;
    }
    // Starts fresh state for a new question. The previous question's
    // finished diagram/caption are kept on screen for reference until
    // this runs again, not cleared when that question's answer arrives.
    // The tick redraws the whole diagram, not just the caption. A
    // comparison question's Retriever calls are plain DB lookups that
    // can complete in well under 100ms, faster than a single phase
    // event could otherwise be seen at all; a redraw every 250ms means
    // the currently-active node's own seconds count is visibly ticking
    // up in real time, and even a very short-lived state still gets at
    // least one real frame on screen instead of being silently skipped
    // by the next phase's own state change overwriting it first.
    // question: shown as the "Ask" node's own hover title (see
    // renderAskWorkflowDiagram). That first node also starts "active"
    // immediately, with its own timer already running, rather than
    // "idle" until the real resolving_vendor phase event streams back --
    // per explicit request, the pipeline diagram's own first node is now
    // what gives a viewer instant feedback that a question was actually
    // submitted, replacing the submit button's own former loading state
    // (removed as a redundant second "something is happening" signal).
    function startAskWorkflow(question) {
      askWorkflowQuestion = question || "";
      askWorkflowNotes = {}; askWorkflowLog = []; askWorkflowFinished = false; askWorkflowAgentKeys = null; askWorkflowStartedRun = Date.now();
      askConsoleLog("Question received");
      askWorkflowState = { vendor: "active", rewriter: "idle", retriever: "idle", classify: "idle", evaluator: "idle", orchestrator: "idle", websearch: "idle", verify: "idle" };
      const now = Date.now();
      askWorkflowTiming = { vendor: { startedAt: now, doneMs: null }, rewriter: null, retriever: null, classify: null, evaluator: null, orchestrator: null, websearch: null, verify: null };
      askWorkflowLabel = ""; askWorkflowStartedAt = null;
      if (askWorkflowTickTimer) clearInterval(askWorkflowTickTimer);
      askWorkflowTickTimer = setInterval(() => { renderAskWorkflowCaption(); renderAskWorkflowDiagram(); }, 250);
      renderAskWorkflowDiagram();
    }
    // Freezes doneMs on whichever node(s) are currently "active" (their
    // own elapsed time stops growing) right before the state itself
    // flips to "done". Shared by both a normal phase transition and
    // the end-of-request finish, so a node's frozen time always matches
    // the moment it actually stopped being active.
    function freezeActiveAskWorkflowTiming(now) {
      for (const k of Object.keys(askWorkflowState)) {
        if (askWorkflowState[k] !== "active") continue;
        const t = askWorkflowTiming[k];
        if (t && t.doneMs == null) t.doneMs = now - t.startedAt;
      }
    }
    // Console box under the Short answer: one timestamped line per progress
    // event, appended live. The box exists in the running card and in the
    // finished card's Short answer tab, so both are refreshed together.
    function askConsoleLog(text, cls) {
      const t = askWorkflowStartedRun ? ((Date.now() - askWorkflowStartedRun) / 1000).toFixed(1) : "0.0";
      askWorkflowLog.push({ t, text, cls: cls || "" });
      renderAskConsole();
    }
    let askWorkflowStartedRun = 0;
    function askConsoleHtml() {
      return askWorkflowLog.slice().reverse().map(l => `<div class="${l.cls}"><span class="ac-t">[${l.t}s]</span> ${uaEsc(l.text)}</div>`).join("");
    }
    let askConsoleMin = false;
    function renderAskConsole() {
      let el = document.getElementById("askConsoleFixed");
      if (!el) {
        el = document.createElement("div");
        el.id = "askConsoleFixed";
        el.className = "ask-console";
        el.setAttribute("aria-label", "Run log");
        document.body.appendChild(el);
        document.body.classList.add("has-ask-console");
      }
      el.classList.toggle("ask-console-min", askConsoleMin);
      document.body.classList.toggle("has-ask-console-min", askConsoleMin);
      el.innerHTML = `<button type="button" class="ask-console-close" aria-label="${askConsoleMin ? "Expand log" : "Minimize log"}" title="${askConsoleMin ? "Expand" : "Minimize"}">${askConsoleMin ? "&#9650;" : "&#8211;"}</button>` + (askConsoleMin ? '<span class="ac-t">Run log</span>' : askConsoleHtml());
      el.querySelector(".ask-console-close").onclick = () => { askConsoleMin = !askConsoleMin; renderAskConsole(); };
      el.scrollTop = 0; // newest line is on top
      // Start where the main column starts so the sidebar never covers the text.
      const main = document.getElementById("askWorkflowTop");
      const host = main && main.parentElement;
      el.style.setProperty("--console-left", host ? Math.max(0, Math.round(host.getBoundingClientRect().left)) + "px" : "0px");
    }
    window.addEventListener("resize", () => { if (document.getElementById("askConsoleFixed")) renderAskConsole(); });
    function pushAskWorkflowPhase(phase, detail, preset, meta) {
      if (!askWorkflowState) return;
      if (phase === "note") {
        if (meta && meta.node) { askWorkflowNotes[meta.node] = meta.short || ""; askConsoleLog(`${meta.node}: ${meta.text || ""}`, "ac-note"); renderAskWorkflowDiagram(); }
        return;
      }
      const now = Date.now();
      askWorkflowLabel = askPhaseLabel(phase, detail, preset, meta);
      askWorkflowStartedAt = now;
      askConsoleLog(askWorkflowLabel);
      const node = ASK_WORKFLOW_PHASE_NODE[phase];
      if (node) {
        freezeActiveAskWorkflowTiming(now);
        for (const k of Object.keys(askWorkflowState)) {
          if (askWorkflowState[k] === "active") askWorkflowState[k] = "done";
        }
        askWorkflowState[node] = "active";
        askWorkflowTiming[node] = { startedAt: now, doneMs: null };
        // "retrying" means the Evaluator is sending the Retriever back
        // for another pass. The Retriever lighting up again (not
        // staying "done" from its first pass, with a fresh timer for
        // this second pass) is the whole point here.
        if (phase === "retrying") {
          askWorkflowState.retriever = "active";
          askWorkflowTiming.retriever = { startedAt: now, doneMs: null };
        }
      }
      renderAskWorkflowCaption();
      renderAskWorkflowDiagram();
    }
    // Called once the request is done, success or failure. Freezes the
    // caption's elapsed time and stops the live tick, marks whichever
    // node was still active as done (and freezes its own elapsed time),
    // but leaves the diagram/caption visible for reference (useful for
    // evaluation) until the next question starts a new one.
    function finishAskWorkflow() {
      if (askWorkflowTickTimer) { clearInterval(askWorkflowTickTimer); askWorkflowTickTimer = null; }
      if (!askWorkflowState) return;
      const now = Date.now();
      freezeActiveAskWorkflowTiming(now);
      for (const k of Object.keys(askWorkflowState)) {
        if (askWorkflowState[k] === "active") askWorkflowState[k] = "done";
      }
      // Cleared, not frozen on its last phase: the caption's own job was
      // narrating what's happening RIGHT NOW during the run ("Generating
      // answer… 1.4s"); once the run is done, that same present-tense
      // text just sits there looking unfinished, right next to the
      // answer card's own total latency chip ("6s") -- two different
      // numbers with no label distinguishing "this one node" from "the
      // whole request," reported live as confusing. The diagram itself
      // still shows every node's own elapsed time after this, so nothing
      // about the per-phase breakdown is actually lost, just this one
      // redundant trailing line.
      askWorkflowLabel = "";
      askWorkflowFinished = true;
      askConsoleLog("Done");
      renderAskWorkflowCaption();
      renderAskWorkflowDiagram();
    }

    function updateAskPreview() {
      const question = askQuestionEl.value;
      const intent = classifyIntentClient(question);
      if (intent) {
        askIntentBadgeEl.textContent = ASK_INTENT_BADGE_LABELS[intent];
        askIntentBadgeEl.hidden = false;
      } else {
        askIntentBadgeEl.hidden = true;
      }
      // Independent of the domain badge above: hidden only when there's
      // no question at all to classify (an empty box has no "fact" vs
      // "opinion" answer either), shown otherwise regardless of whether
      // the domain badge itself is showing.
      if (question.trim()) {
        askQuestionTypeBadgeEl.textContent = ASK_QUESTION_TYPE_BADGE_LABELS[classifyQuestionTypeClient(question)];
        askQuestionTypeBadgeEl.hidden = false;
      } else {
        askQuestionTypeBadgeEl.hidden = true;
      }
    }
    askQuestionEl.addEventListener("input", updateAskPreview);

    // The "search: ... · window: ... · intent: ... · vendor required"
    // readout used to live here too, as its own fixed strip below the
    // header, updating live as you typed. Moved per explicit request to
    // sit above the workflow diagram in the Answer panel instead (see
    // askQueryPreviewBlockHtml, wired into showAskRailRunning and
    // askRenderCard's showWorkflow branch): a snapshot of what the
    // submitted question actually resolved to, not a live typing hint.
    // Short, label-style phrasing ("search:", not "Will search for") is
    // still worth keeping even off the fixed-overlay path this was
    // originally written for: a comparison question's own 4-term list
    // still runs long, and this stays legible next to the diagram.
    // Real recognized product/vendor names found in the question, tested
    // against suggestionPool (the same live list, built by
    // buildSuggestionPool, that the search autocomplete already matches
    // against), not just "the vendor-check box is on." A bare "vendor
    // required" told a viewer nothing about which vendor it actually
    // resolved to; this shows the real name(s) whenever at least one is
    // recognized, per explicit request.
    function previewVendors(question) {
      const words = String(question || "").toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*/g) || [];
      if (!words.length) return [];
      const pool = new Set(suggestionPool);
      const found = [];
      const seen = new Set();
      for (const w of words) {
        if (pool.has(w) && !seen.has(w)) { seen.add(w); found.push(w); }
      }
      return found;
    }
    function buildAskPreviewParts(question, intent) {
      const terms = previewSearchTerms(question);
      const parts = [];
      if (terms.length) parts.push(`search: <strong>${uaEsc(terms.join(", "))}</strong>`);
      if (askTemporalFilterEl.checked) parts.push(`window: ${uaEsc(formatTemporalConstraint(previewTemporalConstraint(question, askResolveTemporalEl.checked)))}`);
      if (askIntentFilterEl.checked) parts.push(`intent: <strong>${uaEsc(ASK_INTENT_TAGS[intent || "general"])}</strong>`);
      if (askVendorCheckEl.checked) {
        const vendors = previewVendors(question);
        parts.push(vendors.length ? `vendor: <strong>${uaEsc(vendors.join(", "))}</strong>` : "vendor required");
      }
      return parts;
    }
    function askQueryPreviewBlockHtml(question) {
      const parts = buildAskPreviewParts(question, classifyIntentClient(question));
      return parts.length ? `<div class="ask-query-preview">${parts.join(" · ")}</div>` : "";
    }

    // Dropdown source: real component names only (the old Search box's
    // own autocomplete, instant/local; see suggestionPool/getCurrentToken/
    // replaceCurrentToken/highlightMatch further down this file). Used to
    // also merge in real past community questions (GET /api/reddit/query/
    // questions/suggest) as a second, async-appended source, removed per
    // explicit request - picking a component replaces just the current
    // comma-separated token, so "chrome, fire" style multi-component entry
    // still works.
    const askSuggestionsEl = document.getElementById("askSuggestions");
    let askSuggestActiveIdx = -1;
    // A component's own latest-version bracket (e.g. "Android (latest:
    // 17.0.0)"), shown both here in the Ask suggestion dropdown and on
    // each feed group's own header (see renderComponentNode further
    // down), is fetched lazily, one component name at a time, and
    // cached here (value null once a name is known to have nothing) so
    // re-showing an already-seen name never refetches it.
    // askSuggestRenderGen (used by this dropdown only) guards the DOM
    // update the fetch eventually makes: by the time it resolves, the
    // dropdown may already be showing a completely different query's
    // results, and this must not stamp a version onto whatever
    // unrelated row happens to occupy that position now.
    const componentLatestVersionCache = new Map();
    let askSuggestRenderGen = 0;
    // Returns { version, date } (versionReleaseDate, YYYYMMDD) rather
    // than a bare version string, so a caller can show how fresh that
    // "latest" actually is (see renderComponentNode's feed group header)
    // without a second lookup. `date` is null wherever `version` is,
    // and every existing caller that only wants the number still works
    // unchanged since destructuring `{ version }` off a null result is
    // safe.
    // At most 4 of these lookups run at once. The feed asks for one per
    // group, and ~70 simultaneous requests on page load can knock a small
    // server over (the proxy then answers 502 to everything, login included).
    const latestVersionQueue = [];
    let latestVersionActive = 0;
    function latestVersionFetch(url) {
      return new Promise((resolve, reject) => {
        latestVersionQueue.push({ url, resolve, reject });
        pumpLatestVersionQueue();
      });
    }
    function pumpLatestVersionQueue() {
      while (latestVersionActive < 4 && latestVersionQueue.length) {
        const job = latestVersionQueue.shift();
        latestVersionActive++;
        fetch(job.url).then(job.resolve, job.reject).finally(() => { latestVersionActive--; pumpLatestVersionQueue(); });
      }
    }
    async function fetchLatestVersionFor(name) {
      const key = name.toLowerCase();
      if (componentLatestVersionCache.has(key)) return componentLatestVersionCache.get(key);
      let result = { version: null, date: null };
      let cacheable = true;
      try {
        const res = await latestVersionFetch(`${API_BASE}c/name/${encodeURIComponent(name)}`);
        if (!res.ok && res.status >= 500) cacheable = false;
        if (res.ok) {
          const data = await res.json();
          const list = Object.values(data)[0];
          // /api/c/name/:name is sorted by versionReleaseDate (real
          // release date), but that's not the same as "the highest
          // version": a CVE record can share/exceed a real release's date
          // (excluded below via !v.isCve), and separately, a product with
          // several concurrently-maintained branches (e.g. Python's
          // 3.12/3.13/3.14) can post an older branch's patch after a
          // newer branch's, so the first non-CVE, most-recently-dated
          // entry isn't necessarily the actual highest version (verified
          // live: Python's own top result this way was "3.12.14," dated
          // after 3.14.7 even though 3.14 is the newer branch). Pick the
          // max by real version number instead, same numeric-split
          // comparison as aVerGap's own parser here and
          // compareVersionsNumeric in the server's app.js; keep all three
          // in sync.
          const nonCve = Array.isArray(list) ? list.filter(v => !v.isCve) : [];
          const parseVer = s => String(s || "").split(/[^0-9]+/).filter(Boolean).map(Number);
          const best = nonCve.reduce((top, v) => {
            if (!top) return v;
            const pv = parseVer(v.versionNumber), pt = parseVer(top.versionNumber);
            for (let i = 0; i < Math.max(pv.length, pt.length); i++) {
              const d = (pv[i] || 0) - (pt[i] || 0);
              if (d !== 0) return d > 0 ? v : top;
            }
            return (v.versionReleaseDate || "") > (top.versionReleaseDate || "") ? v : top;
          }, null);
          if (best && best.versionNumber) result = { version: best.versionNumber, date: best.versionReleaseDate || null };
        }
      } catch { cacheable = false; /* leave result null; a missing bracket beats a broken dropdown */ }
      if (cacheable) componentLatestVersionCache.set(key, result);
      return result;
    }

    function hideAskSuggestions() {
      askSuggestionsEl.classList.remove("open");
      askSuggestionsEl.innerHTML = "";
      askSuggestActiveIdx = -1;
    }
    // suggestionPool/getCurrentToken/highlightMatch are declared later in
    // this file but only ever called from here at runtime (an input
    // event, long after the whole script has run once), so referencing
    // them here ahead of their own declaration is safe.
    function computeComponentMatches(val) {
      const token = getCurrentToken(val).trim().toLowerCase();
      if (!token) return [];
      return suggestionPool.filter(n => n.includes(token)).slice(0, 5)
        .map(n => ({ kind: "component", value: n, html: highlightMatch(n, token) }));
    }
    function showAskSuggestions(items) {
      askSuggestActiveIdx = -1;
      const gen = ++askSuggestRenderGen;
      askSuggestionsEl.innerHTML = items.map((it, i) => `
        <li role="option" data-kind="component" data-val="${uaEsc(it.value)}">
          <span class="ask-suggestion-text">🧩 ${it.html}</span>
          <span class="ask-suggestion-ver" data-ver-slot="${i}"></span>
        </li>`
      ).join("");
      askSuggestionsEl.classList.add("open");
      // Shown always, for every row, once it resolves; not conditional on
      // anything beyond "this row is still on screen".
      items.forEach((it, i) => {
        fetchLatestVersionFor(it.value).then(({ version }) => {
          if (gen !== askSuggestRenderGen || !version) return;
          const slot = askSuggestionsEl.querySelector(`[data-ver-slot="${i}"]`);
          if (slot) slot.textContent = `(latest: ${version})`;
        });
      });
    }
    function pickAskSuggestion(li) {
      askQuestionEl.value = replaceCurrentToken(askQuestionEl.value, li.dataset.val);
      hideAskSuggestions();
      updateAskPreview();
      askQuestionEl.focus();
    }
    askQuestionEl.addEventListener("input", () => {
      const componentMatches = computeComponentMatches(askQuestionEl.value);
      if (componentMatches.length) showAskSuggestions(componentMatches);
      else hideAskSuggestions();
    });
    askQuestionEl.addEventListener("keydown", e => {
      if (!askSuggestionsEl.classList.contains("open")) return;
      const items = askSuggestionsEl.querySelectorAll("li");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        askSuggestActiveIdx = Math.min(askSuggestActiveIdx + 1, items.length - 1);
        items.forEach((li, i) => li.classList.toggle("active", i === askSuggestActiveIdx));
        if (items[askSuggestActiveIdx]) items[askSuggestActiveIdx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        askSuggestActiveIdx = Math.max(askSuggestActiveIdx - 1, -1);
        items.forEach((li, i) => li.classList.toggle("active", i === askSuggestActiveIdx));
      } else if (e.key === "Enter" && askSuggestActiveIdx >= 0) {
        e.preventDefault();
        pickAskSuggestion(items[askSuggestActiveIdx]);
      } else if (e.key === "Escape") {
        hideAskSuggestions();
      }
    });
    askSuggestionsEl.addEventListener("mousedown", e => {
      const li = e.target.closest("li");
      if (!li) return;
      e.preventDefault();
      pickAskSuggestion(li);
    });
    askQuestionEl.addEventListener("blur", () => setTimeout(hideAskSuggestions, 150));

    // Provider + size lists come from the server (GET /api/ask/providers),
    // not hardcoded here - each provider offers its own 3 model sizes
    // (small/medium/large), with its own labels (e.g. Groq's "Small
    // (20B)" vs Ollama's "Small (~14GB)"), so the Size <select>'s options
    // depend on whichever Model is currently picked. Fetched once and
    // cached; the two <option>s already in the Model <select>'s markup
    // are just a same-render fallback for the brief window before this
    // resolves.
    let ASK_PROVIDER_DATA = null;
    // Set once askLoadProviders' response arrives (admin-configured, via
    // GET /api/ask/providers' defaultSize) and consumed the first time
    // askPopulateSizeOptions runs after that; preferred over the
    // prevValue/"medium" fallback below exactly once, then cleared, so a
    // later provider switch (the user actively picking a different size)
    // isn't repeatedly forced back to the admin default.
    let askDefaultSizePending = null;
    function askPopulateSizeOptions() {
      const sizeEl = document.getElementById("askSize");
      if (!ASK_PROVIDER_DATA) return;
      const providerId = document.getElementById("askProvider").value;
      const provider = ASK_PROVIDER_DATA.find(p => p.id === providerId);
      const sizes = (provider && provider.sizes) || [];
      const prevValue = sizeEl.value;
      sizeEl.innerHTML = sizes.map(s => `<option value="${uaEsc(s.id)}">${uaEsc(s.label)}</option>`).join("");
      // Keep the same size tier (e.g. stay on "large") across a provider
      // switch when the new provider has one by that id; default to
      // medium otherwise rather than whatever the browser picks first.
      if (askDefaultSizePending && sizes.some(s => s.id === askDefaultSizePending)) {
        sizeEl.value = askDefaultSizePending;
      } else if (sizes.some(s => s.id === prevValue)) {
        sizeEl.value = prevValue;
      } else if (sizes.some(s => s.id === "medium")) {
        sizeEl.value = "medium";
      }
      askDefaultSizePending = null;
    }
    async function askLoadProviders() {
      try {
        const res = await uaRequest("ask/providers");
        const data = await res.json();
        ASK_PROVIDER_DATA = data.providers || [];
        const providerEl = document.getElementById("askProvider");
        const prevValue = providerEl.value;
        providerEl.innerHTML = ASK_PROVIDER_DATA.map(p => `<option value="${uaEsc(p.id)}">${uaEsc(p.label)}</option>`).join("");
        // The admin-configured default (see UA_SETTINGS_META's
        // askDefaultProvider/askDefaultSize/askDefaultPreset) wins on this
        // first load over the static markup's hardcoded selection; a
        // later re-fetch (there isn't one today, but if one's ever added)
        // would fall back to preserving whatever the visitor already
        // has selected instead of re-forcing the admin default on them.
        if (data.defaultProvider && ASK_PROVIDER_DATA.some(p => p.id === data.defaultProvider)) {
          providerEl.value = data.defaultProvider;
        } else if (ASK_PROVIDER_DATA.some(p => p.id === prevValue)) {
          providerEl.value = prevValue;
        }
        askDefaultSizePending = data.defaultSize || null;
        askPopulateSizeOptions();
        const presetEl = document.getElementById("askPreset");
        if (data.defaultPreset && presetEl.querySelector(`option[value="${CSS.escape(data.defaultPreset)}"]`)) {
          presetEl.value = data.defaultPreset;
        }
      } catch {
        // Leave the two hardcoded fallback <option>s in place; Size stays
        // empty in this case (no live provider/size data to build it
        // from), same "degrade, don't crash" spirit as everywhere else
        // in this form.
      }
    }
    document.getElementById("askProvider").addEventListener("change", askPopulateSizeOptions);
    askLoadProviders().then(() => askRefreshQuota());

    // Was also a visible "Usage: N call(s) today..." line; removed per
    // explicit request (it read as broken, permanently stuck on "limits
    // unknown until a request succeeds" for any provider that doesn't
    // return real rate-limit headers, e.g. Ollama Cloud, the default).
    // The underlying quota fetch stays: rather than silently falling
    // back to a different provider when one is rate-limited (surprising:
    // "I picked Claude but got a Groq answer"), disable that option in
    // the Model select so it can be seen but not picked, and let the
    // user explicitly choose a working one. Doesn't touch an
    // already-selected option's value. Only new selections are blocked,
    // so a provider that becomes rate-limited mid-use doesn't get
    // silently swapped out from under an open answer.
    function askUpdateProviderOptions(quotaData) {
      Array.from(document.getElementById("askProvider").options).forEach(opt => {
        const q = quotaData[opt.value];
        const limited = !!(q && q.rateLimitedSecondsLeft);
        opt.disabled = limited;
        const baseLabel = opt.textContent.replace(/ \(rate limited\)$/, "");
        opt.textContent = limited ? `${baseLabel} (rate limited)` : baseLabel;
      });
    }
    async function askRefreshQuota() {
      try {
        const res = await uaRequest("ask/quota");
        if (!res.ok) return;
        askUpdateProviderOptions(await res.json());
      } catch { /* provider options just stay as they were */ }
    }
    document.getElementById("askProvider").addEventListener("change", askRefreshQuota);

    // Reddit yes/no community poll: delegated so it works for every
    // .poll-btn regardless of which timeline group re-renders it. Results
    // are memoized per redditId+provider for the life of the page (a
    // second click just re-shows the same tally rather than re-spending
    // a call).
    const pollResultCache = new Map();
    function renderPollResult(btn, data) {
      delete btn.dataset.state;
      btn.disabled = true;
      btn.classList.add("chip-done");
      const parts = [];
      if (data.no) parts.push(`No ${data.no}`);
      if (data.yes) parts.push(`Yes ${data.yes}`);
      if (data.unclear) parts.push(`Unclear ${data.unclear}`);
      btn.textContent = "📊 " + (parts.length ? parts.join(" · ") : "no clear answers");
      const details = data.breakdown && data.breakdown.length
        ? data.breakdown.map(b => `${b.verdict.toUpperCase()}: ${b.author} - "${b.body}"`).join("\n")
        : "";
      if (details) btn.title = details;
    }
    document.addEventListener("click", async e => {
      const btn = e.target.closest(".poll-btn");
      if (!btn) return;
      e.preventDefault();
      if (btn.dataset.state === "loading" || btn.disabled) return;
      if (!uaToken()) {
        promptSignIn("Sign in or create a free account to run a poll — it runs a real query against the model.");
        return;
      }
      const redditId = btn.dataset.redditId;
      if (!redditId) return;
      // Without sending this, the server defaults to Anthropic regardless
      // of what is actually selected/working in the Ask box. If that
      // provider's account is out of credit or otherwise down, every
      // single poll fails while Ask itself looks fine, since Ask lets the
      // user pick a different, working provider. Send whichever provider
      // is currently selected there instead, and key the cache on it too,
      // so switching provider and polling again is not silently served a
      // stale result from a different one.
      const provider = document.getElementById("askProvider")?.value || "";
      const cacheKey = redditId + ":" + provider;
      const cached = pollResultCache.get(cacheKey);
      if (cached) { renderPollResult(btn, cached); return; }
      btn.dataset.state = "loading";
      const prevText = btn.textContent;
      btn.textContent = "⏳ Poll";
      try {
        const qs = provider ? `?provider=${encodeURIComponent(provider)}` : "";
        const res = await uaRequest(`reddit/${encodeURIComponent(redditId)}/poll${qs}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed.");
        pollResultCache.set(cacheKey, data);
        renderPollResult(btn, data);
      } catch (err) {
        delete btn.dataset.state;
        btn.textContent = "⚠️ poll failed";
        btn.classList.add("chip-err");
        btn.title = (err && err.message) || "Request failed.";
        setTimeout(() => { btn.textContent = prevText; btn.classList.remove("chip-err"); }, 3000);
      }
    });
    // Search and Ask used to be two separate forms, switched by a mode
    // toggle. #askForm is now the only visible box (see the submit
    // handler below for how it branches between the two), so there's no
    // toggle left to wire up here.

    const askOverlayEl = document.getElementById("askOverlay");
    const askModalEl = document.getElementById("askModal");
    function askCloseModal() {
      askOverlayEl.classList.remove("open");
      askModalEl.classList.remove("open");
    }
    askOverlayEl.addEventListener("click", askCloseModal);
    document.getElementById("askModalClose").addEventListener("click", askCloseModal);
    document.addEventListener("keydown", e => { if (e.key === "Escape") askCloseModal(); });

    // Two groups, not one flat list: release notes/CVE are this system's
    // own documented evidence, everything else (reddit, the web) is
    // community discussion the model also drew on. Splitting them makes
    // it obvious at a glance which kind of source a given claim rests on,
    // instead of the two reading as one undifferentiated pile.
    // Surfaces exactly what verifyVendorViaWeb searched and found on the
    // server (see ask.js), not just the bare fact that a pipeline
    // escalated -- including on a "no vendor detected" abstain, where
    // this evidence block is the only way to see why. webEvidence is
    // null on any run that never needed escalation at all.
    function askRenderWebVerification(webEvidence) {
      if (!webEvidence || !webEvidence.candidate) return "";
      const results = webEvidence.results || [];
      const resultsHtml = results.length
        ? `<ol class="ask-webverify-results">${results.map(r => {
            const titleHtml = `<strong>${uaEsc(r.title || r.url || "")}</strong>`;
            const linked = r.url
              ? `<a href="${uaEsc(r.url)}" target="_blank" rel="noopener">${titleHtml}</a>`
              : titleHtml;
            return `<li class="ask-webverify-result">${linked}${r.snippet ? `<div class="ask-webverify-snippet">${uaEsc(r.snippet)}</div>` : ""}</li>`;
          }).join("")}</ol>`
        : `<p class="ask-muted">The search returned no results.</p>`;
      const verdictHtml = webEvidence.verified
        ? `✅ verified${webEvidence.name ? ` as "${uaEsc(webEvidence.name)}"` : ""}`
        : `⛔ not verified`;
      return `<div class="ask-source-group ask-webverify-group">
        <div class="ask-source-heading">Web Verification</div>
        <div class="ask-webverify-grid">
          <div class="ask-webverify-col">
            <div><strong>Candidate:</strong> ${uaEsc(webEvidence.candidate)}</div>
            <div><strong>Searched:</strong> ${uaEsc(webEvidence.searchQuery || webEvidence.candidate)}</div>
            <div><strong>Verdict:</strong> ${verdictHtml}</div>
          </div>
          <div class="ask-webverify-col">${resultsHtml}</div>
        </div>
      </div>`;
    }
    // Brief, deliberately: deterministicWebFallback's own zero-evidence
    // retrieval fallback (see ask.js) is a plain search_web call, not a
    // vendor-verification judgment like askRenderWebVerification above,
    // so there's no candidate/verdict to show, just proof a real search
    // was attempted. Only rendered when it found NOTHING -- a successful
    // find already shows up as a normal clickable "web"-kind source in
    // the Discussion group below, so a separate block for that case
    // would just duplicate it. A manual-verification link (a plain
    // Google search URL) is included since the automated search engines
    // this tool scrapes can intermittently block automated requests
    // (see webSearch.js's own header comment) without blocking a real
    // browser, so a human can often verify in one click when the
    // automated attempt came up empty.
    function askRenderWebSearchFallback(webSearchFallback) {
      if (!webSearchFallback || webSearchFallback.resultCount > 0) return "";
      const q = webSearchFallback.query || "";
      const href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
      return `<p class="ask-muted">Web search for "${uaEsc(q)}" found no results. <a href="${uaEsc(href)}" target="_blank" rel="noopener">Search manually to verify</a>.</p>`;
    }
    // A "Documented" source's own url isn't always a specific artifact -
    // a CVE's url is always NVD's description page (see mitre.py's own
    // versionUrl comment), never the fix; a release's url used to always
    // be a generic repo homepage too. Returns the real, specific artifact
    // link when this source actually has one, null otherwise - a CVE's
    // own separate patchUrl (see classifySourcesTrust in ask.js,
    // populated from mitre.py's tagged NVD references), or a release
    // whose url already points at a real downloadable artifact: a tagged
    // release's own archive (github.py's normal case, per direct
    // follow-up - "they point the github project not the branch tag zip
    // or tar file") or, for an in-progress rc/beta with no tag of its
    // own yet, the specific commit. Reported live: "where is the
    // specific artifact link, link to the specific code not the generic
    // github page" - this is what actually answers that, by only ever
    // surfacing a link here when it's genuinely one.
    function askArtifactUrl(s) {
      if (s.kind === "cve" && s.patchUrl) return s.patchUrl;
      if (s.kind === "release" && /\/(commit|archive)\//.test(s.url || "")) return s.url;
      return null;
    }
    function askRenderSources(sources, webEvidence, webSearchFallback) {
      const webVerifyHtml = askRenderWebVerification(webEvidence);
      const webFallbackHtml = askRenderWebSearchFallback(webSearchFallback);
      if (!sources || !sources.length) {
        return webVerifyHtml || webFallbackHtml || '<p class="ask-muted">No sources were found for this question.</p>';
      }
      // Artifact: lifted out of Documented (not just listed twice) so a
      // reader sees at a glance which sources actually have a real,
      // specific code artifact behind them, per explicit request ("add
      // a section artifact at the beginning") - rendered with THIS
      // source's own artifact url substituted in, since the item
      // renderer just links whatever `.url` it's given.
      const artifactUrlBySource = new Map();
      for (const s of sources) {
        const u = askArtifactUrl(s);
        if (u) artifactUrlBySource.set(s, u);
      }
      const artifact = sources.filter(s => artifactUrlBySource.has(s)).map(s => ({ ...s, url: artifactUrlBySource.get(s) }));
      const documented = sources.filter(s => (s.kind === "cve" || s.kind === "release") && !artifactUrlBySource.has(s));
      const discussion = sources.filter(s => s.kind !== "cve" && s.kind !== "release");
      const group = (label, list) => list.length
        ? `<div class="ask-source-group"><div class="ask-source-heading">${label}</div>${askRenderSourceItems(list)}</div>`
        : "";
      return webVerifyHtml + webFallbackHtml + group("Artifact", artifact) + group("Documented", documented) + group("Discussion", discussion);
    }

    // "stackoverflow" was previously indistinguishable from "reddit": the
    // server used to hardcode kind:'reddit' for every doc in the shared
    // collection regardless of its real source field, so a genuine Stack
    // Overflow citation had no way to look like one. 🟧 matches the same
    // emoji the feed's own "SO" summary chip uses. The icon alone already
    // tells a documented source (📦/🔴) apart from a discussion one
    // (💬/🟧/🌐), which is what lets askRenderSourceItems below skip a
    // separate Documented/Discussion group heading when a caller (Eval
    // Rewriter's own dense lists) wants a flat list instead.
    function askSourceIcon(kind) {
      return kind === "cve" ? "🔴" : kind === "reddit" ? "💬" : kind === "stackoverflow" ? "🟧" : kind === "web" ? "🌐" : "📦";
    }
    // Icon/title/date each their own grid cell (see .ask-source-row's own
    // CSS comment) so every row's date lines up in the same column,
    // instead of trailing right after each row's own differently-long
    // title. Shared by askRenderSources' own grouped rendering above and
    // any caller that wants the plain flat list on its own.
    // showUrl (default false): the eval tools' own source lists (Eval
    // Rewriter's with/without/common columns) show the raw URL instead
    // of the title, per explicit request, since a debugging/comparison
    // view benefits more from seeing exactly where a result actually
    // came from than a possibly-truncated headline; the main answer's
    // own Sources tab keeps the title, unaffected.
    function askRenderSourceItems(sources, showUrl) {
      const renderItem = s => {
        const dateStr = s.date ? String(s.date) : "";
        const label = showUrl ? (s.url || s.title) : s.title;
        const cells = `<span class="ask-source-icon">${askSourceIcon(s.kind)}</span>` +
          `<span class="ask-source-title"><strong>${uaEsc(label)}</strong></span>` +
          `<span class="ask-source-date">${dateStr ? "· " + uaEsc(dateStr) : ""}</span>`;
        return `<li>${s.url
          ? `<a class="ask-source-row" href="${uaEsc(s.url)}" target="_blank" rel="noopener">${cells}</a>`
          : `<span class="ask-source-row">${cells}</span>`}</li>`;
      };
      return `<ul class="ask-sources">${sources.map(renderItem).join("")}</ul>`;
    }

    // Meta chips (vendor/intent/temporal) plus a collapsible technical
    // detail section (system prompt + the actual search calls made) - the
    // evidence-gating checkboxes only matter if their effect is visible,
    // not just trusted blindly.
    function askRenderMetaChips(res) {
      const chips = [];
      if (res.vendor) chips.push(`vendor: ${uaEsc(res.vendor)}`);
      if (res.intent) chips.push(`intent: ${uaEsc(res.intent)}`);
      if (res.temporalConstraint) {
        const tc = res.temporalConstraint;
        const iso = `${tc.date.slice(0,4)}-${tc.date.slice(4,6)}-${tc.date.slice(6,8)}`;
        chips.push(tc.type === "as_of" ? `as of ${iso}` : `since ${iso}`);
      }
      if (!chips.length) return "";
      return `<div class="ask-meta-chips">${chips.map(c => `<span class="ask-meta-chip">${c}</span>`).join("")}</div>`;
    }

    function askRenderDetails(res) {
      if (!res.systemPrompt && !(res.searchCalls && res.searchCalls.length)) return "";
      const calls = (res.searchCalls || []).map(c =>
        `<li><code>${uaEsc(c.tool)}</code>(<code>${uaEsc((c.input && c.input.query) || "")}</code>) → ${c.resultCount} result${c.resultCount === 1 ? "" : "s"}</li>`
      ).join("");
      return `<details class="ask-details">
        <summary>Show internals (search calls, system prompt)</summary>
        ${calls ? `<ol class="ask-calls">${calls}</ol>` : '<p class="ask-muted">No search calls were made.</p>'}
        ${res.systemPrompt ? `<pre class="ask-system-prompt">${uaEsc(res.systemPrompt)}</pre>` : ""}
      </details>`;
    }

    // A checkbox column reads as a real, at-a-glance yes/no per role,
    // for THIS specific run, not a general claim about the pipeline's
    // architecture, which is why every row is driven off the actual
    // response fields (evaluatorRan, evaluatorOverridden, answerCorrected,
    // vendorWebVerified, webSearchFallback), not a fixed table. disabled,
    // not interactive: these are indicators, not settings. See ask.js's
    // own comments on each field (evaluatorRan in particular: false, not
    // true, for single_agent: that architecture never calls a separate
    // evaluatorAgent at all, a different mechanism handles that role).
    function askMvrCheckbox(checked) {
      return `<input type="checkbox" disabled ${checked ? "checked" : ""}>`;
    }
    // Renders only the reason for whichever box in a row is actually
    // checked, never a blended sentence that reads the same regardless
    // of check state (the bug that let "Vendor resolution" show a
    // checked Model box next to text describing a pure catalog lookup,
    // which involves no model call at all). modelReason/ruleReason are
    // null when that box is unchecked, so nothing renders for it; a row
    // where neither box is checked falls back to `fallback`.
    function askMvrMeaning(model, rule, modelReason, ruleReason, fallback) {
      const parts = [];
      if (model && modelReason) parts.push(`<div class="ask-mvr-reason"><strong>Model:</strong> ${modelReason}</div>`);
      if (rule && ruleReason) parts.push(`<div class="ask-mvr-reason"><strong>Rule:</strong> ${ruleReason}</div>`);
      return parts.length ? parts.join("") : fallback;
    }
    function askRenderModelVsRules(res) {
      // A comparison question ("Firefox or Chrome?") always runs
      // runComparisonAsk (ask.js), a genuinely different, entirely
      // deterministic-evidence pipeline: it never calls a real Rewriter
      // or Evaluator agent, and never lets the model choose which tool
      // to call, REGARDLESS of which preset is selected (Single-agent,
      // Multi-agent delegated, feedback loop, all identical here). This
      // used to read the exact same fields the normal pipeline uses
      // without checking for this case, so a comparison run under, say,
      // Multi-agent (delegated) still showed the Evaluator row's fixed
      // fallback text blaming "single-agent architecture", flatly
      // contradicting the preset actually picked. See res.intent, set to
      // the literal string "comparison" by classifyIntent().
      const isComparison = res.intent === "comparison";

      // Vendor resolution: a catalog hit is a plain array lookup, zero
      // model reasoning, so Model is checked ONLY when a real web
      // verification LLM call actually ran (res.vendorWebEvidence is set
      // the moment verifyVendorViaWeb is invoked, ask.js:715, regardless
      // of whether it ended up confirming a vendor, unlike
      // vendorWebVerified, which is only true on a POSITIVE outcome and
      // would wrongly leave Model unchecked for a real model judgment
      // call that came back negative). vendorRanCheck is false only for
      // the rare case nothing was ever attempted at all (an opinion
      // question bypasses vendor resolution entirely, or the "Vendor
      // check" toggle is off): every row should show at least one
      // checked box when a real mechanism produced its outcome, but a
      // role that was never reached is a genuinely different, honest
      // third state, not "Rule decided nothing."
      const vendorModel = !!res.vendorWebEvidence;
      const vendorRanCheck = !!res.vendor || vendorModel || res.abstainReason === "no_vendor_detected";
      const vendorRule = vendorRanCheck;
      const vendorMeaning = vendorRanCheck
        ? askMvrMeaning(vendorModel, true,
          `A real web search was judged by the model to confirm "${uaEsc(res.vendor || "")}" as a real product.`,
          res.vendorWebVerified
            ? "A catalog miss deterministically triggered the web-verification fallback above."
            : res.vendor
              ? "Matched directly against the tracked vendor catalog, a fixed lookup with no model call involved."
              : "The tracked vendor catalog and a web-verification check were both consulted, but no match was found for this question.",
          "")
        : "The pipeline never reached vendor resolution for this question (an opinion question, or vendor checking turned off in this run's config).";

      // Rewriter: only a genuinely delegated architecture (Multi-agent
      // delegated / feedback loop) ever runs a real, separate Rewriter
      // LLM call, res.evaluatorRan is true only once that SAME
      // delegated pipeline's real evaluatorAgent() call has actually run
      // (see its own top-of-function comment in ask.js: the two only
      // ever happen together), reused here rather than adding a fourth
      // field just for this row. Whenever it's false, something else
      // still deterministically decided that: either this preset simply
      // never includes a Rewriter step, or (a comparison question,
      // regardless of preset) intent classification routed around the
      // whole agentic pipeline before a Rewriter step could ever run.
      // Either way that is a real Rule outcome, not "nothing happened."
      const rewriterModel = !!res.evaluatorRan;
      const rewriterRule = !rewriterModel;
      const rewriterMeaning = askMvrMeaning(rewriterModel, rewriterRule,
        "The Rewriter agent (a separate LLM call) chose these search terms before retrieval started.",
        isComparison
          ? "A comparison question always skips the Rewriter and any other model-chosen tool selection, regardless of which preset is selected; a fixed set of deterministic searches runs instead (see Retriever)."
          : "This preset's architecture never includes a separate Rewriter step; the model picks its own search-tool arguments inline as part of one continuous loop.",
        "");

      // Retriever: a comparison question's evidence gathering
      // (comparisonEntityEvidence in ask.js) is entirely fixed, six
      // deterministic searches per side, never the model choosing which
      // tool to call or what to search for, unlike every other
      // question type, where the model always makes that choice itself
      // (Rule there only ADDS on top, when internal retrieval came up
      // empty and a deterministic web fallback took over).
      const retrieverModel = !isComparison;
      const retrieverFallbackUsed = !!(res.webSearchFallback && res.webSearchFallback.used);
      const retrieverRule = isComparison || retrieverFallbackUsed;
      const retrieverMeaning = isComparison
        ? askMvrMeaning(false, true, null,
          "Every search is fixed and deterministic per side (recent updates, known vulnerabilities, community reports), never chosen by the model.",
          "")
        : askMvrMeaning(true, retrieverFallbackUsed,
          "The model chose which internal tools to call and with what search terms.",
          "Internal retrieval came up empty, so a deterministic fallback tried a real web search directly.",
          "");

      // Evaluator: same "only a real delegated architecture calls a
      // separate Evaluator" logic as Rewriter above, so Rule is checked
      // whenever it didn't run at all (architecture, or a comparison
      // question) OR (on top of a real run) its verdict was overridden.
      const evaluatorModel = !!res.evaluatorRan;
      const evaluatorRule = !evaluatorModel || !!res.evaluatorOverridden;
      const evaluatorMeaning = askMvrMeaning(evaluatorModel, evaluatorRule,
        res.evaluatorOverridden
          ? "A separate Evaluator LLM call judged the draft answer, but its verdict was overridden (see the Rule reason)."
          : "A separate Evaluator LLM call judged the draft answer sufficient; no override was needed.",
        evaluatorModel
          ? uaEsc(res.evaluatorOverrideReason || "Overridden by a deterministic check.")
          : isComparison
            ? "No separate Evaluator LLM call for a comparison question. A deterministic formula weighs known vulnerabilities, average and worst-case community risk scores, and report counts to compute which side is lower risk."
            : "This preset's architecture never includes a separate Evaluator step; a different deterministic mechanism handles that role instead.",
        "");

      // Orchestrator: abstaining is itself a deterministic gate (no
      // evidence found, an opinion question, and so on), a real Rule
      // outcome, not "nothing happened", so it checks Rule rather than
      // leaving the row blank. Otherwise Model is checked when the
      // model's own generated wording was used as written, and Rule
      // instead whenever a deterministic check replaced it outright (a
      // version-correctness rewrite in the normal pipeline, or a
      // comparison answer that didn't correctly name the side the
      // deterministic risk score computed as lower-risk, see
      // answerCorrected's own comment in runComparisonAsk).
      const orchestratorModel = !res.abstained && !res.answerCorrected;
      const orchestratorRule = !!res.abstained || !!res.answerCorrected;
      const orchestratorMeaning = askMvrMeaning(orchestratorModel, orchestratorRule,
        "The model's own generated answer text was used.",
        res.abstained
          ? "The pipeline declined to answer before reaching this step."
          : isComparison
            ? "The model's wording did not correctly name the side the deterministic risk score computed as lower-risk, so it was replaced outright by a templated write-up of the same evidence."
            : "The model's own wording was replaced outright by a deterministic version-correctness rewrite.",
        "");

      // Classify: unlike every row above, this one is NEVER a model
      // judgment call by design (see classifySourcesTrust's own comment
      // in ask.js: a fixed domain-match rule plus a known-platform list,
      // never an LLM asked to guess trustworthiness) - Model stays
      // unchecked on every single run. Runs on the same delegated
      // architecture Rewriter/Evaluator do, so res.evaluatorRan (the
      // same real-run proxy already used for those two rows) doubles as
      // "did Classify run too", since both live in the same retrieval
      // loop and always run together.
      const classifyRan = !!res.evaluatorRan;
      const sourcesClassified = (res.sources || []).filter((s) => s.trustTier);
      const officialCount = sourcesClassified.filter((s) => s.trustTier === "official").length;
      const communityCount = sourcesClassified.filter((s) => s.trustTier === "community").length;
      const verifiedCount = sourcesClassified.filter((s) => s.urlVerified === true).length;
      const classifyMeaning = classifyRan
        ? askMvrMeaning(false, true, null,
          sourcesClassified.length
            ? `${sourcesClassified.length} source(s) checked: ${officialCount} official, ${communityCount} community, ${verifiedCount} with a live url confirmed.`
            : "No sources were retrieved to classify.",
          "")
        : "This preset's architecture has no separate Classify step (single-agent loops and comparison questions skip it).";

      const rows = [
        ["Vendor resolution", vendorModel, vendorRule, vendorMeaning],
        ["Rewriter", rewriterModel, rewriterRule, rewriterMeaning],
        ["Retriever", retrieverModel, retrieverRule, retrieverMeaning],
        ["Classify", false, classifyRan, classifyMeaning],
        ["Evaluator", evaluatorModel, evaluatorRule, evaluatorMeaning],
        ["Orchestrator", orchestratorModel, orchestratorRule, orchestratorMeaning],
      ];
      const body = rows.map(([label, model, rule, meaning]) => `<tr>
        <td>${uaEsc(label)}</td>
        <td>${askMvrCheckbox(model)}</td>
        <td>${askMvrCheckbox(rule)}</td>
        <td>${meaning}</td>
      </tr>`).join("");
      // A single-loop preset (not delegated, not a comparison) typically
      // checks Model on BOTH Retriever and Orchestrator here, since the
      // one loop chooses its own tools and writes its own final text:
      // two roles, genuinely fulfilled by the model. Reported live as a
      // fresh contradiction: the answer badge right above this tab says
      // "1 agent" for the same run (see agentCount's own comment in
      // askRenderCard), and two Model checkmarks read as "2 agents" next
      // to it. Both numbers are correct; they just answer different
      // questions. This note says so explicitly instead of leaving a
      // reader to guess which one is "wrong".
      const isSingleLoop = !isComparison && !res.evaluatorRan;
      const singleLoopNote = isSingleLoop
        ? `<p class="ask-mvr-note">This preset runs one continuous agent loop, so every row checked <strong>Model</strong> above was decided by that same single agent, not by a separate agent per row. See the answer badge above for the real count of distinct agents.</p>`
        : "";
      return `<div class="ask-mvr-wrap">
        ${singleLoopNote}
        <table class="ask-mvr-table">
          <thead><tr><th>Component</th><th>Model</th><th>Rule</th><th>Meaning</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
    }

    // Light markdown rendering for the model's own answer text: escape
    // first (uaEsc), THEN apply markdown on the already-escaped string,
    // so nothing in the model's output can inject real HTML. Only the
    // markdown syntax this function itself recognizes turns into tags.
    // Covers what the model's answers actually use: **bold**, `code`,
    // "- "/"* " bullet lists, "1. " numbered lists, blank-line-separated
    // paragraphs (a single newline inside a paragraph becomes <br>), and
    // a leading "#"..."######" on its own line (rendered as bold text,
    // not a real heading tag. Keeps the compact answer card's type
    // scale consistent rather than introducing a much bigger heading
    // mid-card).
    // Wraps every occurrence of `term` (res.highlightTerm from the
    // server, e.g. "8.5.10") in a <mark> after mdLite has already run,
    // not before. Applying it to the rendered HTML string rather than
    // the raw markdown means it can't land inside an already-open tag,
    // since a version number never appears as part of mdLite's own
    // markup (just <strong>/<code>/list tags). `term` is never a guess:
    // see highlightTerm's own comment in ask.js for why the server only
    // ever sends a value it already deterministically verified.
    function highlightAnswerTerm(html, term) {
      if (!term) return html;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // The model sometimes bolds a whole phrase around this term
      // (**Python 3.13.0**, not just **3.13.0**), which mdLite has
      // already turned into <strong>...</strong> by the time this runs.
      // Per explicit request ("do not make it bold but use a marker"),
      // any <strong> span containing the term is unwrapped (the tags
      // dropped, the text kept) before the term itself is marked, rather
      // than stacking bold on top of the highlighter mark below. A first
      // version matched only <strong> immediately adjacent to the exact
      // term, which broke on a longer bolded phrase: it deleted the
      // closing </strong> while leaving the opening tag in place (it
      // wasn't immediately before the term either), corrupting every
      // node after it into an unclosed, dangling bold run. This instead
      // finds the whole enclosing <strong>...</strong> pair (a
      // non-greedy match that stops at the first </strong>, so it can't
      // accidentally span into an unrelated later bold run) and unwraps
      // that complete pair as one replacement.
      const unwrapRx = new RegExp(`<strong>((?:(?!</strong>)[\\s\\S])*?${escaped}(?:(?!</strong>)[\\s\\S])*?)</strong>`, "g");
      const unwrapped = html.replace(unwrapRx, "$1");
      const markRx = new RegExp(escaped, "g");
      return unwrapped.replace(markRx, (m) => `<mark class="ask-answer-mark">${m}</mark>`);
    }
    // "[id](url)" -> a real clickable link, shown as "[id]" (brackets
    // baked into this template, not part of the source text) -- added
    // specifically for the server's new comparisonRiskyPostWarning
    // guardrail ("show the reddit id in brackets and make them
    // clickable"), which emits exactly this markdown-link shape for each
    // flagged post's own id. Runs on the already-uaEsc'd text (this
    // function's very next step below), so `$2` (the URL) is safe to
    // drop straight into an href without a second escaping pass: uaEsc
    // already turned any literal `&` in the URL into `&amp;`, which is
    // the CORRECT way to represent it inside an HTML attribute (a
    // browser decodes it back to a real `&` on click) -- not a bug to
    // work around. No other markdown-link usage exists in this app yet;
    // if one ever does that shouldn't show brackets, give it its own
    // regex rather than changing this one.
    // Matches an absolute URL or a bare "/..." path -- confirmed live, a
    // Reddit doc's own stored url can be relative ("/r/StableDiffusion/"),
    // which the earlier https-only version silently left as plain,
    // unlinked text instead of rendering a link at all ("make it
    // clickable" reported live). A relative path is resolved against
    // reddit.com specifically, not the current page, since every producer
    // of this markdown-link shape today is a Reddit/Stack Overflow report.
    const MD_LINK_RX = /\[([^\]\n]+)\]\((\/[^\s)]+|https?:\/\/[^\s)]+)\)/g;
    function mdLite(text) {
      const escaped = uaEsc(text)
        .replace(MD_LINK_RX, (m, label, url) => {
          const href = /^https?:\/\//i.test(url) ? url : `https://reddit.com${url}`;
          return `<a href="${href}" target="_blank" rel="noopener">[${label}]</a>`;
        })
        .replace(/\*\*([^\n*]+?)\*\*/g, "<strong>$1</strong>")
        .replace(/`([^`\n]+?)`/g, "<code>$1</code>");
      // Line-by-line, not "does this whole blank-line-separated block
      // uniformly look like a list". A first version required every
      // line in a block to match the bullet pattern, which silently
      // dropped list formatting whenever a plain lead-in line preceded
      // the list items ("Root causes:\n- Missing initramfs\n- ...") -
      // a common real shape in these answers, not an edge case.
      const lines = escaped.split("\n");
      const out = [];
      let list = null; // { type: 'ul'|'ol', items: [] }
      let para = [];
      const flushPara = () => { if (para.length) { out.push("<p>" + para.join("<br>") + "</p>"); para = []; } };
      const flushList = () => { if (list) { out.push(`<${list.type}>` + list.items.map(i => `<li>${i}</li>`).join("") + `</${list.type}>`); list = null; } };
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) { flushPara(); flushList(); continue; }
        const bullet = line.match(/^[-*]\s+(.*)$/);
        const numbered = line.match(/^\d+\.\s+(.*)$/);
        if (bullet) {
          flushPara();
          if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
          list.items.push(bullet[1]);
        } else if (numbered) {
          flushPara();
          if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
          list.items.push(numbered[1]);
        } else {
          flushList();
          para.push(line.replace(/^#{1,6}\s+(.*)$/, "<strong>$1</strong>"));
        }
      }
      flushPara(); flushList();
      return out.join("");
    }

    // A fixed, hand-written technical summary of what each of the 5
    // presets does and doesn't do, shown once above the 5 answer cards
    // in Compare mode. Static rather than derived from PRESETS/config
    // flags on purpose: the point is a plain-language "what's actually
    // different here" reference a reader can check the 5 live answers
    // against, not a dump of internal field names. Update this by hand
    // if a preset's own behavior changes (see PRESETS in ask.js).
    const ASK_COMPARE_LEGEND_ROWS = [
      {
        name: "Single-agent", rewrite: false, union: false, delegated: false, feedback: false,
        example: "Q: \"latest mysql ver\" → searches with that exact wording only. A typo or vague phrasing is never corrected, so a real match can be missed.",
      },
      {
        name: "Multi-agent (buggy)", rewrite: true, union: false, delegated: false, feedback: false,
        example: "Q: \"latest mysql ver\" → rewritten to \"MySQL LTS release schedule\", then searches ONLY that rewrite. If the rewrite drifts, the original wording is gone.",
      },
      {
        name: "Multi-agent (fixed)", rewrite: true, union: true, delegated: false, feedback: false,
        example: "Same rewrite as above, but searches the union of the original wording AND the rewrite, so \"mysql ver\" still matches even if the rewrite drifts.",
      },
      {
        name: "Multi-agent (delegated)", rewrite: true, union: true, delegated: true, feedback: false,
        example: "A separate Rewriter call picks search terms, a separate Retriever call searches, a separate Evaluator call judges the evidence, before an Orchestrator call writes the answer. One pass only.",
      },
      {
        name: "Multi-agent (feedback loop)", rewrite: true, union: true, delegated: true, feedback: true,
        example: "Same 4 separate calls as delegated, but if the Evaluator judges the first pass insufficient, it sends the Retriever back for one more, targeted search before answering.",
      },
    ];
    // A stacked list, not a real <table>: a genuine 6-column table only
    // fits with its own horizontal scrollbar (min-width 760px, wider than
    // the answer rail, the narrow-screen modal, and most phones), and this
    // repo avoids horizontal scroll wherever a layout can reasonably be
    // made to reflow instead. Each pipeline gets its own name, a
    // fact-chip row (label: yes/no, wraps naturally at any width instead
    // of forcing a scrollbar), and the example paragraph below it.
    function askCompareLegendHTML() {
      const fact = (label, yes) =>
        `<span class="ask-legend-fact">${uaEsc(label)}: ${yes ? '<span class="ask-cy">&check; yes</span>' : '<span class="ask-cn">&mdash; no</span>'}</span>`;
      const items = ASK_COMPARE_LEGEND_ROWS.map((r) => `
        <div class="ask-legend-item">
          <div class="ask-legend-name">${uaEsc(r.name)}</div>
          <div class="ask-legend-facts">
            ${fact("Rewrites query", r.rewrite)}
            ${fact("Searches union", r.union)}
            ${fact("Real delegation", r.delegated)}
            ${fact("Feedback retry", r.feedback)}
          </div>
          <div class="ask-legend-example">${uaEsc(r.example)}</div>
        </div>`
      ).join("");
      return `<div class="ask-legend-list">${items}</div>`;
    }

    // A CSS-grid block, not a real <table>: a genuine 4-column table
    // doesn't fit the ~360px answer rail (see ASK_RAIL_MIN_WIDTH's own
    // comment), so each pipeline gets a compact 3-cell header row
    // (name/time/source count) plus a full-width answer row beneath it.
    // Reads the same in the wider modal fallback too, so there's exactly
    // one Benchmark rendering, not two to keep in sync. Answers are
    // shown in full (small font), not truncated — the point is reading
    // them side by side to actually compare, not a teaser.
    function askRenderBenchmarkTable(runs) {
      const rows = (runs || []).map(r => {
        const label = uaEsc(ASK_PRESET_LABELS[r.preset] || r.preset);
        if (r.error) {
          return `<div class="ask-bm-head">${label}</div><div class="ask-bm-head ask-muted">&mdash;</div><div class="ask-bm-head ask-muted">&mdash;</div>` +
            `<div class="ask-bm-answer-row"><span class="ask-error">${uaEsc(r.error)}</span></div>`;
        }
        const time = r.latencyMs ? Math.round(r.latencyMs / 1000) + "s" : "&mdash;";
        const srcCount = (r.sources || []).length;
        const abstainHtml = r.abstained
          ? `<span class="ask-abstain-badge">⛔ ${uaEsc(ASK_ABSTAIN_REASON_LABELS[r.abstainReason] || "Abstained")}</span> `
          : "";
        const rateHtml = r.runId
          ? `<span class="ask-bm-rate">
              <button type="button" class="btn btn-ghost ask-rate-btn" data-rating="1" title="Helpful">👍</button>
              <button type="button" class="btn btn-ghost ask-rate-btn" data-rating="-1" title="Not helpful">👎</button>
            </span>`
          : "";
        return `<div class="ask-bm-head">${label}</div><div class="ask-bm-head ask-muted">${time}</div><div class="ask-bm-head ask-muted">${srcCount} src</div>` +
          `<div class="ask-bm-answer-row" data-run-id="${uaEsc(r.runId || "")}">${abstainHtml}${highlightAnswerTerm(mdLite(r.answer || ""), r.highlightTerm)}${rateHtml}</div>`;
      }).join("");
      return `<div class="ask-bm-table">
        <div class="ask-bm-head ask-bm-col-head">Pipeline</div><div class="ask-bm-head ask-bm-col-head">Time</div><div class="ask-bm-head ask-bm-col-head">Sources</div>
        ${rows}
      </div>`;
    }

    // Full Compare-mode result: the same three-tab shape as a normal
    // single-pipeline answer (askRenderCard's showWorkflow branch), just
    // with the Benchmark tab actually filled in, so Compare mode reads
    // as "the same answer UI, with a comparison available" rather than a
    // separate page. Used for both the rail (wide screens) and the modal
    // (narrow-screen fallback) — one Compare rendering, not two.
    function askRenderCompareBody(question, data, opts) {
      opts = opts || {};
      const runs = data.runs || [];
      const ok = runs.filter(r => !r.error);
      const primary = ok.find(r => !r.abstained) || ok[0];
      const answerHtml = primary
        ? `<div class="ask-answer-label">${uaEsc(ASK_PRESET_LABELS[primary.preset] || primary.preset)}</div>
           <div class="ask-answer-summary">${highlightAnswerTerm(mdLite(primary.answer || ""), primary.highlightTerm)}</div>`
        : `<p class="ask-error">None of the 5 pipelines produced an answer.</p>`;
      // Union of every run's sources, deduped by URL (title when a
      // source has none), so 5 answers about the same question don't
      // mean 5 separate, mostly-overlapping source lists.
      const seen = new Set();
      const mergedSources = [];
      for (const r of runs) {
        for (const s of (r.sources || [])) {
          const key = s.url || s.title;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          mergedSources.push(s);
        }
      }
      // opts.showQuestion: rail-only (see showAskRailCompare). The modal
      // already shows the question in its own #askModalQuestion header,
      // so baking it in here too for that context would duplicate it.
      const questionHeading = opts.showQuestion
        ? `<div class="ask-answer-heading"><span class="ask-answer-question">${uaEsc(question)}</span></div>`
        : "";
      return `<div class="ask-answer-card" data-run-id="${uaEsc((primary && primary.runId) || "")}">
        ${questionHeading}
        <div class="ask-rail-tabs" role="tablist">
          <button type="button" class="ask-rail-tab active" data-tab="answer" role="tab" aria-selected="true">Answer</button>
          <button type="button" class="ask-rail-tab" data-tab="sources" role="tab" aria-selected="false">Sources</button>
          <button type="button" class="ask-rail-tab" data-tab="benchmark" role="tab" aria-selected="false">Benchmark</button>
        </div>
        <div class="ask-rail-panel" data-panel="answer">
          <p class="st-191 ask-muted" >Ran all 5 pipelines against the same question${primary ? ". Shown here: " + uaEsc(ASK_PRESET_LABELS[primary.preset] || primary.preset) + "&rsquo;s answer" : ""}. See the Benchmark tab to compare every pipeline's answer side by side.</p>
          ${answerHtml}
        </div>
        <div class="ask-rail-panel" data-panel="sources" hidden>
          ${askRenderSources(mergedSources, primary && primary.vendorWebEvidence, primary && primary.webSearchFallback)}
        </div>
        <div class="ask-rail-panel" data-panel="benchmark" hidden>
          <details class="ask-bm-legend-details">
            <summary>What do these pipelines do?</summary>
            ${askCompareLegendHTML()}
          </details>
          ${askRenderBenchmarkTable(runs)}
        </div>
      </div>`;
    }

    // Demo mode (the "duo" pipeline option): unlike askRenderCompareBody above
    // (one "primary" answer + a Benchmark tab you have to click into to
    // see the rest), this shows both full answers at once, side by side.
    // A presenter can point at one card, then the other, in the same
    // screenshot/screen-share, with no extra clicks. Only ever
    // single_agent + multi_agent_feedback (see the "duo" branch in the
    // ask submit handler), not a generic N-way renderer.
    function askRenderDuoBody(question, data, opts) {
      opts = opts || {};
      const runs = data.runs || [];
      const order = ["single_agent", "multi_agent_feedback"];
      const ordered = order.map(p => runs.find(r => r.preset === p)).filter(Boolean);
      const list = ordered.length ? ordered : runs;
      const cards = list.map(r => {
        const label = uaEsc(ASK_PRESET_LABELS[r.preset] || r.preset);
        if (r.error) {
          return `<div class="ask-answer-card ask-duo-card">
            <div class="ask-answer-label">${label}</div>
            <p class="ask-error">${uaEsc(r.error)}</p>
          </div>`;
        }
        const timing = Number.isFinite(r.latencyMs) ? ` <span class="st-195 ask-muted" >&middot; ${Math.round(r.latencyMs / 1000)}s</span>` : "";
        return `<div class="ask-answer-card ask-duo-card${r.abstained ? " ask-answer-abstained" : ""}" data-run-id="${uaEsc(r.runId || "")}">
          <div class="ask-answer-label">${label}${timing}</div>
          <div class="ask-answer-summary">${highlightAnswerTerm(mdLite(r.answer || ""), r.highlightTerm)}</div>
          ${askRenderSources(r.sources, r.vendorWebEvidence, r.webSearchFallback)}
          <div class="ask-rate-row">
            <button type="button" class="btn btn-ghost ask-rate-btn" data-rating="1" ${!r.runId ? "disabled" : ""}>&#128077; Helpful</button>
            <button type="button" class="btn btn-ghost ask-rate-btn" data-rating="-1" ${!r.runId ? "disabled" : ""}>&#128078; Not helpful</button>
          </div>
        </div>`;
      }).join("");
      const questionHeading = opts.showQuestion
        ? `<div class="ask-answer-heading"><span class="ask-answer-question">${uaEsc(question)}</span></div>`
        : "";
      return `<div class="ask-duo-wrap">
        ${questionHeading}
        <p class="st-191 ask-muted" >Same question, single-agent (one continuous model call) next to multi-agent, feedback loop (separate Rewriter / Retriever / Evaluator / Orchestrator calls, retrying retrieval when the Evaluator judges the first pass insufficient).</p>
        <div class="ask-compare-grid ask-duo-grid">${cards}</div>
      </div>`;
    }

    // opts.trimAnswer: cap the answer text to N chars (a "Show full
    // answer" button appears when it actually got cut), used by the
    // right-side rail so a long answer doesn't dominate the sidebar;
    // omitted (or falsy) renders the complete answer, as the modal
    // always has. opts.showWorkflow: rail-only, splits the card into
    // two tabs (Answer: the workflow diagram + the answer itself,
    // Sources: citations + meta chips + "Show internals") instead of
    // one flat stacked card. The modal and Compare grid keep the
    // plain single-block shape, since neither has a live phase stream
    // to drive the diagram (Compare fetches all runs at once, not as a
    // stream; the modal is the narrow-screen/Compare fallback).
    // One short sentence that answers the question, for the "Short answer" tab that comes
    // before the full Answer tab. No extra model call: a comparison already carries its
    // verdict as data (the winning app, and the component when a stack was resolved);
    // anything else uses the answer's own first sentence, with markdown, citation markers
    // and links stripped, capped at about 220 characters.
    function askShortAnswer(res, question) {
      if (!res) return "";
      const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
      if (res.intent === "comparison" && !res.abstained) {
        const st = res.stack;
        if (st && st.app && st.bestMember) return cap(`${st.app} on ${st.bestMember} looks like the lower-risk choice.`);
        if (res.highlightTerm) return cap(`${res.highlightTerm} looks like the lower-risk choice.`);
      }
      let text = String(res.answer || "");
      text = text.replace(/```[\s\S]*?```/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[\d+\]/g, "")
        .replace(/[*_`#>]+/g, "")
        .replace(/^\s*[-•]\s+/gm, "")
        .replace(/\s+/g, " ")
        .replace(/\s+([.,;:!?)])/g, "$1")
        .trim();
      if (!text) return "";
      // A "when" question is answered by its date, so keep the sentence that carries it
      // (with its "(N days ago)") instead of trimming the answer down to the bare claim.
      if (!res.abstained && typeof classifyQuestionTypeClient === "function" && classifyQuestionTypeClient(question) === "when") {
        const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9("'])/);
        let out = parts[0];
        if (!/\b\d{4}\b/.test(out) && parts[1]) out += ` ${parts[1]}`;
        return out.length > 200 ? `${out.slice(0, 197).replace(/\s+\S*$/, "")}…` : out;
      }
      const SENTENCE = /^.+?[.!?](?=\s+[A-Z0-9("']|$)/;
      let first = (text.match(SENTENCE) || [text])[0];
      // Brief on purpose: no parentheticals, no reason or time clauses (why, when, released),
      // just the claim itself. The Answer tab keeps the details.
      const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
      const DATE = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|${MONTH}\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\s+${MONTH}(?:\\s+\\d{4})?|${MONTH}\\s+\\d{4})`;
      first = first
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s*;\s+.*$/, "")
        .replace(/\s*[,;:]\s+(?:because|since|as|which|but|while|although|though|so|after|before|when|released|published|according|per|and)\b.*$/i, "")
        .replace(new RegExp(`\\s+(?:was\\s+)?(?:released|published|updated|fixed|patched)?\\s*(?:on|as of|since|in|from)\\s+${DATE}`, "gi"), "")
        .replace(/\s+(?:because|since|which|although|though)\b.*$/i, "")
        .replace(/\s+([.,;:!?])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!/[.!?]$/.test(first)) first += ".";
      if (first.length > 140) first = `${first.slice(0, 137).replace(/\s+\S*$/, "")}\u2026`;
      return first;
    }
    function askShortTabHtml(res, question) {
      const sentence = askShortAnswer(res, question);
      if (!sentence) return "";
      // The explanatory line under the sentence ("The full answer,
      // sources and checks are in the other tabs.") was removed per
      // explicit request -- the tab row right below it already makes
      // that obvious.
      return `<div class="ask-rail-panel" data-panel="short">
          <p class="ask-short-answer">${uaEsc(sentence)}</p>
        </div>`;
    }

    function askRenderCard(label, res, opts) {
      opts = opts || {};
      // Pipeline escalation, surfaced right in the preset badge: a run
      // whose vendor wasn't in this system's own catalog and got resolved
      // via a real web search instead (res.vendorWebVerified, see
      // verifyVendorViaWeb on the server) reads as "SINGLE-AGENT + WEB
      // VERIFICATION" rather than the plain preset name, so a viewer sees
      // the escalation happened without needing to open the workflow
      // diagram at all. Applied uniformly to whichever preset actually ran
      // it (not just single_agent) -- see ASK_WORKFLOW_PHASE_NODE's own
      // comment on the same "not gated by preset" reasoning.
      // How many distinct model calls (agents) actually produced THIS
      // answer, not a fixed property of the preset name alone: a
      // comparison question always collapses to one write-up call
      // regardless of preset (runComparisonAsk never calls a separate
      // Rewriter/Evaluator), a genuinely delegated architecture
      // (res.evaluatorRan true, see its own comment in ask.js) runs four
      // (Rewriter, Retriever, Evaluator, Orchestrator), and every other
      // architecture is one continuous loop, plus one more whenever a
      // real web-verification call actually confirmed the vendor
      // (res.vendorWebVerified), the same escalation already named in
      // the "+ Web Verification" suffix below.
      const isComparison = res.intent === "comparison";
      const agentCount = (isComparison ? 1 : (res.evaluatorRan ? 4 : 1)) + (res.vendorWebVerified ? 1 : 0);
      const agentSuffix = `${agentCount} agent${agentCount === 1 ? "" : "s"}`;
      // A comparison question always collapses to one write-up call
      // regardless of which preset was picked (see agentCount's own
      // comment above), so naming the picked-but-unused preset right
      // next to "1 agent" reads as a flat contradiction ("Multi-agent,
      // feedback loop · 1 agent") rather than an explanation, reported
      // live. The badge names what actually ran instead; which preset
      // was selected is still visible in full, with the real reason, on
      // the Model vs Rules tab.
      // Same contradiction, a second real case: multi_agent_buggy/
      // multi_agent_fixed are genuinely single-continuous-loop
      // architectures (evaluatorRan is always false for them, see
      // agentCount's own comment - only a truly delegated run ever
      // reaches 4), but their own display label still says "Multi-agent"
      // (the paper's own naming: that label's "buggy"/"fixed" wording is
      // about a bug in, or fix to, that one loop's retrieval, not about
      // delegation). Reported live on a plain, non-comparison "recent
      // CVEs affecting MySQL" question run under Multi-agent (fixed):
      // "Multi-agent, fixed · 1 agent" reads exactly as contradictory as
      // the comparison case above. Suppressing just the "· N agent(s)"
      // suffix here (not renaming the label, which would misrepresent
      // this system's own citation of the paper's established
      // terminology) fixes it without touching what the label itself says.
      const labelSaysMultiAgent = /multi-agent/i.test(label);
      const suffixContradicts = !isComparison && agentCount === 1 && labelSaysMultiAgent;
      const displayLabel = isComparison
        ? `Comparison · ${agentSuffix}`
        : `${label}${res.vendorWebVerified ? " + Web Verification" : ""}${suffixContradicts ? "" : ` · ${agentSuffix}`}`;
      if (res.error) {
        const errLabelHtml = opts.previewQuestion
          ? `<div class="ask-answer-heading"><span class="ask-answer-question">${uaEsc(opts.previewQuestion)}</span><span class="ask-answer-preset">${uaEsc(displayLabel)}</span></div>`
          : `<div class="ask-answer-label">${uaEsc(displayLabel)}</div>`;
        return `<div class="ask-answer-card">
          ${errLabelHtml}
          <p class="ask-error">${uaEsc(res.error)}</p>
        </div>`;
      }
      const fullAnswer = res.answer || "";
      const wasTrimmed = !!opts.trimAnswer && fullAnswer.length > opts.trimAnswer;
      const shownAnswer = wasTrimmed ? truncate(fullAnswer, opts.trimAnswer) : fullAnswer;
      const abstainBadge = res.abstained ? `<span class="ask-abstain-badge">⛔ ${uaEsc(ASK_ABSTAIN_REASON_LABELS[res.abstainReason] || "Abstained")}</span>` : "";
      // The rail passes the actual question in as opts.previewQuestion so
      // it can render inside the card, right next to the pipeline label,
      // per explicit request (previously the question sat outside the
      // card entirely, in the rail's own static header, with just the
      // bare uppercase label inside). No brackets around the label
      // itself: plain, uppercase, colored text next to the question
      // reads as its own distinct badge already, without needing a
      // bracket pair (or worse, a bracket nested inside one, when
      // displayLabel's own preset name used to carry a parenthetical
      // qualifier too) to set it apart. Every other caller (modal,
      // Compare grid) has nowhere to put a question this way and keeps
      // the original plain-label line.
      const labelHtml = opts.previewQuestion
        ? `<div class="ask-answer-heading"><span class="ask-answer-question">${uaEsc(opts.previewQuestion)}</span><span class="ask-answer-preset">${uaEsc(displayLabel)}</span>${abstainBadge}</div>`
        : `<div class="ask-answer-label">${uaEsc(displayLabel)}${abstainBadge}</div>`;
      const answerHtml = `
        <div class="ask-answer-summary">${highlightAnswerTerm(mdLite(shownAnswer), res.highlightTerm)}</div>
        ${wasTrimmed ? '<button type="button" class="st-196 btn btn-ghost ask-view-full-btn" >Show full answer</button>' : ""}
        <div class="ask-rate-row">
          <button type="button" class="btn btn-ghost ask-rate-btn" data-rating="1" ${!res.runId ? "disabled" : ""}>👍 Helpful</button>
          <button type="button" class="btn btn-ghost ask-rate-btn" data-rating="-1" ${!res.runId ? "disabled" : ""}>👎 Not helpful</button>
          <span class="st-197 ask-muted" >${res.latencyMs ? Math.round(res.latencyMs / 1000) + "s" : ""}</span>
        </div>`;

      // "Short answer" tab: one sentence, first and selected by default; the full Answer
      // tab (opts.activeTab === "answer", e.g. after "Show full answer") keeps the old view.
      const shortPanel = askShortTabHtml(res, opts.previewQuestion || res.question);
      const activeTab = shortPanel && opts.activeTab !== "answer" ? "short" : "answer";
      if (!opts.showWorkflow) {
        return `<div class="ask-answer-card${res.abstained ? " ask-answer-abstained" : ""}" data-run-id="${uaEsc(res.runId || "")}">
          ${labelHtml}
          ${answerHtml}
          ${askRenderMetaChips(res)}
          ${askRenderSources(res.sources, res.vendorWebEvidence, res.webSearchFallback)}
          ${askRenderDetails(res)}
          ${askRenderModelVsRules(res)}
        </div>`;
      }
      return `<div class="ask-answer-card${res.abstained ? " ask-answer-abstained" : ""}" data-run-id="${uaEsc(res.runId || "")}">
        ${labelHtml}
        <div class="ask-rail-tabs" role="tablist">
          ${shortPanel ? `<button type="button" class="ask-rail-tab${activeTab === "short" ? " active" : ""}" data-tab="short" role="tab" aria-selected="${activeTab === "short"}">Short answer</button>` : ""}
          <button type="button" class="ask-rail-tab${activeTab === "answer" ? " active" : ""}" data-tab="answer" role="tab" aria-selected="${activeTab === "answer"}">Answer</button>
          <button type="button" class="ask-rail-tab" data-tab="sources" role="tab" aria-selected="false">Sources</button>
          <button type="button" class="ask-rail-tab" data-tab="benchmark" role="tab" aria-selected="false">Benchmark</button>
          <button type="button" class="ask-rail-tab" data-tab="modelrules" role="tab" aria-selected="false">Model vs Rules</button>
          <button type="button" class="ask-rail-tab" data-tab="guardrails" role="tab" aria-selected="false">Guardrails</button>
          <button type="button" class="ask-rail-tab" data-tab="feedbackloop" role="tab" aria-selected="false">Feedback Loop</button>
        </div>
        ${shortPanel ? shortPanel.replace('data-panel="short"', 'data-panel="short"' + (activeTab === "short" ? "" : " hidden")) : ""}
        <div class="ask-rail-panel" data-panel="answer"${activeTab === "answer" ? "" : " hidden"}>
          ${opts.previewQuestion ? askQueryPreviewBlockHtml(opts.previewQuestion) : ""}
          ${answerHtml}
        </div>
        <div class="ask-rail-panel" data-panel="sources" hidden>
          ${askRenderMetaChips(res)}
          ${askRenderSources(res.sources, res.vendorWebEvidence, res.webSearchFallback)}
          ${askRenderDetails(res)}
        </div>
        <div class="ask-rail-panel" data-panel="benchmark" hidden>
          <p class="ask-muted">See how every pipeline (Single-agent, Multi-agent buggy/fixed/delegated/feedback loop) answers this exact question, side by side.</p>
          <button type="button" class="st-198 btn btn-primary ask-run-compare-btn" >Compare all 5 now</button>
        </div>
        <div class="ask-rail-panel" data-panel="modelrules" hidden>
          <p class="st-191 ask-muted" >Which part of each role actually ran on this exact answer, the model or a deterministic check.</p>
          ${askRenderModelVsRules(res)}
        </div>
        <div class="ask-rail-panel" data-panel="guardrails" hidden
          data-guardrail-activity='${uaEsc(JSON.stringify(res.guardrailActivity || {}))}'
          data-guardrail-sources='${uaEsc(JSON.stringify((res.sources || []).filter(s => s.guardrail).map(s => ({ title: s.title, guardrail: s.guardrail }))))}'>
          <p class="st-189 ask-muted" >Loading…</p>
        </div>
        <div class="ask-rail-panel" data-panel="feedbackloop" hidden
          data-feedback-loop-count="${Number.isFinite(res.feedbackLoopCount) ? res.feedbackLoopCount : ""}"
          data-orchestration='${uaEsc(JSON.stringify(res.orchestration || null))}'
          data-guardrail-activity='${uaEsc(JSON.stringify(res.guardrailActivity || {}))}'>
          <p class="st-189 ask-muted" >Loading…</p>
        </div>
      </div>`;
    }

    // Reveals an already-rendered answer's text word by word instead of
    // showing the whole formatted block at once, per explicit request.
    // Runs purely on the DOM askRenderCard/askRenderCompareBody already
    // built from mdLite/highlightAnswerTerm: wraps each leaf text node's
    // non-space runs in their own hidden <span class="ask-reveal-word">
    // (whitespace stays a plain text node between them, so wrapping and
    // spacing are unaffected), then reveals them a few at a time.
    // Structure (bold, links, etc.) is untouched and nothing gets
    // re-parsed, so this is a pure animation layered on top of already-
    // correct HTML, not a second markdown pass. Gated by data-revealed
    // so re-wiring the same card (tab switches call askWireRateButtons/
    // askWireRailTabs again but don't touch this innerHTML) never
    // replays it; a genuinely new render (a fresh answer, or "Show full
    // answer" swapping in the untrimmed text) always gets a fresh,
    // unmarked element, so it always plays once.
    function askWireAnswerReveal(root) {
      root.querySelectorAll(".ask-answer-summary").forEach(el => {
        if (el.dataset.revealed) return;
        el.dataset.revealed = "1";
        const textNodes = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) textNodes.push(n);
        const spans = [];
        textNodes.forEach(node => {
          const parts = node.textContent.split(/(\s+)/);
          if (parts.length < 2) return; // no whitespace at all: nothing to split into words
          const frag = document.createDocumentFragment();
          parts.forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
              return;
            }
            const span = document.createElement("span");
            span.className = "ask-reveal-word";
            span.textContent = part;
            frag.appendChild(span);
            spans.push(span);
          });
          node.parentNode.replaceChild(frag, node);
        });
        if (!spans.length) return;
        let i = 0;
        // A few words per tick, not one at a time: at 3 words/35ms an
        // 80-word answer finishes in under a second, closer to "watch
        // it type" than "wait for it to finish typing."
        (function step() {
          for (let k = 0; k < 3 && i < spans.length; k++, i++) spans[i].classList.add("shown");
          if (i < spans.length) setTimeout(step, 35);
        })();
      });
    }

    function askWireRateButtons(root) {
      root.querySelectorAll(".ask-rate-btn").forEach(rb => {
        rb.addEventListener("click", async () => {
          // [data-run-id], not the narrower .ask-answer-card: the
          // Benchmark table's own rows carry data-run-id directly on a
          // <tr>, not wrapped in a full answer card.
          const card = rb.closest("[data-run-id]");
          const runId = card && card.dataset.runId;
          if (!runId) return;
          rb.disabled = true;
          try {
            await uaRequest(`ask/${runId}/rate`, { method: "POST", body: JSON.stringify({ rating: Number(rb.dataset.rating) }) });
            card.querySelectorAll(".ask-rate-btn").forEach(b => b.disabled = true);
            rb.classList.add("ask-rate-chosen");
          } catch { rb.disabled = false; }
        });
      });
    }
    function askWireRailTabs(root) {
      const tabs = Array.from(root.querySelectorAll(".ask-rail-tab"));
      tabs.forEach(tab => {
        tab.addEventListener("click", () => {
          tabs.forEach(t => {
            const on = t === tab;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
          });
          root.querySelectorAll(".ask-rail-panel").forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
          // Guardrails tab content is fetched once, the first time it's
          // actually opened (see askRenderGuardrailsTab's own comment) -
          // most answers are never checked, so this avoids a GET
          // /api/guardrails call on every single answer by default.
          if (tab.dataset.tab === "guardrails") {
            const panel = root.querySelector('.ask-rail-panel[data-panel="guardrails"]');
            if (panel && !panel.dataset.loaded) {
              panel.dataset.loaded = "1";
              askRenderGuardrailsTab(panel);
            }
          }
          // Same lazy-load-on-first-open reasoning as Guardrails above,
          // plus this one needs the card's own runId (GET
          // /api/ask/:runId/feedback-loop), unlike Guardrails' single
          // shared GET /api/guardrails list.
          if (tab.dataset.tab === "feedbackloop") {
            const panel = root.querySelector('.ask-rail-panel[data-panel="feedbackloop"]');
            const card = root.querySelector(".ask-answer-card");
            if (panel && !panel.dataset.loaded) {
              panel.dataset.loaded = "1";
              askRenderFeedbackLoopTab(panel, card && card.dataset.runId);
            }
          }
        });
      });
    }
