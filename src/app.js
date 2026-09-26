    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'G-P5E77Z7VG5');
  

    // Show/hide without inline styles: the visibility classes live in styles.css.
    // "" clears every override (back to the stylesheet's own display).
    function setDisplay(el, value) {
      el.classList.remove("u-hide", "u-show-block", "u-show-flex", "u-show-grid", "u-show-inline-block", "u-show-inline-flex");
      if (value === "none") el.classList.add("u-hide");
      else if (value) el.classList.add("u-show-" + value);
    }

    /* ── Constants ────────────────────────────────────────────── */
    // Resolution order: ?api= query override, then <meta name="api-base">, then default.
    // Always normalised to a single trailing slash.
    const API_BASE = (() => {
      const fromQuery = new URLSearchParams(location.search).get("api");
      const fromMeta = document.querySelector('meta[name="api-base"]')?.content;
      const raw = (fromQuery || fromMeta || "https://releasetrain.io/api/").trim();
      return raw.replace(/\/+$/, "") + "/";
    })();
    const GROUPS_BATCH = 6, PAGE_LIMIT = 150, TOP_TYPES = 10, REDDIT_LIMIT = 400, MAX_VER_DESC = 220;

    /* ── Global fault surface ─────────────────────────────────── */
    // Uncaught errors and rejected promises otherwise fail silently, leaving an
    // empty UI with no signal. Show one dismissible banner instead.
    (function installErrorBanner() {
      let shown = false;
      const show = (detail) => {
        console.error("[unhandled]", detail);
        if (shown) return;
        shown = true;
        const bar = document.createElement("div");
        bar.setAttribute("role", "alert");
        bar.className = "fault-bar";
        bar.innerHTML = '<span class="st-182" >Something went wrong loading part of this page. '
          + 'A reload may help; if it persists the API may be unavailable.</span>'
          + '<button type="button" class="fault-dismiss">Dismiss</button>';
        bar.querySelector("button").addEventListener("click", () => { bar.remove(); shown = false; });
        (document.body || document.documentElement).appendChild(bar);
      };
      window.addEventListener("error", (e) => show(e.error || e.message));
      window.addEventListener("unhandledrejection", (e) => show(e.reason));
    })();
    // 28 is only the fallback used until /api/ask/recent-window-days
    // resolves in boot() (or if that fetch fails): the feed's own window
    // now tracks the admin-configurable "Ask recency window" setting live
    // instead of carrying its own separately-hardcoded number. These were
    // two genuinely independent values that only ever coincidentally
    // shared a starting value, which read as a bug the moment someone
    // changed one expecting the other to follow; per explicit request
    // they're now the same number by construction. All four are `let`,
    // not `const`, so setLookbackDays() below can update them in place.
    let LOOKBACK_DAYS = 28;
    let LOOKBACK_WEEKS = Math.round(LOOKBACK_DAYS / 7);
    let LOOKBACK_MS = 1000 * 60 * 60 * 24 * LOOKBACK_DAYS;
    let LOOKBACK_AGO = Date.now() - LOOKBACK_MS;
    // Recomputes every LOOKBACK_* derived value, plus the sidebar's
    // static "Activity (N weeks)" label (previously hand-set once at
    // load and prone to drifting out of sync any time this changed), from
    // a single day count. Ignores a bad/missing value rather than
    // clearing the current one, so a failed fetch in boot() just keeps
    // whatever LOOKBACK_DAYS already was.
    function setLookbackDays(days) {
      const n = Number(days);
      if (!Number.isFinite(n) || n < 1) return;
      LOOKBACK_DAYS = Math.round(n);
      LOOKBACK_WEEKS = Math.round(LOOKBACK_DAYS / 7);
      LOOKBACK_MS = 1000 * 60 * 60 * 24 * LOOKBACK_DAYS;
      LOOKBACK_AGO = Date.now() - LOOKBACK_MS;
      const el = document.getElementById("sbActivityLabel");
      if (el) el.textContent = `Activity (${LOOKBACK_WEEKS} week${LOOKBACK_WEEKS !== 1 ? "s" : ""})`;
    }
    setLookbackDays(LOOKBACK_DAYS); // sets the sidebar label immediately, ahead of the live fetch below
    // Public, no auth (see its own comment in app.js): reads the admin
    // Settings panel's "Ask recency window (days)" value. Swallows its
    // own errors and leaves LOOKBACK_DAYS at its current value (the
    // fallback above, on a first load) rather than letting a failed
    // fetch break the feed.
    async function fetchAndApplyLookbackDays() {
      try {
        const res = await fetch(`${API_BASE}ask/recent-window-days`);
        if (!res.ok) return;
        const data = await res.json();
        setLookbackDays(data.askRecentWindowDays);
      } catch { /* keep whatever LOOKBACK_DAYS already was */ }
    }
    // Kicked off once, immediately, rather than called separately by each
    // consumer: boot() and loadHomeStats() further down both run at page
    // load concurrently, not one after another, and both build a
    // LOOKBACK_DAYS-sized day range before their own first render. Each
    // awaits this same promise instead of calling
    // fetchAndApplyLookbackDays() itself, so the live value is only
    // fetched once per page load and both consumers see the exact same
    // resolved LOOKBACK_DAYS by the time either needs it.
    const lookbackDaysReady = fetchAndApplyLookbackDays();

    /* ── DOM cache ────────────────────────────────────────────── */
    const EL = {};
    ["feed", "sentinel", "status", "navLoader", "feedWindowLabel", "kpi-page", "kpi-range", "kpi-uniq", "kpi-reddit", "kpi-llm", "kpi-hv",
      "btn-major", "btn-minor", "btn-patch", "btn-cve", "btn-llm", "btn-hv", "btn-potential-cve", "btn-reddit",
      "btn-reddit-risk", "btn-reddit-risk-latest", "btn-reddit-risk-cve", "btn-so-risk", "btn-so",
      "filterForm", "components", "clearBtn", "fixedToggles", "typeToggles",
      "homeLink", "graphLink", "archLink", "cveLink", "dashboardLink", "docsLink", "changelogLink", "ackLink", "usersLink", "networkLink", "evalRewriterLink", "evalEvaluatorLink", "evalOrchestratorLink", "expandAllBtn", "feedSortSelect", "activeFilters", "afTags", "afClearAll", "emptyState", "emptyStateIcon", "emptyStateMsg", "emptyStateDetail"
    ].forEach(id => { EL[id] = document.getElementById(id); });

    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    // View visibility: which nav-menu links are enabled, admin-
    // configurable (see the admin Settings section's viewXVisible
    // entries and app.js's TOGGLEABLE_VIEWS/setViewVisibility). A public
    // endpoint, not one of the admin-only /api/admin/settings routes -
    // every visitor's nav depends on this, not just admins. Hides the
    // <a> itself rather than blocking the view's own switch logic,
    // matching the literal request ("toggle the view option... from the
    // menu"); navigating a hidden view's own #/hash route directly still
    // works. "Home" and "Account" are never in this list (see the
    // server's own comment on why), so they're always shown.
    const VIEW_NAV_LINKS = {
      viewGraphVisible: "graphLink", viewArchVisible: "archLink", viewCveVisible: "cveLink",
      viewDashboardVisible: "dashboardLink", viewDocsVisible: "docsLink", viewChangelogVisible: "changelogLink",
      viewAckVisible: "ackLink", viewNetworkVisible: "networkLink",
      // Layered on top of (not a replacement for) the admin-only role
      // check further down (EL.evalRewriterLink.hidden = user.role !==
      // "admin"): this hides the link from literally everyone, admins
      // included, once disabled, same as every other entry above; the
      // role check still separately keeps it from a non-admin regardless
      // of this setting.
      viewEvalRewriterVisible: "evalRewriterLink", viewEvalEvaluatorVisible: "evalEvaluatorLink",
      viewEvalOrchestratorVisible: "evalOrchestratorLink",
    };
    fetch(API_BASE + "views/visibility").then(r => r.ok ? r.json() : {}).then(flags => {
      for (const [key, elId] of Object.entries(VIEW_NAV_LINKS)) {
        if (flags[key] === false && EL[elId]) setDisplay(EL[elId], "none");
      }
    }).catch(() => { /* nav just shows every link, same as before this existed */ });

    /* ── Topbar scroll shadow ─────────────────────────────────── */
    const topbarEl = document.getElementById("topbar");
    window.addEventListener("scroll", () => {
      topbarEl.classList.toggle("scrolled", window.scrollY > 4);
    }, { passive: true });

    /* ── Menu drawer (☰) and Filters panel (🎚️) ────────────────────
       Two independent off-canvas drawers, left (☰: just the view-
       switcher nav now) and right (🎚️: Filters + Stats, previously
       nested inside the ☰ drawer, given its own toggle per explicit
       request). They share one overlay/backdrop and one Escape handler;
       opening either one closes the other, so only one is ever open at
       once (avoids both drawers' shadows/backdrops stacking oddly on a
       narrow screen), but each has its own toggle button and CSS
       transform, so they're genuinely independent, not one control
       driving two things. */
    const navToggleBtn = document.getElementById("navToggle");
    const sidebarEl = document.getElementById("sidebar");
    const filtersToggleBtn = document.getElementById("filtersToggleBtn");
    const filtersPanelEl = document.getElementById("filtersPanel");
    const sidebarOverlayEl = document.getElementById("sidebarOverlay");

    function setSidebarOpen(open) {
      sidebarEl.classList.toggle("open", open);
      if (open) filtersPanelEl.classList.remove("open");
      sidebarOverlayEl.classList.toggle("open", open || filtersPanelEl.classList.contains("open"));
      navToggleBtn.setAttribute("aria-expanded", String(open));
      navToggleBtn.textContent = open ? "✕" : "☰";
    }
    function setFiltersPanelOpen(open) {
      filtersPanelEl.classList.toggle("open", open);
      if (open) sidebarEl.classList.remove("open");
      sidebarOverlayEl.classList.toggle("open", open || sidebarEl.classList.contains("open"));
      filtersToggleBtn.setAttribute("aria-expanded", String(open));
      navToggleBtn.setAttribute("aria-expanded", String(sidebarEl.classList.contains("open")));
      navToggleBtn.textContent = sidebarEl.classList.contains("open") ? "✕" : "☰";
    }
    navToggleBtn.addEventListener("click", () => {
      setSidebarOpen(!sidebarEl.classList.contains("open"));
    });
    filtersToggleBtn.addEventListener("click", () => {
      setFiltersPanelOpen(!filtersPanelEl.classList.contains("open"));
    });
    sidebarOverlayEl.addEventListener("click", () => {
      setSidebarOpen(false);
      setFiltersPanelOpen(false);
    });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      setSidebarOpen(false);
      setFiltersPanelOpen(false);
    });
    // Picking a view closes the drawer so the chosen view is immediately
    // visible instead of staying hidden behind it.
    document.getElementById("navLinks").addEventListener("click", e => {
      if (e.target.closest(".nav-link")) setSidebarOpen(false);
    });

    /* ── Ask (config-driven Q&A over the same sources the feed indexes) ──
       Same search bar, a mode toggle swaps the component-search form for
       a question form. Answers always come back with their sources
       attached (never a bare summary) and, per config, either as one
       card or - in Compare mode - one card per pipeline side by side,
       for judging which one actually answers better. See
       releasetrain-server's src/ask.js for the pipeline itself. */
    // No round brackets: a bracket nested inside another bracket (the
    // literal "(MULTI-AGENT (FEEDBACK LOOP))" this used to render as,
    // once the outer wrap in askRenderCard added its own pair around
    // this string's own inner pair) read as noisy rather than technical.
    // A comma reads as plainly as a parenthetical aside without the
    // nesting risk.
    const ASK_PRESET_LABELS = {
      single_agent: "Single-agent",
      multi_agent_buggy: "Multi-agent, buggy",
      multi_agent_fixed: "Multi-agent, fixed",
      multi_agent: "Multi-agent, delegated",
      multi_agent_feedback: "Multi-agent, feedback loop",
      // The two demo-facing aliases (2026-09-23) Auto now resolves to, and
      // the only two the simplified dropdown offers directly. See
      // ASK_PRESETS in ask.js for what each actually runs under the hood.
      orchestrator_single: "Orchestrator, single agent",
      orchestrator_delegated: "Orchestrator, multi-agent",
      langgraph_delegated: "Orchestrator, multi-agent (LangGraph)",
      // Defensive fallback only: the server always resolves "auto" to a
      // concrete preset before an answer comes back (see /api/ask),
      // so this should never actually render.
      auto: "Auto",
    };

    // Shown on the abstain badge instead of a plain, unexplained
    // "Abstained". See runAsk's own abstainReason values in ask.js.
    // "No vendor matched" specifically answers "why did this decline",
    // which the generic label alone did not.
    const ASK_ABSTAIN_REASON_LABELS = {
      no_vendor_detected: "No vendor matched",
      no_evidence: "No evidence found",
      opinion_question: "Opinion question",
    };

    // Client-side mirror of releasetrain-server's src/ask.js classifyIntent()
    // and detectComparisonEntities(), kept in sync by hand. This is a live
    // UI preview only (shown next to the input as the user types); the
    // actual question text sent to the server is never altered, and the
    // server does its own independent classification for real. Keep this
    // in sync with the server's own copy if either changes: this exact
    // drift (the server learned the 'comparison' intent, this preview did
    // not) is what showed "Opinion (will decline)" for a real comparison
    // question ("should i use zoom or teams for the next video call") that
    // the server itself was already answering correctly.
    const ASK_INTENT_KEYWORDS = {
      cve: ["cve", "vulnerability", "vulnerabilities", "exploit", "advisory", "attack", "breach", "rce", "zero-day"],
      patch: ["patch", "patched", "hotfix", "fix", "fixed", "bugfix"],
      version: ["version", "release", "released", "changelog", "upgrade", "downgrade"],
      opinion: ["nightmare", "best", "worst", "should i", "recommend", "opinion", "prefer", "versus", " vs ", "better than", "worth it", "favorite", "favourite", "hate", "love", "annoying", "say goodbye"],
    };
    const ASK_COMPARISON_SPLIT_RX = /\s+(?:or|vs\.?|versus)\s+/i;
    // Kept in sync by hand with ask.js's own COMPARISON_LEADIN_RX. See
    // its comment for the live bug this optional interrogative prefix
    // fixes ("Do you recommend zoom or teams?" leaking "recommend zoom"
    // into the feed's own vendor filter).
    const ASK_COMPARISON_LEADIN_RX = /^(?:(?:do|does|would|will|can|could)\s+(?:you|we|i)\s+)?(?:should\s+(?:i|we)\s+(?:use|go\s+with|pick|choose)|(?:let'?s\s+)?use|using|choose|choosing|pick|picking|go(?:ing)?\s+with|prefer|recommend(?:ing)?)\s+/i;
    const ASK_COMPARISON_TRAILER_RX = /\s+(?:for|to|when|while|during|tomorrow|today|tonight|this\s+\w+|next\s+\w+|which|that|who|whose|and|but|with|on|in|using|under|inside|within|via|running)\b.*$/i;
    const ASK_COMPARISON_DECISION_WORDS = new Set([
      "upgrade", "upgrading", "downgrade", "downgrading", "update", "updating",
      "install", "installing", "uninstall", "reinstall", "wait", "waiting",
      "switch", "switching", "stay", "staying", "continue", "proceed",
      "restart", "reboot", "disable", "enable", "keep", "keeping", "skip",
      "retry", "rollback", "repair", "fix", "fixing", "now", "later", "today",
      "tomorrow", "yet", "again", "it", "this", "that", "mine", "buy", "buying",
      "which", "who", "whose",
    ]);
    function askLooksLikeComparisonName(phrase) {
      return phrase.split(/\s+/).every(w => !ASK_COMPARISON_DECISION_WORDS.has(w.toLowerCase()));
    }
    function detectComparisonEntitiesClient(question) {
      const text = String(question || "").trim().replace(/[?!.]+$/, "");
      const parts = text.split(ASK_COMPARISON_SPLIT_RX);
      if (parts.length !== 2) return null; // exactly one connector, not "A, B or C"
      let [left, right] = parts;
      if (left.includes(",")) left = left.slice(left.lastIndexOf(",") + 1);
      left = left.replace(ASK_COMPARISON_LEADIN_RX, "").trim();
      left = left.split(/\s+/).filter(Boolean).slice(-2).join(" ");
      // A qualifying clause on the right ("iOS, which is more secure",
      // "Android or iOS which has more vulnerabilities") attaches right
      // after the entity name, comma or not. Cut at the first comma
      // before the trailer regex runs, same fix as the server's own copy.
      if (right.includes(",")) right = right.slice(0, right.indexOf(","));
      right = right.replace(ASK_COMPARISON_TRAILER_RX, "").trim();
      right = right.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
      left = left.replace(/^[,.:;!?]+|[,.:;!?]+$/g, "");
      right = right.replace(/^[,.:;!?]+|[,.:;!?]+$/g, "");
      if (!left || !right) return null;
      if (!askLooksLikeComparisonName(left) || !askLooksLikeComparisonName(right)) return null;
      if (ASK_GENERIC_STOPLIST.has(left.toLowerCase()) || ASK_GENERIC_STOPLIST.has(right.toLowerCase())) return null;
      if (left.toLowerCase() === right.toLowerCase()) return null;
      return [left, right];
    }
    const ASK_INTENT_BADGE_LABELS = {
      cve: "CVE question", patch: "Patch question", version: "Version question",
      opinion: "Opinion (will decline)", comparison: "Comparison question",
    };
    function classifyIntentClient(question) {
      if (detectComparisonEntitiesClient(question)) return "comparison";
      const text = String(question || "").toLowerCase();
      for (const intent of ["cve", "patch", "version", "opinion"]) {
        if (ASK_INTENT_KEYWORDS[intent].some(kw => text.indexOf(kw) !== -1)) return intent;
      }
      return null; // "general" isn't worth badging - nothing distinctive to show
    }
    // Second, independent badge (see #askQuestionTypeBadge's own markup
    // comment): fact vs. opinion, orthogonal to the domain badge above
    // (CVE/patch/version/comparison/general) rather than folded into the
    // same 5-way classification, per explicit request ("independent of
    // the domain language") -- a question can be both a Version question
    // AND an Opinion question at once ("should I upgrade to the latest
    // version?"), which the single combined classifier above could never
    // show simultaneously. Reuses the exact same opinion keyword list
    // ASK_INTENT_KEYWORDS.opinion already has, rather than a second,
    // separately-tuned list, so the two badges never disagree about what
    // counts as an opinion cue. Unlike the domain badge (hidden when
    // nothing distinctive matches), this one always shows one of the two:
    // "fact" is the honest default for a question with no opinion cue,
    // not an absence of information the way "general" is for the domain.
    function classifyQuestionTypeClient(question) {
      const text = String(question || "").toLowerCase();
      return ASK_INTENT_KEYWORDS.opinion.some(kw => text.indexOf(kw) !== -1) ? "opinion" : "fact";
    }
    const ASK_QUESTION_TYPE_BADGE_LABELS = { fact: "Fact question", opinion: "Opinion question" };
    // Client-side mirror of releasetrain-server's src/ask.js
    // GENERIC_QUERY_STOPLIST/buildTermRegex: a deterministic preview of
    // which words will actually drive the search match, computed and
    // shown before any API call - so it's visible even when the
    // configured Anthropic key has no credit, unlike the real search
    // calls (which only exist after a successful model round-trip and
    // are shown in each answer's "Show internals" section). This is an
    // approximation, not the model's own eventual query: the model can
    // still add vendor synonyms this plain filter doesn't know about.
    // A Yes/No poll only makes sense for a question shaped that way; a
    // WH-question opener (what/when/why/how/who/which/where) asks for an
    // explanation, not a binary answer. Checked against the raw title/
    // self-text field directly (not an extracted sentence, unlike the
    // server's own copy) since this only ever gates a feed row's own
    // post, not a longer field with the question buried mid-paragraph.
    const ASK_WH_QUESTION_RX = /^\s*(?:so|well|ok(?:ay)?)?\s*(what|when|why|how|who|which|where)\b/i;
    function askLooksLikeYesNoQuestion(text) {
      const t = String(text || "").trim();
      return t.includes("?") && !ASK_WH_QUESTION_RX.test(t);
    }
    const ASK_GENERIC_STOPLIST = new Set([
      "version", "versions", "update", "updates", "updated", "updating",
      "issue", "issues", "problem", "problems", "latest", "new", "newest",
      "release", "released", "releases", "patch", "patches", "patched",
      "fix", "fixed", "fixes", "bug", "bugs", "error", "errors", "help",
      "security", "vulnerability", "vulnerabilities", "known", "after",
      "following", "there", "have", "does", "with", "what", "when", "why",
      "how", "about", "still", "again", "working", "broken",
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "to", "of", "in", "on", "for", "and", "or", "but", "this", "that",
      "these", "those", "it", "its", "do", "did", "can", "could", "will",
      "would", "should", "my", "your", "i", "you", "we", "they", "any", "all",
    ]);
    // Strips leading/trailing punctuation ("update?" -> "update") before
    // matching, same as ask.js's stripPunctuation - without this a
    // trailing "?" hid an otherwise-generic word from the stoplist.
    const askStripPunctuation = t => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
    function previewSearchTerms(question) {
      const allTerms = String(question || "").trim().split(/\s+/).map(askStripPunctuation).filter(t => t.length > 1);
      const specific = allTerms.filter(t => !ASK_GENERIC_STOPLIST.has(t.toLowerCase()));
      return (specific.length ? specific : allTerms).slice(0, 6);
    }

    // Client-side mirror of releasetrain-server's src/ask.js
    // extractDateConstraint/computeTemporalConstraint - same three date
    // shapes plus the 3-day fallback. Deliberately does NOT (yet) special-
    // case "latest" the way it arguably should (asking for "the latest X"
    // and time-boxing to only the last 3 days can miss the real latest
    // release if it's older than that) - that needs a matching server
    // change, tracked separately, so this preview stays honest about what
    // the server actually does right now rather than showing a fixed
    // behavior the backend doesn't implement yet.
    const ASK_MONTH_NAMES = {
      january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
      may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
      september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
      december: 12, dec: 12,
    };
    const askPad2 = n => String(n).padStart(2, "0");
    function extractDateConstraintClient(question) {
      const text = String(question || "");
      let m = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
      if (m) return `${m[1]}${askPad2(m[2])}${askPad2(m[3])}`;
      m = text.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
      if (m && ASK_MONTH_NAMES[m[1].toLowerCase()]) return `${m[3]}${askPad2(ASK_MONTH_NAMES[m[1].toLowerCase()])}${askPad2(m[2])}`;
      m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([A-Za-z]+)\s+(20\d{2})\b/);
      if (m && ASK_MONTH_NAMES[m[2].toLowerCase()]) return `${m[3]}${askPad2(ASK_MONTH_NAMES[m[2].toLowerCase()])}${askPad2(m[1])}`;
      m = text.match(/\b(?:as of|in|during|by)\s+(20\d{2})\b/i);
      if (m) return `${m[1]}1231`;
      return null;
    }
    // Mirrors extractRelativeWindowDays in releasetrain-server/src/ask.js (kept in
    // sync by hand): "last 3 weeks", "past few days", "yesterday", "this month".
    const ASK_RELATIVE_NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3 };
    const ASK_RELATIVE_UNIT_DAYS = { day: 1, week: 7, month: 30 };
    function extractRelativeWindowDaysClient(question) {
      const text = String(question || "").toLowerCase();
      const m = text.match(/\b(?:last|past|previous)\s+(?:(\d{1,3}|an?|one|two|three|four|five|six|seven|eight|nine|ten|couple\s+of|few)\s+)?(day|week|month)s?\b/);
      if (m) {
        const raw = (m[1] || "1").replace(/\s+of$/, "");
        const n = /^\d+$/.test(raw) ? Number(raw) : (ASK_RELATIVE_NUMBER_WORDS[raw] || 1);
        return { days: Math.max(1, Math.min(365, n * ASK_RELATIVE_UNIT_DAYS[m[2]])), phrase: m[0].trim() };
      }
      if (/\byesterday\b/.test(text)) return { days: 2, phrase: "yesterday" };
      if (/\btoday\b/.test(text)) return { days: 1, phrase: "today" };
      if (/\bthis\s+week\b/.test(text)) return { days: 7, phrase: "this week" };
      if (/\bthis\s+month\b/.test(text)) return { days: Math.max(1, new Date().getUTCDate()), phrase: "this month" };
      return null;
    }
    const ASK_RECENT_WINDOW_DAYS = 3;
    function previewTemporalConstraint(question, resolveRelative) {
      const explicit = extractDateConstraintClient(question);
      if (explicit) return { type: "as_of", date: explicit };
      const rel = resolveRelative === false ? null : extractRelativeWindowDaysClient(question);
      const days = rel ? rel.days : ASK_RECENT_WINDOW_DAYS;
      const cutoff = new Date();
      cutoff.setUTCDate(cutoff.getUTCDate() - days);
      const date = `${cutoff.getUTCFullYear()}${askPad2(cutoff.getUTCMonth() + 1)}${askPad2(cutoff.getUTCDate())}`;
      return rel ? { type: "recent", date, windowDays: days, resolvedFrom: rel.phrase } : { type: "recent", date };
    }
    function formatTemporalConstraint(tc) {
      const iso = `${tc.date.slice(0, 4)}-${tc.date.slice(4, 6)}-${tc.date.slice(6, 8)}`;
      if (tc.type === "as_of") return `as of ${iso}`;
      return `last ${tc.windowDays || ASK_RECENT_WINDOW_DAYS} days, since ${iso}` + (tc.resolvedFrom ? ` (from "${tc.resolvedFrom}")` : "");
    }
    // Missing 'comparison' here left the preview strip printing a bare
    // "tag intent:" with nothing after the colon (uaEsc(undefined) ->
    // ""), caught live once the comparison intent's own sample question
    // was added below. The badge (ASK_INTENT_BADGE_LABELS) got updated
    // at the time, this sibling map did not.
    const ASK_INTENT_TAGS = { cve: "cve-question", patch: "patch-question", version: "version-question", general: "general-question", opinion: "opinion", comparison: "comparison-question" };

    const askQuestionEl = document.getElementById("askQuestion");
    // #askIntroPanel's sample buttons fill the input and focus it; they
    // never submit on their own, since a real question runs an actual
    // model call (and, for most questions, requires sign-in) rather
    // than something safe to trigger from a single click on a static
    // example. updateAskPreview is defined further below in this same
    // script, so this listener is wired after it exists (DOM events
    // fire well after the whole script has run).
    document.getElementById("askIntroPanel")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-ask-sample]");
      if (btn) {
        askQuestionEl.value = btn.dataset.askSample;
        askQuestionEl.focus();
        updateAskPreview();
        return;
      }
    });
    // Topbar's own sign-in pill (#topSignInLink, top-right, see its own
    // comment). Opens the same Account view the sidebar's 👤 Account
    // link and the guardrails panel's own "Sign in" link do
    // (activateUsers, defined further below in this same script; safe
    // to reference here since function declarations are hoisted and
    // this only actually runs on a later click, not at wiring time).
    // Not a second, separate sign-in flow.
    document.getElementById("topSignInLink")?.addEventListener("click", () => activateUsers());
    const askIntentBadgeEl = document.getElementById("askIntentBadge");
    const askQuestionTypeBadgeEl = document.getElementById("askQuestionTypeBadge");
    const askVendorCheckEl = document.getElementById("askVendorCheck");
    const askTemporalFilterEl = document.getElementById("askTemporalFilter");
    const askIntentFilterEl = document.getElementById("askIntentFilter");
    const askResolveVendorEl = document.getElementById("askResolveVendor");
    const askResolveTemporalEl = document.getElementById("askResolveTemporal");

    // Guardrails: releasetrain-server's unified admin-configurable
    // registry of deterministic safety/correctness checks applied to
    // every Ask answer (GET /api/guardrails, public with optional auth;
    // GET/PUT /api/account/guardrails for a signed-in user's own
    // per-guardrail override). Distinct from askVendorCheck/
    // askTemporalFilter/askIntentFilter above, which keep their own
    // separate, existing purpose (quick one-off testing, sent
    // explicitly on every ask request) and are untouched. Fetched lazily
    // each time #askGuardrailsDetails is opened (see the "toggle"
    // listener below), not on page load, and re-fetched on every open
    // rather than cached once, so a visitor who signs in without
    // reloading the page still sees the correct configurable state the
    // next time they open it.
    async function askLoadGuardrails() {
      const bodyEl = document.getElementById("askGuardrailsBody");
      if (!bodyEl) return;
      bodyEl.innerHTML = `<p class="st-183 ua-muted" >Loading…</p>`;
      const res = await uaRequest("guardrails").catch(() => null);
      if (!res || !res.ok) {
        bodyEl.innerHTML = `<p class="st-183 ua-muted" >Could not load guardrails.</p>`;
        return;
      }
      const data = await res.json();
      const guardrails = Array.isArray(data.guardrails) ? data.guardrails : [];
      // vendorCheck, temporalFilter and intentFilter are the same settings as the Vendor
      // check / Temporal filter / Intent filter checkboxes above, and those are sent with
      // every question so they always win; listing them here too only duplicated them.
      const ASK_DUPLICATED_TOGGLES = ["vendorCheck", "temporalFilter", "intentFilter"];
      const optional = guardrails.filter(g => g.tier !== "mandatory" && !ASK_DUPLICATED_TOGGLES.includes(g.id));
      // Per explicit request ("are there more guardrails that can be
      // added to the left, you can keep them unchangeable"): the
      // mandatory ones are listed here too now, alongside the checks a
      // visitor can actually change -- always shown checked and disabled
      // (same as a non-configurable optional one already renders, see
      // below), so they read as "on, not changeable" using an existing
      // visual pattern rather than a new one. Still can't be toggled;
      // the full description is still only a hover away.
      const mandatory = guardrails.filter(g => g.tier === "mandatory");
      const signedIn = !!uaToken();
      // Every short label here is deliberately <= ~18 characters so it
      // never wraps or overflows the sidebar's own narrow column, per
      // explicit request. Hover for the full description either way.
      const ASK_GUARDRAIL_SHORT = {
        rewriterRetry: "Retry new terms",
        toolResultInjectionScan: "Injection scan",
        outputLeakScan: "Leak scan",
        versionCorrectionRewrite: "Version check",
        dualSourceVersionCheck: "Dual-source check",
        vendorDomainVerification: "Domain check",
        evaluatorWebOverride: "Web override",
        deterministicWebFallback: "Web fallback",
        comparisonWindowCorrection: "Window check",
        liveRedditSearchFallback: "Live Reddit search",
        comparisonMetricWeighting: "Metric weighting",
        comparisonRiskyPostWarning: "Risk report links",
        retrieverRetry: "Retriever retry",
        evaluatorSelfCheck: "Evaluator retry",
        orchestratorRevise: "Hedge retry",
      };
      const shortLabel = g => ASK_GUARDRAIL_SHORT[g.id] || String(g.label || g.id).split(/\s+/).slice(0, 3).join(" ");
      const optionalHtml = optional.length
        ? optional.map(g => `<label class="ask-toggle-inline" title="${uaEsc(g.description || g.label || g.id)}">
            <input type="checkbox" class="ask-guardrail-input" data-id="${uaEsc(g.id)}"${g.effective ? " checked" : ""}${g.configurable ? "" : " disabled"}> ${uaEsc(shortLabel(g))}
            <span id="ask-guardrail-msg-${uaEsc(g.id)}" class="u-hide st-184 ua-muted" >Saved</span>
          </label>`).join("")
        : `<p class="st-183 ua-muted" >None you can change.</p>`;
      const mandatoryHtml = mandatory.map(g => `<label class="st-185 ask-toggle-inline"  title="${uaEsc(g.description || g.label || g.id)}">
            <input type="checkbox" checked disabled> ${uaEsc(shortLabel(g))}
          </label>`).join("");
      bodyEl.innerHTML = `
        ${signedIn ? "" : `<p class="st-186 ua-muted" ><a href="#" id="askGuardrailsSignInLink" target="_self">Sign in</a> to change these.</p>`}
        <div class="u-show-flex st-187" >${optionalHtml}</div>
        <p class="st-188 ua-muted" >Always on</p>
        <div class="u-show-flex st-187" >${mandatoryHtml}</div>
      `;
      const signInLink = document.getElementById("askGuardrailsSignInLink");
      if (signInLink) signInLink.addEventListener("click", e => { e.preventDefault(); activateUsers(); });
      bodyEl.querySelectorAll(".ask-guardrail-input").forEach(input => {
        input.addEventListener("change", async () => {
          if (input.disabled) return;
          const id = input.dataset.id;
          const checked = input.checked;
          const msgEl = document.getElementById("ask-guardrail-msg-" + id);
          input.disabled = true;
          try {
            const putRes = await uaRequest("account/guardrails", { method: "PUT", body: JSON.stringify({ guardrailPrefs: { [id]: checked } }) });
            if (!putRes.ok) throw new Error((await putRes.json().catch(() => ({}))).error || "Save failed.");
            if (msgEl) {
              setDisplay(msgEl, "");
              setTimeout(() => { setDisplay(msgEl, "none"); }, 1200);
            }
          } catch (err) {
            input.checked = !checked;
            alert(err.message || "Save failed.");
          } finally {
            input.disabled = false;
          }
        });
      });
    }
    const askGuardrailsDetailsEl = document.getElementById("askGuardrailsDetails");
    if (askGuardrailsDetailsEl) {
      askGuardrailsDetailsEl.addEventListener("toggle", () => {
        if (askGuardrailsDetailsEl.open) askLoadGuardrails();
      });
      if (askGuardrailsDetailsEl.open) askLoadGuardrails();
    }

    // Per-answer Guardrails tab (askRenderCard's own [data-panel="guardrails"]):
    // same GET /api/guardrails list askLoadGuardrails above renders, plus
    // (unique to this tab) a plain-language "Used for this answer" note
    // on any guardrail that actually did something for THIS specific
    // result -- res.guardrailActivity and the res.sources[].guardrail tag
    // a source-affecting guardrail leaves behind, both already embedded
    // by askRenderCard as this panel's own data-* attributes (no second
    // per-answer endpoint needed). Lazily rendered the first time this
    // tab is actually opened (see askWireRailTabs below), same reasoning
    // as the pre-question panel: most answers are never checked.
    function askGuardrailUsedNoteHtml(id, activity, taggedTitles) {
      const a = activity && activity[id];
      if (!a) return "";
      let text = "";
      if (id === "toolResultInjectionScan" && a.dropped > 0) {
        text = `Dropped ${a.dropped} suspicious result${a.dropped === 1 ? "" : "s"} for this answer.`;
      } else if (id === "outputLeakScan" && a.applied) {
        text = "Blocked this answer's original wording (flagged content).";
      } else if (id === "versionCorrectionRewrite" && a.applied) {
        text = "Verified the version number stated in this answer.";
      } else if (id === "dualSourceVersionCheck" && a.applied) {
        text = a.agreed === false
          ? `Checked a live web source too, found a disagreement (web said ${uaEsc(a.webVersion || "a different version")}), and let the Orchestrator reconcile it.`
          : "Checked a live web source too, which confirmed this answer's version number.";
      } else if (id === "evaluatorWebOverride" && a.applied) {
        text = "Trusted a live web result the Evaluator judged insufficient for this answer.";
      } else if (id === "deterministicWebFallback" && a.applied) {
        text = "Ran a live web search for this answer since internal retrieval found nothing.";
      } else if (id === "comparisonWindowCorrection" && a.applied) {
        text = "Corrected the stated time window for this comparison answer.";
      } else if (id === "liveRedditSearchFallback" && a.applied) {
        const entities = (a.entities && a.entities.length) ? a.entities.join(", ") : "a side of this comparison";
        text = `This system's own tracked Reddit data had nothing for ${uaEsc(entities)}, so a live Reddit search ran instead.`;
      } else if (id === "retrieverRetry" && a.applied) {
        text = `Retried retrieval for this answer (${a.rounds} rounds total).`;
      } else if (id === "rewriterRetry" && a.applied) {
        text = `The Rewriter tried different search terms for this answer (${a.attempts} attempts).`;
      } else if (id === "evaluatorSelfCheck" && a.applied) {
        text = "Retried a malformed Evaluator response for this answer.";
      } else if (id === "orchestratorRevise" && a.applied) {
        text = "Regenerated this answer after an initial hedge despite real evidence.";
      }
      if (!text) return "";
      const link = (taggedTitles && taggedTitles.length) ? ` <a href="#" class="ask-guardrail-goto-sources">View source</a>` : "";
      return `<div class="ask-guardrail-used">&#9989; ${uaEsc(text)}${link}</div>`;
    }
    async function askRenderGuardrailsTab(panel) {
      let activity = {}, taggedSources = [];
      try { activity = JSON.parse(panel.dataset.guardrailActivity || "{}"); } catch { /* keep {} */ }
      try { taggedSources = JSON.parse(panel.dataset.guardrailSources || "[]"); } catch { /* keep [] */ }
      const res = await uaRequest("guardrails").catch(() => null);
      if (!res || !res.ok) {
        panel.innerHTML = `<p class="st-189 ua-muted" >Could not load guardrails.</p>`;
        return;
      }
      const data = await res.json();
      const guardrails = Array.isArray(data.guardrails) ? data.guardrails : [];
      const mandatory = guardrails.filter(g => g.tier === "mandatory");
      const optional = guardrails.filter(g => g.tier !== "mandatory");
      const signedIn = !!uaToken();
      const rowHtml = (g, interactive) => {
        const mine = taggedSources.filter(s => s.guardrail === g.id).map(s => s.title);
        return `<div class="st-190 ua-settings-row" >
            <div class="ua-settings-info">
              <strong>${interactive ? "" : "&#128274; "}${uaEsc(g.label || g.id)}</strong>
              <span class="ua-muted">${uaEsc(g.description || "")}</span>
              ${askGuardrailUsedNoteHtml(g.id, activity, mine)}
            </div>
            ${interactive
              ? `<input type="checkbox" class="ask-guardrail-input" data-id="${uaEsc(g.id)}"${g.effective ? " checked" : ""}${g.configurable ? "" : " disabled"}>
                 <span id="ask-guardrail-tab-msg-${uaEsc(g.id)}" class="u-hide st-184 ua-muted" >Saved</span>`
              : `<input type="checkbox" disabled${g.enabled ? " checked" : ""}>`}
          </div>`;
      };
      const mandatoryHtml = mandatory.length ? mandatory.map(g => rowHtml(g, false)).join("")
        : `<p class="st-183 ua-muted" >None defined yet.</p>`;
      const optionalHtml = optional.length ? optional.map(g => rowHtml(g, true)).join("")
        : `<p class="st-183 ua-muted" >None defined yet.</p>`;
      panel.innerHTML = `
        <p class="st-191 ask-muted" >Which safety/correctness checks applied to this exact answer, and what each is set to.</p>
        <p class="st-192" >Mandatory (admin-set, disabled here)</p>
        <div class="st-193 ua-settings-list" >${mandatoryHtml}</div>
        <p class="st-194" >Optional</p>
        ${signedIn ? "" : `<p class="st-186 ua-muted" >Sign in (<a href="#" id="askGuardrailsTabSignInLink" target="_self">Account view</a>) to customize these for your own questions.</p>`}
        <div class="st-193 ua-settings-list" >${optionalHtml}</div>
      `;
      const signInLink = panel.querySelector("#askGuardrailsTabSignInLink");
      if (signInLink) signInLink.addEventListener("click", e => { e.preventDefault(); activateUsers(); });
      // "View source": switches this same card to its own Sources tab
      // rather than duplicating the Sources panel's own rendering here.
      panel.querySelectorAll(".ask-guardrail-goto-sources").forEach(a => {
        a.addEventListener("click", e => {
          e.preventDefault();
          const card = panel.closest(".ask-answer-card");
          const sourcesTab = card && card.querySelector('.ask-rail-tab[data-tab="sources"]');
          if (sourcesTab) sourcesTab.click();
        });
      });
      panel.querySelectorAll(".ask-guardrail-input").forEach(input => {
        input.addEventListener("change", async () => {
          if (input.disabled) return;
          const id = input.dataset.id;
          const checked = input.checked;
          const msgEl = panel.querySelector("#ask-guardrail-tab-msg-" + id);
          input.disabled = true;
          try {
            const putRes = await uaRequest("account/guardrails", { method: "PUT", body: JSON.stringify({ guardrailPrefs: { [id]: checked } }) });
            if (!putRes.ok) throw new Error((await putRes.json().catch(() => ({}))).error || "Save failed.");
            if (msgEl) {
              setDisplay(msgEl, "");
              setTimeout(() => { setDisplay(msgEl, "none"); }, 1200);
            }
          } catch (err) {
            input.checked = !checked;
            alert(err.message || "Save failed.");
          } finally {
            input.disabled = false;
          }
        });
      });
    }

    // Per-answer Feedback Loop tab (askRenderCard's own
    // [data-panel="feedbackloop"]): unlike Guardrails above, this needs
    // its own per-answer fetch (GET /api/ask/:runId/feedback-loop) since
    // the vendor-wide rating stats behind it aren't already embedded in
    // res.* the way guardrailActivity is. Shows this run's own rating,
    // the vendor's aggregate stats, and whether any admin threshold
    // currently flags it -- read-only for now (v1 does not change how a
    // future answer for a flagged vendor gets produced, see
    // feedbackLoop.js's own comment server-side).
    async function askRenderFeedbackLoopTab(panel, runId) {
      // Set synchronously by askRenderCard as this panel's own data
      // attributes (same JSON already computed for the Guardrails panel,
      // reused here rather than a second round trip). Reads every
      // pipeline-level retry guardrail (retrieverRetry/rewriterRetry/
      // evaluatorSelfCheck/orchestratorRevise), not just the numeric
      // feedbackLoopCount: a viewer landing on a tab literally named
      // "Feedback Loop" reasonably expects ALL of this system's feedback-
      // loop mechanics here, not split silently between this tab and the
      // separate Guardrails tab by an internal pipeline distinction they
      // have no way to know about - reported live on a plain,
      // non-comparison "recent CVEs affecting MySQL" question run under
      // Multi-agent (fixed): this tab showed nothing at all about the new
      // loops, since that preset never sets feedbackLoopCount (only the
      // two genuinely delegated presets, multi_agent/multi_agent_feedback,
      // do - see agentCount's own comment on evaluatorRan elsewhere in
      // this file for why).
      let activity = {};
      try { activity = JSON.parse(panel.dataset.guardrailActivity || "{}"); } catch { /* keep {} */ }
      // retrieverRetry/rewriterRetry/evaluatorSelfCheck only ever appear
      // in guardrailActivity for a genuinely delegated run (see
      // runDelegatedAsk's own guardrailActivity object server-side); a
      // continuous-loop preset's guardrailActivity never has these keys
      // at all, which is how this tells the two apart rather than
      // guessing from the preset name.
      const isDelegated = Object.prototype.hasOwnProperty.call(activity, "retrieverRetry");
      const loopCountRaw = panel.dataset.feedbackLoopCount;
      const loopCount = loopCountRaw ? Number(loopCountRaw) : null;
      const loopLines = [];
      // Which engine ran the retry loop: the server adds `orchestration`
      // only for the LangGraph pipeline (see langgraphLoop.js); every
      // other delegated preset runs the built-in loop.
      let orch = null;
      try { orch = JSON.parse(panel.dataset.orchestration || "null"); } catch { /* keep null */ }
      if (isDelegated) {
        if (orch && orch.engine === "langgraph") {
          loopLines.push(orch.fallback
            ? `Orchestration: LangGraph was requested, but this run fell back to the built-in loop (${orch.fallbackReason || "no reason recorded"}).`
            : "Orchestration: the retry loop ran as a LangGraph graph.");
          if (Array.isArray(orch.trace) && orch.trace.length) {
            loopLines.push("Graph steps: " + orch.trace.map(t => `${t.node} #${t.attempt} (${t.ms} ms${t.ok ? "" : ", failed"})`).join(", ") + ".");
          }
        } else {
          loopLines.push("Orchestration: the built-in retry loop.");
        }
        if (loopCount) {
          loopLines.push(`${loopCount} retrieval/evaluation round${loopCount === 1 ? "" : "s"} for this answer${loopCount > 1 ? " (the feedback loop retried)" : " (no retry needed, the first pass was already sufficient)"}.`);
        }
        if (activity.rewriterRetry && activity.rewriterRetry.applied) {
          loopLines.push(`The Rewriter tried different search terms for this answer (${activity.rewriterRetry.attempts} attempts).`);
        }
        if (activity.evaluatorSelfCheck && activity.evaluatorSelfCheck.applied) {
          loopLines.push("The Evaluator's response was retried after an earlier malformed reply.");
        }
      } else {
        loopLines.push("This preset doesn't use a separate Rewriter/Retriever/Evaluator loop; only the delegated multi-agent presets (Multi-agent, delegated / Multi-agent, feedback loop) do.");
      }
      if (activity.orchestratorRevise && activity.orchestratorRevise.applied) {
        loopLines.push("This answer was regenerated after an initial hedge despite real evidence.");
      }
      const loopCountHtml = `<p class="st-192" >This answer's loop activity</p>
           ${loopLines.map(t => `<p class="st-191 ask-muted" >${uaEsc(t)}</p>`).join("")}`;
      if (!runId) {
        panel.innerHTML = `${loopCountHtml}<p class="st-189 ua-muted" >No saved answer to check yet.</p>`;
        return;
      }
      const res = await uaRequest(`ask/${runId}/feedback-loop`).catch(() => null);
      if (!res) {
        panel.innerHTML = `<p class="st-189 ua-muted" >Could not load feedback loop status.</p>`;
        return;
      }
      if (res.status === 401) {
        panel.innerHTML = `${loopCountHtml}<p class="st-189 ua-muted" >Sign in (<a href="#" id="askFeedbackLoopSignInLink" target="_self">Account view</a>) to see feedback loop status for your own answers.</p>`;
        const signInLink = panel.querySelector("#askFeedbackLoopSignInLink");
        if (signInLink) signInLink.addEventListener("click", e => { e.preventDefault(); activateUsers(); });
        return;
      }
      if (!res.ok) {
        panel.innerHTML = `<p class="st-189 ua-muted" >Could not load feedback loop status.</p>`;
        return;
      }
      const data = await res.json();
      const ratingText = data.thisRun && data.thisRun.rating === 1 ? "👍 You rated this Helpful"
        : data.thisRun && data.thisRun.rating === -1 ? "👎 You rated this Not helpful"
        : "Not rated yet";
      const vendorText = data.vendor ? uaEsc(data.vendor) : "this question's vendor";
      const statsHtml = data.totalRatings
        ? `<p class="st-191 ask-muted" >${data.totalRatings} rating${data.totalRatings === 1 ? "" : "s"} so far for <strong>${vendorText}</strong>, ${Math.round((data.negativeRatio || 0) * 100)}% negative.</p>`
        : `<p class="st-191 ask-muted" >No user ratings yet for <strong>${vendorText}</strong>.</p>`;
      const thresholdsHtml = (data.thresholds || []).map(t => `<div class="st-190 ua-settings-row" >
          <div class="ua-settings-info">
            <strong>&#128274; ${uaEsc(t.label || t.id)}</strong>
            <span class="ua-muted">${uaEsc(t.description || "")}</span>
            ${t.flagged ? `<div class="ask-feedback-flagged">&#9888;&#65039; ${vendorText} is currently flagged: at least ${t.minRatings} ratings, &ge;${Math.round(t.negativeRatio * 100)}% negative.</div>` : ""}
          </div>
          <input type="checkbox" disabled${t.enabled ? " checked" : ""}>
        </div>`).join("") || `<p class="st-183 ua-muted" >No feedback thresholds defined yet.</p>`;
      panel.innerHTML = `
        <p class="st-191 ask-muted" >Real user ratings for this answer's vendor, and whether an admin-set threshold currently flags it. <a href="#" class="ask-feedbackloop-goto-answer">Rate this answer</a></p>
        ${loopCountHtml}
        <p class="st-192" >This answer's rating</p>
        <p class="st-191 ask-muted" >${uaEsc(ratingText)}</p>
        <p class="st-192" >Vendor rating history</p>
        ${statsHtml}
        <p class="st-194" >Thresholds (admin-set, disabled here)</p>
        <div class="st-193 ua-settings-list" >${thresholdsHtml}</div>
      `;
      // "Rate this answer": switches this same card to its Answer tab,
      // same jump-to-tab pattern as Guardrails' "View source" above.
      panel.querySelectorAll(".ask-feedbackloop-goto-answer").forEach(a => {
        a.addEventListener("click", e => {
          e.preventDefault();
          const card = panel.closest(".ask-answer-card");
          const answerTab = card && card.querySelector('.ask-rail-tab[data-tab="answer"]');
          if (answerTab) answerTab.click();
        });
      });
    }

    // A "which pipeline step is this" ticker above the input while a real
    // question is in flight, built from actual progress events the server
    // sends over the response stream (see the fetch/SSE handling in the
    // submit handler below), not a guess at timing. Each entry's elapsed
    // time counts up live while it is current and freezes at whatever it
    // actually reached the moment the next event arrives.
    //
    // Tool names get a short, plain label; a multi-agent preset also gets
    // the paper's own role name prefixed onto each phase (Rewriter for
    // vendor resolution, Retriever for searching, Evaluator for a widened
    // retry, Orchestrator for generating the final answer), matching how
    // this deck's own architecture diagrams already describe those roles.
    // Single-agent shows the same phases with no role framing, since that
    // preset represents the one-pipeline baseline the roles do not apply to.
    const ASK_TOOL_LABELS = {
      search_release_notes: "release notes",
      search_cve: "CVE records",
      search_community: "Reddit and StackOverflow",
      search_reddit_questions: "similar questions",
      search_web: "the web",
    };
    function askPhaseLabel(phase, detail, preset, meta) {
      const isMultiAgent = preset === "multi_agent_buggy" || preset === "multi_agent_fixed"
        || preset === "multi_agent" || preset === "multi_agent_feedback"
        || preset === "orchestrator_delegated" || preset === "langgraph_delegated";
      // meta.attempt (1 or 2) identifies which Retriever/Evaluator call
      // this event belongs to, on the two presets whose feedback loop can
      // genuinely run those roles twice for one question. Shown as a
      // "#1"/"#2" tag on the role name so two "Searching..." or "judging
      // evidence" entries in a row read as two distinct agent calls
      // rather than the same step repeating.
      const hasAttempt = isMultiAgent && meta && Number.isInteger(meta.attempt);
      const tag = (name) => hasAttempt ? `${name} #${meta.attempt}` : name;
      const role = (name) => isMultiAgent ? `${tag(name)}: ` : "";
      // Never a role() prefix here: vendor resolution is a plain catalog
      // lookup on every preset, not a Rewriter LLM call (see the Vendor
      // node's own comment above ASK_WORKFLOW_PHASE_NODE).
      if (phase === "resolving_vendor") return "Resolving vendor";
      // "rewriting"/"evaluating"/"retrying" only ever fire on multi_agent/
      // multi_agent_feedback (see runDelegatedAsk on the server), where
      // each role really is its own separate model call, not just a
      // phase of one loop. The role prefix is not optional for these.
      if (phase === "rewriting") return "Rewriter: choosing search terms";
      if (phase === "searching") return `${role("Retriever")}Searching ${ASK_TOOL_LABELS[detail] || detail || "sources"}`;
      if (phase === "evaluating") return `${tag("Evaluator")}: judging evidence`;
      if (phase === "retrying") return `${tag("Evaluator")}: requesting another search pass`;
      if (phase === "widening") return `${role("Evaluator")}Widening search window`;
      if (phase === "generating") return `${role("Orchestrator")}Generating answer`;
      // Pipeline escalation: the vendor wasn't in this system's own
      // catalog, so it's being checked against a real web search before
      // the run is allowed to abstain. See verifyVendorViaWeb on the
      // server. Not gated by isMultiAgent/role() like the phases above:
      // this can fire on single_agent too, which is the whole point.
      if (phase === "web_searching") return "Web Search: searching for vendor evidence";
      if (phase === "web_verifying") return "Verify: judging vendor evidence";
      return phase;
    }
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
    let askWorkflowState = null;      // { vendor, rewriter, retriever, evaluator, orchestrator, websearch, verify } -> idle|active|done
    let askWorkflowTiming = null;     // { vendor, rewriter, retriever, evaluator, orchestrator, websearch, verify } -> { startedAt, doneMs } | null
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
      // request -- shorter labels, same reasoning.
      { key: "vendor", name: "Ask" },
      { key: "rewriter", name: "Rewrite" },
      { key: "websearch", name: "Search" },
      { key: "verify", name: "Verify" },
      { key: "retriever", name: "Retrieve" },
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
        vendor: "idle", rewriter: "idle", retriever: "idle",
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
      askWorkflowState = { vendor: "active", rewriter: "idle", retriever: "idle", evaluator: "idle", orchestrator: "idle", websearch: "idle", verify: "idle" };
      const now = Date.now();
      askWorkflowTiming = { vendor: { startedAt: now, doneMs: null }, rewriter: null, retriever: null, evaluator: null, orchestrator: null, websearch: null, verify: null };
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

    // One combined dropdown, two sources: real component names (the
    // old Search box's own autocomplete, instant/local; see
    // suggestionPool/getCurrentToken/replaceCurrentToken/highlightMatch
    // further down this file) and real past community questions (GET
    // /api/reddit/query/questions/suggest, public, no sign-in/LLM-call
    // needed, a real relevance ranking server-side). Component matches
    // show immediately since they cost nothing; question matches are
    // appended once that request returns, without discarding whichever
    // component matches are already on screen. Picking a question fills
    // the whole input (it may already be answered); picking a component
    // replaces just the current comma-separated token, so "chrome, fire"
    // style multi-component entry still works.
    // A local debounce timer rather than the shared debounce() helper
    // further down this file. That's a `const`, and this code executes
    // well before its declaration is reached, so referencing it here
    // would throw (temporal dead zone), not silently do nothing.
    const askSuggestionsEl = document.getElementById("askSuggestions");
    let askSuggestTimer = null;
    let askSuggestActiveIdx = -1;
    let askSuggestSeq = 0; // guards against an earlier, slower request overwriting a later one
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
      askSuggestionsEl.innerHTML = items.map((it, i) => it.kind === "component"
        ? `<li role="option" data-kind="component" data-val="${uaEsc(it.value)}">
             <span class="ask-suggestion-text">🧩 ${it.html}</span>
             <span class="ask-suggestion-ver" data-ver-slot="${i}"></span>
           </li>`
        : `<li role="option" data-kind="question" data-question="${uaEsc(it.question)}" data-url="${uaEsc(it.url || "")}">
             <span class="ask-suggestion-text">💬 ${uaEsc(it.question)}</span>
             ${it.subreddit ? `<span class="ask-suggestion-sub">r/${uaEsc(it.subreddit)}</span>` : ""}
           </li>`
      ).join("");
      askSuggestionsEl.classList.add("open");
      // Shown always, for every component row, once it resolves; not
      // conditional on anything beyond "this row is still on screen".
      items.forEach((it, i) => {
        if (it.kind !== "component") return;
        fetchLatestVersionFor(it.value).then(({ version }) => {
          if (gen !== askSuggestRenderGen || !version) return;
          const slot = askSuggestionsEl.querySelector(`[data-ver-slot="${i}"]`);
          if (slot) slot.textContent = `(latest: ${version})`;
        });
      });
    }
    function pickAskSuggestion(li) {
      if (li.dataset.kind === "component") {
        askQuestionEl.value = replaceCurrentToken(askQuestionEl.value, li.dataset.val);
      } else {
        askQuestionEl.value = li.dataset.question;
      }
      hideAskSuggestions();
      updateAskPreview();
      askQuestionEl.focus();
    }
    askQuestionEl.addEventListener("input", () => {
      clearTimeout(askSuggestTimer);
      const raw = askQuestionEl.value;
      const q = raw.trim();
      const componentMatches = computeComponentMatches(raw);
      if (q.length < 3) {
        // Too short for a real-question search, so show component
        // matches alone if there are any, since those cost nothing to compute.
        if (componentMatches.length) showAskSuggestions(componentMatches);
        else hideAskSuggestions();
        return;
      }
      if (componentMatches.length) showAskSuggestions(componentMatches);
      askSuggestTimer = setTimeout(async () => {
        const seq = ++askSuggestSeq;
        try {
          const res = await fetch(`${API_BASE}reddit/query/questions/suggest?q=${encodeURIComponent(q)}&limit=6`);
          if (!res.ok) return;
          const data = await res.json();
          if (seq !== askSuggestSeq) return; // a newer keystroke already fired its own request
          const questionMatches = (data.results || []).map(it => ({ kind: "question", ...it }));
          const combined = componentMatches.concat(questionMatches);
          if (!combined.length) { hideAskSuggestions(); return; }
          showAskSuggestions(combined);
        } catch { /* best-effort: typeahead failing silently beats blocking on it */ }
      }, 250);
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
        alert("Sign in (Account view) to run a poll. It runs a real query against the model.");
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
    function askRenderSources(sources, webEvidence, webSearchFallback) {
      const webVerifyHtml = askRenderWebVerification(webEvidence);
      const webFallbackHtml = askRenderWebSearchFallback(webSearchFallback);
      if (!sources || !sources.length) {
        return webVerifyHtml || webFallbackHtml || '<p class="ask-muted">No sources were found for this question.</p>';
      }
      const documented = sources.filter(s => s.kind === "cve" || s.kind === "release");
      const discussion = sources.filter(s => s.kind !== "cve" && s.kind !== "release");
      const group = (label, list) => list.length
        ? `<div class="ask-source-group"><div class="ask-source-heading">${label}</div>${askRenderSourceItems(list)}</div>`
        : "";
      return webVerifyHtml + webFallbackHtml + group("Documented", documented) + group("Discussion", discussion);
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

      const rows = [
        ["Vendor resolution", vendorModel, vendorRule, vendorMeaning],
        ["Rewriter", rewriterModel, rewriterRule, rewriterMeaning],
        ["Retriever", retrieverModel, retrieverRule, retrieverMeaning],
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
    function askShortAnswer(res) {
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
    function askShortTabHtml(res) {
      const sentence = askShortAnswer(res);
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
      const shortPanel = askShortTabHtml(res);
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
    // Prototype Demo quick-load buttons (see their own markup comment):
    // fills #askQuestion and re-runs the same preview logic typing
    // would trigger, but never submits -- the presenter clicks Ask
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

    /* ── Back to top ──────────────────────────────────────────── */
    const backToTopBtn = document.getElementById("backToTop");
    window.addEventListener("scroll", () => {
      backToTopBtn.classList.toggle("visible", window.scrollY > 300);
    }, { passive: true });
    backToTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    /* ── Helpers ──────────────────────────────────────────────── */
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    const safe = (v, d = "") => v == null ? d : v;
    const uniq = a => Array.from(new Set(a));
    const truncate = (str, n = MAX_VER_DESC) => str && str.length > n ? str.slice(0, n - 1) + "…" : (str || "");
    const norm = s => String(s || "").toLowerCase().trim();
    const normKey = s => norm(s).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    // AI model releases (ai_model.py) vs. regular software — versionProductType is
    // one of these three exact values only for AI-model bot entries.
    const LLM_PRODUCT_TYPES = new Set(["LLM", "Embedding Model", "Multimodal Model"]);
    const isLLMVersion = v => !!v && LLM_PRODUCT_TYPES.has(v.versionProductType);
    // Hypervisor / virtualization-platform releases (hypervisor.py) — versionProductType
    // is exactly "Hypervisor" only for that bot's entries.
    const HV_PRODUCT_TYPES = new Set(["Hypervisor"]);
    const isHypervisorVersion = v => !!v && HV_PRODUCT_TYPES.has(v.versionProductType);
    const titleCase = s => s ? s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1)) : s;
    const tokens = s => uniq(String(s || "").split(",").map(t => norm(t)).filter(Boolean));

    const GENERIC_WORDS = new Set(["project", "org", "organization", "team", "labs", "systems", "software",
      "tech", "technologies", "dev", "development", "opensource", "open", "source"]);

    const dayLabelFromMillis = ms => {
      try {
        const dt = new Date(ms);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const yest = new Date(today); yest.setDate(today.getDate() - 1);
        const dStart = new Date(dt); dStart.setHours(0, 0, 0, 0);
        if (dStart.getTime() === today.getTime()) {
          const diffMin = Math.floor((Date.now() - ms) / 60000);
          if (diffMin < 1)  return "Just now";
          if (diffMin < 60) return `${diffMin} min ago`;
          const diffHr = Math.floor(diffMin / 60);
          if (diffHr <= 2)  return `${diffHr} hr ago`;
          return "Today";
        }
        if (dStart.getTime() === yest.getTime()) return "Yesterday";
        return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      } catch { return ""; }
    };
    const shortTime = iso => {
      try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
      catch { return ""; }
    };
    const avatarFor = it => {
      const url = (it.versionUrl || "") + "";
      if (it.isCve) return "./img/cve.png";
      if (url.includes("github.com/")) { const u = url.split("/")[3]; if (u) return `https://github.com/${u}.png`; }
      if (url.startsWith("https://nvd.nist.gov/")) return "./img/cve.png";
      return "./img/default.png";
    };

    // Every view's own sticky/height math (see e.g. #usersView's own
    // `top: calc(var(--topbar-h) + 16px)`) assumes --topbar-h is the
    // real height of whatever's actually pinned above it. .topbar itself
    // is display:none at a wide width outside the Ask home (see its own
    // CSS rule), so its offsetHeight there is 0. #stickyAskHeader
    // (the diagram+input) is what's actually sticky and visible in that
    // exact case, per explicit request ("allow only internal scroll for
    // view items"). Reading .topbar unconditionally left every one of
    // these views computing `top: 16px`, well short of the sticky
    // header's own real height, so a view's content started underneath/
    // behind it instead of right below it. Read whichever one is
    // actually visible (offsetHeight is 0 for a display:none element
    // either way, so no explicit visibility check is needed).
    function updateOffsets() {
      const tb = $(".topbar");
      const stickyHeader = document.getElementById("stickyAskHeader");
      const h = Math.max(tb ? tb.offsetHeight : 0, stickyHeader ? stickyHeader.offsetHeight : 0);
      document.documentElement.style.setProperty("--topbar-h", h + "px");
    }
    window.addEventListener("load", updateOffsets);
    window.addEventListener("resize", updateOffsets);
    new ResizeObserver(updateOffsets).observe($(".topbar"));
    if (document.getElementById("stickyAskHeader")) new ResizeObserver(updateOffsets).observe(document.getElementById("stickyAskHeader"));

    const normalizeQuery = q => String(q || "").split(",").map(t => t.trim()).filter(Boolean).join(",");
    const encodeCsvKeepCommas = csv => {
      const terms = String(csv || "").split(",").map(t => t.trim()).filter(Boolean);
      if (!terms.length) return "";
      return terms.map(t => encodeURIComponent(t)).join(",");
    };

    function buildHrefWithQ(path, csv) {
      const q = String(csv || "").trim();
      const qs = q ? `?q=${encodeCsvKeepCommas(q)}` : "";
      const base = path.startsWith("/") ? path : `/${path}`;
      const view = new URL(location.href).searchParams.get("view");
      const vp = view ? `${qs ? "&" : "?"}view=${encodeURIComponent(view)}` : "";
      return `${location.origin}${base}${qs}${vp}`;
    }

    function setViewParam(view) {
      const url = new URL(location.href);
      if (view) url.searchParams.set("view", view);
      else url.searchParams.delete("view");
      // Every other call site here means "navigate to this named view"
      // (or home); a `?q=...` from an earlier shared-search link has
      // nothing to do with any of them and shouldn't linger in the
      // address bar once the viewer has navigated away from it.
      // Reported live: clicking Home left `?q=whatsapp` in the URL
      // indefinitely, since this function used to only ever touch its
      // own `view` param.
      // "arch" is the one exception: activateArch() (its only caller
      // with a real view name) reads `q` as the actual component list
      // to render (see boot()'s own `EL.components.value = rawQ`), so
      // deleting it here silently broke `?view=arch&q=...` -- the page
      // rendered the right diagram on that first load (the value was
      // already in the input field before this ran), but the URL lost
      // `q` immediately, so reloading, bookmarking, or sharing that
      // exact link lost the component list. Reported live as "this is
      // not working" against a real `?view=arch&q=safari,chrome,...`
      // link that silently degraded to a bare `?view=arch`.
      if (view !== "arch") url.searchParams.delete("q");
      // URLSearchParams encodes commas as %2C; restore them for readability
      history.replaceState({}, "", url.toString().replace(/%2C/gi, ","));
      syncHomeClass();
    }
    // The Ask home is "no ?view= and no ?q=". body.view-home only changes the layout
    // on a wide screen (see the .view-home CSS); ?view=feed is the Recent updates feed.
    function syncHomeClass() {
      const u = new URL(location.href);
      const view = u.searchParams.get("view");
      document.body.classList.toggle("view-home", !view && !u.searchParams.get("q"));
      const feedLink = document.getElementById("feedLink");
      if (feedLink) feedLink.classList.toggle("nav-active", view === "feed");
      // ?view=feed, or a bare ?q= link, is the plain feed with nothing from Ask beside it.
      document.body.classList.toggle("view-feed", view === "feed" || (!view && !!u.searchParams.get("q")));
      // Was Ask-home-only ("other views keep their own scrolling panels" --
      // never actually true for every one of them: Docs and Account, at
      // least, have no internal scroll container of their own, so their
      // content just clipped invisibly against html/body's overflow:hidden
      // with no way to reach the rest of the page). A page that can always
      // scroll when its content runs taller than the viewport is strictly
      // safer than one that silently clips, and doesn't interfere with a
      // view that does have its own inner overflow:auto panel (e.g. the
      // sticky .ask-rail-col); nested scroll areas coexist fine.
      document.documentElement.classList.add("page-scroll");
      // #viewCloseBtn (see its own comment): visible on any view other
      // than the Ask home itself, since that's the only one with
      // nowhere further to "close" back to.
      const closeBtn = document.getElementById("viewCloseBtn");
      if (closeBtn) closeBtn.hidden = document.body.classList.contains("view-home");
      relocateAskOptionsPanel();
    }
    // Phones get the Recent updates feed only (see the "Phone view" CSS).
    // A phone landing on the Ask home, or on an AI-only view, is sent to the feed.
    (function phoneFeedOnly() {
      if (!window.matchMedia("(max-width: 640px)").matches) return;
      const u = new URL(location.href);
      const view = u.searchParams.get("view");
      const aiViews = ["credits", "changelog", "eval-rewriter", "eval-evaluator", "eval-orchestrator"];
      if ((!view && !u.searchParams.get("q")) || aiViews.includes(view)) {
        u.searchParams.set("view", "feed");
        history.replaceState({}, "", u.toString());
      }
    })();
    syncHomeClass();

    function setLinksHref() {
      /* archLink is now in-page (#); no href update needed */
    }

    // Round-trips a sidebar quick-filter toggle ("llm" or "hv") to a ?type= URL
    // param, so e.g. releasetrain.io/?type=llm or ?type=hv loads with that filter
    // already active and is shareable/bookmarkable as a plain link. This is a
    // client-only convenience — there's no server-side "filter by
    // versionProductType" param.
    function setTypeParam(type) {
      const url = new URL(location.href);
      if (type) url.searchParams.set("type", type);
      else url.searchParams.delete("type");
      history.replaceState({}, "", url.toString().replace(/%2C/gi, ","));
    }

    /* ── Graph Module (vis-network) ─────────────────────────────── */
    let G_ACTIVE = false, G_VIS_LOADED = false;
    let G_NETWORK = null;
    function gLoadVisNetwork() {
      if (G_VIS_LOADED) return Promise.resolve();
      return new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/vis-network@9.1.9/standalone/umd/vis-network.min.js";
        s.crossOrigin = "anonymous";
        s.onload = () => { G_VIS_LOADED = true; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    function gDestroyNetwork() {
      if (G_NETWORK) { try { G_NETWORK.destroy(); } catch(e) {} G_NETWORK = null; }
    }

    // Sidebar list of nodes that were dropped from the canvas for having no edge.
    function gRenderIsolated(list) {
      const box = document.getElementById("g-isolatedList");
      const wrap = document.getElementById("g-isolatedWrap");
      if (!box) return;
      list = Array.isArray(list) ? list : [];
      if (wrap) {
        if (list.length) wrap.setAttribute("open", "");
        else wrap.removeAttribute("open");
        const c = wrap.querySelector(".g-iso-count");
        if (c) c.textContent = list.length ? String(list.length) : "";
      }
      if (!list.length) {
        box.innerHTML = `<div class="st-199" >None: every node has at least one edge.</div>`;
        return;
      }
      const kindOf = id =>
        id.startsWith("comp:") ? "component" :
        id.startsWith("ver:")  ? "version" :
        id.startsWith("post:") ? "post" : "node";
      const rows = list
        .map(n => ({ label: n.label || n.id, kind: kindOf(String(n.id)) }))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
      box.innerHTML = rows.map(r =>
        `<div class="u-show-flex st-200" >` +
        `<span class="st-201"  title="${aEsc(r.label)}">${aEsc(r.label)}</span>` +
        `<span class="st-202" >${r.kind}</span></div>`
      ).join("");
    }

    function gChannelOf(v) {
      return v.versionReleaseChannel || (v.isCve ? "cve" : "patch");
    }

    function gGetVersionEpoch(v) {
      if (v.versionTimestamp > 0) return v.versionTimestamp;
      const d = v.versionReleaseDate;
      if (d && /^\d{8}$/.test(d)) {
        return Date.UTC(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8));
      }
      return 0;
    }

    function gBuildAndRender(versions, redditPosts) {
      gDestroyNetwork();
      const container = document.getElementById("g-networkContainer");
      const badge = document.getElementById("g-graphBadge");
      const info = document.getElementById("g-nodeInfoPanel");
      if (info) setDisplay(info, "none");

      const showVer  = document.getElementById("g-show-versions")?.checked !== false;
      const showCve  = document.getElementById("g-show-cve")?.checked !== false;
      const showRed  = document.getElementById("g-show-reddit")?.checked !== false;
      const showSO   = document.getElementById("g-show-so")?.checked !== false;
      const riskOnly = document.getElementById("g-risk-only")?.checked;
      const cvePosts = document.getElementById("g-cve-posts")?.checked;
      const windowDays = Number(document.getElementById("g-window")?.value) || 90;
      const cutoff = Date.now() - windowDays * 86400000;
      const CVE_PAT = /\bCVE-\d{4}-\d+\b/i;

      const nodes = new vis.DataSet();
      const edges = new vis.DataSet();

      /* ── Component hub nodes ── */
      const addHub = (key, label) => {
        if (compSet.has(key)) return;
        compSet.add(key);
        nodes.add({
          id: "comp:" + key,
          label: label || key,
          group: "component",
          shape: "ellipse",
          size: 28,
          mass: 6,
          color: { background: "#2563eb", border: "#1d4ed8", highlight: { background: "#1d4ed8", border: "#1d4ed8" } },
          font: { color: "#fff", size: 13, face: "system-ui,sans-serif", bold: true },
          title: "Component: " + (label || key),
        });
      };

      const compSet = new Set();
      /* Seed hubs from the URL query so every searched component gets a hub node
         even if the first API page contains no versions for it. */
      const rawQ = new URL(location.href).searchParams.get("q") || "";
      rawQ.split(",").map(s => s.trim().toLowerCase()).filter(Boolean).forEach(q => addHub(q, q));
      /* Also add hubs for any versionProductName that isn't already in compSet. */
      versions.forEach(v => {
        const key = (v.versionProductName || "").toLowerCase().trim();
        if (key) addHub(key, v.versionProductName || key);
      });

      /* Fuzzy hub lookup: find the best hub for a given name string. */
      const hubFor = name => {
        if (!name) return null;
        const n = name.toLowerCase();
        if (compSet.has(n)) return n;
        for (const c of compSet) { if (n.includes(c) || c.includes(n)) return c; }
        return null;
      };

      /* ── Version nodes ── */
      const seenVer = new Set();
      versions.forEach(v => {
        const key = hubFor((v.versionProductName || "").trim());
        if (!key) return;
        const ch = gChannelOf(v);
        const isCve = ch === "cve" || !!v.isCve || !!v.latestCveVersion;
        if (isCve && !showCve) return;
        if (!isCve && !showVer) return;
        const ep = gGetVersionEpoch(v);
        if (ep > 0 && ep < cutoff) return;
        const nodeId = "ver:" + (v._id || v.versionId || (key + v.versionNumber));
        if (seenVer.has(nodeId)) return;
        seenVer.add(nodeId);
        const daysSince = ep > 0 ? Math.max(0, (Date.now() - ep) / 86400000) : windowDays / 2;
        const edgeLen = Math.round(80 + (daysSince / windowDays) * 280);
        const color = isCve ? "#dc2626" : ch === "major" ? "#b45309" : ch === "minor" ? "#475569" : "#64748b";
        const verSourceUrl = (v.versionUrl && v.versionUrl.startsWith("http")) ? v.versionUrl
          : (v.versionReleaseNotes && v.versionReleaseNotes.startsWith("http")) ? v.versionReleaseNotes : null;
        nodes.add({
          id: nodeId,
          label: "v" + (v.versionNumber || "?"),
          shape: isCve ? "diamond" : "dot",
          size: isCve ? 11 : 7,
          mass: 1,
          color: { background: color, border: color, highlight: { background: color, border: color } },
          font: { size: 9, color: "#334155", face: "system-ui,sans-serif" },
          title: (v.versionProductName || key) + " v" + (v.versionNumber || "?") +
                 (isCve ? " [CVE]" : "") + (ep > 0 ? "\n" + new Date(ep).toLocaleDateString() : "") +
                 (Math.round(daysSince) > 0 ? "\n" + Math.round(daysSince) + " days ago" : " (today)"),
          sourceUrl: verSourceUrl,
          sourceName: (v.versionProductName || key) + " v" + (v.versionNumber || "?"),
        });
        const verDays = Math.round(daysSince);
        edges.add({
          from: nodeId, to: "comp:" + key,
          length: edgeLen,
          label: verDays > 0 ? verDays + "d" : "today",
          font: { size: 8, color: "#94a3b8", align: "middle", strokeWidth: 0 },
          color: { color: isCve ? "rgba(220,38,38,.35)" : "rgba(148,163,184,.35)", highlight: "#94a3b8" },
          width: isCve ? 1.5 : 0.7,
          dashes: false,
        });
      });

      /* ── Reddit / SO post nodes ── */
      (redditPosts || []).forEach(p => {
        const sub = hubFor((p.subreddit || "").trim());
        if (!sub) return;
        const isSO = getPostSource(p) === "stackoverflow";
        if (isSO && !showSO) return;
        if (!isSO && !showRed) return;
        const risk = isRisk(p);
        const hasCve = CVE_PAT.test(p.title || "") || CVE_PAT.test(p.selftext || "") || !!p.isAboutCve;
        if (riskOnly && !risk && !hasCve) return;
        if (cvePosts && !hasCve) return;
        const ep = +(new Date(p.created_utc || 0)) || 0;
        if (ep > 0 && ep < cutoff) return;
        const daysSince = ep > 0 ? Math.max(0, (Date.now() - ep) / 86400000) : windowDays / 2;
        const nodeId = "post:" + (p.redditId || p._id || p.id || Math.random().toString(36).slice(2));
        const edgeLen = Math.round(80 + (daysSince / windowDays) * 280);
        const color = hasCve ? "#94a3b8" : isSO ? "#2563eb" : risk ? "#94a3b8" : "#64748b";
        nodes.add({
          id: nodeId,
          label: (p.title || "").slice(0, 28) + ((p.title || "").length > 28 ? "…" : ""),
          shape: "dot",
          size: (risk || hasCve) ? 9 : 6,
          mass: 1,
          color: { background: color, border: color, highlight: { background: color, border: color } },
          font: { size: 9, color: "#334155", face: "system-ui,sans-serif" },
          title: (p.title || "").slice(0, 160) + (hasCve ? " [CVE]" : "") +
                 (isSO ? " [SO]" : " [Reddit]") + (risk ? " [high risk]" : "") +
                 (ep > 0 ? "\n" + Math.round(daysSince) + " days ago" : ""),
          sourceUrl: p.url || null,
          sourceName: (p.title || "").slice(0, 80),
        });
        const postDays = Math.round(daysSince);
        edges.add({
          from: nodeId, to: "comp:" + sub,
          length: edgeLen,
          label: postDays > 0 ? postDays + "d" : "today",
          font: { size: 8, color: "#94a3b8", align: "middle", strokeWidth: 0 },
          color: { color: hasCve ? "rgba(251,113,133,.4)" : isSO ? "rgba(59,130,246,.3)" : "rgba(168,85,247,.3)", highlight: "#94a3b8" },
          width: (risk || hasCve) ? 1.2 : 0.5,
          dashes: !risk && !hasCve,
        });
      });

      const statsEl = document.getElementById("g-statsLine");
      const satelliteCount = nodes.length - compSet.size;
      if (!compSet.size || satelliteCount <= 0) {
        const suggestions = ["linux","nginx","redis","kubernetes","openssl","postgresql","mysql","python","nodejs","mongodb"];
        const chips = suggestions.map(s =>
          `<a href="/?q=${encodeURIComponent(s)}&view=graph" class="u-show-inline-block st-203" >${s}</a>`
        ).join("");
        container.innerHTML = `<div class="u-show-flex st-204" ><div class="st-205" >Search for a component in the feed to populate the graph, or pick a suggestion:</div><div class="st-206" >${chips}</div></div>`;
        if (badge) badge.textContent = "No data";
        if (statsEl) statsEl.textContent = "No data. Search for a component first.";
        gRenderIsolated(nodes.get());  // every seeded hub is edgeless here
        return;
      }
      container.innerHTML = "";

      /* Canvas shows only connected nodes. Anything with zero edges (typically a
         searched component with no releases/posts inside the current window) is
         pulled off the canvas and listed in the sidebar instead. */
      const gConnected = new Set();
      edges.get().forEach(e => { gConnected.add(e.from); gConnected.add(e.to); });
      const gIsolated = nodes.get().filter(n => !gConnected.has(n.id));
      if (gIsolated.length) nodes.remove(gIsolated.map(n => n.id));
      gRenderIsolated(gIsolated);

      const gCompLeft = nodes.get().filter(n => n.group === "component").length;
      if (badge) badge.textContent = nodes.length + " nodes · " + edges.length + " edges"
        + (gIsolated.length ? " · " + gIsolated.length + " isolated" : "");
      if (statsEl) statsEl.textContent = gCompLeft + " component" + (gCompLeft !== 1 ? "s" : "") + " · " + nodes.length + " nodes · " + edges.length + " edges"
        + (gIsolated.length ? " · " + gIsolated.length + " isolated (see sidebar)" : "");

      G_NETWORK = new vis.Network(container, { nodes, edges }, {
        physics: {
          enabled: true,
          solver: "barnesHut",
          barnesHut: {
            // Tighter than before: less repulsion + stronger pull to centre so
            // disconnected hub/satellite pairs cluster instead of scattering to
            // the corners, which kept the auto-fit zoomed way out.
            gravitationalConstant: -1200,
            centralGravity: 0.7,
            springLength: 85,
            springConstant: 0.05,
            damping: 0.15,
            avoidOverlap: 0.15,
          },
          stabilization: { enabled: true, iterations: 220, updateInterval: 30 },
        },
        interaction: { hover: true, tooltipDelay: 150, zoomView: true, dragView: true },
        nodes: { borderWidth: 1, borderWidthSelected: 2 },
        edges: { smooth: { type: "continuous", roundness: 0.15 }, arrows: { to: false } },
      });

      /* Auto-fit, then nudge in a bit further — fit() alone tends to leave a lot
         of empty margin, especially with few nodes. */
      G_NETWORK.once("stabilizationIterationsDone", () => {
        try {
          G_NETWORK.fit({ animation: false });
          const s = G_NETWORK.getScale();
          const target = Math.min(s * 1.6, 1.4);
          if (target > s + 0.02) {
            G_NETWORK.moveTo({ scale: target, animation: { duration: 350, easingFunction: "easeInOutQuad" } });
          }
        } catch (_) {}
      });

      /* ── Node click: show info panel ── */
      G_NETWORK.on("click", function(params) {
        if (!params.nodes.length) { if (info) setDisplay(info, "none"); return; }
        const nodeId = params.nodes[0];
        const node = nodes.get(nodeId);
        if (!node || !info) return;
        const closeBtn = '<button class="st-207 g-info-close" >×</button>';
        const isComp = nodeId.startsWith("comp:");
        let html = closeBtn;
        if (isComp) {
          const key = nodeId.slice(5);
          const count = edges.get({ filter: e => e.to === nodeId }).length;
          html += '<strong class="st-198" >' + node.label + '</strong>';
          html += '<div class="st-208" >' + count + ' connected node' + (count !== 1 ? 's' : '') + '</div>';
          html += '<div class="st-209" ><a href="/?q=' + encodeURIComponent(key) + '" target="_self" class="st-210" >Open feed ↗</a></div>';
        } else {
          html += '<strong class="u-show-block st-211" >' + (node.sourceName || node.label) + '</strong>';
          if (node.title) html += '<div class="st-212" >' + node.title + '</div>';
          if (node.sourceUrl) {
            html += '<a href="' + node.sourceUrl + '" target="_blank" rel="noopener" class="st-213" >' + node.sourceUrl + ' ↗</a>';
          } else {
            html += '<span class="st-214" >No source URL available.</span>';
          }
        }
        info.innerHTML = html;
        const closeEl = info.querySelector(".g-info-close");
        if (closeEl) closeEl.addEventListener("click", () => setDisplay(info, "none"));
        setDisplay(info, "block");
      });
    }

    function gGetVersions() {
      if (STATE.candidates.length) return STATE.candidates;
      return STATE.rawVersions;
    }

    document.getElementById("g-zoomIn").addEventListener("click", () => {
      if (!G_NETWORK) return;
      G_NETWORK.moveTo({ scale: G_NETWORK.getScale() * 1.3, animation: { duration: 200, easingFunction: "easeInOutQuad" } });
    });
    document.getElementById("g-zoomOut").addEventListener("click", () => {
      if (!G_NETWORK) return;
      G_NETWORK.moveTo({ scale: G_NETWORK.getScale() / 1.3, animation: { duration: 200, easingFunction: "easeInOutQuad" } });
    });
    document.getElementById("g-zoomFit").addEventListener("click", () => {
      if (!G_NETWORK) return;
      G_NETWORK.fit({ animation: { duration: 400, easingFunction: "easeInOutQuad" } });
    });

    /* ── Graph view: show / hide ─────────────────────────────── */
    function activateGraph() {
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (A_ACTIVE)   deactivateArch();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      G_ACTIVE = true;
      setViewParam("graph");
      setDisplay(document.getElementById("graphView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("graphControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.graphLink.classList.add("nav-active");
    }
    function deactivateGraph() {
      gDestroyNetwork();
      G_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("graphView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("graphControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.graphLink.classList.remove("nav-active");
    }

    EL.graphLink.addEventListener("click", async e => {
      e.preventDefault();
      if (G_ACTIVE) { deactivateGraph(); return; }
      activateGraph();
      EL.navLoader.classList.add("active");
      try { await gLoadVisNetwork(); } finally { EL.navLoader.classList.remove("active"); }
      gBuildAndRender(gGetVersions(), STATE.redditAll);
    });

    document.querySelector(".brand").addEventListener("click", e => {
      e.preventDefault();
      deactivateActiveView();
      // Same unconditional clear as EL.homeLink's own handler just below
      // (a stray `?q=...` needs clearing too, not just `?view=`).
      setViewParam("");
    });

    // Shared by the Home link, the Recent updates link, the ask submit
    // handler (see its own comment), and #viewCloseBtn: leaves whichever
    // one alternate view is currently active, if any. At most one of
    // these flags is ever true at a time (activateX always deactivates
    // whatever came before it), so this is a plain if/else-if chain, not
    // a series of independent checks.
    function deactivateActiveView() {
      if (ER_ACTIVE)       deactivateEvalRewriter();
      else if (EE_ACTIVE)  deactivateEvalEvaluator();
      else if (EO_ACTIVE)  deactivateEvalOrchestrator();
      else if (G_ACTIVE)   deactivateGraph();
      else if (A_ACTIVE)   deactivateArch();
      else if (CV_ACTIVE)  deactivateCve();
      else if (DB_ACTIVE)  deactivateDashboard();
      else if (D_ACTIVE)   deactivateDocs();
      else if (ACK_ACTIVE) deactivateAck();
      else if (CL_ACTIVE)  deactivateChangelog();
      else if (UA_ACTIVE)  deactivateUsers();
      else if (NET_ACTIVE) deactivateNetwork();
    }
    EL.homeLink.addEventListener("click", e => {
      e.preventDefault();
      deactivateActiveView();
      // Unconditional, not just "if view === feed": a stray `?q=...` from
      // an earlier shared-search link (with no ?view= at all) needs
      // clearing too, and deactivateActiveView() above is a no-op when
      // nothing else was active in the first place. Reported live:
      // clicking Home left `?q=whatsapp` sitting in the address bar with
      // no way to clear it. setViewParam("") is itself a no-op on the
      // URL when there's nothing to clear, so this is always safe to call.
      setViewParam("");
    });

    // "Recent updates": the plain feed, as its own view (the Ask home no longer shows it).
    document.getElementById("feedLink").addEventListener("click", e => {
      e.preventDefault();
      deactivateActiveView();
      setViewParam("feed");
    });

    // #viewCloseBtn (see its own markup comment): same effect as clicking
    // Home, just reachable without opening the (now collapsed-by-default)
    // Menu first.
    document.getElementById("viewCloseBtn").addEventListener("click", () => {
      deactivateActiveView();
      // Unconditional: same reasoning as EL.homeLink's own handler.
      setViewParam("");
    });

    function gReRender() {
      if (!G_ACTIVE || !G_VIS_LOADED) return;
      gBuildAndRender(gGetVersions(), STATE.redditAll);
    }

    document.getElementById("g-refreshBtn").addEventListener("click", async () => {
      if (!G_VIS_LOADED) {
        EL.navLoader.classList.add("active");
        try { await gLoadVisNetwork(); } finally { EL.navLoader.classList.remove("active"); }
      }
      gBuildAndRender(gGetVersions(), STATE.redditAll);
    });

    ["g-show-versions","g-show-cve","g-show-reddit","g-show-so","g-risk-only","g-cve-posts"].forEach(id => {
      document.getElementById(id)?.addEventListener("change", gReRender);
    });
    document.getElementById("g-window")?.addEventListener("change", gReRender);

    document.querySelectorAll("[data-close-dialog]").forEach(btn =>
      btn.addEventListener("click", () => document.getElementById(btn.dataset.closeDialog).close())
    );



    /* ── Arch Module ──────────────────────────────────────────── */
    // Fallback OS names for aIsOsComponent() — only consulted when the feed record
    // carries no usable OS classification of its own.
    const A_OS = new Set(["linux","windows","macos","ubuntu","centos","debian","redhat","fedora","arch","suse",
      "mint","mac","solaris","freebsd","opensuse","gentoo","slackware","manjaro","android","ios",
      "raspbian","kali-linux","zorin","popos"]);
    let A_ACTIVE = false, A_LOADED = false;
    let A_PLANTUML_SERVER = "https://www.plantuml.com/plantuml/svg/";
    let A_PLANTUML_URL = "", A_VERSIONS = [], A_UML_CODE = "";
    const aEl = id => document.getElementById("a-" + id);

    function aLoadPako() {
      if (A_LOADED || typeof pako !== "undefined") { A_LOADED = true; return Promise.resolve(); }
      return new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";
        s.crossOrigin = "anonymous";
        s.onload = () => { A_LOADED = true; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    function aSanitize(s) { return String(s || "").replace(/[":]/g, "-"); }
    function aExtractCveCode(url) {
      if (!url) return "Unknown CVE";
      const m = url.match(/CVE-\d{4}-\d+/);
      return m ? m[0] : "Generic Security Issue";
    }
    function aFormatDate(yyyymmdd) {
      if (!yyyymmdd || String(yyyymmdd).length < 8) return "Unknown";
      const y = yyyymmdd.slice(0, 4), mo = yyyymmdd.slice(4, 6), d = yyyymmdd.slice(6, 8);
      const dt = new Date(y, mo - 1, d), today = new Date();
      const diff = Math.floor((today - dt) / 86400000);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const base = `${months[dt.getMonth()]}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`;
      const rel = diff === 0 ? "(Today)" : diff === 1 ? "(Yesterday)" : diff < 7 ? "(This week)" : diff < 30 ? "(This month)" : "";
      return `${base} ${rel}`.trim();
    }
    // Is this component an operating system? Prefer the feed's own classification;
    // fall back to A_OS only for OSes the data leaves unclassified (linux, macos, …).
    function aIsOsComponent(v) {
      const lv = v.latestVersion || v.currentVersion || {};
      if (String(lv.versionProductType || "").trim().toUpperCase() === "OS") return true;
      const ct = (lv.classification && lv.classification.componentType) || [];
      // Sole "OS" tag only — e.g. chrome carries ["OS","MOBILE","BROWSER"] and is not an OS.
      if (Array.isArray(ct) && ct.length === 1 && String(ct[0]).toUpperCase() === "OS") return true;
      return A_OS.has((v.name || "").toLowerCase());
    }
    function aSortByOS(arr) {
      return arr.slice().sort((a, b) =>
        (aIsOsComponent(b) ? 1 : 0) - (aIsOsComponent(a) ? 1 : 0));
    }
    // Fallback hypervisor names — only consulted when the feed record carries no
    // usable "Hypervisor" productType of its own (hypervisor.py sets it). A
    // hypervisor is the base layer: everything else (OS, apps) runs on top of it.
    const A_HYPERVISOR = new Set(["vmware esxi","vmware workstation","vmware fusion",
      "oracle virtualbox","virtualbox","xen","xcp-ng","proxmox ve","proxmox",
      "hyper-v","kvm","qemu","bhyve","nutanix ahv"]);
    function aIsHypervisorComponent(v) {
      const lv = v.latestVersion || v.currentVersion || {};
      if (String(lv.versionProductType || "").trim().toLowerCase() === "hypervisor") return true;
      const ct = (lv.classification && lv.classification.componentType) || [];
      if (Array.isArray(ct) && ct.map(x => String(x).toUpperCase()).includes("HYPERVISOR")) return true;
      return A_HYPERVISOR.has((v.name || "").toLowerCase());
    }
    const A_STACKS = [
      { name:"LAMP",   components:["apache","mysql","php","linux"] },
      { name:"LEMP",   components:["nginx","mysql","php","linux"] },
      { name:"UNN",    components:["ubuntu","nginx","nodejs"] },
      { name:"RAILS",  components:["macos","rails","postgresql"] },
      { name:"DWS",    components:["django","windows","sqlite"] },
      { name:"FLASK",  components:["flask","arch","postgresql"] },
      { name:"SPRING", components:["redhat","spring","java"] },
      { name:"CRP",    components:["centos","rails","postgresql"] },
      { name:"DDS",    components:["debian","django","sqlite"] },
      { name:"USP",    components:["ubuntu","prisma","svelte"] },
      { name:"VIRT",   components:["xen","debian","nginx"] },
    ];
    function aGetStack(list) {
      const stacks = A_STACKS;
      const out = [], used = new Set();
      for (const s of stacks) {
        if (s.components.every(c => list.includes(c.toLowerCase()))) {
          out.push({ stackName: s.name, matchedComponents: s.components });
          s.components.forEach(c => used.add(c.toLowerCase()));
        }
      }
      const extra = list.filter(c => !used.has(c.toLowerCase())).map(c => ({ component: c, belongsToStack: false }));
      return { groupedStacks: out, extraComponents: extra };
    }
    function aVersionDelta(cur, latest) {
      const toN = v => String(v || "").split(/[^\d]+/).map(x => parseInt(x || "0", 10)).slice(0, 3);
      const [cM, cm, cp] = toN(cur), [lM, lm, lp] = toN(latest);
      if (lM > cM) return "major";
      if (lM === cM && lm > cm) return "minor";
      if (lM === cM && lm === cm && lp > cp) return "patch";
      return "none";
    }
    /* ── Drift helpers: installed vs latest ───────────────────── */
    function aDateMs(yyyymmdd) {
      const s = String(yyyymmdd || "").replace(/-/g, "");
      if (!/^\d{8}$/.test(s)) return 0;
      return +new Date(s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + "T12:00:00Z");
    }
    // Whole calendar days between a YYYYMMDD date-only value and "today",
    // in the viewer's own local timezone. Deliberately NOT
    // aDateMs(date) vs Date.now(). aDateMs pins every date to a fixed
    // noon-UTC instant; diffing that against Date.now() (a real, moving
    // instant) means the result silently depends on how far the viewer's
    // own timezone sits from UTC, not on whether a calendar day has
    // actually passed for them. Confirmed live: a release dated "today"
    // and posted at 5am Pacific already read "1d ago" by evening the
    // same Pacific day, purely because Pacific time is far enough behind
    // UTC that "now" had already crossed past the item's noon-UTC anchor
    // by more than 12 hours, even though the viewer's own calendar date
    // hadn't changed at all. Building both sides as local-midnight
    // Date objects instead makes the diff a plain, exact day count that
    // only moves once the viewer's own local date actually does.
    function calendarDaysAgo(yyyymmdd) {
      const s = String(yyyymmdd || "").replace(/-/g, "");
      if (!/^\d{8}$/.test(s)) return null;
      const itemMidnight = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).getTime();
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return Math.round((todayMidnight - itemMidnight) / 86400000);
    }
    // Per-position step counts from installed → latest, plus the dominant tier.
    function aVerGap(cur, lat) {
      const P = v => String(v || "").split(/[^\d]+/).filter(x => x !== "").map(n => parseInt(n, 10));
      const c = P(cur), l = P(lat), d = i => (l[i] || 0) - (c[i] || 0);
      const M = d(0), m = d(1), p = d(2);
      let tier = "none";
      if (M > 0) tier = "major";
      else if (M === 0 && m > 0) tier = "minor";
      else if (M === 0 && m === 0 && p > 0) tier = "patch";
      return { tier, major: Math.max(0, M), minor: Math.max(0, m), patch: Math.max(0, p) };
    }
    // How long the current latest has been available while you're not on it (staleness proxy).
    function aDaysBehind(version) {
      const cur = version.currentVersion || {}, lat = version.latestVersion || {};
      if (aVersionDelta(cur.versionNumber, lat.versionNumber) === "none") return 0;
      const ld = aDateMs(lat.versionReleaseDate);
      return ld ? Math.max(0, Math.round((Date.now() - ld) / 86400000)) : 0;
    }
    function aGapLabel(g) {
      if (!g || g.tier === "none") return "";
      const bits = [];
      if (g.major) bits.push(g.major + " major");
      if (g.minor) bits.push(g.minor + " minor");
      if (g.patch && g.tier === "patch") bits.push(g.patch + " patch");
      return bits.join(" +") || (g.tier + " update");
    }
    // 10-cell ASCII magnitude bar, full near ~1 year behind.
    function aLagBar(days) {
      const f = Math.max(0, Math.min(10, Math.round(days / 36.5)));
      return "[" + "#".repeat(f) + "-".repeat(10 - f) + "]";
    }
    // Rank for sorting: worst first.
    const A_COLOR_RANK = { cve: 0, behind: 1, unknown: 2, current: 3 };
    // Ecosystem freshness score + headline counts for the scorecard.
    function aScore(vers) {
      const pts = { current: 100, unknown: 70, behind: 55, cve: 15 };
      let sum = 0, behind = 0, current = 0, cve = 0, unknown = 0;
      const lags = [];
      vers.forEach(v => {
        const k = aColorKey(v);
        sum += pts[k];
        if (k === "cve") cve++;
        else if (k === "behind") behind++;
        else if (k === "unknown") unknown++;
        else current++;
        const d = aDaysBehind(v); if (d > 0) lags.push(d);
      });
      lags.sort((a, b) => a - b);
      return {
        score: vers.length ? Math.round(sum / vers.length) : 100,
        behind, current, cve, unknown,
        medianLag: lags.length ? lags[Math.floor(lags.length / 2)] : 0,
      };
    }
    /* One component = one bucket, matching aColorKey(). */
    function aSummarize(arr) {
      const out = { cve: 0, behind: 0, current: 0, unknown: 0 };
      arr.forEach(v => {
        const cur = v.currentVersion || v.latestVersion, lat = v.latestVersion;
        if (!cur || !lat) return;
        const k = aColorKey(v);
        out[k] = (out[k] || 0) + 1;
      });
      return out;
    }
    function aIsRecent(version) {
      const rd = String((version.latestVersion || {}).versionReleaseDate || "");
      if (rd.length < 8) return false;
      const dt = new Date(rd.slice(0, 4), rd.slice(4, 6) - 1, rd.slice(6, 8));
      return (Date.now() - dt) / 86400000 <= 7;
    }
    // CVE affecting this component, from the per-component aggregate or the
    // secondary isCve lookup (aAttachCve) — the aggregate misses some, e.g. the
    // 2026-08 Chrome advisories whose brand differs from the release feed.
    function aCveOf(version) {
      if (version.latestCveVersion) {
        return { code: aExtractCveCode(version.latestCveVersion.versionUrl), url: version.latestCveVersion.versionUrl };
      }
      if (version._cve) return version._cve;
      return null;
    }
    /* The only colour axis: act-now / behind / current / no-data.
       Everything finer (how far behind, community chatter, freshly released)
       is carried by the text label, not by more colours. */
    function aColorKey(version) {
      const cur = version.currentVersion || version.latestVersion, lat = version.latestVersion;
      if (!cur || !lat) return "current";
      if (aCveOf(version)) return "cve";
      const behind = aVerGap(cur.versionNumber, lat.versionNumber).tier !== "none";
      if (behind || (version._risk || 0) > 0) return "behind";
      if (!version._hasInstalled) return "unknown";
      return "current";
    }
    function aComponentLine(version, fills) {
      const cur = version.currentVersion || version.latestVersion, lat = version.latestVersion;
      if (!cur || !lat) return `component "${aSanitize(version.name)}"`;
      const fill = fills[aColorKey(version)] || fills.current;
      const name = aSanitize(cur.versionProductName || version.name);
      const cv = aSanitize(cur.versionNumber), lv = aSanitize(lat.versionNumber);
      const gap = aVerGap(cur.versionNumber, lat.versionNumber);
      const days = aDaysBehind(version);
      let headline;
      if (gap.tier !== "none") {
        // installed → latest, magnitude bar, semver distance, staleness
        headline = `${name}  ${cv} -> ${lv} \\n${aLagBar(days)} ${aGapLabel(gap)} - ${days}d behind`;
      } else if (!version._hasInstalled) {
        headline = `${name}  ${lv} \\ninstalled version unknown`;
      } else {
        headline = `${name}  ${cv} \\non latest${aIsRecent(version) ? " [NEW]" : " [OK]"}`;
      }
      const cve = aCveOf(version);
      const cveText = cve ? `\\nCVE: ${cve.code}${cve.date ? " (" + aFormatDate(cve.date) + ")" : ""}` : "";
      const rp = (version._riskPosts || [])[0];
      const riskText = rp
        ? `\\ncommunity: ${rp.url ? `[[${rp.url} u/${rp.handle}]]` : `u/${rp.handle}`}`
        : `\\ncommunity: no risk posts (${A_RISK_DAYS}d)`;
      return `component "${headline}${cveText}${riskText}" #${fill.replace("#", "")}`;
    }
    /* Two colours, used only where something needs attention. A calm component
       (on latest, or version unknown) gets no fill at all. */
    const A_FILLS = {
      cve:     "#fca5a5",  /* red   : security advisory — act now      */
      behind:  "#fcd34d",  /* amber : an update is available           */
      current: "#ffffff",  /* none                                     */
      unknown: "#ffffff",  /* none                                     */
    };
    const A_RISK_DAYS = 10;  // community-risk lookback for the arch view
    // Recent high-risk community (Reddit) posts for a component, newest first.
    function aRiskPostsFor(name) {
      const n = norm(name);
      if (n.length < 3 || !STATE.redditBySub) return [];
      const cutoff = Date.now() - A_RISK_DAYS * 86400000;
      const hits = [];
      for (const p of postsForComponent(n)) {
        if (getPostSource(p) !== "reddit") continue;
        if (redditTime(p) < cutoff) continue;
        if (!isRisk(p)) continue;
        hits.push(p);
      }
      hits.sort((a, b) => redditTime(b) - redditTime(a) || (b.score || 0) - (a.score || 0));
      return hits.map(p => ({
        handle: String(p.author || "").replace(/^u\//i, "") || "unknown",
        // the source discussion thread, not any external link the post points at
        url: p.redditId ? `https://reddit.com/comments/${p.redditId}` : (p.url || ""),
        sub: p.subreddit || "",
      }));
    }
    function aAttachRisk(vers) {
      vers.forEach(v => {
        const posts = aRiskPostsFor(v.name);
        v._risk = posts.length;
        v._riskPosts = posts.slice(0, 1);  // just the latest
      });
      return vers;
    }

    // Secondary CVE lookup: /v/d/versionsByComponent's `latestCveVersion` misses
    // advisories whose product brand differs from the release feed, so pull recent
    // isCve versions by name and attach the newest per component as v._cve.
    async function aAttachCve(vers) {
      const names = Array.from(new Set(vers.map(v => v.name).filter(Boolean)));
      if (!names.length) return vers;
      const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
      try {
        const url = `${API_BASE}v/search?q=${encodeURIComponent(names.join(","))}`
          + `&isCve=true&start=${start}&limit=400`
          + `&fields=versionProductName,versionProductBrand,versionReleaseDate,versionUrl,isCve`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return vers;
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body.data || []);
        const byName = new Map();
        for (const r of list) {
          if (!r.isCve) continue;
          const t = aDateMs(r.versionReleaseDate);
          for (const k of [norm(r.versionProductName), norm(r.versionProductBrand)]) {
            if (!k) continue;
            const prev = byName.get(k);
            if (!prev || t > prev._t) {
              byName.set(k, { _t: t, code: aExtractCveCode(r.versionUrl), url: r.versionUrl, date: r.versionReleaseDate });
            }
          }
        }
        vers.forEach(v => { const hit = byName.get(norm(v.name)); if (hit) v._cve = hit; });
      } catch { /* best-effort */ }
      return vers;
    }

    function aBuildUml(vers) {
      const sorted = aSortByOS(vers), names = sorted.map(v => v.name);
      const { groupedStacks } = aGetStack(names);
      const ts = new Date().toLocaleString("en-US", { weekday:"short", year:"numeric", month:"short", day:"numeric", hour:"numeric", minute:"numeric", second:"numeric", hour12:false, timeZoneName:"short" });
      const fills = A_FILLS;
      const legend =
        `legend bottom left\n` +
        `|= Key ` +
        `|= <${A_FILLS.cve}> CVE - act now ` +
        `| <${A_FILLS.behind}> Update available |\n` +
        `endlegend\n`;
      // Scorecard: one-line overview across the whole set.
      const sc = aScore(sorted);
      const scorecard = `header Freshness ${sc.score}/100  |  ${sc.behind} behind  |  ${sc.current} current  |  ${sc.cve} CVE  |  ${sc.unknown} version unknown  |  median lag ${sc.medianLag}d\n`;
      // Font sizes bumped from PlantUML's own small defaults (2026-09-23,
      // "make the arch view diagram more readable" / "use the available
      // height"): the rendered SVG only ever scaled up to the width of
      // .a-canvas (height:auto preserves its aspect ratio), so a diagram
      // with few, short rows rendered small with real vertical space
      // left unused below it. Bigger source fonts make the same layout
      // both more legible and taller relative to its own width, so it
      // fills more of that available height once scaled (see
      // aFitDiagramSvg). Bumped again after a live render still read as
      // cramped at the first pass (16/17/15/13 -> 20/22/20/16).
      // `skinparam Padding`/`ComponentPadding` were tried for extra
      // breathing room but are not real PlantUML skinparams (newer
      // PlantUML rejects them and renders a "please use CSS style
      // instead" warning banner inline in the diagram itself -- caught
      // from a live render, not assumed) -- removed rather than chasing
      // the CSS-style-block syntax PlantUML wants instead, since the
      // font-size bumps alone already grow each box's default internal
      // margin along with its text.
      let uml = `@startuml\nskinparam BackgroundColor #ffffff\nskinparam DefaultTextAlignment left\nskinparam Shadowing false\nskinparam PackageBorderColor #cbd5e1\nskinparam PackageBackgroundColor #ffffff\nskinparam ComponentBorderColor #94a3b8\nskinparam ComponentBackgroundColor #ffffff\nskinparam ArrowColor #111827\nskinparam FontColor #111827\nskinparam DefaultFontSize 20\nskinparam PackageFontSize 22\nskinparam PackageFontStyle bold\nskinparam ComponentFontSize 20\nskinparam ArrowFontSize 16\n${scorecard}left footer Software Ecosystem: ${ts}\n${legend}`;
      // Renders the stack groups + leftover components for a given subset of versions.
      const groupedNames = new Set();
      groupedStacks.forEach(s => s.matchedComponents.forEach(c => groupedNames.add(c)));
      const renderGroups = (pad, list) => {
        let out = "";
        groupedStacks.forEach(s => {
          const members = list.filter(v => s.matchedComponents.includes(v.name));
          if (!members.length) return;
          out += `${pad}package "${s.stackName} stack" #transparent {\n`;
          members.forEach(v => { out += `${pad}  ${aComponentLine(v, fills)}\n`; });
          out += `${pad}}\n`;
        });
        // Components not part of any detected stack render on their own, labelled by name.
        list.filter(v => !groupedNames.has(v.name))
            .forEach(v => { out += `${pad}${aComponentLine(v, fills)}\n`; });
        return out;
      };

      // #4 — hoist everything that needs action into one cluster at the top,
      // worst (most days behind) first. These are pulled OUT of the normal layout.
      // Urgent = a CVE, or a major-version gap.
      const isUrgent = v => {
        const cur = v.currentVersion || v.latestVersion, lat = v.latestVersion;
        return !!aCveOf(v) || (cur && lat && aVerGap(cur.versionNumber, lat.versionNumber).tier === "major");
      };
      const urgent = sorted.filter(isUrgent).sort((a, b) => aDaysBehind(b) - aDaysBehind(a));
      const rest = sorted.filter(v => !isUrgent(v));
      // Three stacked tiers, base first: hypervisor -> OS -> application. Each is
      // mutually exclusive (a hypervisor never also counts as OS) and each is
      // optional — an empty tier is skipped and the tier above bubbles up.
      const hvVers  = rest.filter(aIsHypervisorComponent);
      const osVers  = rest.filter(v => !aIsHypervisorComponent(v) && aIsOsComponent(v));
      const appVers = rest.filter(v => !aIsHypervisorComponent(v) && !aIsOsComponent(v));

      // OS layer wrapping the application layer (the arrangement used when there
      // is no hypervisor tier, and reused nested inside the hypervisor tier).
      const osBlock = (pad) => {
        let out = "";
        if (osVers.length) {
          const osLabel = osVers.length === 1 ? `${aSanitize(osVers[0].name)} - OS layer` : "OS layer";
          out += `${pad}package "${osLabel}" #transparent {\n`;
          osVers.forEach(v => { out += `${pad}  ${aComponentLine(v, fills)}\n`; });
          if (appVers.length) {
            out += `${pad}  package "Application layer" #transparent {\n`;
            out += renderGroups(`${pad}    `, appVers);
            out += `${pad}  }\n`;
          }
          out += `${pad}}\n`;
        } else if (appVers.length) {
          out += renderGroups(pad, appVers);
        }
        return out;
      };

      uml += `package "Ecosystem" #transparent {\n`;
      if (urgent.length) {
        uml += `  package "Upgrade now (${urgent.length})" #${A_FILLS.cve.replace("#", "")} {\n`;
        urgent.forEach(v => { uml += `    ${aComponentLine(v, fills)}\n`; });
        uml += `  }\n`;
      }
      if (hvVers.length) {
        // Hypervisor is the base layer — OS + apps nest inside it.
        const hvLabel = hvVers.length === 1 ? `${aSanitize(hvVers[0].name)} - Hypervisor layer` : "Hypervisor layer";
        uml += `  package "${hvLabel}" #transparent {\n`;
        hvVers.forEach(v => { uml += `    ${aComponentLine(v, fills)}\n`; });
        uml += osBlock("    ");
        uml += `  }\n`;
      } else {
        uml += osBlock("  ");
      }
      uml += `}\n@enduml\n`;
      return uml;
    }
    function aEncode6bit(b) {
      if (b < 10) return String.fromCharCode(48 + b);
      b -= 10; if (b < 26) return String.fromCharCode(65 + b);
      b -= 26; if (b < 26) return String.fromCharCode(97 + b);
      b -= 26; return b === 0 ? "-" : b === 1 ? "_" : "?";
    }
    function aAppend3bytes(b1, b2, b3) {
      return aEncode6bit((b1 >> 2) & 0x3F) + aEncode6bit((((b1 & 3) << 4) | (b2 >> 4)) & 0x3F) +
             aEncode6bit((((b2 & 0xF) << 2) | (b3 >> 6)) & 0x3F) + aEncode6bit(b3 & 0x3F);
    }
    function aEncode64(data) {
      let res = "";
      for (let i = 0; i < data.length; i += 3) {
        if (i + 2 === data.length) res += aAppend3bytes(data[i], data[i + 1], 0);
        else if (i + 1 === data.length) res += aAppend3bytes(data[i], 0, 0);
        else res += aAppend3bytes(data[i], data[i + 1], data[i + 2]);
      }
      return res;
    }
    function aEncodePlantUML(text) {
      const deflated = pako.deflateRaw(unescape(encodeURIComponent(text)), { level: 9 });
      return aEncode64(deflated);
    }
    // Scales the current ecosystem SVG to fill whichever dimension of
    // .a-canvas is the real constraint (2026-09-23, "use the available
    // height"): a plain width:100%/height:auto fit only ever grows the
    // diagram until its WIDTH matches the container, so a diagram with
    // few, short rows (wide-and-short) rendered small with real unused
    // vertical space below it, even though there was room to grow
    // further. This reads the SVG's own intrinsic viewBox size (stored
    // once at render time, see aRenderDiagram) and the container's
    // current client size, then sets an explicit pixel width/height at
    // whichever scale is the tighter of the two -- a real "contain" fit,
    // not a distorting stretch, since both axes scale by the same factor.
    // Re-run on window resize (the container's own size can change) so
    // this stays correct after the initial render too.
    function aFitDiagramSvg() {
      const host = aEl("ecosysImage");
      const s = host && host.querySelector("svg");
      const canvas = host && host.closest(".a-canvas");
      if (!s || !canvas) return;
      const vw = Number(s.dataset.vbW), vh = Number(s.dataset.vbH);
      if (!vw || !vh) return;
      const cw = canvas.clientWidth - 4, ch = canvas.clientHeight - 4;  // minus .a-canvas's own 2px padding per side
      if (cw <= 0 || ch <= 0) return;
      const scale = Math.min(cw / vw, ch / vh);
      s.style.setProperty("--rt-fit-w", Math.floor(vw * scale) + "px");
      s.style.setProperty("--rt-fit-h", Math.floor(vh * scale) + "px");
      s.classList.add("a-fit");
    }
    let A_FIT_RESIZE_WIRED = false;
    function aRenderDiagram(uml) {
      A_UML_CODE = uml;
      A_PLANTUML_URL = A_PLANTUML_SERVER + aEncodePlantUML(uml);
      const host = aEl("ecosysImage"), loader = aEl("loader");
      const done = () => { if (loader) setDisplay(loader, "none"); };
      // Inline the SVG so diagram links (community post handles) are clickable.
      fetch(A_PLANTUML_URL)
        .then(r => r.ok ? r.text() : Promise.reject(r.status))
        .then(svg => {
          host.innerHTML = svg;
          const s = host.querySelector("svg");
          if (s) {
            // Read the intrinsic size PlantUML encoded into viewBox
            // ("0 0 W H") before removing width/height, then let
            // aFitDiagramSvg compute the actual on-screen size.
            const vb = (s.getAttribute("viewBox") || "").trim().split(/\s+/);
            s.dataset.vbW = vb[2] || ""; s.dataset.vbH = vb[3] || "";
            s.removeAttribute("width"); s.removeAttribute("height");
            setDisplay(s, "block"); s.classList.add("a-fit");
            aFitDiagramSvg();
          }
          host.querySelectorAll("a").forEach(a => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); });
        })
        .catch(() => { host.innerHTML = `<p class="a-muted-note">Could not render diagram.</p>`; })
        .finally(done);
      const codeEl = aEl("plantumlCode");
      if (codeEl) codeEl.textContent = uml;
      if (!A_FIT_RESIZE_WIRED) { A_FIT_RESIZE_WIRED = true; window.addEventListener("resize", aFitDiagramSvg); }
    }
    function aUpdateMetrics(vers) {
      const { groupedStacks } = aGetStack(vers.map(v => v.name));
      const sum = aSummarize(vers);
      const set = (id, val) => { const el = aEl(id); if (el) el.textContent = val; };
      set("totalComponents", vers.length);
      set("stackCount", groupedStacks.length);
      set("cveCount", sum.cve);
      set("behindCount", sum.behind);
      set("currentCount", sum.current);
      set("unknownCount", sum.unknown);
      const detC = aEl("detComponents"), detS = aEl("detStacks");
      if (detC) detC.innerHTML = vers.map(v => `• ${v.name}`).join("<br>");
      if (detS) detS.innerHTML = groupedStacks.length ? groupedStacks.map(s => `• ${s.stackName}: ${s.matchedComponents.join(", ")}`).join("<br>") : "None";
    }
    function aMapVers(data) {
      return (Array.isArray(data) ? data : []).map(c => ({
        name: c.name, latestVersion: c.latestVersion,
        currentVersion: c.currentVersion || c.latestVersion, latestCveVersion: c.latestCveVersion,
        _hasInstalled: false
      }));
    }
    // Installed versions the user recorded on the Account page (device-local).
    function aInventoryMap() {
      let list = [];
      try {
        const u = (typeof uaUser === "function") ? uaUser() : null;
        if (u && Array.isArray(u.inventory)) list = u.inventory;
        else list = JSON.parse(localStorage.getItem("rt_inventory") || "[]");
      } catch { list = []; }
      const m = new Map();
      (Array.isArray(list) ? list : []).forEach(e => {
        if (e && e.component && e.version) m.set(String(e.component).toLowerCase(), String(e.version));
      });
      return m;
    }
    // Overlay recorded installed versions onto each component as currentVersion.
    function aApplyInventory(vers) {
      const inv = aInventoryMap();
      vers.forEach(v => {
        const iv = inv.get(String(v.name).toLowerCase());
        if (iv && v.latestVersion) {
          v.currentVersion = {
            versionNumber: iv,
            versionReleaseDate: "",
            versionProductName: v.latestVersion.versionProductName
          };
          v._hasInstalled = true;
        } else {
          v._hasInstalled = false;
        }
      });
      return vers;
    }

    let A_EMPTY_BUILT = false;
    let A_MODE = (localStorage.getItem("rt_arch_mode") === "table") ? "table" : "diagram";

    const aCanvasEl = () => document.querySelector("#archView .a-canvas");

    // Show the result area (canvas or table per A_MODE), hide the empty state.
    function aShowResult() {
      const e = aEl("empty"); if (e) setDisplay(e, "none");
      const c = aCanvasEl(), t = aEl("table");
      if (c) setDisplay(c, (A_MODE === "table") ? "none" : "");
      if (t) setDisplay(t, (A_MODE === "table") ? "" : "none");
    }
    function aSetMode(mode) {
      A_MODE = (mode === "table") ? "table" : "diagram";
      try { localStorage.setItem("rt_arch_mode", A_MODE); } catch {}
      const dg = document.getElementById("a-viewDiagram"), tb = document.getElementById("a-viewTable");
      if (dg) dg.className = "btn" + (A_MODE === "diagram" ? " btn-primary" : " btn-ghost");
      if (tb) tb.className = "btn" + (A_MODE === "table" ? " btn-primary" : " btn-ghost");
      const e = aEl("empty");
      if (e && !e.classList.contains("u-hide")) return;  // empty state stays put
      aShowResult();
      // If the diagram was last fit while .a-canvas was hidden behind the
      // table (0 client size, e.g. restoring "table" as the saved mode
      // on load), its size never got computed -- redo it now that the
      // canvas is actually visible and has a real size to fit against.
      if (A_MODE === "diagram") aFitDiagramSvg();
      if (A_MODE === "table") aRenderTable();
    }
    function aEsc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    // #5b — dense sortable drift table, most-behind first.
    function aRenderTable() {
      const el = aEl("table"); if (!el) return;
      const vers = Array.isArray(A_VERSIONS) ? A_VERSIONS : [];
      if (!vers.length) { el.innerHTML = `<p class="a-muted-note">No components.</p>`; return; }
      const sc = aScore(vers);
      const rows = vers.map(v => {
        const cur = v.currentVersion || v.latestVersion || {}, lat = v.latestVersion || {};
        return { v, cur, lat, key: aColorKey(v), gap: aVerGap(cur.versionNumber, lat.versionNumber), days: aDaysBehind(v) };
      }).sort((a, b) => b.days - a.days || (A_COLOR_RANK[a.key] - A_COLOR_RANK[b.key]) || a.v.name.localeCompare(b.v.name));
      el.innerHTML =
        `<div class="a-score">Freshness <b>${sc.score}/100</b> &nbsp;·&nbsp; ${sc.behind} behind &nbsp;·&nbsp; ${sc.current} current &nbsp;·&nbsp; ${sc.cve} CVE &nbsp;·&nbsp; ${sc.unknown} version unknown &nbsp;·&nbsp; median lag ${sc.medianLag}d</div>` +
        `<table class="a-drift"><thead><tr>` +
        `<th>Component</th><th>Installed</th><th>Latest</th><th>Change</th><th>Behind</th><th>CVE</th><th>Community</th>` +
        `</tr></thead><tbody>` +
        rows.map(r => {
          // Colour only marks a problem. Calm rows stay plain.
          const chip = r.gap.tier !== "none"
            ? `<span class="a-chip-t rt-bg" style="--rt-bg:${A_FILLS.behind}">${aEsc(aGapLabel(r.gap))}</span>`
            : `<span class="a-muted-note">${r.key === "unknown" ? "version ?" : "on latest"}</span>`;
          return `<tr>` +
            `<td>${aEsc(r.v.name)}</td>` +
            `<td class="mono">${r.v._hasInstalled ? aEsc(r.cur.versionNumber) : '<span class="a-muted-note">?</span>'}</td>` +
            `<td class="mono">${aEsc(r.lat.versionNumber || "-")}</td>` +
            `<td>${chip}</td>` +
            `<td class="mono">${r.days ? r.days + "d" : "-"}</td>` +
            `<td>${(() => { const c = aCveOf(r.v); return c ? `<span class="a-chip-t rt-bg" style="--rt-bg:${A_FILLS.cve}">${aEsc(c.code)}</span>` : "-"; })()}</td>` +
            `<td>${(() => {
              const p = (r.v._riskPosts || [])[0];
              if (!p) return `<span class="a-muted-note">no risk posts (${A_RISK_DAYS}d)</span>`;
              return p.url
                ? `<a href="${aEsc(p.url)}" target="_blank" rel="noopener noreferrer">u/${aEsc(p.handle)}</a>`
                : `u/${aEsc(p.handle)}`;
            })()}</td>` +
            `</tr>`;
        }).join("") +
        `</tbody></table>`;
    }
    function aBuildEmptyState() {
      if (A_EMPTY_BUILT) return; A_EMPTY_BUILT = true;
      const grid = aEl("stackGrid"); if (!grid) return;
      grid.innerHTML = A_STACKS.map(s => `
        <button type="button" class="a-stack-card" data-comps="${s.components.join(",")}">
          <span class="a-stack-card-name">${s.name}</span>
          <span class="a-stack-card-chips">${s.components.map(c => `<span class="a-chip">${c}</span>`).join("")}</span>
        </button>`).join("");
      grid.querySelectorAll(".a-stack-card").forEach(btn => {
        btn.addEventListener("click", () => {
          EL.components.value = btn.dataset.comps.split(",").join(", ");
          aLoadAndRender();
        });
      });
    }
    function aShowEmptyState() {
      const loader = aEl("loader"), titleEl = aEl("title");
      if (loader) setDisplay(loader, "none");
      if (titleEl) titleEl.textContent = "Pick a stack to begin";
      const c = aCanvasEl(); if (c) setDisplay(c, "none");
      const t = aEl("table"); if (t) setDisplay(t, "none");
      const e = aEl("empty"); if (e) setDisplay(e, "block");
      aBuildEmptyState();
    }

    async function aLoadUpdatedToday() {
      const loader = aEl("loader"), titleEl = aEl("title");
      aShowResult();
      if (loader) setDisplay(loader, "block");
      try {
        const res = await fetch(`${API_BASE}v/d/updatedToday`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        await ensureRedditLoaded().catch(() => {});  // risk posts need the reddit index
        const vers = aApplyInventory(aAttachRisk(aMapVers(data)));
        if (titleEl) titleEl.textContent = "Today's updated components";
        A_VERSIONS = vers;
        if (!vers.length) {
          if (titleEl) titleEl.textContent = "No components updated today";
          if (loader) setDisplay(loader, "none");
          return;
        }
        await aAttachCve(vers);
        aRenderDiagram(aBuildUml(vers));
        aUpdateMetrics(vers);
        if (A_MODE === "table") aRenderTable();
      } catch (e) {
        console.error("Arch load error:", e);
        if (loader) setDisplay(loader, "none");
      }
    }

    async function aLoadAndRender() {
      const compsCsv = (EL.components.value || "").trim();
      const names = compsCsv ? compsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (!names.length) { aShowEmptyState(); return; }
      const loader = aEl("loader"), titleEl = aEl("title");
      aShowResult();
      if (loader) setDisplay(loader, "block");
      try {
        const query = names.map(n => `component=name:${encodeURIComponent(n)}`).join("&");
        const res = await fetch(`${API_BASE}v/d/versionsByComponent?${query}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        await ensureRedditLoaded().catch(() => {});  // risk posts need the reddit index
        const vers = aApplyInventory(aAttachRisk(aMapVers(data)));
        if (titleEl) titleEl.textContent = names.join(", ");
        A_VERSIONS = vers;
        if (!vers.length) {
          if (titleEl) titleEl.textContent = "No data";
          if (loader) setDisplay(loader, "none");
          return;
        }
        await aAttachCve(vers);
        const uml = aBuildUml(vers);
        aRenderDiagram(uml);
        aUpdateMetrics(vers);
        if (A_MODE === "table") aRenderTable();
      } catch (e) {
        console.error("Arch load error:", e);
        if (loader) setDisplay(loader, "none");
      }
    }

    /* ── Arch view: show / hide ───────────────────────────────── */
    function activateArch() {
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (G_ACTIVE)   deactivateGraph();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      A_ACTIVE = true;
      setViewParam("arch");
      setDisplay(document.getElementById("archView"), "flex");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("archControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.archLink.classList.add("nav-active");
      aSetMode(A_MODE);  // sync the Diagram / Table toggle buttons
    }
    function deactivateArch() {
      A_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("archView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("archControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.archLink.classList.remove("nav-active");
    }

    EL.archLink.addEventListener("click", async e => {
      e.preventDefault();
      if (A_ACTIVE) { deactivateArch(); return; }
      activateArch();
      EL.navLoader.classList.add("active");
      try { await aLoadPako(); } finally { EL.navLoader.classList.remove("active"); }
      aLoadAndRender();
    });

    /* ── Arch sidebar controls ────────────────────────────────── */
    document.getElementById("a-addStackBtn").addEventListener("click", () => {
      const sel = document.getElementById("a-stackSelect");
      const val = sel.value; if (!val) return;
      const toAdd = val.split(",").map(s => s.trim()).filter(Boolean);
      const existing = (EL.components.value || "").split(",").map(s => s.trim()).filter(Boolean);
      const merged = Array.from(new Set([...existing, ...toAdd]));
      EL.components.value = merged.join(", ");
      sel.value = "";
      if (A_ACTIVE) aLoadAndRender();
    });

    document.getElementById("a-todayBtn").addEventListener("click", () => {
      EL.components.value = "";
      aLoadUpdatedToday();
    });

    document.getElementById("a-viewDiagram").addEventListener("click", () => aSetMode("diagram"));
    document.getElementById("a-viewTable").addEventListener("click", () => aSetMode("table"));

    document.getElementById("a-metricsBtn").addEventListener("click", () => document.getElementById("a-metricsDialog").showModal());
    document.getElementById("a-codeBtn").addEventListener("click", () => document.getElementById("a-codeDialog").showModal());
    document.getElementById("a-detailsBtn").addEventListener("click", () => document.getElementById("a-detailsDialog").showModal());
    document.getElementById("a-configBtn").addEventListener("click", () => {
      document.getElementById("a-cfgApi").value = API_BASE.replace(/\/$/, "");
      document.getElementById("a-cfgPlant").value = A_PLANTUML_SERVER;
      document.getElementById("a-configDialog").showModal();
    });
    document.getElementById("a-copyLinkBtn").addEventListener("click", () => {
      if (!A_PLANTUML_URL) return;
      navigator.clipboard.writeText(A_PLANTUML_URL).then(() => alert("Ecosystem image URL copied!"));
    });
    document.getElementById("a-copyCodeBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(A_UML_CODE).then(() => alert("PlantUML code copied!"));
    });
    document.getElementById("a-cfgCopyApi").addEventListener("click", () => {
      navigator.clipboard.writeText(API_BASE.replace(/\/$/, "")).then(() => alert("API endpoint copied!"));
    });
    document.getElementById("a-cfgApplyPlant").addEventListener("click", () => {
      const v = document.getElementById("a-cfgPlant").value.trim();
      if (!v) return alert("Enter a PlantUML server URL.");
      A_PLANTUML_SERVER = v.endsWith("/") ? v : v + "/";
      if (A_UML_CODE) { aRenderDiagram(A_UML_CODE); }
      alert("PlantUML server updated for this session.");
    });

    /* ── Docs Module ─────────────────────────────────────────── */
    let D_ACTIVE = false, D_INIT = false;

    function dSlugify(str) {
      return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    }

    function dAddCopyButtons(scope) {
      scope.querySelectorAll("pre code").forEach(code => {
        if (code.parentElement.querySelector(".d-copy-btn")) return;
        const btn = document.createElement("button");
        btn.className = "d-copy-btn";
        btn.textContent = "Copy";
        btn.addEventListener("click", () => {
          navigator.clipboard.writeText(code.textContent.trim()).then(() => {
            btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy"; }, 1500);
          });
        });
        const pre = code.parentElement;
        pre.classList.add("u-pos-rel");
        pre.appendChild(btn);
      });
    }

    function dNormalizeEndpoints(scope) {
      scope.querySelectorAll(".endpoint").forEach(ep => {
        const exEl = ep.querySelector(".example-url");
        if (!exEl) return;
        const url = exEl.textContent.trim();
        if (!url) return;
        let testLink = ep.querySelector(".d-test-link");
        if (!testLink) {
          testLink = document.createElement("a");
          testLink.className = "d-test-link";
          testLink.target = "_blank";
          testLink.rel = "noopener";
          testLink.textContent = "Try it ↗";
          exEl.insertAdjacentElement("afterend", testLink);
        }
        testLink.href = url.startsWith("http") ? url : `${API_BASE}${url.replace(/^\/+/, "")}`;
      });
      dAddCopyButtons(scope);
    }

    function dInitIds(scope) {
      const methodOrder = ["get","post","put","patch","delete"];
      const counts = {};
      scope.querySelectorAll(".endpoint").forEach(ep => {
        const pathEl = ep.querySelector(".path");
        const methodEl = ep.querySelector(".method");
        if (!pathEl || !methodEl) return;
        const method = methodEl.textContent.trim().toLowerCase();
        const path = pathEl.textContent.trim();
        const base = `d-ep-${method}-${dSlugify(path)}`;
        counts[base] = (counts[base] || 0) + 1;
        const id = counts[base] > 1 ? `${base}-${counts[base]}` : base;
        ep.id = id;

        if (ep.querySelector(".d-copylink-btn")) return;
        const btn = document.createElement("button");
        btn.className = "d-copylink-btn";
        btn.title = "Copy link to this endpoint";
        btn.textContent = "# Link";
        btn.addEventListener("click", () => {
          const url = `${location.origin}${location.pathname}?view=docs#${id}`;
          navigator.clipboard.writeText(url).then(() => {
            btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "# Link"; }, 1500);
          });
        });
        const summary = ep.querySelector("summary");
        if (summary) summary.appendChild(btn);
      });
    }

    function dScrollToHash() {
      const hash = location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash) || document.getElementById("d-" + hash);
      if (target) {
        const wrap = document.getElementById("docsView");
        setTimeout(() => {
          wrap.scrollTo({ top: target.offsetTop - 12, behavior: "smooth" });
          const det = target.closest("details");
          if (det) det.open = true;
        }, 80);
      }
    }

    function dInitDocs() {
      if (D_INIT) return; D_INIT = true;
      const scope = document.getElementById("docsView");
      dNormalizeEndpoints(scope);
      dInitIds(scope);

      // Render Mermaid diagrams inside docsView (loaded lazily via CDN)
      function runMermaid() {
        if (typeof window.mermaid !== "undefined") {
          const nodes = Array.from(scope.querySelectorAll(".mermaid:not([data-processed])"));
          if (nodes.length) {
            // mermaid.run() is async; the rendered <svg> only exists in
            // the DOM once it resolves. See the #docsView .mermaid svg
            // CSS rule's own comment for why clearing this inline
            // max-width matters.
            window.mermaid.run({ nodes }).then(() => {
              nodes.forEach(n => {
                const svg = n.querySelector("svg");
                if (svg) svg.classList.add("u-max-none");
              });
            });
          }
        }
      }
      if (typeof window.mermaid !== "undefined") {
        runMermaid();
      } else {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
        s.crossOrigin = "anonymous";
        s.onload = () => { window.mermaid.initialize({ startOnLoad: false, securityLevel: "loose" }); runMermaid(); };
        document.head.appendChild(s);
      }

      document.querySelectorAll(".d-toc a[data-target]").forEach(a => {
        a.addEventListener("click", e => {
          e.preventDefault();
          const target = document.getElementById(a.dataset.target);
          if (!target) return;
          document.getElementById("docsView").scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
          document.querySelectorAll(".d-toc a").forEach(x => x.classList.remove("d-active"));
          a.classList.add("d-active");
        });
      });

      document.querySelectorAll("#docsView .toplink").forEach(a => {
        a.addEventListener("click", e => {
          e.preventDefault();
          document.getElementById("docsView").scrollTo({ top: 0, behavior: "smooth" });
        });
      });

      document.getElementById("docsView").addEventListener("scroll", debounce(() => {
        const wrap = document.getElementById("docsView");
        const tocLinks = document.querySelectorAll(".d-toc a[data-target]");
        let active = null;
        tocLinks.forEach(a => {
          const sec = document.getElementById(a.dataset.target);
          if (sec && sec.offsetTop - 20 <= wrap.scrollTop) active = a;
        });
        tocLinks.forEach(a => a.classList.remove("d-active"));
        if (active) active.classList.add("d-active");
      }, 80), { passive: true });

      // Populate live collection stats — sidebar + #d-stats section
      Promise.all([
        fetch('https://releasetrain.io/api/v/count').then(r => r.json()).catch(() => null),
        fetch('https://releasetrain.io/api/reddit/count').then(r => r.json()).catch(() => null),
        fetch('https://releasetrain.io/api/c/count').then(r => r.json()).catch(() => null),
      ]).then(([vData, rData, cData]) => {
        const fmt = n => typeof n === 'number' ? n.toLocaleString() : '—';
        const fmtSize = bytes => {
          const mb = bytes / (1024 * 1024);
          return mb < 1 ? (bytes / 1024).toFixed(0) + ' KB' : mb.toFixed(1) + ' MB';
        };
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        if (vData) {
          const vTotal = vData.totalVersions, vCve = vData.cveCount ?? 0, vNon = vData.nonCveCount ?? (vTotal - vCve);
          const vSize = fmtSize(vTotal * 800);
          // main content
          set('d-stat-versions', fmt(vTotal));
          set('d-stat-v-cve', fmt(vCve));
          set('d-stat-v-noncve', fmt(vNon));
          set('d-stat-v-size', vSize + ' / 5 MB max');
          // sidebar
          set('dsb-v-total', fmt(vTotal));
          set('dsb-v-cve', fmt(vCve));
          set('dsb-v-noncve', fmt(vNon));
          set('dsb-v-size', vSize + ' / 5 MB');
        }

        if (rData) {
          const rTotal = rData.totalRedditPosts, rReddit = rData.redditCount ?? 0, rSO = rData.stackoverflowCount ?? 0, rSF = rData.serverfaultCount ?? 0;
          const rSize = fmtSize(rTotal * 2000);
          // main content
          set('d-stat-reddit', fmt(rTotal));
          set('d-stat-r-reddit', fmt(rReddit));
          set('d-stat-r-so', fmt(rSO));
          set('d-stat-r-sf', fmt(rSF));
          set('d-stat-r-size', rSize + ' / 5 MB max');
          // sidebar
          set('dsb-r-total', fmt(rTotal));
          set('dsb-r-reddit', fmt(rReddit));
          set('dsb-r-so', fmt(rSO));
          set('dsb-r-sf', fmt(rSF));
          set('dsb-r-size', rSize + ' / 5 MB');
        }

        if (cData) set('d-stat-components', fmt(cData.totalComponents));

        const fresh = document.getElementById('d-stats-freshness');
        if (fresh) fresh.innerHTML = '<p class="st-215 small muted" >Version data polled continuously from 20+ release feeds. Reddit &amp; Stack Overflow ingested on a rolling schedule. Both collections maintain a rolling 2-year window.</p>';
      });
    }

    function activateDocs() {
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      D_ACTIVE = true;
      setViewParam("docs");
      setDisplay(document.getElementById("docsView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("docsControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.docsLink.classList.add("nav-active");
      dInitDocs();
      dScrollToHash();
    }

    function deactivateDocs() {
      D_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("docsView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("docsControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.docsLink.classList.remove("nav-active");
    }

    EL.docsLink.addEventListener("click", e => {
      e.preventDefault();
      if (D_ACTIVE) { deactivateDocs(); return; }
      activateDocs();
    });

    /* ── Changelog Module ───────────────────────────────────── */
    let CL_ACTIVE = false;

    function activateChangelog() {
      if (ER_ACTIVE) deactivateEvalRewriter();
      if (EE_ACTIVE) deactivateEvalEvaluator();
      if (EO_ACTIVE) deactivateEvalOrchestrator();
      if (G_ACTIVE)  deactivateGraph();
      if (A_ACTIVE)  deactivateArch();
      if (CV_ACTIVE) deactivateCve();
      if (DB_ACTIVE) deactivateDashboard();
      if (D_ACTIVE)  deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      CL_ACTIVE = true;
      setViewParam("changelog");
      setDisplay(document.getElementById("changelogView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("changelogControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.changelogLink.classList.add("nav-active");
    }

    function deactivateChangelog() {
      CL_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("changelogView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("changelogControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.changelogLink.classList.remove("nav-active");
    }

    EL.changelogLink.addEventListener("click", e => {
      e.preventDefault();
      if (CL_ACTIVE) { deactivateChangelog(); return; }
      activateChangelog();
    });

    /* ── Credits / Ack Module ────────────────────────────────── */
    let ACK_ACTIVE = false;

    function activateAck() {
      if (ER_ACTIVE) deactivateEvalRewriter();
      if (EE_ACTIVE) deactivateEvalEvaluator();
      if (EO_ACTIVE) deactivateEvalOrchestrator();
      if (G_ACTIVE)  deactivateGraph();
      if (A_ACTIVE)  deactivateArch();
      if (CV_ACTIVE) deactivateCve();
      if (DB_ACTIVE) deactivateDashboard();
      if (D_ACTIVE)  deactivateDocs();
      if (CL_ACTIVE) deactivateChangelog();
      if (UA_ACTIVE) deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      ACK_ACTIVE = true;
      setViewParam("credits");
      setDisplay(document.getElementById("ackView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("ackControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.ackLink.classList.add("nav-active");
    }

    function deactivateAck() {
      ACK_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("ackView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("ackControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.ackLink.classList.remove("nav-active");
    }

    EL.ackLink.addEventListener("click", e => {
      e.preventDefault();
      if (ACK_ACTIVE) { deactivateAck(); return; }
      activateAck();
    });

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

    /* ── Post helpers ─────────────────────────────────────────── */
    function getPostSource(p) {
      const s = norm(p?.source || "");
      if (s) return s;
      const url = String(p?.url || "");
      if (url.includes("stackoverflow.com")) return "stackoverflow";
      return "reddit";
    }
    const getPostId = p => p?.redditId || p?._id || p?.id || "";
    const isUpdateRelatedBoolean = p => !!(p?.metadata?.labeled?.isUpdateRelated || p?.metadata?.predicted?.isUpdateRelated);
    const getUpdateScore = p => typeof p?.metadata?.predicted?.positiveScore === "number" ? p.metadata.predicted.positiveScore : null;
    const isRisk = p => isUpdateRelatedBoolean(p) || ((getUpdateScore(p) ?? -1) > 0.5);

    // Exact-match anchor names for AI model releases. The server's `q` search matches
    // near-exact versionProductName (confirmed empirically: q=Claude finds only the
    // single doc named exactly "Claude", not "Claude 2" or "Claude 3.5 Sonnet"; a
    // handful of generic brand keywords like "mistral"/"openai" only turns up a
    // couple of real hits this way). This list is ai_model.py's actual scraped
    // catalog (Ollama library slugs + the OpenAI/Anthropic/Mistral/xAI/DeepSeek/
    // Meta/Gemini Wikipedia tables) as of 2026-08-18 — it's what makes the LLM
    // dataset fetch below actually complete instead of finding 3 of ~560 real docs.
    // Needs periodic regeneration from ai_model.py's fetchers as new models appear;
    // stale entries are harmless (they just stop matching anything).
    const KNOWN_LLM_PRODUCT_NAMES = ["1","1.0 Nano","1.0 Pro","1.0 Ultra","1.5","1.5 Flash","1.5 Pro","2","2.0 Flash","2.0 Flash-Lite","2.0 Pro","2.5 Flash","2.5 Flash Image (Nano Banana)","2.5 Flash-Lite","2.5 Pro","2mini","3","3 Deep Think","3 Flash","3 Pro","3 Pro Image (Nano Banana Pro)","3.1 Flash Image(Nano Banana 2)","3.1 Flash-Lite","3.1 Flash-Lite Image(Nano Banana 2 Lite)","3.1 Pro","3.5 Flash","3.5 Flash-Lite","3.6 Flash","3.7 Flash","3mini","4","4.1","4.1Fast","4.1Thinking","4.20","4.3","4.5","4.6","4Fast","4Heavy","Claude","Claude 2","Claude 2.1","Claude 3 Haiku","Claude 3 Opus","Claude 3 Sonnet","Claude 3.5 Haiku","Claude 3.5 Sonnet","Claude 3.5 Sonnet (new)","Claude 3.7 Sonnet","Claude Fable 5","Claude Haiku 4.5","Claude Instant 1.2","Claude Mythos 5","Claude Mythos Preview","Claude Opus 4","Claude Opus 4.1","Claude Opus 4.5","Claude Opus 4.6","Claude Opus 4.7","Claude Opus 4.8","Claude Opus 5","Claude Sonnet 4","Claude Sonnet 4.5","Claude Sonnet 4.6","Claude Sonnet 5","Code Fast1","Code Llama","Codestral 22B","Codestral Mamba 7B","Codestral25.01","Codestral25.08","DeepSeek-Coder","DeepSeek-LLM","DeepSeek-Math","DeepSeek-Math-V2","DeepSeek-MoE","DeepSeek-Prover-V2","DeepSeek-R1","DeepSeek-V2","DeepSeek-V3","DeepSeek-V3.1","DeepSeek-V3.2","DeepSeek-V4","DeepSeek-VL2","Devstral 2","Devstral Medium 1.0","Devstral Small 1.125.07","Devstral Small 2","Devstral Small25.05","GPT-3.5","GPT-4","GPT-4.1","GPT-4.5","GPT-4o","GPT-5","GPT-5.1","GPT-5.2","GPT-5.3","GPT-5.4","GPT-5.5","GPT-5.6","Llama","Llama 2","Llama 3","Llama 3.1","Llama 3.2","Llama 3.3","Llama 4","Magistral Medium","Magistral Medium 1.225.09","Magistral Small","Magistral Small 1.225.09","Mathstral 7B","Medium 3.5","Ministral 3","Ministral 3B24.10","Ministral 8B24.10","Mistral 7B","Mistral Large 224.07","Mistral Large 224.11","Mistral Large 3","Mistral Large24.02","Mistral Medium","Mistral Medium 3.125.08","Mistral Medium 325.05","Mistral Small","Mistral Small 3.125.03","Mistral Small 3.225.06","Mistral Small 325.01","Mistral Small 4","Mixtral 8x22B","Mixtral 8x7B","Pixtral Large24.11","Pixtral24.09","Voxtral Mini","Voxtral Mini Transcribe V2","Voxtral Realtime","Voxtral Small","Voxtral TTS","alfred","all-minilm","athene-v2","aya","aya-expanse","bakllava","bespoke-minicheck","bge-large","bge-m3","codebooga","codegeex4","codegemma","codellama","codeqwen","codestral","codeup","cogito","cogito-2.1","command-a","command-r","command-r-plus","command-r7b","command-r7b-arabic","dbrx","deepcoder","deepscaler","deepseek-coder","deepseek-coder-v2","deepseek-llm","deepseek-ocr","deepseek-r1","deepseek-v2","deepseek-v2.5","deepseek-v3","deepseek-v3.1","deepseek-v4-flash","deepseek-v4-pro","devstral","devstral-2","devstral-small-2","dolphin-llama3","dolphin-mistral","dolphin-mixtral","dolphin-phi","dolphin3","dolphincoder","duckdb-nsql","embeddinggemma","everythinglm","exaone-deep","exaone3.5","falcon","falcon2","falcon3","firefunction-v2","functiongemma","gemma","gemma2","gemma3","gemma3n","gemma4","glm-4.7-flash","glm-5.1","glm-5.2","glm-ocr","glm4","goliath","gpt-oss","gpt-oss-safeguard","granite-code","granite-embedding","granite3-dense","granite3-guardian","granite3-moe","granite3.1-dense","granite3.1-moe","granite3.2","granite3.2-vision","granite3.3","granite4","granite4.1","granite4.1-guardian","hermes3","internlm2","kimi-k2.6","kimi-k2.7-code","kimi-k3","laguna-s-2.1","laguna-xs-2.1","laguna-xs.2","lfm2","lfm2.5","lfm2.5-thinking","llama-guard3","llama-pro","llama2","llama2-chinese","llama2-uncensored","llama3","llama3-chatqa","llama3-gradient","llama3-groq-tool-use","llama3.1","llama3.2","llama3.2-vision","llama3.3","llama4","llava","llava-llama3","llava-phi3","magicoder","magistral","marco-o1","mathstral","medgemma","medgemma1.5","meditron","medllama2","megadolphin","minicpm-v","minicpm-v4.5","minicpm-v4.6","minimax-m2.7","minimax-m3","ministral-3","mistral","mistral-large","mistral-large-3","mistral-medium-3.5","mistral-nemo","mistral-openorca","mistral-small","mistral-small3.1","mistral-small3.2","mistrallite","mixtral","moondream","muse-glimmer","mxbai-embed-large","nemotron","nemotron-3-nano","nemotron-3-super","nemotron-3-ultra","nemotron-3.5-lightning","nemotron-cascade-2","nemotron-mini","nemotron3","neural-chat","nexusraven","nomic-embed-text","nomic-embed-text-v2-moe","north-mini-code-1.0","notus","notux","nous-hermes","nous-hermes2","nous-hermes2-mixtral","nuextract","o1","o3","olmo-3","olmo-3.1","olmo2","open-orca-platypus2","openchat","opencoder","openhermes","openthinker","orca-mini","orca2","ornith","paraphrase-multilingual","phi","phi3","phi3.5","phi4","phi4-mini","phi4-mini-reasoning","phi4-reasoning","phind-codellama","qwen","qwen2","qwen2-math","qwen2.5","qwen2.5-coder","qwen2.5vl","qwen3","qwen3-coder","qwen3-coder-next","qwen3-embedding","qwen3-next","qwen3-vl","qwen3.5","qwen3.6","qwen3.8","qwq","r1-1776","reader-lm","reflection","rnj-1","sailor2","samantha-mistral","shieldgemma","smallthinker","smollm","smollm2","snowflake-arctic-embed","snowflake-arctic-embed2","solar","solar-pro","sqlcoder","stable-beluga","stable-code","stablelm-zephyr","stablelm2","starcoder","starcoder2","starling-lm","tinydolphin","tinyllama","translategemma","tulu3","vicuna","wizard-math","wizard-vicuna","wizard-vicuna-uncensored","wizardcoder","wizardlm","wizardlm-uncensored","wizardlm2","xwinlm","yarn-llama2","yarn-mistral","yi","yi-coder","zephyr"];

    // Exact-match anchor names for hypervisor releases, same rationale as
    // KNOWN_LLM_PRODUCT_NAMES above (server `q` matches near-exact
    // versionProductName). This is hypervisor.py's full catalog — small and
    // stable, so it rarely needs regeneration.
    const KNOWN_HV_PRODUCT_NAMES = [
      "VMware ESXi", "VMware Workstation", "VMware Fusion",
      "Oracle VirtualBox", "VirtualBox", "Xen", "XCP-ng",
      "Proxmox VE", "Proxmox Virtual Environment"
    ];

    /* ── API ──────────────────────────────────────────────────── */
    const Api = {
      async versions(qCsv, cursor) {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (qCsv) params.set("q", encodeCsvKeepCommas(qCsv));
        if (cursor) params.set("cursor", cursor);
        // No start — server uses its 2-year rolling window; client filters to LOOKBACK_DAYS days.
        // Cap end at today so future-dated docs are never fetched.
        const today = new Date(); today.setHours(23,59,59,999);
        params.set("end", today.toISOString().slice(0,10).replace(/-/g,''));
        const url = `${API_BASE}v/search?${params}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        return { versions: json.data || [], nextCursor: json.nextCursor || null };
      },
      // Dedicated, date-window-independent fetch for the LLM category. There's no
      // server-side "filter by versionProductType" endpoint, so this leans on
      // KNOWN_LLM_PRODUCT_NAMES's exact-match terms (plus a few generic brand
      // keywords as a cheap catch-all) run as CSV OR queries over the full 2-year
      // window, chunked to keep each request's query string a reasonable size and
      // run in parallel. The caller-facing filter to real versionProductType values
      // discards any incidental noise a term might also match.
      async llmVersions() {
        const brandTerms = ["ollama","openai","anthropic","mistral","xai","deepseek","meta","google","gpt","claude","llama","gemini","grok"];
        const allTerms = uniq([...brandTerms, ...KNOWN_LLM_PRODUCT_NAMES]);
        const CHUNK = 60;
        const chunks = [];
        for (let i = 0; i < allTerms.length; i += CHUNK) chunks.push(allTerms.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(async terms => {
          try {
            const params = new URLSearchParams({ q: encodeCsvKeepCommas(terms.join(",")), limit: "300" });
            const res = await fetch(`${API_BASE}v/search?${params}`, { headers: { Accept: "application/json" } });
            if (!res.ok) return [];
            const json = await res.json();
            return json.data || [];
          } catch (_) { return []; }
        }));
        return dedupeByVersionId(results).filter(isLLMVersion);
      },
      // Same shape as llmVersions() — a date-window-independent fetch for the
      // Hypervisor category, since hypervisor releases (like AI models) are
      // sparse enough in time to almost never fall inside the default feed window.
      async hypervisorVersions() {
        const brandTerms = ["hypervisor", "virtualization", "vmware", "virtualbox", "esxi", "xen", "proxmox", "xcp-ng"];
        const allTerms = uniq([...brandTerms, ...KNOWN_HV_PRODUCT_NAMES]);
        const CHUNK = 60;
        const chunks = [];
        for (let i = 0; i < allTerms.length; i += CHUNK) chunks.push(allTerms.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(async terms => {
          try {
            const params = new URLSearchParams({ q: encodeCsvKeepCommas(terms.join(",")), limit: "300" });
            const res = await fetch(`${API_BASE}v/search?${params}`, { headers: { Accept: "application/json" } });
            if (!res.ok) return [];
            const json = await res.json();
            return json.data || [];
          } catch (_) { return []; }
        }));
        return dedupeByVersionId(results).filter(isHypervisorVersion);
      },
      async reddit() {
        // Fetch all recent posts sorted by date; positiveScore filter was too strict
        const res = await fetch(`${API_BASE}reddit?limit=${REDDIT_LIMIT}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const list = await res.json();
        const arr = Array.isArray(list) ? list : (list.data || list.posts || list.results || []);
        return arr.map(p => {
          // Reddit API stores created_utc as Unix seconds; convert to ISO so Date() works correctly
          const rawDate = p.created_utc || p.createdAt || p.updatedAt;
          let created_utc = rawDate;
          if (typeof rawDate === 'number' && rawDate < 1e10) {
            created_utc = new Date(rawDate * 1000).toISOString();
          } else if (typeof rawDate === 'string' && /^\d{9,10}$/.test(rawDate.trim())) {
            created_utc = new Date(Number(rawDate) * 1000).toISOString();
          }
          return {
            redditId: p.redditId || p._id || p.id,
            title: p.title, subreddit: p.subreddit, url: p.url,
            author: p.author,
            created_utc,
            num_comments: p.num_comments, score: p.score,
            metadata: p.metadata, source: p.source,
            isAboutLatestUpdate: p.isAboutLatestUpdate, isAboutCve: p.isAboutCve
          };
        });
      }
    };

    /* ── Canon names ──────────────────────────────────────────── */
    const canonComponentName = v => {
      const display = titleCase((v && v.versionProductName) || "");
      return { key: normKey(display), nameOut: display };
    };

    let _homeRTotalNum = null;   // total reddit/community count from /api/reddit/count
    let _rTodayApi = null, _rYestApi = null; // per-day community counts from aggregate API
    let _activityChart = null;   // Chart.js instance for sidebar activity chart
    let _chartJsLoading = false; // prevents duplicate CDN injections
    let _activityDayStrs = null; // YYYYMMDD strings for the chart's LOOKBACK_DAYS window (LLM line refresh)

    /* ── State ────────────────────────────────────────────────── */
    const STATE = {
      rawVersions: [], redditAll: [],
      redditBySub: new Map(), redditByUrl: new Map(),
      groupsFiltered: [], groupIndex: 0,
      observer: null, loading: false,
      filters: { components: [], toggles: new Set() },
      expandedAll: false,
      candidates: [],
      redditReady: null,   // promise — set once, never re-fetched
      nextCursor: null,    // server cursor for the next versions page
      fetchingPage: false, // prevents concurrent server page fetches
      llmVersions: [],        // full, date-window-independent AI model dataset (see ensureLlmVersionsLoaded)
      llmVersionsLoaded: false,
      llmReady: null,         // promise — set once, never re-fetched
      hvVersions: [],         // full, date-window-independent hypervisor dataset (see ensureHvVersionsLoaded)
      hvVersionsLoaded: false,
      hvReady: null           // promise — set once, never re-fetched
    };

    // Merges arrays of raw version docs, dropping duplicates by versionId (falling
    // back to _id). Used when combining the windowed feed with the full LLM dataset.
    function dedupeByVersionId(arrays) {
      const seen = new Set(), out = [];
      for (const arr of arrays) {
        for (const v of arr) {
          const key = v.versionId || v._id;
          if (key) { if (seen.has(key)) continue; seen.add(key); }
          out.push(v);
        }
      }
      return out;
    }

    /* ── Reddit indexing ──────────────────────────────────────── */
    function getSourceCounts() {
      let reddit = 0, stackoverflow = 0;
      for (const p of STATE.redditAll) {
        if (norm(p.source || "") === "stackoverflow") stackoverflow++; else reddit++;
      }
      return { reddit, stackoverflow };
    }

    function buildRedditIndex(list) {
      STATE.redditBySub = new Map(); STATE.redditByUrl = new Map();
      for (const p of list) {
        const k = norm(p.subreddit); if (!k) continue;
        if (!STATE.redditBySub.has(k)) STATE.redditBySub.set(k, []);
        STATE.redditBySub.get(k).push(p);
        if (p.url) STATE.redditByUrl.set(String(p.url), p);
      }
      for (const arr of STATE.redditBySub.values())
        arr.sort((a, b) => redditTime(b) - redditTime(a) || (b.score || 0) - (a.score || 0));
    }

    function redditTime(p) {
      const raw = p.created_utc || p.updatedAt || p.createdAt || 0;
      if (typeof raw === 'number') return raw < 1e10 ? raw * 1000 : raw;
      const t = +new Date(raw); return isFinite(t) ? t : 0;
    }

    // versionTimestamp is set to Date.now() on every bot upsert — use versionReleaseDate instead
    function versionTime(v) {
      const rd = String(v.versionReleaseDate || '').trim().replace(/-/g, '');
      if (/^\d{8}$/.test(rd)) {
        return +new Date(rd.slice(0,4) + '-' + rd.slice(4,6) + '-' + rd.slice(6,8) + 'T12:00:00Z');
      }
      return 0;
    }

    // Returns all posts from subreddits that match the component name (exact or partial)
    function postsForComponent(name) {
      if (!name || name.length < 3) return [];
      const seen = new Set();
      const result = [];
      for (const [sub, posts] of STATE.redditBySub) {
        if (sub === name || (sub.length >= 3 && (sub.includes(name) || name.includes(sub)))) {
          for (const p of posts) { if (!seen.has(p.redditId)) { seen.add(p.redditId); result.push(p); } }
        }
      }
      result.sort((a, b) => redditTime(b) - redditTime(a) || (b.score || 0) - (a.score || 0));
      return result;
    }

    function redditMatchesForVersionBase(v, limit = 6, onlyRisks = false) {
      const name = norm(canonComponentName(v).nameOut); if (!name) return [];
      const arr = postsForComponent(name), out = [];
      for (const p of arr) {
        if (getPostSource(p) !== "reddit") continue;
        if (redditTime(p) < LOOKBACK_AGO) continue;
        if (onlyRisks && !isRisk(p)) continue;
        out.push(p); if (out.length >= limit) break;
      }
      return out;
    }

    function stackoverflowMatchesForVersionBase(v, limit = 6, onlyRisks = false) {
      const name = norm(canonComponentName(v).nameOut); if (!name) return [];
      const arr = postsForComponent(name), out = [];
      for (const p of arr) {
        if (getPostSource(p) !== "stackoverflow") continue;
        if (redditTime(p) < LOOKBACK_AGO) continue;
        if (onlyRisks && !isRisk(p)) continue;
        out.push(p); if (out.length >= limit) break;
      }
      return out;
    }

    /* ── Grouping ─────────────────────────────────────────────── */
    // User-selectable, remembered across visits. "recency" is the
    // default (see groupByComponentName's own comment for why); the
    // others are for when a different question matters more than "what
    // just changed"; alphabetical browsing, or triaging by risk.
    const FEED_SORT_KEY = "rt_feed_sort";
    function getFeedSort() {
      try { return localStorage.getItem(FEED_SORT_KEY) || "recency"; } catch { return "recency"; }
    }
    function setFeedSort(mode) {
      try { localStorage.setItem(FEED_SORT_KEY, mode); } catch { /* best-effort only */ }
    }

    function groupByComponentName(list) {
      const map = new Map();
      for (const v of list) {
        const c = canonComponentName(v);
        if (!map.has(c.key)) map.set(c.key, { key: c.key, name: c.nameOut, items: [] });
        map.get(c.key).items.push(v);
      }
      const arr = Array.from(map.values());
      arr.forEach(g => g.items.sort((a, b) => versionTime(b) - versionTime(a)));

      const mode = getFeedSort();
      if (mode === "alpha") {
        // Predictable position over recency, the same tradeoff the old
        // always-alphabetical default used to make, now opt-in.
        arr.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      } else if (mode === "cve") {
        arr.forEach(g => { g._cveCount = g.items.filter(v => v.isCve).length; });
        arr.sort((a, b) => (b._cveCount - a._cveCount) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else if (mode === "risk") {
        // Reddit data loads in the background (see ensureRedditLoaded)
        // and may not be in yet on the very first sort. That callback
        // re-runs applyFilters() (which calls back in here) once it
        // lands, specifically when this mode is active, so the order
        // corrects itself rather than staying wrong until some other
        // filter change happens to re-trigger it.
        arr.forEach(g => {
          const posts = postsForComponent(norm(g.name))
            .filter(p => getPostSource(p) === "reddit" && redditTime(p) >= LOOKBACK_AGO);
          g._riskScore = posts.reduce((max, p) => Math.max(max, getUpdateScore(p) ?? 0), 0);
        });
        arr.sort((a, b) => (b._riskScore - a._riskScore) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else if (mode === "activity") {
        arr.sort((a, b) => (b.items.length - a.items.length) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else if (mode === "sources") {
        // How many distinct bots actually produced this component's own
        // content: the same count each group's own "Source(s): ..." line
        // shows (see renderComponentNode), computed here across every
        // group up front so the feed can be ordered by it. "unknown"
        // isn't counted as a real source: a group whose only documents
        // are unattributed shouldn't out-rank one confirmed genuinely
        // single-sourced.
        arr.forEach(g => {
          const botSet = new Set();
          for (const v of g.items) {
            if (v._synthetic) continue;
            botSet.add((v.sourceBot || "unknown").trim() || "unknown");
          }
          const posts = postsForComponent(norm(g.name)).filter(p => redditTime(p) >= LOOKBACK_AGO);
          if (posts.some(p => getPostSource(p) === "reddit")) botSet.add("reddit.py");
          if (posts.some(p => getPostSource(p) === "stackoverflow")) botSet.add("stackoverflow.py");
          botSet.delete("unknown");
          g._sourceCount = botSet.size;
        });
        arr.sort((a, b) => (b._sourceCount - a._sourceCount) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else {
        // Groups (component names) sorted by recency: whichever group has
        // the most recently updated item leads. This is a "Recent Updates"
        // feed, so surfacing what actually just changed matters more than
        // a stable, alphabetically-predictable position, and finding one
        // specific component by name is already better served by the
        // search/filter box than by scanning an alphabetized list. Each
        // group's own items are already sorted newest first (just above),
        // so a group's own most recent timestamp is simply its first item's.
        arr.sort((a, b) => versionTime(b.items[0]) - versionTime(a.items[0]));
      }
      return arr;
    }

    /* ── Aggregates ───────────────────────────────────────────── */
    function computeAggregates(list) {
      let major = 0, minor = 0, patch = 0, cve = 0, llm = 0, hv = 0; const uniqComps = new Set(), typeCounts = new Map();
      const rIds = new Set(), rRiskIds = new Set(), rRiskLatIds = new Set(), rRiskCveIds = new Set(), soIds = new Set(), soRiskIds = new Set();
      let potentialCve = 0;
      for (const it of list) {
        const ch = norm(it.versionReleaseChannel);
        if (ch === "major") major++; else if (ch === "minor") minor++; else if (ch === "patch") patch++;
        const isLlm = isLLMVersion(it), isHv = isHypervisorVersion(it);
        if (it.isCve) cve++;
        if (isLlm) llm++;
        if (isHv) hv++;
        for (const p of redditMatchesForVersionBase(it, REDDIT_LIMIT, false)) if (getPostSource(p) === "reddit") rIds.add(getPostId(p));
        for (const p of redditMatchesForVersionBase(it, REDDIT_LIMIT, true)) if (getPostSource(p) === "reddit") {
          const id = getPostId(p); rRiskIds.add(id);
          if (p.isAboutLatestUpdate) rRiskLatIds.add(id);
          if (p.isAboutCve) rRiskCveIds.add(id);
        }
        const mltlSrc = it.mltl && Array.isArray(it.mltl.src) ? it.mltl.src : [];
        const potPosts = mltlSrc.map(u => STATE.redditByUrl.get(String(u))).filter(p => p?.isAboutLatestUpdate && p?.isAboutCve);
        if (potPosts.length) potentialCve++;
        for (const p of stackoverflowMatchesForVersionBase(it, REDDIT_LIMIT, false)) if (getPostSource(p) === "stackoverflow") soIds.add(getPostId(p));
        for (const p of stackoverflowMatchesForVersionBase(it, REDDIT_LIMIT, true)) if (getPostSource(p) === "stackoverflow") soRiskIds.add(getPostId(p));
        uniqComps.add(canonComponentName(it).key);
        for (const t of (it.classification?.componentType || [])) {
          if (!t || t === "UNKNOWN") continue;
          const k = String(t).toLowerCase(); typeCounts.set(k, (typeCounts.get(k) || 0) + 1);
        }
      }
      return {
        major, minor, patch, cve, llm, hv, reddit: rIds.size, redditRisk: rRiskIds.size,
        redditRiskLatest: rRiskLatIds.size, redditRiskCve: rRiskCveIds.size,
        so: soIds.size, soRisk: soRiskIds.size, potentialCve, uniq: uniqComps.size, typeCounts
      };
    }

    function paintFixedCounts(a) {
      EL["btn-major"].textContent = a.major;
      EL["btn-minor"].textContent = a.minor;
      EL["btn-patch"].textContent = a.patch;
      EL["btn-cve"].textContent = a.cve;
      // Once the full LLM dataset has loaded, show its true total rather than the
      // windowed count — AI model releases are sparse enough in time that the
      // windowed count is misleadingly 0 far more often than not (see
      // ensureLlmVersionsLoaded).
      const llmCount = STATE.llmVersionsLoaded ? STATE.llmVersions.length : a.llm;
      EL["btn-llm"].textContent = llmCount;
      EL["kpi-llm"].textContent = llmCount;
      // Same treatment as LLM — prefer the full dataset's true total once loaded.
      const hvCount = STATE.hvVersionsLoaded ? STATE.hvVersions.length : a.hv;
      EL["btn-hv"].textContent = hvCount;
      EL["kpi-hv"].textContent = hvCount;
      EL["btn-potential-cve"].textContent = a.potentialCve;
      EL["btn-reddit"].textContent = a.reddit;
      EL["btn-reddit-risk"].textContent = a.redditRisk;
      EL["btn-reddit-risk-latest"].textContent = a.redditRiskLatest;
      EL["btn-reddit-risk-cve"].textContent = a.redditRiskCve;
      EL["btn-so"].textContent = a.so;
      EL["btn-so-risk"].textContent = a.soRisk;
      EL["kpi-uniq"].textContent = a.uniq;
    }

    /* ── Active filter display ────────────────────────────────── */
    function refreshActiveFilters() {
      const set = STATE.filters.toggles;
      if (!set.size) { EL.activeFilters.classList.remove("visible"); return; }
      EL.activeFilters.classList.add("visible");
      EL.afTags.innerHTML = [...set].map(k => `<span class="af-tag">${k}</span>`).join("");
    }

    /* ── Type buttons ─────────────────────────────────────────── */
    function buildTypeButtons(typeCounts) {
      EL.typeToggles.innerHTML = "";
      const entries = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP_TYPES);
      if (!entries.length) {
        EL.typeToggles.innerHTML = `<button class="toggle disabled" type="button" aria-disabled="true"><span class="lbl">No types</span></button>`;
        return;
      }
      for (const [type, count] of entries) {
        const btn = document.createElement("button");
        btn.className = "toggle"; btn.type = "button"; btn.dataset.key = `type:${type}`;
        btn.setAttribute("aria-pressed", STATE.filters.toggles.has(`type:${type}`) ? "true" : "false");
        btn.innerHTML = `<span class="lbl">${type}</span><span class="count">${count}</span>`;
        btn.addEventListener("click", () => {
          const key = btn.dataset.key, on = btn.getAttribute("aria-pressed") === "true";
          btn.setAttribute("aria-pressed", on ? "false" : "true");
          on ? STATE.filters.toggles.delete(key) : STATE.filters.toggles.add(key);
          refreshActiveFilters(); applyFilters();
        });
        EL.typeToggles.appendChild(btn);
      }
    }

    /* ── Toggle matching ──────────────────────────────────────── */
    function matchesToggles(v, rc, rRiskCount, soCount, soRiskCount, rRiskLatestCount, rRiskCveCount, hasPotentialCve) {
      const set = STATE.filters.toggles, channel = norm(v.versionReleaseChannel);
      const compTypes = (v.classification?.componentType || []).map(norm);
      const truth = {
        major: channel === "major", minor: channel === "minor", patch: channel === "patch",
        cve: !!v.isCve, llm: isLLMVersion(v), hv: isHypervisorVersion(v), reddit: rc > 0,
        "reddit-risk": rRiskCount > 0, "reddit-risk-latest": rRiskLatestCount > 0,
        "reddit-risk-cve": rRiskCveCount > 0, so: soCount > 0, "so-risk": soRiskCount > 0,
        "potential-cve": hasPotentialCve
      };
      for (const k of set) {
        if (k.startsWith("type:")) { if (!compTypes.includes(k.slice(5))) return false; }
        else if (!truth[k]) return false;
      }
      return true;
    }

    /* ── Range KPI helper ────────────────────────────────────── */
    // "Recent Updates (last N weeks)" also states how many components
    // that window currently holds, so the header itself answers "how
    // much is actually in here": the separate #status text used to
    // repeat this same count on the right, which was just redundant.
    // Weeks computed from LOOKBACK_DAYS rather than hardcoded, same
    // reasoning as everywhere else this constant is the source of truth.
    function updateFeedWindowLabel() {
      if (!EL.feedWindowLabel) return;
      const n = STATE.groupsFiltered.length;
      EL.feedWindowLabel.textContent = `(last ${LOOKBACK_WEEKS} week${LOOKBACK_WEEKS !== 1 ? "s" : ""}, ${n.toLocaleString()} component${n !== 1 ? "s" : ""})`;
    }

    function updateRangeKpi(items) {
      const fmt = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      // Reflects what's actually displayed: inside LOOKBACK_DAYS for the
      // default no-search feed, but a named component search can span
      // further back than that window (see withinFeedWindow's own
      // comment on skipRecencyCap), so this range legitimately widens
      // once a search is active.
      const times = (items || []).map(versionTime).filter(Boolean);
      if (!times.length) { EL["kpi-range"].innerHTML = `📅 Range: <em>—</em>`; return; }
      const min = Math.min(...times), max = Math.max(...times);
      EL["kpi-range"].innerHTML = `📅 Range: <em>${fmt(new Date(min))} – ${fmt(new Date(max))}</em>`;
    }

    // The recency window is a hard cap on the default, no-search "Recent
    // Updates" feed: nothing older than LOOKBACK_DAYS shows up there
    // regardless of the LLM/Hypervisor toggles, so that view can't
    // quietly surface a release from a year ago. A named component
    // search (STATE.filters.components, e.g. typed into the search box
    // or pre-filled from a ?q=name,name URL like /?q=Hibernate,java) is
    // the one exception: per explicit request, searching for a specific
    // vendor means "show me everything about it," not "show me only
    // what's recent enough for the front page," so skipRecencyCap is
    // true whenever that filter is active.
    function withinFeedWindow(v, skipRecencyCap) {
      const ts = versionTime(v);
      if (!ts) return false;
      if (!skipRecencyCap && ts < LOOKBACK_AGO) return false;
      if (ts > Date.now() && !v.isVendorPublished) return false;
      return true;
    }

    /* ── Apply filters ────────────────────────────────────────── */
    function applyFilters() {
      buildSuggestionPool();
      const comps = STATE.filters.components;
      const llmActive = STATE.filters.toggles.has("llm");
      const hvActive = STATE.filters.toggles.has("hv");
      // Extends the candidate pool with the full LLM / hypervisor
      // datasets whenever relevant, since STATE.rawVersions alone
      // doesn't necessarily include them. withinFeedWindow below still
      // applies the LOOKBACK_DAYS cap to every candidate when there's no
      // named component search active, regardless of which pool it came
      // from, so the toggles alone only widen WHERE a recent match can
      // be found, not whether an old one can slip through.
      const pool = (llmActive || hvActive || comps.length)
        ? dedupeByVersionId([STATE.rawVersions, STATE.llmVersions, STATE.hvVersions])
        : STATE.rawVersions;
      const candidates = pool.filter(v => {
        if (!withinFeedWindow(v, comps.length > 0)) return false;
        if (!comps.length) return true;
        const name = norm(v.versionProductName);
        const tags = (Array.isArray(v.versionSearchTags) ? v.versionSearchTags.join(",") : "").toLowerCase();
        return comps.some(t => name.includes(t) || tags.includes(t));
      });

      const ag = computeAggregates(candidates);
      paintFixedCounts(ag);
      buildTypeButtons(ag.typeCounts);

      const filtered = candidates.filter(v => {
        const r = redditMatchesForVersionBase(v, 6, false);
        const rr = redditMatchesForVersionBase(v, 6, true);
        const soAll = stackoverflowMatchesForVersionBase(v, 6, false);
        const soRiskA = stackoverflowMatchesForVersionBase(v, 6, true);
        const rLatest = rr.filter(p => p.isAboutLatestUpdate).length;
        const rCve = rr.filter(p => p.isAboutCve).length;
        const mltlSrc = v.mltl && Array.isArray(v.mltl.src) ? v.mltl.src : [];
        const potPosts = mltlSrc.map(u => STATE.redditByUrl.get(String(u))).filter(p => p?.isAboutLatestUpdate && p?.isAboutCve);
        return matchesToggles(v, r.length, rr.length, soAll.length, soRiskA.length, rLatest, rCve, potPosts.length > 0);
      });

      EL["kpi-reddit"].textContent = getSourceCounts().reddit;

      updateRangeKpi(filtered);

      STATE.candidates = candidates;
      STATE.groupsFiltered = groupByComponentName(filtered);

      // Inject subreddit-only groups for search terms that match a subreddit
      // but have no version data — so community posts are still surfaced.
      if (STATE.filters.components.length) {
        const existingKeys = new Set(STATE.groupsFiltered.map(g => g.key));
        for (const term of STATE.filters.components) {
          const posts = postsForComponent(term);
          const recent = posts.filter(p => getPostSource(p) === "reddit" && redditTime(p) >= LOOKBACK_AGO);
          if (!recent.length) continue;
          const c = canonComponentName({ versionProductName: term });
          if (existingKeys.has(c.key)) continue;
          STATE.groupsFiltered.push({ key: c.key, name: c.nameOut, items: [{ versionProductName: term, _synthetic: true }] });
        }
      }

      STATE.groupIndex = 0;
      EL.feed.innerHTML = "";
      EL["kpi-page"].textContent = STATE.groupsFiltered.length;
      EL.sentinel.textContent = STATE.groupsFiltered.length ? "Loading more…" : "No results";
      if (STATE.groupsFiltered.length) {
        hideEmptyState();
      } else {
        // A named component search no longer has a day-window to blame
        // (see withinFeedWindow's own comment: it's bypassed whenever
        // comps.length), so "matched, but still empty" here now means
        // something else excluded it -- most likely the Reddit/Stack
        // Overflow risk toggles, occasionally a version with no usable
        // timestamp at all. Distinguish that from a genuine no-match.
        const matchedButFiltered = comps.length && pool.some(v => {
          const name = norm(v.versionProductName);
          const tags = (Array.isArray(v.versionSearchTags) ? v.versionSearchTags.join(",") : "").toLowerCase();
          return comps.some(t => name.includes(t) || tags.includes(t));
        });
        showEmptyState(matchedButFiltered
          ? "Found matches for that search, but none match the other active filters."
          : (comps.length ? "No versions found for that search." : "No updates match the current filters."));
      }
      // The header's own "(last N weeks, M components)" label now states
      // this same count. #status stays reserved for transient messages
      // (Loading…, Filtering…, error states) elsewhere in this file, not
      // a steady-state repeat of a number already shown above the feed.
      EL.status.textContent = "";
      updateFeedWindowLabel();
      appendNextGroups();

      if (G_ACTIVE && G_VIS_LOADED) gBuildAndRender(gGetVersions(), STATE.redditAll);
      if (A_ACTIVE) aLoadAndRender();
    }

    /* ── Chip builder ─────────────────────────────────────────── */
    const chip = (t, k) => `<span class="chip ${k || ""}">${t}</span>`;

    /* ── Render group ─────────────────────────────────────────── */
    function renderComponentNode(group, groupIndex = 0) {
      const onlyRedditRisks = STATE.filters.toggles.has("reddit-risk") ||
        STATE.filters.toggles.has("reddit-risk-latest") ||
        STATE.filters.toggles.has("reddit-risk-cve");
      const onlySoRisks = STATE.filters.toggles.has("so-risk");

      const seen = new Set(); const rUnion = [];
      for (const v of group.items) {
        for (const p of redditMatchesForVersionBase(v, REDDIT_LIMIT, onlyRedditRisks)) {
          const id = getPostId(p); if (seen.has(id)) continue; seen.add(id); rUnion.push(p);
        }
        for (const p of stackoverflowMatchesForVersionBase(v, REDDIT_LIMIT, onlySoRisks)) {
          const id = getPostId(p); if (seen.has(id)) continue; seen.add(id); rUnion.push(p);
        }
      }

      const vEntries = group.items.filter(v => !v._synthetic).map(v => ({
        t: versionTime(v),
        kind: v.isCve ? "cve" : "update",
        channel: (v.versionReleaseChannel || "other").toLowerCase(),
        label: `${safe(v.versionProductName, "")} ${v.versionNumber || ""}`.trim(),
        url: (v.versionUrl && v.versionUrl.startsWith("http")) ? v.versionUrl : ((v.versionReleaseNotes && v.versionReleaseNotes.startsWith("http")) ? v.versionReleaseNotes : "#"),
        raw: v
      }));
      const rEntries = rUnion.map(p => {
        const src = getPostSource(p);
        const t = redditTime(p);
        return { t, kind: src === "stackoverflow" ? "stackoverflow" : "reddit", channel: null, label: p.title, url: p.url, raw: p };
      });
      // Merge two already-sorted-desc arrays into one sorted timeline
      vEntries.sort((a, b) => b.t - a.t);
      rEntries.sort((a, b) => b.t - a.t);
      const timeline = [];
      let vi = 0, ri = 0;
      while (vi < vEntries.length && ri < rEntries.length) {
        timeline.push(vEntries[vi].t >= rEntries[ri].t ? vEntries[vi++] : rEntries[ri++]);
      }
      while (vi < vEntries.length) timeline.push(vEntries[vi++]);
      while (ri < rEntries.length) timeline.push(rEntries[ri++]);

      const cveCount = timeline.filter(x => x.kind === "cve").length;
      const redditCount = timeline.filter(x => x.kind === "reddit").length;
      const soCount = timeline.filter(x => x.kind === "stackoverflow").length;
      // A CVE record carries its own versionReleaseChannel too (e.g. a CVE
      // affecting 6.31.1 reads channel "patch"), which double-counted it
      // into both the CVE chip and the Major/Minor/Patch chips. These are
      // meant to read as real release-notes activity, so only count
      // kind==="update" entries here, never a CVE's own channel value.
      const majorCount = timeline.filter(x => x.kind === "update" && x.channel === "major").length;
      const minorCount = timeline.filter(x => x.kind === "update" && x.channel === "minor").length;
      const patchCount = timeline.filter(x => x.kind === "update" && x.channel === "patch").length;

      const summaryChips = [
        cveCount ? chip(`🔴 CVE ${cveCount}`, "bad") : "",
        redditCount ? chip(`💬 Reddit ${redditCount}`, "reddit") : "",
        soCount ? chip(`🟧 SO ${soCount}`, "soft") : "",
        majorCount ? chip(`🔖 Major ${majorCount}`, "ok") : "",
        minorCount ? chip(`🔹 Minor ${minorCount}`, "soft") : "",
        patchCount ? chip(`🩹 Patch ${patchCount}`, "soft") : "",
      ].filter(Boolean).join("");

      // Which bot(s) actually produced this component's own content:
      // replaces the old global, deck-wide "Recent Updates" source
      // breakdown (which just listed raw totals with no way to tell
      // which component each count belonged to). Reddit/StackOverflow
      // posts carry no sourceBot field of their own (they're keyed by
      // "source" instead), but there's only ever one bot that creates
      // each: reddit.py, stackoverflow.py.
      const botSet = new Set();
      for (const v of group.items) {
        if (v._synthetic) continue;
        botSet.add((v.sourceBot || "unknown").trim() || "unknown");
      }
      if (redditCount) botSet.add("reddit.py");
      if (soCount) botSet.add("stackoverflow.py");
      // "videoCall"/"videoCall.py" is a legacy sourceBot value from
      // before videoCall.py started stamping the actual vendor
      // (zoom/teams/webex) it found in each document's own URL; older
      // documents saved before that fix still carry it. It's never the
      // real source, just the bot's own filename, so it's excluded here
      // rather than shown alongside (or instead of) the real vendor
      // label a reader actually wants (e.g. "mitre, teams", not "mitre,
      // teams, videoCall").
      botSet.delete("videoCall"); botSet.delete("videoCall.py");
      const bots = [...botSet].sort((a, b) => (a === "unknown") - (b === "unknown") || a.localeCompare(b));
      // ".py" is an implementation detail (the actual script filename,
      // kept as the real sourceBot value so it stays consistent with
      // maintainer.py's own naming), not something a reader needs to see.
      const botLabel = b => b === "unknown" ? "unknown" : b.replace(/\.py$/, "");
      const sourceLine = bots.length
        ? `<div class="groupSource">📦 ${bots.length > 1 ? "Sources" : "Source"}: ${bots.map(b => uaEsc(botLabel(b))).join(", ")}</div>`
        : "";

      const det = document.createElement("details");
      det.className = "feedGroup";
      // Every group starts collapsed, including the first one. It used
      // to default open, which read as one arbitrarily-expanded group
      // sitting above an otherwise all-collapsed list.
      det.open = false;
      det.dataset.component = group.name;
      det.dataset.itemCount = String(timeline.length);

      const sum = document.createElement("summary");
      // Name + latest-version bracket share one row (version pushed to
      // the far right via .group-latest-ver's own margin-left:auto);
      // the CVE/Reddit/SO/Major/Minor/Patch total chips get their own
      // row below rather than competing for space on the name's line.
      sum.innerHTML = `<span class="groupHead">${safe(group.name, "")}<span class="group-latest-ver"></span></span>` +
        (summaryChips ? `<div class="groupChips">${summaryChips}</div>` : "") + sourceLine;
      det.appendChild(sum);
      // Fetched live (fetchLatestVersionFor, shared with the Ask
      // suggestion dropdown's own version bracket, cached the same way)
      // rather than derived from this group's own vEntries above.
      // Verified live: a group's currently-loaded items (bounded by
      // whatever date window/filters the feed is showing right now) can
      // genuinely have no real release in view at all. A component
      // showing "Patch 1"/"Minor 2" chips can still have zero non-CVE
      // items loaded, because those chips count a CVE record's own
      // versionReleaseChannel field too, not only real releases, while
      // the real latest release exists but is simply older than the
      // feed's current window. A live fetch by name isn't limited to
      // what happens to be loaded right now.
      const verSlot = sum.querySelector(".group-latest-ver");
      fetchLatestVersionFor(group.name).then(({ version, date }) => {
        if (!version) return;
        // How fresh "latest" actually is, right next to the version
        // number itself, since a version can be genuinely current or a
        // year stale, and the bare number alone doesn't say which.
        // calendarDaysAgo, not aDateMs vs Date.now() (see its own
        // comment): a plain calendar-day diff in the viewer's own
        // timezone, not one that can flip to "1d ago" on the same local
        // day just because UTC noon has passed.
        const days = date ? calendarDaysAgo(date) : null;
        const freshness = days == null ? "" : (days <= 0 ? ", today" : `, ${days}d ago`);
        verSlot.textContent = ` (latest: ${version}${freshness})`;
      });

      const wrap = document.createElement("div"); wrap.className = "updates";
      const list = document.createElement("div"); list.className = "list";

      for (const it of timeline) {
        const li = document.createElement("div");
        const dayLabel = dayLabelFromMillis(it.t);
        const _todayMidnight = new Date(); _todayMidnight.setHours(0, 0, 0, 0);
        const isNew = it.t >= _todayMidnight.getTime();

        let liClass = "li";
        if (it.kind === "cve") liClass += " kind-cve";
        else if (it.kind === "reddit") liClass += " kind-reddit" + (isRisk(it.raw) ? " risk" : "");
        else if (it.kind === "stackoverflow") liClass += " kind-stackoverflow" + (isRisk(it.raw) ? " risk" : "");
        else if (it.kind === "update" && it.channel) liClass += ` kind-update ${it.channel}`;
        if (isLLMVersion(it.raw)) liClass += " kind-llm";
        if (isHypervisorVersion(it.raw)) liClass += " kind-hv";
        if (isNew) liClass += " is-new";
        li.className = liClass;

        li.dataset.kind = it.kind;
        if (it.channel) li.dataset.channel = it.channel;
        li.dataset.timestamp = new Date(it.t).toISOString();
        if (it.kind === "reddit" || it.kind === "stackoverflow") {
          li.dataset.source = it.kind;
          const score = getUpdateScore(it.raw);
          if (score != null) li.dataset.riskScore = score.toFixed(2);
          if (it.raw?.subreddit) li.dataset.subreddit = it.raw.subreddit;
          if (typeof it.raw?.num_comments === "number") li.dataset.comments = String(it.raw.num_comments);
        }
        if (it.raw?.versionNumber) li.dataset.version = it.raw.versionNumber;

        const dcol = document.createElement("div"); dcol.className = "datecol";
        dcol.innerHTML = `<span class="day${isNew ? " today" : ""}">${dayLabel}</span><span class="time">${shortTime(it.t)}</span>`;
        li.appendChild(dcol);

        if (it.kind === "reddit") {
          const av = document.createElement("img");
          av.className = "avatar redditIcon" + (isRisk(it.raw) ? " risky" : "");
          av.src = "./img/reddit.png"; av.alt = "Reddit"; av.title = isRisk(it.raw) ? "Reddit (risk)" : "Reddit";
          li.appendChild(av);
        } else if (it.kind === "stackoverflow") {
          const av = document.createElement("img");
          av.className = "avatar soIcon" + (isRisk(it.raw) ? " risky" : "");
          av.src = "./img/stackoverflow.png"; av.alt = "StackOverflow";
          li.appendChild(av);
        } else {
          const av = document.createElement("img"); av.className = "avatar"; av.alt = group.name; av.src = avatarFor(it.raw);
          li.appendChild(av);
        }

        const body = document.createElement("div");
        const chipsEl = document.createElement("div"); chipsEl.className = "chips";

        if (it.kind === "reddit") {
          // The reddit/StackOverflow icon already sits to the left of every
          // row (and the group header already totals each source), so a
          // repeated "reddit"/"stackoverflow" text chip on every single row
          // is pure noise, not new information.
          if (it.raw?.subreddit) chipsEl.insertAdjacentHTML("beforeend", chip(`r/${it.raw.subreddit}`, "soft"));
          const scorePred = it.raw?.metadata?.predicted?.positiveScore;
          const scoreField = typeof it.raw?.score === "number" ? it.raw.score : null;
          const scoreVal = typeof scorePred === "number" ? scorePred : scoreField;
          if (isRisk(it.raw)) {
            chipsEl.insertAdjacentHTML("beforeend", chip(scoreVal != null ? `⚠️ RISK ${Number(scoreVal).toFixed(2)}` : "⚠️ RISK", "warn"));
          } else if (scoreVal != null) {
            chipsEl.insertAdjacentHTML("beforeend", chip(`score ${Number(scoreVal).toFixed(2)}`, "soft"));
          }
          const flags = it.raw || {};
          if (flags.isAboutLatestUpdate) chipsEl.insertAdjacentHTML("beforeend", chip("🆕 latest", "soft"));
          if (flags.isAboutCve) chipsEl.insertAdjacentHTML("beforeend", chip("🔐 security", "bad"));
          const comments = typeof flags.num_comments === "number" ? flags.num_comments : null;
          if (comments != null) chipsEl.insertAdjacentHTML("beforeend", chip(`💬 ${comments}`, "soft"));
          // Yes/No poll: only offered when the post reads like a question
          // actually shaped for a binary answer, and has at least one
          // comment to poll. A WH-question ("What's the best way to fix
          // this?", "Why did this happen?") asks for an explanation, not
          // a yes/no, so classifying comments against one is meaningless -
          // flagged live. Mirrors the server's own isYesNoShapedQuestion
          // (ask.js), same reasoning, kept in sync by hand.
          const questionText = flags.author_description || flags.title || "";
          if (askLooksLikeYesNoQuestion(questionText) && comments) {
            const rid = getPostId(flags);
            if (rid) {
              chipsEl.insertAdjacentHTML("beforeend",
                `<button type="button" class="chip poll-btn" data-reddit-id="${uaEsc(rid)}" title="Classify comments as Yes/No answers to this question">📊 Poll</button>`);
            }
          }
        } else if (it.kind === "stackoverflow") {
          const scorePred = it.raw?.metadata?.predicted?.positiveScore;
          const scoreVal = typeof scorePred === "number" ? scorePred : (typeof it.raw?.score === "number" ? it.raw.score : null);
          if (isRisk(it.raw)) chipsEl.insertAdjacentHTML("beforeend", chip(scoreVal != null ? `⚠️ RISK ${Number(scoreVal).toFixed(2)}` : "⚠️ RISK", "warn"));
        } else if (it.kind === "cve") {
          // Its own red icon + red-tinted row (.kind-cve) already say "CVE" -
          // no need to say it a third time after the group header's own count.
          const cveHref = (it.url && it.url.startsWith("http")) ? it.url : (it.raw?._id ? `https://releasetrain.io/api/v/${it.raw._id}` : null);
          if (cveHref) chipsEl.insertAdjacentHTML("beforeend", `<span class="chip link"><a href="${cveHref}" target="_blank" rel="noopener">open ↗</a></span>`);
        } else {
          // Channel (major/minor/patch) is the one row-level distinction with
          // no icon of its own, so it keeps a visual cue (the row's own
          // left-border color, see .li.kind-update.major) even though the
          // repeated text chip, already totalled in the group header, is
          // gone.
          if (isLLMVersion(it.raw)) chipsEl.insertAdjacentHTML("beforeend", chip("🤖 LLM", "llm"));
          if (isHypervisorVersion(it.raw)) chipsEl.insertAdjacentHTML("beforeend", chip("🖥️ Hypervisor", "hv"));
        }

        if (it.kind !== "reddit" && it.kind !== "stackoverflow" && it.raw) {
          const r = it.raw;
          // Only the chips that flag something actionable stay on the row by
          // default: a security classification or a breaking-change classification.
          // License and component-type were repetitive noise (every row in a
          // group carries the same values) — dropped.
          (r.classification?.securityType || []).filter(x => x && x !== "UNKNOWN").slice(0, 1)
            .forEach(t => chipsEl.insertAdjacentHTML("beforeend", chip(String(t).toLowerCase(), "bad")));
          (r.classification?.breakingType || []).filter(x => x && x !== "UNKNOWN").slice(0, 1)
            .forEach(t => chipsEl.insertAdjacentHTML("beforeend", chip(String(t).toLowerCase(), "warn")));
          if (r._id && it.kind !== "cve") chipsEl.insertAdjacentHTML("beforeend", `<span class="chip link"><a href="https://releasetrain.io/api/v/${r._id}" target="_blank" rel="noopener">open ↗</a></span>`);
        }

        body.appendChild(chipsEl);

        const titleRow = document.createElement("div"); titleRow.className = "titleRow";
        const a = document.createElement("a"); a.href = it.url || "#"; a.target = "_blank"; a.rel = "noopener"; a.textContent = it.label;
        titleRow.appendChild(a);
        body.appendChild(titleRow);

        // versionReleaseNotes is a human-readable summary for some bots (e.g. GitHub
        // commit messages) but a bare URL for others (python.py, java.py, eclipse.py,
        // ai_model.py). A URL there is already the clickable title link above — showing
        // it again as body text is just clutter, so prefer versionReleaseComments in
        // that case instead of dumping the raw link into the description.
        const notesRaw = safe(it.raw?.versionReleaseNotes, "");
        const notesIsUrl = notesRaw.startsWith("http");
        const descTxt = notesIsUrl
          ? safe(it.raw?.versionReleaseComments, "")
          : (truncate(notesRaw) || safe(it.raw?.versionReleaseComments, ""));
        if (descTxt) {
          const d = document.createElement("div"); d.className = "meta";
          let inner = "";

          if (it.kind !== "reddit" && it.kind !== "stackoverflow" && it.raw) {
            const mltlSrc = it.raw.mltl && Array.isArray(it.raw.mltl.src) ? it.raw.mltl.src : [];
            const potPosts = mltlSrc.map(u => STATE.redditByUrl.get(String(u))).filter(p => p?.isAboutLatestUpdate && p?.isAboutCve);
            if (potPosts.length) {
              inner += `<span class="chip warn potentialCveBadge">⚠️ Potential CVE discussion (${potPosts.length})</span>`;
              inner += `<div class="chips potentialCveChips">`;
              for (const p of potPosts) {
                const id = getPostId(p) || "post";
                inner += `<a class="chip potentialCveChip" href="${p.url || `https://reddit.com/comments/${id}`}" target="_blank" rel="noopener">${id}</a>`;
              }
              inner += `</div>`;
            }
          }

          d.innerHTML = inner + descTxt;
          body.appendChild(d);
        }

        li.appendChild(body);
        list.appendChild(li);
      }

      wrap.appendChild(list);
      det.appendChild(wrap);
      return det;
    }

    /* ── Infinite scroll ──────────────────────────────────────── */

    // Apply current component + toggle filters to a list of versions (used for incoming pages)
    function filterVersions(vers) {
      const comps = STATE.filters.components;
      const candidates = vers.filter(v => {
        if (!withinFeedWindow(v, comps.length > 0)) return false;
        if (!comps.length) return true;
        const name = norm(v.versionProductName);
        const tags = (Array.isArray(v.versionSearchTags) ? v.versionSearchTags.join(",") : "").toLowerCase();
        return comps.some(t => name.includes(t) || tags.includes(t));
      });
      if (!STATE.filters.toggles.size) return candidates;
      return candidates.filter(v => {
        const r  = redditMatchesForVersionBase(v, 6, false);
        const rr = redditMatchesForVersionBase(v, 6, true);
        const soAll  = stackoverflowMatchesForVersionBase(v, 6, false);
        const soRisk = stackoverflowMatchesForVersionBase(v, 6, true);
        const rLatest = rr.filter(p => p.isAboutLatestUpdate).length;
        const rCve    = rr.filter(p => p.isAboutCve).length;
        const potPosts = (v.mltl && Array.isArray(v.mltl.src) ? v.mltl.src : [])
          .map(u => STATE.redditByUrl.get(String(u))).filter(p => p && p.isAboutLatestUpdate && p.isAboutCve);
        return matchesToggles(v, r.length, rr.length, soAll.length, soRisk.length, rLatest, rCve, potPosts.length > 0);
      });
    }

    function appendNextGroups() {
      if (STATE.loading || STATE.fetchingPage) return;

      // Render next batch of already-loaded groups
      if (STATE.groupIndex < STATE.groupsFiltered.length) {
        STATE.loading = true;
        const frag = document.createDocumentFragment();
        const end = Math.min(STATE.groupIndex + GROUPS_BATCH, STATE.groupsFiltered.length);
        for (let i = STATE.groupIndex; i < end; i++) frag.appendChild(renderComponentNode(STATE.groupsFiltered[i], i));
        EL.feed.appendChild(frag);
        STATE.groupIndex = end;
        STATE.loading = false;
        // Always continue via rAF: next local batch OR (when groupIndex reaches
        // the end) fall through to the cursor-fetch branch so older server pages
        // load automatically without requiring a user scroll.
        requestAnimationFrame(appendNextGroups);
        return;
      }

      // All client groups rendered — fetch next server page if cursor exists
      if (STATE.nextCursor) {
        STATE.fetchingPage = true;
        EL.sentinel.textContent = "Loading more…";
        const q = (EL.components && EL.components.value || "").trim();
        Api.versions(q, STATE.nextCursor).then(({ versions: newVers, nextCursor }) => {
          STATE.nextCursor = nextCursor;
          STATE.fetchingPage = false;
          if (!newVers.length) { EL.sentinel.textContent = ""; return; }

          STATE.rawVersions = STATE.rawVersions.concat(newVers);
          const newFiltered = filterVersions(newVers);
          const newGroups   = groupByComponentName(newFiltered);

          // Merge: accumulate items into existing groups, collect truly new ones
          const existingMap = new Map(STATE.groupsFiltered.map(g => [g.key, g]));
          const brandNew = [];
          newGroups.forEach(g => {
            if (existingMap.has(g.key)) existingMap.get(g.key).items.push(...g.items);
            else brandNew.push(g);
          });
          STATE.groupsFiltered = STATE.groupsFiltered.concat(brandNew);
          EL["kpi-page"].textContent = STATE.groupsFiltered.length;
          updateFeedWindowLabel();
          updateRangeKpi(STATE.groupsFiltered.flatMap(g => g.items));

          if (brandNew.length) appendNextGroups();
          else if (!nextCursor) EL.sentinel.textContent = "";
        }).catch(e => {
          STATE.fetchingPage = false;
          console.error("[FEED] page fetch:", e);
          EL.sentinel.textContent = "Error loading more";
        });
        return;
      }

      EL.sentinel.textContent = STATE.groupsFiltered.length ? "" : "🔍 No results";
    }

    function setupObserver() {
      if (STATE.observer) STATE.observer.disconnect();
      STATE.observer = new IntersectionObserver(es => {
        if (es[0]?.isIntersecting) appendNextGroups();
      }, { rootMargin: "400px 0px" });
      STATE.observer.observe(EL.sentinel);
    }

    /* ── Expand / collapse all ────────────────────────────────── */
    EL.expandAllBtn.addEventListener("click", () => {
      STATE.expandedAll = !STATE.expandedAll;
      $$(".feedGroup").forEach(d => { d.open = STATE.expandedAll; });
      EL.expandAllBtn.textContent = STATE.expandedAll ? "Collapse all" : "Expand all";
    });

    /* ── Feed sort ────────────────────────────────────────────── */
    EL.feedSortSelect.value = getFeedSort();
    EL.feedSortSelect.addEventListener("change", () => {
      setFeedSort(EL.feedSortSelect.value);
      applyFilters();
    });

    /* ── Boot ─────────────────────────────────────────────────── */
    function refreshRenderedGroupsWithReddit() {
      const rendered = Array.from(EL.feed.querySelectorAll(".feedGroup[data-component]"));
      rendered.forEach(existingNode => {
        const compName = existingNode.dataset.component;
        const idx = STATE.groupsFiltered.findIndex(g => g.name === compName);
        if (idx < 0) return;
        const wasOpen = existingNode.open;
        const scrollTop = existingNode.scrollTop;
        const newNode = renderComponentNode(STATE.groupsFiltered[idx], idx);
        newNode.open = wasOpen;
        existingNode.replaceWith(newNode);
        newNode.scrollTop = scrollTop;
      });
    }

    function ensureRedditLoaded() {
      if (!STATE.redditReady) {
        STATE.redditReady = Api.reddit().catch(() => []).then(reddit => {
          STATE.redditAll = reddit;
          buildRedditIndex(reddit);
          EL["kpi-reddit"].textContent = getSourceCounts().reddit;
          // Recompute sidebar toggle counts now that reddit index is populated
          const list = STATE.candidates.length ? STATE.candidates : STATE.rawVersions;
          if (list.length) paintFixedCounts(computeAggregates(list));
          // Re-render rendered feed cards so reddit posts and chips appear
          refreshRenderedGroupsWithReddit();
          updateCommunityBracket();
          if (G_ACTIVE && G_VIS_LOADED) gBuildAndRender(gGetVersions(), STATE.redditAll);
          // "Highest risk" and "Most sources" both read reddit data that
          // wasn't in yet on whichever earlier call actually computed the
          // current group order, same pattern as ensureLlmVersionsLoaded
          // re-running applyFilters() only when the LLM toggle is the
          // reason its own data matters right now.
          const fs = getFeedSort();
          if (fs === "risk" || fs === "sources") applyFilters();
        });
      }
      return STATE.redditReady;
    }

    // Loads the full, date-window-independent LLM dataset in the background — AI
    // model releases are sparse enough in time that the default LOOKBACK_DAYS feed
    // essentially never contains any, so the "AI Models" KPI/toggle count would
    // otherwise show 0 even when real data exists (as it currently does).
    function ensureLlmVersionsLoaded() {
      if (!STATE.llmReady) {
        STATE.llmReady = Api.llmVersions().catch(() => []).then(list => {
          STATE.llmVersions = dedupeByVersionId([list]);
          STATE.llmVersionsLoaded = true;
          EL["btn-llm"].textContent = STATE.llmVersions.length;
          EL["kpi-llm"].textContent = STATE.llmVersions.length;
          refreshActivityChartLlmLine();
          // If the LLM toggle is already active, re-render now that data has landed.
          if (STATE.filters.toggles.has("llm")) applyFilters();
        });
      }
      return STATE.llmReady;
    }

    // Hypervisor counterpart of ensureLlmVersionsLoaded() — hypervisor releases are
    // sparse enough in time that the default feed window essentially never contains
    // any, so the "Hypervisors" KPI/toggle would otherwise sit at 0.
    function ensureHvVersionsLoaded() {
      if (!STATE.hvReady) {
        STATE.hvReady = Api.hypervisorVersions().catch(() => []).then(list => {
          STATE.hvVersions = dedupeByVersionId([list]);
          STATE.hvVersionsLoaded = true;
          EL["btn-hv"].textContent = STATE.hvVersions.length;
          EL["kpi-hv"].textContent = STATE.hvVersions.length;
          refreshActivityChartHvLine();
          if (STATE.filters.toggles.has("hv")) applyFilters();
        });
      }
      return STATE.hvReady;
    }

    // Turns a fetch/API failure into a plain-language message that still
    // states the real cause, rather than a bare "⚠️ Error: 502 Bad
    // Gateway" dump, which reads as a crash report to a viewer with no
    // reason to know what a gateway even is. Api.versions() throws
    // `new Error("${status} ${statusText}")` for a non-ok response; a
    // genuine network failure (offline, DNS, CORS) instead throws a
    // native error with no leading status code at all, so that case is
    // told apart by the absence of one, not assumed away.
    function friendlyFetchError(e) {
      const msg = String((e && e.message) || "");
      const m5xx = msg.match(/^5\d\d\b/);
      if (m5xx) {
        return { headline: `The server is temporarily unavailable (${m5xx[0]}).`, detail: "This isn't your connection; try again in a minute." };
      }
      const m4xx = msg.match(/^4\d\d\b/);
      if (m4xx) {
        return { headline: `That request was rejected (${m4xx[0]}).`, detail: "Try reloading the page." };
      }
      return { headline: "Can't reach the server right now.", detail: "Check your connection and try again." };
    }

    // Single shared "nothing to show" surface for every reason the feed
    // can come up empty: a plain over-filtered search, a component with
    // nothing inside the day window, or a genuine fetch failure. Before
    // this, a failed fetch wrote its own ad-hoc error paragraph straight
    // into #feed while the unrelated pagination sentinel independently
    // set itself to "No results" and #status said "Failed to load," all
    // three visible at once, none of them coordinated (see this file's
    // own GLOBAL RULE on redundant elements). Routing every case through
    // here means #emptyState.show ~ #sentinel (that same rule's fix)
    // suppresses the sentinel regardless of which reason triggered this.
    function showEmptyState(message, opts) {
      opts = opts || {};
      EL.emptyState.classList.toggle("emptyState-error", !!opts.isError);
      EL.emptyState.classList.add("show");
      if (EL.emptyStateIcon) EL.emptyStateIcon.textContent = opts.icon || "🔍";
      if (EL.emptyStateMsg) EL.emptyStateMsg.textContent = message;
      if (EL.emptyStateDetail) {
        EL.emptyStateDetail.textContent = opts.detail || "";
        EL.emptyStateDetail.hidden = !opts.detail;
      }
    }
    function hideEmptyState() {
      EL.emptyState.classList.remove("show", "emptyState-error");
    }

    // The five most recently released distinct components, shown under the prompt on the
    // Ask home until a question is asked. Reads the same list the feed renders.
    function renderHomeLatest() {
      const host = document.getElementById("askHomeLatest");
      if (!host) return;
      const seen = new Set();
      const rows = [];
      for (const v of STATE.rawVersions) {
        if (v.isCve) continue;
        const name = String(v.versionProductName || v.sourceBot || "").trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        rows.push({ name, v });
        if (rows.length >= 5) break;
      }
      if (!rows.length) { host.hidden = true; return; }
      host.querySelector("ul").innerHTML = rows.map(({ name, v }) => {
        const d = String(v.versionReleaseDate || "");
        const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
        return `<li><strong>${uaEsc(name)}</strong>`
          + `<span class="m">${uaEsc(v.versionNumber || "")}</span>`
          + `<span class="m">${uaEsc(v.versionReleaseChannel || "")}</span>`
          + `<span class="m">${uaEsc(date)}</span></li>`;
      }).join("");
      host.hidden = false;
    }

    async function boot() {
      EL.status.textContent = "Loading…";
      EL.navLoader.classList.add("active");
      EL.feed.innerHTML = "";
      hideEmptyState();
      STATE.groupIndex = 0;
      STATE.nextCursor = null;
      STATE.rawVersions = [];

      try {
        const rawQ = new URL(location.href).searchParams.get("q") || "";
        EL.components.value = rawQ;
        STATE.filters.components = tokens(rawQ);
        setLinksHref();

        // Restore a quick-filter toggle from the URL, e.g. ?type=llm — lets a link
        // like releasetrain.io/?type=llm land with that filter already active.
        const typeParam = (new URL(location.href).searchParams.get("type") || "").toLowerCase().trim();
        if (typeParam) {
          const btn = document.querySelector(`#fixedToggles .toggle[data-key="${CSS.escape(typeParam)}"]`);
          if (btn && !btn.classList.contains("disabled")) {
            STATE.filters.toggles.add(typeParam);
            btn.setAttribute("aria-pressed", "true");
            refreshActiveFilters();
          }
        }

        // First page only — renders immediately, more loaded lazily as user scrolls
        trackSearch(rawQ);
        // Run alongside the feed's own fetch, not before it: neither
        // depends on the other, and every LOOKBACK_* consumer below
        // (sorting, applyFilters, the activity chart) only runs once
        // both have settled, so there's nothing to gain by sequencing
        // them.
        const [{ versions: vers, nextCursor }] = await Promise.all([
          Api.versions(rawQ),
          lookbackDaysReady,
        ]);
        STATE.nextCursor = nextCursor;

        if (!vers.length) {
          EL.status.textContent = "No versions found";
          showEmptyState("No versions found for that search.");
          return;
        }

        vers.sort((a, b) => (versionTime(b) || +new Date(b.versionTimestampLastUpdate || b.versionTimestamp || 0)) - (versionTime(a) || +new Date(a.versionTimestampLastUpdate || a.versionTimestamp || 0)));
        STATE.rawVersions = vers;
        applyFilters();
        renderHomeLatest();

        // Reddit, LLM and hypervisor datasets load in background — never block the feed
        ensureRedditLoaded();
        ensureLlmVersionsLoaded();
        ensureHvVersionsLoaded();
      } catch (e) {
        console.error(e);
        EL.feed.innerHTML = "";
        const { headline, detail } = friendlyFetchError(e);
        showEmptyState(headline, { icon: "⚠️", detail, isError: true });
        EL.status.textContent = "Failed to load";
      } finally {
        EL.navLoader.classList.remove("active");
      }
    }

    /* ── Events ───────────────────────────────────────────────── */
    EL.filterForm.addEventListener("submit", async e => {
      e.preventDefault();
      const input = EL.components.value.replace(/ /g, " ").replace(/\s*,\s*/g, ",").trim();
      history.replaceState({}, "", buildHrefWithQ(location.pathname, input));
      setLinksHref();
      EL.status.textContent = "Filtering…";
      EL.navLoader.classList.add("active");
      try {
        STATE.filters.components = tokens(input);
        if (DB_ACTIVE) riPopulateVersions();
        STATE.nextCursor = null;
        STATE.rawVersions = [];
        trackSearch(input);
        const { versions: vers, nextCursor: nc } = await Api.versions(input);
        STATE.nextCursor = nc;
        if (!vers.length) {
          EL.feed.innerHTML = "";
          showEmptyState("No versions found for that search.");
          EL.status.textContent = "No versions";
          return;
        }
        vers.sort((a, b) => (versionTime(b) || +new Date(b.versionTimestampLastUpdate || b.versionTimestamp || 0)) - (versionTime(a) || +new Date(a.versionTimestampLastUpdate || a.versionTimestamp || 0)));
        STATE.rawVersions = vers;
        applyFilters();
      } catch (e) { console.error(e); EL.status.textContent = friendlyFetchError(e).headline; }
      finally { EL.navLoader.classList.remove("active"); }
    });

    EL.clearBtn.addEventListener("click", () => {
      EL.components.value = "";
      // #components is the hidden internal-only mirror now (see
      // #filterForm's own comment). #askQuestion is what the user
      // actually typed into and sees, so Clear needs to reset that too.
      const askQ = document.getElementById("askQuestion");
      if (askQ) askQ.value = "";
      hideAskRail();
      STATE.filters.components = [];
      STATE.filters.toggles.clear();
      history.replaceState({}, "", buildHrefWithQ(location.pathname, ""));
      setLinksHref();
      $$("#fixedToggles .toggle, #typeToggles .toggle").forEach(b => b.setAttribute("aria-pressed", "false"));
      refreshActiveFilters();
      if (DB_ACTIVE) riPopulateVersions();
      boot();
    });

    EL.fixedToggles.addEventListener("click", e => {
      const btn = e.target.closest(".toggle");
      if (!btn || btn.classList.contains("disabled")) return;
      const key = btn.dataset.key, on = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", on ? "false" : "true");
      on ? STATE.filters.toggles.delete(key) : STATE.filters.toggles.add(key);
      // Only "llm" / "hv" round-trip to the URL (see setTypeParam) — shareable
      // ?type=llm / ?type=hv links, not a general mechanism for every toggle.
      if (key === "llm" || key === "hv") setTypeParam(on ? null : key);
      refreshActiveFilters();
      applyFilters();
    });

    EL.afClearAll.addEventListener("click", () => {
      STATE.filters.toggles.clear();
      $$("#fixedToggles .toggle, #typeToggles .toggle").forEach(b => b.setAttribute("aria-pressed", "false"));
      setTypeParam(null);
      refreshActiveFilters();
      applyFilters();
    });

    /* ── Autocomplete ─────────────────────────────────────────── */
    // #components/#suggestions (this pool's original home) are hidden,
    // internal-only now that Search and Ask are one box. See the merged
    // askQuestion typeahead above, which is the real consumer of
    // suggestionPool/getCurrentToken/replaceCurrentToken/highlightMatch.
    let suggestionPool = [];

    // Full distinct-component-name list from the server (not just what's currently
    // loaded in the feed). Without this, searching for e.g. "Mistral" or "Ollama"
    // wouldn't even suggest the name unless one of their releases happened to fall
    // inside the current LOOKBACK_DAYS window and had already been paginated in.
    let _allComponentNames = null;
    let _allComponentNamesPromise = null;
    function ensureAllComponentNames() {
      if (_allComponentNamesPromise) return _allComponentNamesPromise;
      _allComponentNamesPromise = fetch(API_BASE + "c/names")
        .then(r => r.ok ? r.json() : [])
        .then(arr => { _allComponentNames = (Array.isArray(arr) ? arr : []).map(norm).filter(Boolean); })
        .catch(() => { _allComponentNames = _allComponentNames || []; });
      return _allComponentNamesPromise;
    }

    function buildSuggestionPool() {
      const names = new Set(_allComponentNames || []);
      for (const v of STATE.rawVersions) {
        const n = norm(v.versionProductName);
        if (n) names.add(n);
        if (Array.isArray(v.versionSearchTags)) {
          for (const t of v.versionSearchTags) { const tn = norm(t); if (tn) names.add(tn); }
        }
      }
      suggestionPool = Array.from(names).sort();
    }

    function getCurrentToken(val) {
      const parts = val.split(",");
      return parts[parts.length - 1].trimStart();
    }

    function replaceCurrentToken(val, replacement) {
      const parts = val.split(",");
      parts[parts.length - 1] = parts.length > 1 ? " " + replacement : replacement;
      return parts.join(",") + ", ";
    }

    function highlightMatch(str, query) {
      const idx = str.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return str;
      return str.slice(0, idx) + `<strong>${str.slice(idx, idx + query.length)}</strong>` + str.slice(idx + query.length);
    }

    /* ── Community bracket ── uses aggregate API counts when available ── */
    function updateCommunityBracket() {
      if (_homeRTotalNum == null) return;
      let todayN, yestN;
      if (_rTodayApi != null) {
        todayN = _rTodayApi; yestN = _rYestApi ?? 0;
      } else {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const yestStart = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
        const todayMs = todayStart.getTime(), yestMs = yestStart.getTime();
        todayN = 0; yestN = 0;
        for (const p of STATE.redditAll) {
          const t = redditTime(p);
          if (t >= todayMs) todayN++;
          else if (t >= yestMs) yestN++;
        }
      }
      const fmtN = n => n.toLocaleString();
      const pct = yestN ? Math.round((todayN - yestN) / yestN * 100) : null;
      const deltaHtml = pct != null
        ? `, <span class="rt-c u-bold" style="--rt-c:${pct > 0 ? '#475569' : pct < 0 ? '#dc2626' : '#6b7280'}">${pct >= 0 ? '+' : ''}${pct}%</span>`
        : '';
      const el = document.getElementById('home-r-total');
      if (el) el.innerHTML = fmtN(_homeRTotalNum) + ` [${fmtN(todayN)} today${deltaHtml}]`;
    }

    /* ── Sidebar activity chart ── only loadHomeStats calls this ── */
    // llmData / hvData are best-effort: there's no server-side "X releases per day"
    // aggregate endpoint for either, so they're computed client-side from the full
    // LLM / hypervisor datasets at render time (see refreshActivityChart*Line,
    // called once boot() / the background fetches have loaded data).
    function updateActivityChart(labels, vData, cveData, rData, llmData, hvData) {
      const canvas = document.getElementById('home-activity-chart');
      if (!canvas) return;
      _activityDays = labels;
      const doRender = () => {
        try {
          if (_activityChart) { try { _activityChart.destroy(); } catch (_) {} _activityChart = null; }
          _activityChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [
              { label: 'Versions',  data: vData,   borderColor: '#2563eb', backgroundColor: 'rgba(99,102,241,0.10)', tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: true },
              { label: 'CVE',       data: cveData, borderColor: '#dc2626', backgroundColor: 'rgba(239,68,68,0.07)',   tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: false },
              { label: 'Community', data: rData,   borderColor: '#64748b', backgroundColor: 'rgba(34,197,94,0.07)',  tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: true },
              { label: 'LLM',       data: llmData || labels.map(() => 0), borderColor: '#475569', backgroundColor: 'rgba(124,58,237,0.08)', tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: false },
              { label: 'Hypervisor', data: hvData || labels.map(() => 0), borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.08)', tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: false },
            ]},
            options: {
              responsive: true, maintainAspectRatio: false, animation: false,
              plugins: {
                // Labeled and clickable — Chart.js's default legend behavior toggles a
                // line's visibility on click, which is exactly the enable/disable ask.
                legend: {
                  display: true, position: 'bottom',
                  labels: { boxWidth: 8, boxHeight: 8, font: { size: 9 }, color: '#6b7280', padding: 6, usePointStyle: true }
                },
                tooltip: { mode: 'index', intersect: false, bodyFont: { size: 10 }, titleFont: { size: 10 } }
              },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9ca3af', maxRotation: 0 } },
                y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9 }, color: '#9ca3af', maxTicksLimit: 3 }, beginAtZero: true }
              }
            }
          });
        } catch (e) { console.warn('[activity-chart]', e); }
      };
      if (typeof Chart !== 'undefined') { doRender(); }
      else if (!_chartJsLoading) {
        _chartJsLoading = true;
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = () => { _chartJsLoading = false; doRender(); };
        document.head.appendChild(s);
      }
    }

    // Best-effort LLM-per-day counts from whatever's currently in STATE.rawVersions
    // (no server-side aggregate endpoint for this yet, unlike the other three lines).
    function computeLlmDailyFromRaw(dayStrs) {
      const counts = Object.fromEntries(dayStrs.map(s => [s, 0]));
      // Source of truth is STATE.llmVersions (full, date-window-independent dataset,
      // see ensureLlmVersionsLoaded) once it's loaded — STATE.rawVersions alone almost
      // never has any LLM docs, since AI model releases are sparse enough in time that
      // they rarely fall inside the default feed window. Falls back to rawVersions
      // before that dataset has landed so the chart still renders something on first paint.
      const source = STATE.llmVersionsLoaded ? STATE.llmVersions : STATE.rawVersions;
      for (const v of source) {
        if (!isLLMVersion(v)) continue;
        const d = String(v.versionReleaseDate || '').trim().replace(/-/g, '');
        if (Object.prototype.hasOwnProperty.call(counts, d)) counts[d]++;
      }
      return dayStrs.map(s => counts[s]);
    }

    // Re-paints just the LLM dataset once boot()/ensureLlmVersionsLoaded() has actually
    // populated real data (loadHomeStats renders the chart independently/earlier, so
    // the LLM line starts flat).
    function refreshActivityChartLlmLine() {
      if (!_activityChart || !_activityDayStrs) return;
      const ds = _activityChart.data?.datasets?.find(d => d.label === 'LLM');
      if (!ds) return;
      ds.data = computeLlmDailyFromRaw(_activityDayStrs);
      try { _activityChart.update('none'); } catch (_) {}
    }

    // Hypervisor counterpart of computeLlmDailyFromRaw — same fallback logic.
    function computeHvDailyFromRaw(dayStrs) {
      const counts = Object.fromEntries(dayStrs.map(s => [s, 0]));
      const source = STATE.hvVersionsLoaded ? STATE.hvVersions : STATE.rawVersions;
      for (const v of source) {
        if (!isHypervisorVersion(v)) continue;
        const d = String(v.versionReleaseDate || '').trim().replace(/-/g, '');
        if (Object.prototype.hasOwnProperty.call(counts, d)) counts[d]++;
      }
      return dayStrs.map(s => counts[s]);
    }

    function refreshActivityChartHvLine() {
      if (!_activityChart || !_activityDayStrs) return;
      const ds = _activityChart.data?.datasets?.find(d => d.label === 'Hypervisor');
      if (!ds) return;
      ds.data = computeHvDailyFromRaw(_activityDayStrs);
      try { _activityChart.update('none'); } catch (_) {}
    }

    // Load the full component name list in the background so autocomplete can suggest
    // e.g. "Mistral" or "Ollama" even before/without any of their releases being loaded
    // into the current feed window. Rebuild the pool once it lands.
    ensureAllComponentNames().then(() => buildSuggestionPool());

    // Fetch live collection stats for home sidebar on page load
    (async function loadTopSearches() {
      const listEl = document.getElementById("top-searches-list");
      if (!listEl) return;
      try {
        const res = await fetch(API_BASE + "events/search/top?n=3");
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const items = data.data || [];
        if (!items.length) {
          listEl.innerHTML = '<span class="st-224" >No searches yet.</span>';
          return;
        }
        listEl.innerHTML = items.map(item => {
          const q = normalizeQuery(item.query);
          if (!q) return "";
          return '<a href="/?q=' + encodeCsvKeepCommas(q) + '" class="u-show-flex st-225" >'
            + '<span class="st-201" >' + q.replace(/&/g,"&amp;").replace(/</g,"&lt;") + '</span>'
            + '<span class="st-226" >' + item.count + (item.count === 1 ? ' search' : ' searches') + '</span>'
            + '</a>';
        }).filter(Boolean).join("");
      } catch {
        listEl.innerHTML = '<span class="st-224" >Could not load.</span>';
      }
    })();

    (async function loadHomeStats() {
      // Runs concurrently with boot() at page load, not after it; without
      // this, the LOOKBACK_DAYS-sized day array below could be built from
      // the fallback value if this resolves first, a live race that would
      // show a different window here than the feed itself ends up using.
      await lookbackDaysReady;
      const fmtDate = d => d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
      const today = new Date();
      const fmt = n => typeof n === 'number' ? n.toLocaleString() : '—';
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
      const fmtSize = bytes => { const mb = bytes / (1024*1024); return mb < 1 ? (bytes/1024).toFixed(0)+' KB' : mb.toFixed(1)+' MB'; };
      const colorDelta = (todayN, yestN) => {
        if (!yestN || !todayN) return '';
        const pct = Math.round((todayN - yestN) / yestN * 100);
        const sign = pct >= 0 ? '+' : '';
        const color = pct > 0 ? '#475569' : pct < 0 ? '#dc2626' : '#6b7280';
        return `, <span class="st-227 rt-c" style="--rt-c:${color}">${sign}${pct}%</span>`;
      };
      // Build LOOKBACK_DAYS-day date array (oldest → today)
      const days = Array.from({ length: LOOKBACK_DAYS }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (LOOKBACK_DAYS - 1 - i));
        return { str: fmtDate(d), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      });
      try {
        const startStr = days[0].str, endStr = days[LOOKBACK_DAYS - 1].str;
        const [vData, rData, vByDay, cveByDay, rByDay] = await Promise.all([
          fetch('https://releasetrain.io/api/v/count').then(r => r.json()).catch(() => null),
          fetch('https://releasetrain.io/api/reddit/count').then(r => r.json()).catch(() => null),
          fetch(`https://releasetrain.io/api/aggregate/v/versionCountByDay?start=${startStr}&end=${endStr}`).then(r => r.json()).catch(() => null),
          fetch(`https://releasetrain.io/api/aggregate/v/cveCountByDay?start=${startStr}&end=${endStr}`).then(r => r.json()).catch(() => null),
          fetch(`https://releasetrain.io/api/aggregate/reddit/countByDay?start=${startStr}&end=${endStr}`).then(r => r.json()).catch(() => null),
        ]);
        // Map sparse per-day results (only dates with data) to the full LOOKBACK_DAYS-day array
        const vMap   = Object.fromEntries((vByDay?.days   ?? []).map(d => [d._id, d.count]));
        const cveMap = Object.fromEntries((cveByDay?.days ?? []).map(d => [d._id, d.count]));
        const rMap   = Object.fromEntries((rByDay?.days   ?? []).map(d => [d._id, d.count]));
        const vDaily   = days.map(d => vMap[d.str]   ?? 0);
        const cveDaily = days.map(d => cveMap[d.str] ?? 0);
        const rDaily   = days.map(d => rMap[d.str]   ?? 0);
        const vTodayN = vDaily[LOOKBACK_DAYS - 1], vYestN = vDaily[LOOKBACK_DAYS - 2];
        _rTodayApi = rDaily[LOOKBACK_DAYS - 1]; _rYestApi = rDaily[LOOKBACK_DAYS - 2];
        if (vData) {
          const vTotal = vData.totalVersions, vCve = vData.cveCount ?? 0, vNon = vData.nonCveCount ?? (vTotal - vCve);
          const vBracket = vTodayN > 0 ? ` [${fmt(vTodayN)} today${colorDelta(vTodayN, vYestN)}]` : '';
          setHtml('home-v-total', fmt(vTotal) + vBracket);
          setText('home-v-cve', fmt(vCve));
          setText('home-v-noncve', fmt(vNon));
          setText('dsb-v-total', fmt(vTotal));
          setText('dsb-v-cve', fmt(vCve));
          setText('dsb-v-noncve', fmt(vNon));
          setText('dsb-v-size', fmtSize(vTotal * 800) + ' / 5 MB');
        }
        if (rData) {
          _homeRTotalNum = rData.totalRedditPosts;
          const rReddit = rData.redditCount ?? 0, rSO = rData.stackoverflowCount ?? 0, rSF = rData.serverfaultCount ?? 0;
          setHtml('home-r-total', fmt(_homeRTotalNum));
          setText('home-r-reddit', fmt(rReddit));
          setText('home-r-so', fmt(rSO));
          setText('home-r-sf', fmt(rSF));
          setText('dsb-r-total', fmt(_homeRTotalNum));
          setText('dsb-r-reddit', fmt(rReddit));
          setText('dsb-r-so', fmt(rSO));
          setText('dsb-r-sf', fmt(rSF));
          setText('dsb-r-size', fmtSize(_homeRTotalNum * 2000) + ' / 5 MB');
          updateCommunityBracket();
        }
        _activityDayStrs = days.map(d => d.str);
        updateActivityChart(days.map(d => d.label), vDaily, cveDaily, rDaily, computeLlmDailyFromRaw(_activityDayStrs), computeHvDailyFromRaw(_activityDayStrs));
      } catch (_) { /* stats are non-critical */ }
    })();

    setupObserver();
    boot().then(async () => {
      refreshActivityChartLlmLine(); // STATE.rawVersions is populated now — repaint the LLM line for real
      refreshActivityChartHvLine();
      const view = new URL(location.href).searchParams.get("view");
      if (view === "graph") {
        activateGraph();
        EL.navLoader.classList.add("active");
        try { await gLoadVisNetwork(); } finally { EL.navLoader.classList.remove("active"); }
        gBuildAndRender(gGetVersions(), STATE.redditAll);
      } else if (view === "arch") {
        activateArch();
        EL.navLoader.classList.add("active");
        try { await aLoadPako(); } finally { EL.navLoader.classList.remove("active"); }
        aLoadAndRender();
      } else if (view === "docs") {
        activateDocs();
      } else if (view === "cve") {
        activateCve();
      } else if (view === "risk") {
        activateDashboard();
      } else if (view === "release") {
        activateNetwork();
      } else if (view === "credits") {
        activateAck();
      } else if (view === "changelog") {
        activateChangelog();
      } else if (view === "account") {
        activateUsers();
      } else if (view === "eval-rewriter") {
        // Admin-only: a shared/bookmarked URL from a non-admin session
        // silently falls through to the normal feed instead of erroring.
        const u = uaUser();
        if (u && u.role === "admin") activateEvalRewriter();
      } else if (view === "eval-evaluator") {
        const u = uaUser();
        if (u && u.role === "admin") activateEvalEvaluator();
      } else if (view === "eval-orchestrator") {
        const u = uaUser();
        if (u && u.role === "admin") activateEvalOrchestrator();
      }
    });

    /* ── CVE Module ──────────────────────────────────────────── */
    let CV_ACTIVE = false, CV_INIT = false;

    const CV_API_BASE = API_BASE.replace(/\/$/, ''); // same endpoint, no trailing slash
    const CV_BATCH    = 250;

    const CV_NVD_STATUSES = [
      { key: 'received',    label: 'Received',               cls: 'nvd-received',   bar: 'info',  desc: 'CVE recently published to the CVE List.' },
      { key: 'awaiting',   label: 'Awaiting Enrichment',     cls: 'nvd-awaiting',   bar: '',      desc: 'Marked for NVD enrichment efforts.' },
      { key: 'undergoing', label: 'Undergoing Enrichment',   cls: 'nvd-undergoing', bar: 'warn',  desc: 'Currently being enriched by the NVD team.' },
      { key: 'enriched',   label: 'Enriched',                cls: 'nvd-enriched',   bar: 'ok',    desc: 'NVD enrichment complete.' },
      { key: 'modified',   label: 'Modified After Enrichment', cls: 'nvd-modified', bar: 'warn',  desc: 'Record updated after enrichment was complete.' },
      { key: 'deferred',   label: 'Not Scheduled',           cls: 'nvd-deferred',   bar: 'muted', desc: 'Not currently scheduled for NVD enrichment.' },
      { key: 'rejected',   label: 'Rejected',                cls: 'nvd-rejected',   bar: 'bad',   desc: 'Marked Rejected in the CVE List.' },
      { key: 'unknown',    label: 'No History',              cls: 'nvd-unknown',    bar: 'muted', desc: 'No NVD change history captured.' },
    ];
    const CV_NVD_BY_KEY = Object.fromEntries(CV_NVD_STATUSES.map(s => [s.key, s]));

    const CV_EL = {};
    function cvCacheEl() {
      ['statusBar','statusText','loadProgress','loadProgressFill',
       'postList','cveSearch','statusFilter','versionFilter','sortSelect','timelineBadge',
       'srcTabs','tabCountAll','tabCountReddit','tabCountStackoverflow','tabCountOther',
       'nvdPipelineFlow','pipelineRange',
       'aggStatus','aggSource','aggCompType','aggSecType','aggSubreddit','aggMonthly'
      ].forEach(id => { CV_EL[id] = document.getElementById(id); });
    }

    const CV_STATE = {
      all: [], filtered: [], totalCount: 0,
      sourceFilter: '',
      nonCveProductSet: null, latestProductSet: null,
    };

    function cvSetStatus(msg, type = '') {
      if (!CV_EL.statusText) return;
      CV_EL.statusText.textContent = msg;
      CV_EL.statusBar.className = type;
    }

    function cvSetProgress(loaded, total) {
      if (!CV_EL.loadProgressFill) return;
      const pct = total > 0 ? Math.min(100, Math.round(loaded / total * 100)) : 0;
      CV_EL.loadProgressFill.classList.add("rt-w");
      CV_EL.loadProgressFill.style.setProperty("--rt-w", pct + "%");
    }

    async function cvFetchBatch(cursor = null) {
      const params = new URLSearchParams({ q: 'CVE-', limit: String(CV_BATCH), showCount: 'true' });
      if (cursor) params.set('cursor', cursor);
      const r = await fetch(`${CV_API_BASE}/reddit/query/cve?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }

    async function cvLoadAll() {
      if (!CV_EL.loadProgress) return;
      setDisplay(CV_EL.loadProgress, 'block');
      try {
        const first = await cvFetchBatch();
        CV_STATE.totalCount = first.totalCount ?? first.data?.length ?? 0;
        CV_STATE.all        = first.data ?? [];
        cvSetStatus(`Loading ${CV_STATE.all.length} of ${CV_STATE.totalCount}…`);
        cvSetProgress(CV_STATE.all.length, CV_STATE.totalCount);
        cvApplyFilter();
        cvRenderAggregates();
        let cursor = first.cursor ?? null;
        while (cursor) {
          const batch = await cvFetchBatch(cursor);
          const items = batch.data ?? [];
          const existingIds = new Set(CV_STATE.all.map(p => p._id || p.redditId || p.id));
          CV_STATE.all = [...CV_STATE.all, ...items.filter(p => !existingIds.has(p._id || p.redditId || p.id))];
          cursor = batch.cursor ?? null;
          cvSetStatus(`Loading ${CV_STATE.all.length} of ${CV_STATE.totalCount}…`);
          cvSetProgress(CV_STATE.all.length, CV_STATE.totalCount);
          cvApplyFilter();
          cvRenderAggregates();
        }
        cvSetStatus(`${CV_STATE.all.length} CVE posts loaded`, 'done');
        setDisplay(CV_EL.loadProgress, 'none');
        cvFetchVersionIndex();
      } catch (e) {
        cvSetStatus('Failed to load: ' + e.message, 'error');
        if (CV_EL.postList) CV_EL.postList.innerHTML = `<li class="empty-state"><div class="icon">⚠️</div>${cvEscHtml(e.message)}</li>`;
        if (CV_EL.loadProgress) setDisplay(CV_EL.loadProgress, 'none');
      }
    }

    async function cvFetchVersionIndex() {
      try {
        const r = await fetch(`${CV_API_BASE}/v/search?isCve=false&limit=500&fields=versionId,versionNumber,versionProductName`);
        if (!r.ok) return;
        const json = await r.json();
        const versions = json.data ?? [];
        CV_STATE.nonCveProductSet = new Set(versions.map(v => (v.versionProductName ?? '').toLowerCase()).filter(Boolean));
        const latestByComp = {};
        versions.forEach(v => {
          const comp = cvCompFromVersionId(v.versionId);
          const dateStr = (v.versionId ?? '').slice(0, 8);
          if (!latestByComp[comp] || dateStr > latestByComp[comp].date)
            latestByComp[comp] = { date: dateStr, product: (v.versionProductName ?? '').toLowerCase() };
        });
        CV_STATE.latestProductSet = new Set(Object.values(latestByComp).map(v => v.product).filter(Boolean));
        cvApplyFilter();
      } catch (e) { console.warn('Version index fetch failed:', e); }
    }

    function cvGetSource(post) {
      const url = (post.url ?? '').toLowerCase();
      if (url.includes('reddit.com') || post.subreddit) return 'reddit';
      if (url.includes('stackoverflow.com') || url.includes('stackexchange.com')) return 'stackoverflow';
      return 'other';
    }

    function cvApplyFilter() {
      if (!CV_EL.cveSearch) return;
      const q      = CV_EL.cveSearch.value.trim().toLowerCase();
      const srt    = CV_EL.sortSelect?.value ?? 'date-desc';
      const stFilt = CV_EL.statusFilter?.value ?? '';
      const vFilt  = CV_EL.versionFilter?.value ?? '';
      const srcF   = CV_STATE.sourceFilter;

      let list = CV_STATE.all.filter(p => {
        if (srcF && cvGetSource(p) !== srcF) return false;
        if (q) {
          const cveIds = (p.detectedCVEs ?? []).flatMap(c => c.cveIds ?? (c.cveId ? [c.cveId] : [])).join(' ').toLowerCase();
          if (!cveIds.includes(q) && !(p.title ?? '').toLowerCase().includes(q) &&
              !(p.subreddit ?? '').toLowerCase().includes(q) && !(p.author ?? '').toLowerCase().includes(q)) return false;
        }
        if (stFilt && cvCurrentNvdStatus(p) !== stFilt) return false;
        if (vFilt) {
          const productSet = vFilt === 'has-noncve' ? CV_STATE.nonCveProductSet : CV_STATE.latestProductSet;
          if (productSet !== null) { const sub = (p.subreddit ?? '').toLowerCase(); if (!sub || !productSet.has(sub)) return false; }
        }
        return true;
      });

      list = list.slice().sort((a, b) => {
        switch (srt) {
          case 'date-asc':      return cvTs(a) - cvTs(b);
          case 'score-desc':    return (b.score ?? 0) - (a.score ?? 0);
          case 'comments-desc': return (b.num_comments ?? 0) - (a.num_comments ?? 0);
          case 'ratio-desc':    return (b.upvote_ratio ?? 0) - (a.upvote_ratio ?? 0);
          default:              return cvTs(b) - cvTs(a);
        }
      });
      CV_STATE.filtered = list;
      cvRenderTimeline();
    }

    function cvTs(p) { return p.created_utc ? new Date(p.created_utc).getTime() : 0; }

    const _cvNvdCache = new WeakMap();
    function cvCurrentNvdStatus(post) {
      if (_cvNvdCache.has(post)) return _cvNvdCache.get(post);
      const cves = post.detectedCVEs ?? [];
      let result = 'unknown';
      for (const cve of cves) {
        if (cve.cveChangeHistory?.trim()) {
          const entries = cvParseCveHistory(cve.cveChangeHistory);
          if (entries.length) { result = entries[entries.length - 1].statusKey; break; }
        }
      }
      _cvNvdCache.set(post, result);
      return result;
    }

    function cvRenderTimeline() {
      if (!CV_EL.postList) return;
      if (CV_EL.timelineBadge) CV_EL.timelineBadge.textContent = CV_STATE.filtered.length;
      const frag = document.createDocumentFragment();
      if (!CV_STATE.filtered.length) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        li.innerHTML = '<div class="icon">🔍</div>No posts match your filter.';
        frag.appendChild(li);
        CV_EL.postList.replaceChildren(frag);
        return;
      }
      CV_STATE.filtered.forEach(post => frag.appendChild(cvBuildPostCard(post)));
      CV_EL.postList.replaceChildren(frag);
    }

    function cvBuildPostCard(post) {
      const cves = post.detectedCVEs ?? [];
      const allCveIds = [...new Set(cves.flatMap(c => c.cveIds ?? (c.cveId ? [c.cveId] : [])))];
      const secTypes = post.classification?.securityType ?? [];
      const compTypes = post.classification?.componentType ?? [];
      const curStatus = cvCurrentNvdStatus(post);
      const nvdMeta = CV_NVD_BY_KEY[curStatus] ?? CV_NVD_BY_KEY.unknown;
      const date = post.created_utc ? cvFmtDate(post.created_utc) : '';
      const ratio = typeof post.upvote_ratio === 'number' ? Math.round(post.upvote_ratio * 100) : null;

      const li = document.createElement('li'); li.className = 'post-card';
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.className = 'post-summary';
      const meta = document.createElement('div'); meta.className = 'post-meta';

      const titleDiv = document.createElement('div'); titleDiv.className = 'post-title';
      const a = document.createElement('a');
      a.href = post.url ?? '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = cvDecodeHtml(post.title ?? '(no title)');
      titleDiv.appendChild(a);

      const chips = document.createElement('div'); chips.className = 'post-chips';
      allCveIds.forEach(id => chips.appendChild(cvMkCveChip(id)));
      chips.appendChild(cvMkSourceChip(post));
      secTypes.forEach(t => chips.appendChild(cvMkChip(t, 'sec')));
      compTypes.forEach(t => chips.appendChild(cvMkChip(t, 'info')));
      const badge = document.createElement('span');
      badge.className = 'nvd-badge ' + nvdMeta.cls;
      badge.textContent = nvdMeta.label; badge.title = nvdMeta.desc;
      chips.appendChild(badge);

      const row2 = document.createElement('div'); row2.className = 'post-row2';
      row2.innerHTML = `<span>📅 ${date}</span><span>⬆ ${post.score ?? 0}</span><span>💬 ${post.num_comments ?? 0}</span>` +
        (ratio !== null ? `<span><span class="score-bar"><span class="score-fill rt-w" style="--rt-w:${ratio}%"></span></span> ${ratio}%</span>` : '') +
        `<span>👤 ${cvEscHtml(post.author ?? '')}</span>`;

      meta.appendChild(titleDiv); meta.appendChild(chips); meta.appendChild(row2);
      summary.appendChild(meta); details.appendChild(summary);

      const detail = document.createElement('div'); detail.className = 'post-detail';
      if (post.author_description?.trim()) {
        const desc = document.createElement('div'); desc.className = 'detail-description reddit-body';
        desc.appendChild(cvHighlightCveIds(cvDecodeHtml(post.author_description).trim()));
        detail.appendChild(desc);
      }
      cves.forEach(cve => detail.appendChild(cvBuildCveTimeline(post, cve)));
      if (!cves.some(c => c.cveChangeHistory?.trim())) detail.appendChild(cvBuildRedditOnlyTimeline(post));

      details.addEventListener('toggle', function onToggle() {
        if (!details.open) return;
        details.removeEventListener('toggle', onToggle);
        cvEnrichTimeline(post, detail);
      });

      details.appendChild(detail); li.appendChild(details);
      return li;
    }

    function cvBuildCveTimeline(post, cve) {
      const wrap = document.createElement('div');
      const label = document.createElement('div'); label.className = 'tl-section-label';
      const cveIds = cve.cveIds ?? (cve.cveId ? [cve.cveId] : []);
      if (cveIds.length) {
        cveIds.forEach((id, i) => {
          if (i > 0) label.appendChild(document.createTextNode(' · '));
          const a = document.createElement('a');
          a.href = 'https://nvd.nist.gov/vuln/detail/' + encodeURIComponent(id);
          a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.classList.add("link-dotted");
          a.textContent = id; label.appendChild(a);
        });
        label.appendChild(document.createTextNode(' · Event Timeline'));
      } else { label.textContent = 'Event Timeline'; }
      wrap.appendChild(label);

      const events = [];
      events.push({ ts: post.created_utc ? new Date(post.created_utc) : null, type: 'post',
        label: 'Reddit post published',
        sub: `r/${post.subreddit ?? '?'} · by ${post.author ?? '?'} · score ${post.score ?? 0}`,
        body: cvDecodeHtml(post.author_description ?? '').trim() || null, dotCls: 'dot-post' });

      cvParseCveHistory(cve.cveChangeHistory ?? '').forEach(e => {
        events.push({ ts: e.rawDate, type: 'cve',
          label: 'NVD Status: ' + (CV_NVD_BY_KEY[e.statusKey]?.label ?? e.action),
          sub: e.action, body: e.changes || null,
          dotCls: 'dot-' + e.statusKey, nvdKey: e.statusKey });
      });

      (post.comments ?? []).forEach(c => {
        events.push({ ts: c.created_utc ? new Date(c.created_utc) : null, type: 'comment',
          label: 'Comment by ' + (c.author ?? 'unknown'), sub: null,
          body: (c.body ?? '').slice(0, 500) + ((c.body ?? '').length > 500 ? '…' : ''),
          dotCls: 'dot-comment' });
      });

      events.sort((a, b) => { if (!a.ts && !b.ts) return 0; if (!a.ts) return 1; if (!b.ts) return -1; return a.ts - b.ts; });

      const tlWrap = document.createElement('div'); tlWrap.className = 'tl-wrap';
      events.forEach(ev => {
        const item = document.createElement('div'); item.className = 'tl-item';
        item.dataset.ts = ev.ts ? ev.ts.getTime() : '';
        const dot = document.createElement('div'); dot.className = 'tl-dot ' + ev.dotCls;
        item.appendChild(dot);
        const header = document.createElement('div'); header.className = 'tl-header';
        if (ev.ts) { const ds = document.createElement('span'); ds.className = 'tl-date'; ds.textContent = cvFmtDateTime(ev.ts); header.appendChild(ds); }
        const lbl = document.createElement('span'); lbl.className = 'tl-label'; lbl.textContent = ev.label; header.appendChild(lbl);
        if (ev.nvdKey) { const nb = document.createElement('span'); nb.className = 'nvd-badge nvd-' + ev.nvdKey; nb.textContent = CV_NVD_BY_KEY[ev.nvdKey]?.label ?? ev.nvdKey; header.appendChild(nb); }
        item.appendChild(header);
        if (ev.sub) { const sub = document.createElement('div'); sub.className = 'tl-sublabel'; sub.textContent = ev.sub; item.appendChild(sub); }
        if (ev.body) {
          const body = document.createElement('div');
          body.className = 'tl-body' + (ev.type === 'post' ? ' reddit-body' : ev.type === 'comment' ? ' comment-body' : '');
          body.appendChild(cvHighlightCveIds(ev.body)); item.appendChild(body);
        }
        tlWrap.appendChild(item);
      });
      const ph = document.createElement('div'); ph.className = 'tl-version-loading'; ph.textContent = 'Loading release context…';
      tlWrap.appendChild(ph);
      wrap.appendChild(tlWrap);
      return wrap;
    }

    function cvBuildRedditOnlyTimeline(post) {
      return cvBuildCveTimeline(post, { cveId: [], cveChangeHistory: '' });
    }

    function cvParseCveHistory(raw) {
      if (!raw?.trim()) return [];
      const lines = raw.split('\n'), entries = [];
      let current = null;
      lines.forEach(line => {
        const top = line.match(/^(\d+)\.\s+(\d{4}-\d{2}-\d{2}T[\d:.]+)\s*\|\s*([^|]+?)(?:\s*\|.*)?$/);
        if (top) {
          if (current) entries.push(current);
          const rawDate = cvParseDate(top[2]);
          const action = top[3].trim();
          current = { rawDate, date: rawDate ? cvFmtDateTime(rawDate) : top[2], action, statusKey: cvActionToStatusKey(action), changes: '' };
          return;
        }
        if (!current) return;
        const sub = line.match(/^\s+[-–]\s+(.+)$/);
        if (sub) { current.changes += (current.changes ? '\n' : '') + sub[1].trim(); return; }
        const cont = line.match(/^(\s{6,})(\S.*)$/);
        if (cont && current.changes) current.changes += '\n  ' + cont[2].trim();
      });
      if (current) entries.push(current);
      entries.sort((a, b) => { if (!a.rawDate && !b.rawDate) return 0; if (!a.rawDate) return 1; if (!b.rawDate) return -1; return a.rawDate - b.rawDate; });
      return entries;
    }

    function cvActionToStatusKey(action) {
      const a = (action ?? '').toLowerCase().trim();
      if (a === 'cve rejected' || a === 'rejected' || a.startsWith('reject')) return 'rejected';
      if (a === 'deferred' || a.includes('not scheduled')) return 'deferred';
      if (a === 'initial analysis' || a === 'reanalysis' || a === 'cve translated' || a === 'analyzed' || a === 'cvss score update' || a.includes('enriched')) return 'enriched';
      if (a === 'undergoing analysis' || a.includes('undergoing') || a.includes('in progress')) return 'undergoing';
      if (a === 'awaiting analysis' || a.startsWith('awaiting')) return 'awaiting';
      if (a === 'cve modified' || a === 'modified' || a === 'cwe remap' || a === 'cpe deprecation remap' || a.includes('modified') || a.includes('changed') || a.includes('remap')) return 'modified';
      if (a === 'new cve received' || a.includes('received') || a.includes('new cve') || a.includes('published') || a.startsWith('added')) return 'received';
      return 'unknown';
    }

    async function cvEnrichTimeline(post, detailEl) {
      const postDate = post.created_utc ? new Date(post.created_utc) : null;
      if (!postDate) { detailEl.querySelectorAll('.tl-version-loading').forEach(el => el.remove()); return; }
      const end = cvToYMD(postDate);
      const compTypes = (post.classification?.componentType ?? []).filter(Boolean);
      const baseFields = 'versionId,versionNumber,versionReleaseDate';
      const gp = new URLSearchParams({ end, limit: '5', fields: baseFields });
      if (compTypes.length) gp.set('q', compTypes.join(','));
      const cp = new URLSearchParams({ end, isCve: 'true', limit: '3', fields: baseFields });
      if (compTypes.length) cp.set('q', compTypes.join(','));
      try {
        const [genRes, cveRes] = await Promise.allSettled([
          fetch(`${CV_API_BASE}/v/search?${gp}`).then(r => r.ok ? r.json() : { data: [] }),
          fetch(`${CV_API_BASE}/v/search?${cp}`).then(r => r.ok ? r.json() : { data: [] }),
        ]);
        const general = genRes.status === 'fulfilled' ? (genRes.value.data ?? []) : [];
        const cveFix  = cveRes.status === 'fulfilled' ? (cveRes.value.data ?? []) : [];
        const cveIds  = new Set(cveFix.map(v => v.versionId));
        const seen = new Set();
        const releases = [...cveFix, ...general].filter(v => {
          if (seen.has(v.versionId)) return false; seen.add(v.versionId);
          const rd = v.versionReleaseDate ? new Date(v.versionReleaseDate) : null;
          return rd && rd <= postDate;
        }).sort((a, b) => new Date(b.versionReleaseDate) - new Date(a.versionReleaseDate));
        const latestId = releases.find(v => !cveIds.has(v.versionId))?.versionId ?? null;
        detailEl.querySelectorAll('.tl-wrap').forEach(tlWrap => {
          const loading = tlWrap.querySelector('.tl-version-loading');
          if (loading) loading.remove();
          if (!releases.length) return;
          releases.forEach(v => {
            const rd = new Date(v.versionReleaseDate);
            const isCve = cveIds.has(v.versionId);
            const isLatest = v.versionId === latestId;
            const comp = cvCompFromVersionId(v.versionId);
            cvInsertChronologically(tlWrap, cvBuildTlReleaseItem(rd, comp, v.versionNumber ?? '', isCve, isLatest), rd);
          });
        });
      } catch { detailEl.querySelectorAll('.tl-version-loading').forEach(el => el.remove()); }
    }

    function cvBuildTlReleaseItem(date, comp, version, isCve, isLatest = false) {
      const item = document.createElement('div');
      item.className = 'tl-item tl-release' + (isLatest ? ' tl-latest' : '');
      item.dataset.ts = date ? date.getTime() : '';
      const dot = document.createElement('div');
      dot.className = 'tl-dot ' + (isLatest ? 'dot-release' : isCve ? 'dot-release-cve' : 'dot-release');
      item.appendChild(dot);
      const header = document.createElement('div'); header.className = 'tl-header';
      const ds = document.createElement('span'); ds.className = 'tl-date'; ds.textContent = cvFmtDateTime(date); header.appendChild(ds);
      const lbl = document.createElement('span'); lbl.className = 'tl-label';
      lbl.textContent = isLatest ? `★ Official release of v${version}` : (`${comp} ${version}`.trim() || 'Release');
      header.appendChild(lbl);
      const badge = document.createElement('span');
      badge.className = 'nvd-badge ' + (isLatest ? 'nvd-enriched' : isCve ? 'nvd-rejected' : 'nvd-awaiting');
      badge.textContent = isLatest ? 'Latest before CVE' : isCve ? 'CVE Release' : 'Release';
      header.appendChild(badge); item.appendChild(header);
      if (isLatest && comp) { const sub = document.createElement('div'); sub.className = 'tl-sublabel'; sub.textContent = `${comp} · latest stable release before this CVE post`; item.appendChild(sub); }
      return item;
    }

    function cvInsertChronologically(tlWrap, newItem, newDate) {
      const newTs = newDate ? newDate.getTime() : Infinity;
      const items = [...tlWrap.querySelectorAll('.tl-item')];
      for (const item of items) { const itemTs = Number(item.dataset.ts); if (!itemTs || newTs <= itemTs) { tlWrap.insertBefore(newItem, item); return; } }
      tlWrap.appendChild(newItem);
    }

    function cvCompFromVersionId(vid) { return (vid ?? '').replace(/^\d{8}/, '').replace(/[\d.]+$/, '') || vid; }
    function cvToYMD(date) { return date.toISOString().slice(0, 10).replace(/-/g, ''); }

    function cvRenderNvdPipeline(statusMap, totalPosts) {
      const mainFlow = [
        { key: 'received', label: 'Received', cls: 's-info' },
        { key: 'awaiting', label: 'Awaiting',  cls: 's-muted' },
        { key: 'undergoing', label: 'Undergoing', cls: 's-warn' },
        { key: 'enriched', label: 'Enriched',  cls: 's-ok' },
        { key: 'modified', label: 'Modified',  cls: 's-warn' },
      ];
      const sideStates = [
        { key: 'deferred', label: 'Deferred',   cls: 's-muted' },
        { key: 'rejected', label: 'Rejected',   cls: 's-bad' },
        { key: 'unknown',  label: 'No History', cls: 's-muted' },
      ];
      const raw = mainFlow.map(s => statusMap.get(s.key) ?? 0);
      const cumulative = raw.map((_, i) => raw.slice(i).reduce((a, b) => a + b, 0));
      let html = `<div class="npp-step s-source"><span class="npp-count">${totalPosts}</span><span class="npp-label">Reddit Posts</span><span class="npp-sub">with CVE mentions</span></div>`;
      html += `<span class="npp-arrow">›</span>`;
      html += `<div class="npp-step s-cvelist" title="CNA reserved this CVE ID."><span class="npp-count">${totalPosts}</span><span class="npp-label">Reserved</span><span class="npp-sub">CVE List · cve.org</span></div>`;
      html += `<span class="npp-arrow">›</span>`;
      html += `<div class="npp-step s-cvelist" title="CVE details now public on cve.org."><span class="npp-count">${totalPosts}</span><span class="npp-label">Published</span><span class="npp-sub">CVE List · cve.org</span></div>`;
      mainFlow.forEach((s, i) => {
        const cum = cumulative[i], own = raw[i];
        const pct = totalPosts > 0 ? Math.round(cum / totalPosts * 100) + '%' : '';
        const sub = own !== cum ? `${pct} · ${own} currently here` : `${pct} of posts`;
        html += `<span class="npp-arrow">›</span>`;
        html += `<div class="npp-step ${s.cls}" title="${cvEscHtml(CV_NVD_BY_KEY[s.key]?.desc ?? '')}"><span class="npp-count">${cum}</span><span class="npp-label">${cvEscHtml(s.label)}</span>${sub ? `<span class="npp-sub">${sub}</span>` : ''}</div>`;
      });
      html += `<span class="npp-divider"></span>`;
      sideStates.forEach(s => {
        const n = statusMap.get(s.key) ?? 0;
        if (!n) return;
        const pct = totalPosts > 0 ? Math.round(n / totalPosts * 100) + '%' : '';
        html += `<div class="npp-step ${s.cls}" title="${cvEscHtml(CV_NVD_BY_KEY[s.key]?.desc ?? '')}"><span class="npp-count">${n}</span><span class="npp-label">${cvEscHtml(s.label)}</span>${pct ? `<span class="npp-sub">${pct} of posts</span>` : ''}</div>`;
        html += `<span class="st-228 npp-arrow" >·</span>`;
      });
      if (CV_EL.nvdPipelineFlow) CV_EL.nvdPipelineFlow.innerHTML = html;
    }

    function cvRenderAggregates() {
      const posts = CV_STATE.all, total = posts.length || 1;
      const statusMap = new Map(CV_NVD_STATUSES.map(s => [s.key, 0]));
      posts.forEach(p => { const k = cvCurrentNvdStatus(p); statusMap.set(k, (statusMap.get(k) ?? 0) + 1); });
      cvUpdateStatusDropdown(statusMap, posts.length);
      cvRenderNvdPipeline(statusMap, posts.length);

      const dates = posts.map(p => p.created_utc ? new Date(p.created_utc) : null).filter(Boolean);
      if (dates.length && CV_EL.pipelineRange) {
        const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
        const newest = new Date(Math.max(...dates.map(d => d.getTime())));
        CV_EL.pipelineRange.textContent = cvFmtMonthYear(oldest) + ' to ' + cvFmtMonthYear(newest);
      }

      const maxStatus = Math.max(...statusMap.values(), 1);
      if (CV_EL.aggStatus) CV_EL.aggStatus.innerHTML = CV_NVD_STATUSES
        .filter(s => (statusMap.get(s.key) ?? 0) > 0)
        .map(s => { const n = statusMap.get(s.key) ?? 0;
          return `<div class="bar-row" title="${cvEscHtml(s.desc)}"><span class="bar-label">${cvEscHtml(s.label)}</span><span class="bar-track"><span class="bar-fill ${s.bar} rt-w" style="--rt-w:${Math.round(n/maxStatus*100)}%"></span></span><span class="bar-count">${n}</span></div>`;
        }).join('') || '<span class="st-229" >No data yet</span>';

      const srcCount = { reddit: 0, stackoverflow: 0, other: 0 };
      posts.forEach(p => { srcCount[cvGetSource(p)]++; });
      if (CV_EL.tabCountAll) CV_EL.tabCountAll.textContent = posts.length;
      if (CV_EL.tabCountReddit) CV_EL.tabCountReddit.textContent = srcCount.reddit;
      if (CV_EL.tabCountStackoverflow) CV_EL.tabCountStackoverflow.textContent = srcCount.stackoverflow;
      if (CV_EL.tabCountOther) CV_EL.tabCountOther.textContent = srcCount.other;
      const srcMap = new Map([['Reddit', srcCount.reddit], ['Stack Overflow', srcCount.stackoverflow], ['Other', srcCount.other]]);
      if (CV_EL.aggSource) CV_EL.aggSource.innerHTML = cvRenderBars(srcMap, 'brand');

      const compMap = new Map();
      posts.forEach(p => { const ct = p.classification?.componentType ?? []; ct.forEach(t => compMap.set(t, (compMap.get(t) ?? 0) + 1)); if (!ct.length) compMap.set('Unclassified', (compMap.get('Unclassified') ?? 0) + 1); });
      if (CV_EL.aggCompType) CV_EL.aggCompType.innerHTML = cvRenderBars(compMap, 'brand');

      const secMap = new Map();
      posts.forEach(p => { const st = p.classification?.securityType ?? []; st.forEach(t => secMap.set(t, (secMap.get(t) ?? 0) + 1)); if (!st.length) secMap.set('No tag', (secMap.get('No tag') ?? 0) + 1); });
      if (CV_EL.aggSecType) CV_EL.aggSecType.innerHTML = cvRenderBars(secMap, 'bad');

      const subMap = new Map();
      posts.forEach(p => { const s = p.subreddit ?? 'unknown'; subMap.set(s, (subMap.get(s) ?? 0) + 1); });
      const topSubs = [...subMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
      if (CV_EL.aggSubreddit) CV_EL.aggSubreddit.innerHTML = `<div class="pill-list">${topSubs.map(([sub, n]) => `<span class="pill">r/${cvEscHtml(sub)} <span class="pct">${Math.round(n/total*100)}%</span></span>`).join('')}</div>`;

      const monthMap = new Map();
      posts.forEach(p => { if (!p.created_utc) return; const d = new Date(p.created_utc); const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; monthMap.set(key, (monthMap.get(key) ?? 0) + 1); });
      const months = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const maxM = Math.max(...months.map(m => m[1]), 1);
      if (CV_EL.aggMonthly) CV_EL.aggMonthly.innerHTML = months.length
        ? months.map(([mo, n]) => `<div class="bar-row"><span class="bar-label">${mo}</span><span class="bar-track"><span class="bar-fill rt-w" style="--rt-w:${Math.round(n/maxM*100)}%"></span></span><span class="bar-count">${n}</span></div>`).join('')
        : '<span class="st-229" >No date data yet</span>';
    }

    function cvUpdateStatusDropdown(statusMap, total) {
      if (!CV_EL.statusFilter) return;
      const selected = CV_EL.statusFilter.value;
      let html = `<option value="">All statuses (${total})</option>`;
      CV_NVD_STATUSES.forEach(s => { const n = statusMap.get(s.key) ?? 0; html += `<option value="${s.key}"${n===0?' disabled':''}>${cvEscHtml(s.label)} (${n})</option>`; });
      CV_EL.statusFilter.innerHTML = html;
      const opt = CV_EL.statusFilter.querySelector(`option[value="${selected}"]`);
      CV_EL.statusFilter.value = (opt && !opt.disabled) ? selected : '';
    }

    function cvRenderBars(map, colorClass) {
      const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const maxV = Math.max(...sorted.map(e => e[1]), 1);
      if (!sorted.length) return '<span class="st-229" >No data</span>';
      return sorted.map(([label, n]) => `<div class="bar-row"><span class="bar-label" title="${cvEscHtml(label)}">${cvEscHtml(label)}</span><span class="bar-track"><span class="bar-fill ${colorClass} rt-w" style="--rt-w:${Math.round(n/maxV*100)}%"></span></span><span class="bar-count">${n}</span></div>`).join('');
    }

    const CV_CVE_RE = /CVE-\d{4}-\d{4,}/gi;
    function cvHighlightCveIds(text) {
      const frag = document.createDocumentFragment();
      let last = 0; CV_CVE_RE.lastIndex = 0; let m;
      while ((m = CV_CVE_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const a = document.createElement('a');
        a.className = 'cve-highlight';
        a.href = 'https://nvd.nist.gov/vuln/detail/' + encodeURIComponent(m[0]);
        a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'View ' + m[0] + ' on NVD';
        a.textContent = m[0]; frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      return frag;
    }

    function cvMkChip(text, cls) { const s = document.createElement('span'); s.className = 'chip ' + cls; s.textContent = text; return s; }
    function cvMkSourceChip(post) {
      const src = cvGetSource(post);
      if (src === 'reddit') return cvMkChip('r/' + (post.subreddit ?? 'reddit'), 'sub');
      if (src === 'stackoverflow') { const s = document.createElement('span'); s.className = 'chip info'; s.textContent = 'Stack Overflow'; return s; }
      try { const s = document.createElement('span'); s.className = 'chip neutral'; s.textContent = new URL(post.url || 'http://x').hostname.replace('www.', ''); return s; }
      catch { const s = document.createElement('span'); s.className = 'chip neutral'; s.textContent = 'other'; return s; }
    }
    function cvMkCveChip(cveId) {
      const a = document.createElement('a');
      a.className = 'chip cve'; a.textContent = cveId;
      a.href = 'https://nvd.nist.gov/vuln/detail/' + encodeURIComponent(cveId);
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'View ' + cveId + ' on NVD';
      return a;
    }
    function cvParseDate(str) { try { const d = new Date(str); return isNaN(d) ? null : d; } catch { return null; } }
    function cvFmtMonthYear(d) { try { return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch { return String(d); } }
    function cvFmtDate(iso) { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return String(iso); } }
    function cvFmtDateTime(d) { if (!d) return ''; try { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); } catch { return String(d); } }
    function cvEscHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function cvDecodeHtml(s) { return String(s).replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }

    function cvWireEvents() {
      const tabs = document.getElementById('srcTabs');
      if (tabs) {
        tabs.addEventListener('click', e => {
          const btn = e.target.closest('.src-tab');
          if (!btn) return;
          tabs.querySelectorAll('.src-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          CV_STATE.sourceFilter = btn.dataset.src;
          cvApplyFilter();
        });
      }
      let cv_searchTimer;
      if (CV_EL.cveSearch) CV_EL.cveSearch.addEventListener('input', () => { clearTimeout(cv_searchTimer); cv_searchTimer = setTimeout(cvApplyFilter, 200); });
      if (CV_EL.sortSelect) CV_EL.sortSelect.addEventListener('change', cvApplyFilter);
      if (CV_EL.statusFilter) CV_EL.statusFilter.addEventListener('change', cvApplyFilter);
      if (CV_EL.versionFilter) CV_EL.versionFilter.addEventListener('change', cvApplyFilter);
    }

    function cvInitPage() {
      if (CV_INIT) return;
      CV_INIT = true;
      cvCacheEl();
      cvWireEvents();
      cvLoadAll();
    }

    function activateCve() {
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      CV_ACTIVE = true;
      setViewParam("cve");
      setDisplay(document.getElementById("cveView"), "flex");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("cveControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.cveLink.classList.add("nav-active");
      cvInitPage();
    }

    function deactivateCve() {
      CV_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("cveView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("cveControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.cveLink.classList.remove("nav-active");
    }

    EL.cveLink.addEventListener("click", e => {
      e.preventDefault();
      if (CV_ACTIVE) { deactivateCve(); return; }
      activateCve();
    });

    /* ── Risk Report ─────────────────────────────────────────── */
    let DB_ACTIVE = false;

    function riPopulateVersions() {
      const sel = document.getElementById("ri-ver-select");
      if (!sel) return;
      sel.innerHTML = '<option value="">Latest / all</option>';
      const comps = EL.components.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (!comps.length || comps.length > 1) { sel.disabled = comps.length > 1; return; }
      sel.disabled = false;
      const comp = comps[0];
      const all = STATE.candidates.length ? STATE.candidates : STATE.rawVersions;
      const cv = all.filter(v => {
        const n = (v.versionProductName || "").toLowerCase();
        return n.includes(comp) || comp.includes(n);
      });
      cv.slice(0, 50).forEach(v => {
        const opt = document.createElement("option");
        opt.value = v._id || v.versionId || v.versionNumber;
        const ch = gChannelOf(v);
        opt.textContent = "v" + (v.versionNumber || "?") + " (" + ch + (v.isCve ? " CVE" : "") + ")";
        sel.appendChild(opt);
      });
    }

    function riEsc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function riAnalyze() {
      const comps = EL.components.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      const selVal = document.getElementById("ri-ver-select")?.value || "";
      const windowDays = Number(document.getElementById("ri-window-select")?.value) || 30;
      const statusEl = document.getElementById("ri-sidebar-status");
      if (!comps.length) { if (statusEl) statusEl.textContent = "Run a search in the feed first."; return; }
      if (statusEl) statusEl.textContent = "Analyzing...";

      const cutoff = Date.now() - windowDays * 86400000;
      const all = STATE.candidates.length ? STATE.candidates : STATE.rawVersions;
      const compRaw = EL.components.value.split(",").map(s => s.trim()).filter(Boolean).join(", ");
      const CVE_PAT = /\bCVE-\d{4}-\d+\b/i;

      let allRecentVers = [], allCveVers = [], allPosts = [], allRiskPostsList = [], allCvePostsList = [], allSoPostsList = [];
      let targetV = null;

      comps.forEach(comp => {
        const compVers = all.filter(v => {
          const n = (v.versionProductName || "").toLowerCase();
          return n.includes(comp) || comp.includes(n);
        });
        if (!targetV && selVal) targetV = compVers.find(v => v._id === selVal || v.versionId === selVal || v.versionNumber === selVal);
        if (!targetV && compVers.length) targetV = compVers[0];

        const recentVers = compVers.filter(v => { const ep = gGetVersionEpoch(v); return ep === 0 || ep >= cutoff; });
        const cveVers = recentVers.filter(v => v.isCve || gChannelOf(v) === "cve");
        allRecentVers = allRecentVers.concat(recentVers);
        allCveVers = allCveVers.concat(cveVers);

        const posts = postsForComponent(comp).filter(p => { const ep = +(new Date(p.created_utc || 0)); return ep === 0 || ep >= cutoff; });
        allPosts = allPosts.concat(posts);
        allRiskPostsList = allRiskPostsList.concat(posts.filter(isRisk));
        allCvePostsList  = allCvePostsList.concat(posts.filter(p => CVE_PAT.test(p.title || "") || p.isAboutCve));
        allSoPostsList   = allSoPostsList.concat(posts.filter(p => getPostSource(p) === "stackoverflow"));
      });

      const dedup = (arr, key) => [...new Map(arr.map(x => [x[key] || (x._id || Math.random()), x])).values()];
      allPosts = dedup(allPosts, "url");
      allRiskPostsList = dedup(allRiskPostsList, "url");
      allCvePostsList  = dedup(allCvePostsList, "url");
      allSoPostsList   = dedup(allSoPostsList, "url");

      const isCveTarget = targetV && (targetV.isCve || gChannelOf(targetV) === "cve");
      const channel = targetV ? gChannelOf(targetV) : "unknown";

      let score = 0;
      if (isCveTarget)               score += 40;
      score += Math.min(allCveVers.length * 8, 24);
      let postRiskPts = 0;
      allRiskPostsList.forEach(p => {
        const ps = getUpdateScore(p);
        postRiskPts += (typeof ps === "number" && ps > 0.5) ? Math.round(ps * 10) : 5;
      });
      score += Math.min(postRiskPts, 20);
      if (allCvePostsList.length)    score += 8;
      if (channel === "major")       score += 12;
      if (channel === "minor")       score += 4;
      score = Math.min(score, 100);

      const level      = score >= 75 ? "Critical" : score >= 50 ? "High" : score >= 25 ? "Medium" : "Low";
      const scoreColor = score >= 75 ? "#b91c1c"  : score >= 50 ? "#b45309" : score >= 25 ? "#b45309" : "#475569";
      const rec =
        score >= 75 ? "Defer deployment. Review all CVE advisories and test in an isolated environment before production." :
        score >= 50 ? "Test thoroughly in staging. Review breaking changes and CVE details before production deployment." :
        score >= 25 ? "Standard staging validation recommended. Review community risk posts and release notes before deploying." :
                      "Safe to deploy. No blocking security advisories detected. Standard validation applies.";

      riRenderResults({ compRaw, targetV, recentVers: allRecentVers, cveVers: allCveVers, isCveTarget, channel, posts: allPosts, riskPostsList: allRiskPostsList, cvePostsList: allCvePostsList, soPostsList: allSoPostsList, score, level, scoreColor, rec, windowDays });
      if (statusEl) statusEl.textContent = "Done.";
    }

    function riRenderResults({ compRaw, targetV, recentVers, cveVers, isCveTarget, channel, posts, riskPostsList, cvePostsList, soPostsList, score, level, scoreColor, rec, windowDays }) {
      setDisplay(document.getElementById("ri-idle"), "none");
      setDisplay(document.getElementById("ri-results"), "");

      const numEl = document.getElementById("ri-score-num");
      numEl.textContent = score;
      numEl.classList.add("rt-c");
      numEl.style.setProperty("--rt-c", scoreColor);
      const lvlEl = document.getElementById("ri-score-level");
      lvlEl.textContent = level + " Risk";
      lvlEl.classList.add("rt-c");
      lvlEl.style.setProperty("--rt-c", scoreColor);
      document.getElementById("ri-score-comp").textContent =
        compRaw + (targetV ? " v" + (targetV.versionNumber || "?") : " (all versions)");
      document.getElementById("ri-score-rec").textContent = rec;

      const pillCls = { Critical:"ri-pill-red", High:"ri-pill-red", Medium:"ri-pill-amber", Low:"ri-pill-green" }[level] || "ri-pill-gray";
      let recHtml = '<div class="st-230" >'
        + '<span class="ri-pill ' + pillCls + '">' + riEsc(level) + ' Risk</span>'
        + ' <span class="ri-pill ri-pill-gray">' + riEsc(channel) + ' release</span>';
      if (isCveTarget) recHtml += ' <span class="ri-pill ri-pill-red">CVE release</span>';
      if (channel === "major") recHtml += ' <span class="ri-pill ri-pill-amber">Breaking changes likely</span>';
      recHtml += '</div><div class="st-231" >' + riEsc(rec) + '</div>'
        + '<div class="st-232" >'
        + recentVers.length + ' version' + (recentVers.length !== 1 ? 's' : '') + ' in last ' + windowDays + 'd'
        + ' · ' + posts.length + ' community post' + (posts.length !== 1 ? 's' : '') + '</div>';
      document.getElementById("ri-body-rec").innerHTML = recHtml;

      let cveHtml = "";
      if (!cveVers.length && !isCveTarget) {
        cveHtml = '<span class="st-199" >No CVE releases detected in the last ' + windowDays + ' days.</span>';
      } else {
        if (isCveTarget) cveHtml += '<div class="st-233" ><span class="ri-pill ri-pill-red">Target version is a CVE/security release</span></div>';
        cveHtml += '<div class="st-234" ><strong>' + cveVers.length + '</strong> CVE release' + (cveVers.length !== 1 ? 's' : '') + ' in last ' + windowDays + 'd</div>';
        cveVers.slice(0, 5).forEach(v => {
          const url = (v.versionUrl && v.versionUrl.startsWith("http")) ? v.versionUrl : null;
          const ep  = gGetVersionEpoch(v);
          cveHtml += '<div class="ri-post-item">';
          cveHtml += url ? '<a class="ri-post-link" href="' + riEsc(url) + '" target="_blank" rel="noopener">v' + riEsc(v.versionNumber || "?") + ' ↗</a>' : 'v' + riEsc(v.versionNumber || "?");
          if (ep) cveHtml += ' <span class="ri-post-meta">' + new Date(ep).toLocaleDateString() + '</span>';
          cveHtml += '</div>';
        });
        if (cveVers.length > 5) cveHtml += '<div class="ri-post-meta">+' + (cveVers.length - 5) + ' more</div>';
        if (cvePostsList.length) cveHtml += '<div class="st-235" ><span class="ri-pill ri-pill-red">' + cvePostsList.length + ' community CVE post' + (cvePostsList.length !== 1 ? 's' : '') + '</span></div>';
      }
      document.getElementById("ri-body-cve").innerHTML = cveHtml;

      let sigHtml = "";
      if (!posts.length) {
        sigHtml = '<span class="st-199" >No community posts found for this component.</span>';
      } else {
        sigHtml = '<div class="st-230" >'
          + '<span class="ri-pill ' + (riskPostsList.length ? "ri-pill-amber" : "ri-pill-green") + '">' + riskPostsList.length + ' risk post' + (riskPostsList.length !== 1 ? 's' : '') + '</span> '
          + '<span class="ri-pill ri-pill-blue">' + soPostsList.length + ' SO</span> '
          + '<span class="ri-pill ri-pill-gray">' + posts.length + ' total</span></div>';
        riskPostsList.slice(0, 4).forEach(p => {
          const ep = +(new Date(p.created_utc || 0));
          const daysAgo = ep ? Math.round((Date.now() - ep) / 86400000) : 0;
          const ps = getUpdateScore(p);
          const psTag = (typeof ps === "number" && ps > 0.5) ? ' · score ' + ps.toFixed(2) : '';
          sigHtml += '<div class="ri-post-item">'
            + (p.url ? '<a class="ri-post-link" href="' + riEsc(p.url) + '" target="_blank" rel="noopener">' + riEsc((p.title || "").slice(0, 70)) + '</a>' : riEsc((p.title || "").slice(0, 70)))
            + (ep ? '<div class="ri-post-meta">' + (daysAgo > 0 ? daysAgo + 'd ago' : 'today') + ' · ' + (getPostSource(p) === "stackoverflow" ? "SO" : "Reddit") + psTag + '</div>' : '')
            + '</div>';
        });
        if (riskPostsList.length > 4) sigHtml += '<div class="ri-post-meta">+' + (riskPostsList.length - 4) + ' more risk posts</div>';
      }
      document.getElementById("ri-body-risk").innerHTML = sigHtml;

      let verHtml = "";
      if (!targetV) {
        verHtml = '<span class="st-199" >No version data found for <strong>' + riEsc(compRaw) + '</strong>. Run a search first.</span>';
      } else {
        const ep  = gGetVersionEpoch(targetV);
        const url = (targetV.versionUrl && targetV.versionUrl.startsWith("http")) ? targetV.versionUrl
          : (targetV.versionReleaseNotes && targetV.versionReleaseNotes.startsWith("http")) ? targetV.versionReleaseNotes : null;
        const chCls = channel === "cve" ? "ri-pill-red" : channel === "major" ? "ri-pill-amber" : "ri-pill-blue";
        verHtml = '<table class="st-236" >'
          + '<tr><td class="st-237" >Component</td><td>' + riEsc(targetV.versionProductName || compRaw) + '</td></tr>'
          + '<tr><td class="st-238" >Version</td><td><strong>v' + riEsc(targetV.versionNumber || "?") + '</strong></td></tr>'
          + '<tr><td class="st-238" >Channel</td><td><span class="ri-pill ' + chCls + '">' + riEsc(channel) + '</span></td></tr>'
          + (ep ? '<tr><td class="st-238" >Released</td><td>' + new Date(ep).toLocaleDateString() + '</td></tr>' : '')
          + (url ? '<tr><td class="st-238" >Notes</td><td><a href="' + riEsc(url) + '" target="_blank" rel="noopener" class="st-239" >Release notes</a></td></tr>' : '')
          + '</table>';
        if (channel === "major") verHtml += '<div class="st-240" >Major version update. Review migration guides and test all integrations before deploying.</div>';
      }
      document.getElementById("ri-body-ver").innerHTML = verHtml;
    }

    function activateDashboard() {
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (CV_ACTIVE)  deactivateCve();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      DB_ACTIVE = true;
      setViewParam("risk");
      setDisplay(document.getElementById("dashboardView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("dashboardControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.dashboardLink.classList.add("nav-active");
      riPopulateVersions();
    }

    function deactivateDashboard() {
      DB_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("dashboardView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("dashboardControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.dashboardLink.classList.remove("nav-active");
    }

    EL.dashboardLink.addEventListener("click", e => {
      e.preventDefault();
      if (DB_ACTIVE) { deactivateDashboard(); return; }
      activateDashboard();
    });

    document.getElementById("ri-analyze-btn").addEventListener("click", riAnalyze);

    /************************* RELEASE KNOWLEDGE NETWORK *************************/

    let NET_ACTIVE = false;

    function nkEsc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function nkKnownVendors() {
      const all = STATE.candidates.length ? STATE.candidates : STATE.rawVersions;
      const names = new Set();
      all.forEach(v => {
        const n = (v.versionProductName || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (n.length >= 3) names.add(n);
      });
      return names;
    }

    function nkValidateNs(ns) {
      if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(ns))
        return "Namespace must be 3 to 32 characters: lowercase letters, digits, and hyphens only.";
      if (nkKnownVendors().has(ns))
        return "Namespace conflicts with an existing tracked vendor. Choose a unique namespace.";
      return null;
    }

    async function nkLoadReleases(filter) {
      const listEl = document.getElementById("nk-release-list");
      if (!listEl) return;
      listEl.innerHTML = '<div class="nk-empty">Loading...</div>';
      try {
        const token = localStorage.getItem("rt_token");
        const headers = { Accept: "application/json" };
        if (token) headers["Authorization"] = "Bearer " + token;
        const params = new URLSearchParams();
        if (filter) params.set("q", filter);
        params.set("source", "vendor");
        const res = await fetch(API_BASE + "knowledge/releases?" + params, { headers });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        nkRenderReleases(Array.isArray(data) ? data : (data.data || []));
      } catch {
        listEl.innerHTML = '<div class="nk-empty">No releases found.</div>';
      }
    }

    function nkRenderReleases(releases) {
      const listEl = document.getElementById("nk-release-list");
      if (!releases.length) {
        listEl.innerHTML = '<div class="nk-empty">No releases found.</div>';
        return;
      }
      listEl.innerHTML = "";
      releases.forEach(r => {
        const id       = String(r._id || "");
        const ns       = r.vendorNs || "";
        const fullProd = r.versionProductName || r.component || "";
        const comp     = (ns && fullProd.startsWith(ns + '/')) ? fullProd.slice(ns.length + 1) : fullProd;
        const ver      = r.versionNumber || r.version || "";
        const ch       = r.versionReleaseChannel || r.channel || "patch";
        const notesUrl = r.versionUrl || r.versionReleaseNotes || r.notesUrl || null;
        const desc     = r.description || "";
        const isVendor = !!r.isVendorPublished;
        const dateStr  = r.publishedAt
          ? new Date(r.publishedAt).toLocaleDateString()
          : (r.versionTimestamp ? new Date(r.versionTimestamp).toLocaleDateString() : "");

        const chCls = ch === "security" ? "ri-pill-red" : ch === "major" ? "ri-pill-amber" : ch === "minor" ? "ri-pill-blue" : "ri-pill-gray";

        const reportsHtml = nkRenderReportsHtml(r.reports || []);

        const card = document.createElement("div");
        card.className = "nk-release-card";
        card.innerHTML =
          '<div class="nk-release-head">'
          + '<span class="nk-release-ns">' + nkEsc(ns) + '</span>'
          + '<span class="nk-release-comp">' + nkEsc(comp) + '</span>'
          + '<span class="nk-release-ver">v' + nkEsc(ver) + '</span>'
          + '<span class="st-184 ri-pill ' + chCls + '" >' + nkEsc(ch) + '</span>'
          + (dateStr ? '<span class="nk-release-meta">' + dateStr + '</span>' : '')
          + '</div>'
          + '<div class="nk-release-body" id="nk-body-' + nkEsc(id) + '">'
          + (desc ? '<p class="st-241" >' + nkEsc(desc) + '</p>' : '')
          + (notesUrl ? '<p class="st-242" ><a href="' + nkEsc(notesUrl) + '" target="_blank" rel="noopener" class="st-239" >Release notes ↗</a></p>' : '')
          + '<div id="nk-reports-' + nkEsc(id) + '" class="st-243" >' + reportsHtml + '</div>'
          + (uaToken() ? '<button class="st-235 btn btn-sm"  data-nk-report="' + nkEsc(id) + '">Add experience</button>' : '')
          + '</div>';
        card.querySelector(".nk-release-head").addEventListener("click", () => {
          card.querySelector(".nk-release-body").classList.toggle("open");
        });
        if (uaToken()) {
          const btn = card.querySelector("[data-nk-report]");
          if (btn) btn.addEventListener("click", () => nkShowReportForm(id, card));
        }
        listEl.appendChild(card);
      });
    }

    function nkRenderReportsHtml(reports) {
      if (!reports.length) return '<span class="st-224" >No experience reports yet.</span>';
      const labels = { success: "Worked well", issues: "Had issues", upgrade: "Upgraded from" };
      const cls    = { success: "nk-outcome-ok", issues: "nk-outcome-issue", upgrade: "nk-outcome-upgrade" };
      return reports.map(rp => {
        const date = rp.reportedAt ? new Date(rp.reportedAt).toLocaleDateString() : "";
        return '<div class="nk-report-item">'
          + '<span class="' + (cls[rp.outcome] || "") + '">' + nkEsc(labels[rp.outcome] || rp.outcome || "") + '</span>'
          + (rp.fromVersion ? ' from v' + nkEsc(rp.fromVersion) : '')
          + (rp.description ? ': ' + nkEsc(rp.description.slice(0, 120)) : '')
          + (date ? '<div class="st-244" >' + date + (rp.reportedBy ? ' · ' + nkEsc(rp.reportedBy) : '') + '</div>' : '')
          + '</div>';
      }).join("");
    }

    function nkShowReportForm(releaseId, card) {
      const existing = card.querySelector(".nk-report-form");
      if (existing) { existing.remove(); return; }
      const wrap = document.createElement("div");
      wrap.className = "nk-report-form";
      wrap.innerHTML =
        '<div class="st-245" >'
        + '<div class="st-246" >Your experience</div>'
        + '<select id="nk-rep-outcome-' + releaseId + '" class="st-230 nk-input" >'
        + '<option value="success">Worked well in production</option>'
        + '<option value="issues">Had issues</option>'
        + '<option value="upgrade">Successfully upgraded from a previous version</option>'
        + '</select>'
        + '<input id="nk-rep-from-' + releaseId + '" class="st-230 nk-input" type="text" placeholder="Upgraded from version (optional)"  maxlength="32" />'
        + '<textarea id="nk-rep-desc-' + releaseId + '" class="st-247 nk-input nk-textarea" placeholder="Describe your experience (optional)"  maxlength="500"></textarea>'
        + '<button class="btn btn-primary btn-sm" id="nk-rep-submit-' + releaseId + '">Submit</button>'
        + ' <button class="btn btn-sm" id="nk-rep-cancel-' + releaseId + '">Cancel</button>'
        + '<div id="nk-rep-msg-' + releaseId + '" class="st-248" ></div>'
        + '</div>';
      card.querySelector(".nk-release-body").appendChild(wrap);
      document.getElementById("nk-rep-cancel-" + releaseId).addEventListener("click", () => wrap.remove());
      document.getElementById("nk-rep-submit-" + releaseId).addEventListener("click", async () => {
        const outcome = document.getElementById("nk-rep-outcome-" + releaseId).value;
        const fromVersion = (document.getElementById("nk-rep-from-" + releaseId).value || "").trim();
        const description = (document.getElementById("nk-rep-desc-" + releaseId).value || "").trim();
        const msgEl = document.getElementById("nk-rep-msg-" + releaseId);
        msgEl.textContent = "Submitting...";
        try {
          const token = localStorage.getItem("rt_token");
          const res = await fetch(API_BASE + "knowledge/releases/" + encodeURIComponent(releaseId) + "/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ outcome, fromVersion, description })
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
          msgEl.classList.remove("msg-err"); msgEl.classList.add("msg-muted");
          msgEl.textContent = "Thank you for your report.";
          setTimeout(() => { wrap.remove(); nkLoadReleases(document.getElementById("nk-search").value); }, 1200);
        } catch (err) {
          msgEl.classList.remove("msg-muted"); msgEl.classList.add("msg-err");
          msgEl.textContent = "Could not submit: " + nkEsc(String(err.message || "error"));
        }
      });
    }

    function nkRender() {
      const gate = document.getElementById("nk-gate");
      const main = document.getElementById("nk-main");
      if (!uaToken()) {
        setDisplay(gate, "block");
        setDisplay(main, "none");
        return;
      }
      setDisplay(gate, "none");
      setDisplay(main, "block");
      nkLoadReleases((document.getElementById("nk-search") || {}).value || "");
    }

    function activateNetwork() {
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      NET_ACTIVE = true;
      setViewParam("release");
      setDisplay(document.getElementById("networkView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("networkControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.networkLink.classList.add("nav-active");
      nkRender();
    }

    function deactivateNetwork() {
      NET_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("networkView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("networkControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.networkLink.classList.remove("nav-active");
    }

    EL.networkLink.addEventListener("click", e => {
      e.preventDefault();
      if (NET_ACTIVE) { deactivateNetwork(); return; }
      activateNetwork();
    });

    document.getElementById("nk-signin-btn").addEventListener("click", () => activateUsers());

    document.querySelectorAll("[data-nk-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-nk-tab]").forEach(b => b.classList.remove("nk-tab-active"));
        btn.classList.add("nk-tab-active");
        const target = btn.dataset.nkTab;
        document.querySelectorAll(".nk-tab-panel").forEach(p => p.classList.remove("nk-tab-panel-active"));
        document.getElementById("nk-panel-" + target).classList.add("nk-tab-panel-active");
      });
    });

    document.getElementById("nk-search").addEventListener("input", () => {
      if (NET_ACTIVE && uaToken()) nkLoadReleases(document.getElementById("nk-search").value);
    });


    document.getElementById("nk-publish-form").addEventListener("submit", async e => {
      e.preventDefault();
      const msgEl = document.getElementById("nk-publish-msg");
      const ns   = (document.getElementById("nk-vendor-ns").value || "").trim().toLowerCase();
      const comp = (document.getElementById("nk-comp-name").value || "").trim();
      const ver  = (document.getElementById("nk-ver-num").value || "").trim();
      const channel     = document.getElementById("nk-channel").value;
      const notesUrl    = (document.getElementById("nk-notes-url").value || "").trim();
      const description = (document.getElementById("nk-description").value || "").trim();

      const nsErr = nkValidateNs(ns);
      if (nsErr) {
        msgEl.className = "nk-msg nk-msg-error";
        msgEl.textContent = nsErr;
        setDisplay(msgEl, "block");
        return;
      }
      msgEl.className = "nk-msg";
      msgEl.textContent = "Publishing...";
      setDisplay(msgEl, "block");
      try {
        const token = localStorage.getItem("rt_token");
        const res = await fetch(API_BASE + "knowledge/releases", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ vendorNs: ns, component: comp, version: ver, channel, notesUrl, description })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || res.status);
        }
        msgEl.className = "nk-msg nk-msg-ok";
        msgEl.textContent = "Release published.";
        document.getElementById("nk-publish-form").reset();
        setTimeout(() => {
          setDisplay(msgEl, "none");
          document.querySelector("[data-nk-tab='discover']").click();
        }, 1400);
      } catch (err) {
        msgEl.className = "nk-msg nk-msg-error";
        msgEl.textContent = "Publish failed: " + nkEsc(String(err.message || "error"));
        setDisplay(msgEl, "block");
      }
    });

    /************************* USER ACCOUNT MANAGEMENT *************************/

    let UA_ACTIVE = false;

    function uaToken() { return localStorage.getItem("rt_token"); }
    function uaUser() {
      try { return JSON.parse(localStorage.getItem("rt_user") || "null"); } catch { return null; }
    }
    function uaOrgs() { const u = uaUser(); return (u && Array.isArray(u.orgs)) ? u.orgs : []; }
    function uaSetSession(token, user) {
      localStorage.setItem("rt_token", token);
      localStorage.setItem("rt_user", JSON.stringify(user));
    }
    function uaClearSession() {
      localStorage.removeItem("rt_token");
      localStorage.removeItem("rt_user");
    }

    async function uaRequest(path, opts = {}) {
      const token = uaToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      return fetch(API_BASE + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    }

    function uaEsc(s) {
      return String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function uaShowMsg(id, text) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      setDisplay(el, text ? "" : "none");
    }

    function uaUpdateTopbar() {
      const user = uaUser();
      const chip = document.getElementById("ua-topbar-user");
      if (!chip) return;
      if (user) {
        chip.textContent = user.name || user.email;
        setDisplay(chip, "");
      } else {
        setDisplay(chip, "none");
      }
      // See #authStatusDot's own markup comment: kept in sync here too,
      // since this function (not just uaUpdateAskIntroSignin) is one of
      // the two places this chip's own visibility is decided.
      const dot = document.getElementById("authStatusDot");
      if (dot) {
        dot.classList.toggle("auth-dot-on", !!user);
        dot.classList.toggle("auth-dot-off", !user);
        dot.title = user ? "Signed in" : "Not signed in";
      }
    }

    function uaUpdateSidebar() {
      const user = uaUser();
      const el = document.getElementById("ua-sidebar-status");
      if (!el) return;
      el.textContent = user
        ? (user.name || user.email) + " (" + user.role + ")"
        : "Not signed in.";
      uaUpdateTopbar();
    }

    // Ask intro panel's own sign-in call-to-action: pointless to a
    // viewer already signed in (they can already ask a real question),
    // reported live right after it shipped. A separate function, not
    // inlined into uaRender() below, specifically so it can ALSO run at
    // page bootstrap (see its own call next to uaUpdateSidebar() further
    // down) - bootstrap deliberately calls the lighter uaUpdateSidebar()
    // instead of full uaRender() (which would fire every admin-only
    // dashboard/guardrails/etc. fetch on every single page load, not
    // just when the Account view is actually opened), so a RETURNING
    // signed-in visitor's already-valid session would otherwise leave
    // this button visibly wrong (still inviting them to sign in) until
    // they happened to log in/out again or open Account during this
    // same page load, neither of which a returning user necessarily
    // ever does.
    function uaUpdateAskIntroSignin() {
      const token = uaToken();
      const user = uaUser();
      // #topSignInLink (now at the bottom of the sidebar on a wide
      // screen, in the topbar on a narrow one; see relocateSidebarFooter)
      // is the one sign-in entry point outside the Account view itself,
      // opposite #ua-topbar-user (uaRender, further down, already shows/
      // hides that one the same way). Kept as its own name/function
      // rather than renamed, since this still runs at the same two
      // points (bootstrap and every uaRender) for the same original
      // reason described above.
      const btn = document.getElementById("topSignInLink");
      if (btn) setDisplay(btn, (token && user) ? "none" : "");
      const dot = document.getElementById("authStatusDot");
      if (dot) {
        const signedIn = !!(token && user);
        dot.classList.toggle("auth-dot-on", signedIn);
        dot.classList.toggle("auth-dot-off", !signedIn);
        dot.title = signedIn ? "Signed in" : "Not signed in";
      }
      if (!token || !user) uaLoadAnonQuota();
      // Guardrails is hidden entirely while signed out now, per explicit
      // request: everything it showed for a signed-out visitor was
      // either a disabled, non-actionable checkbox or a second "Sign in"
      // prompt duplicating the one #topSignInLink already is. It becomes
      // genuinely useful, and reappears, the moment there's a real
      // account to save a preference to.
      const guardrails = document.getElementById("askGuardrailsDetails");
      if (guardrails) setDisplay(guardrails, (token && user) ? "" : "none");
    }
    function uaSetAnonQuotaNote(remaining, limit) {
      const el = document.getElementById("askAnonQuotaNote");
      if (!el) return;
      if (!Number.isFinite(limit) || limit <= 0) { el.hidden = true; return; }
      el.hidden = false;
      el.textContent = remaining > 0
        ? `${remaining} of ${limit} free question${limit === 1 ? "" : "s"} left today`
        : "You've used today's free questions";
    }
    // Cached so a completed anonymous question (see the 'result' SSE
    // event's own anonymousQuestionsRemaining field, in the Ask submit
    // handler) can update askAnonQuotaNote via uaSetAnonQuotaNote
    // in place, without a second fetch, since the SSE payload only
    // carries the new remaining count, not the limit it's out of.
    let uaAnonQuotaLimitCache = null;
    // Public (no auth, see its own comment in app.js): reads the admin
    // Settings panel's "Allow anonymous questions"/"Free questions
    // before sign-in" values plus this visitor's own usage so far.
    // Swallows its own errors and leaves the note hidden rather than
    // showing a stale or wrong count.
    async function uaLoadAnonQuota() {
      const el = document.getElementById("askAnonQuotaNote");
      try {
        const res = await uaRequest("ask/anon-quota");
        if (!res.ok) { if (el) el.hidden = true; return; }
        const data = await res.json();
        if (data.authenticated || !data.enabled) { if (el) el.hidden = true; return; }
        uaAnonQuotaLimitCache = data.limit;
        uaSetAnonQuotaNote(data.remaining, data.limit);
      } catch { if (el) el.hidden = true; }
    }
    function uaRender() {
      const token = uaToken();
      const user = uaUser();
      setDisplay(document.getElementById("ua-auth-panel"), (!token || !user) ? "" : "none");
      setDisplay(document.getElementById("ua-profile-panel"), (token && user) ? "" : "none");
      uaUpdateAskIntroSignin();
      if (token && user) {
        document.getElementById("ua-profile-name").textContent = user.name || user.email;
        document.getElementById("ua-profile-email").textContent = user.email;
        const orgs = user.orgs || [];
        document.getElementById("ua-org-1").value = orgs[0] || "";
        document.getElementById("ua-org-2").value = orgs[1] || "";
        const badge = document.getElementById("ua-profile-role");
        badge.textContent = user.role;
        badge.className = "ua-badge ua-badge-" + user.role;
        const adminSection = document.getElementById("ua-admin-section");
        if (user.role === "admin") {
          setDisplay(adminSection, "");
          uaLoadDashboard();
          uaLoadSettings();
          uaLoadGuardrails();
          uaLoadFeedbackThresholds();
          uaLoadBotCadence();
          uaLoadVendorAliases();
          uaLoadUsers();
          uaLoadSearchEvents();
        } else {
          setDisplay(adminSection, "none");
        }
        // Admin-only nav item, hidden from everyone else regardless of
        // the separate site-wide VIEW_NAV_LINKS visibility toggles above
        // (those are "show/hide for all visitors"; this is "admin role
        // required," a different axis).
        if (EL.evalRewriterLink) EL.evalRewriterLink.hidden = user.role !== "admin";
        if (EL.evalEvaluatorLink) EL.evalEvaluatorLink.hidden = user.role !== "admin";
        if (EL.evalOrchestratorLink) EL.evalOrchestratorLink.hidden = user.role !== "admin";
        uaLoadBookmarks();
        uaLoadInventoryFromServer();
        uaLoadProviderKeys();
      }
      uaUpdateSidebar();
    }

    // Bring-your-own-key. provider -> the field name PUT /api/users/:id
    // whitelists (must match the server's PROVIDER_KEY_FIELDS).
    const UA_KEY_FIELD = { anthropic: "anthropicApiKey", groq: "groqApiKey", ollama: "ollamaApiKey" };

    // The three key inputs render `readonly` so no browser password manager
    // treats them as a fill target on load (that is why the Claude box used
    // to show dots). Drop readonly the moment the field is focused, restore
    // it on blur when the box is still empty. The app never puts a key into
    // these fields itself, shared or otherwise.
    for (const p of Object.keys(UA_KEY_FIELD)) {
      const input = document.getElementById("ua-key-" + p);
      if (!input) continue;
      input.addEventListener("focus", () => { input.removeAttribute("readonly"); });
      input.addEventListener("blur", () => { if (!input.value) input.setAttribute("readonly", ""); });
    }

    // GET /api/users/me returns {provider}KeySet / {provider}KeyPreview
    // (never a raw key). Reflect that into each row's status line.
    async function uaLoadProviderKeys() {
      let me;
      try {
        const res = await uaRequest("users/me");
        if (!res.ok) return;
        me = await res.json();
      } catch { return; }
      for (const p of Object.keys(UA_KEY_FIELD)) {
        const el = document.getElementById("ua-key-" + p + "-status");
        if (!el) continue;
        el.textContent = me[p + "KeySet"]
          ? "· set (" + (me[p + "KeyPreview"] || "…") + "), yours is in use"
          : "· not set, using the shared key";
      }
    }

    document.getElementById("ua-profile-panel")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-key-save]");
      if (!btn) return;
      const provider = btn.dataset.keySave;
      const field = UA_KEY_FIELD[provider];
      const user = uaUser();
      if (!field || !user) return;
      const input = document.getElementById("ua-key-" + provider);
      const value = (input.value || "").trim();
      btn.disabled = true;
      try {
        const res = await uaRequest("users/" + user.id, {
          method: "PUT",
          body: JSON.stringify({ [field]: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Save failed.");
        input.value = "";
        uaShowMsg("ua-keys-ok", value ? "Saved. Your " + provider + " key is now in use." : "Cleared. Back to the shared " + provider + " key.");
        uaShowMsg("ua-keys-error", "");
        await uaLoadProviderKeys();
      } catch (err) {
        uaShowMsg("ua-keys-error", err.message || "Save failed.");
        uaShowMsg("ua-keys-ok", "");
      } finally {
        btn.disabled = false;
      }
    });

    // Renders the {stale,healthy,noData} bot-health arrays from
    // GET /api/admin/overview as three grouped lists. Empty groups are
    // skipped entirely rather than shown as a heading with nothing under it.
    function uaRenderBotGroups(botHealth) {
      const groups = [
        { key: "stale",   cls: "ua-bot-row-stale",   icon: "🔴", label: "Stale: needs attention" },
        { key: "healthy", cls: "ua-bot-row-healthy", icon: "🟢", label: "Healthy" },
        { key: "noData",  cls: "ua-bot-row-nodata",  icon: "⚪", label: "No attributed data" },
      ];
      return groups.map(g => {
        const rows = botHealth[g.key] || [];
        if (!rows.length) return "";
        const rowsHtml = rows.map(r => {
          const detail = r.lastSeen
            ? `${uaEsc(r.lastSeen)} · ${r.ageDays}d old (max ${r.maxDays}d)`
            : `no dated document found (expected within ${r.maxDays}d)`;
          return `<div class="ua-bot-row ${g.cls}">
            <span class="ua-bot-row-name">${uaEsc(r.bot)}</span>
            <span class="ua-bot-row-detail">${detail}</span>
          </div>`;
        }).join("");
        return `<div class="ua-dash-bot-group">
          <div class="ua-dash-bot-group-title"><span>${g.icon}</span> ${g.label} (${rows.length})</div>
          ${rowsHtml}
        </div>`;
      }).join("");
    }

    // The banner only appears when there's actually something new to
    // flag (newSinceLastLogin > 0); the stat line below it always shows
    // the running totals regardless, since "how many accounts/queries
    // exist" is useful context even on a quiet day.
    // The notice banner (new registrations) plus a compact row of
    // aggregate counts, both rendered right in the profile card so
    // they're visible the moment an admin opens the Account view, not
    // an easy-to-miss line further down the page. All of it comes from
    // the one GET /api/admin/overview call uaLoadDashboard already
    // makes for the System overview cards, no separate request.
    function uaRenderRegistrationNotice(users, queries, counts, botHealth, storage) {
      const noticeEl = document.getElementById("ua-reg-notice");
      const statsEl = document.getElementById("ua-reg-stats");
      if (!noticeEl || !statsEl || !users) return;
      if (users.newSinceLastLogin > 0) {
        setDisplay(noticeEl, "");
        noticeEl.innerHTML = `🔔 <strong>${users.newSinceLastLogin}</strong> new registration${users.newSinceLastLogin === 1 ? "" : "s"} since your last login.`;
      } else {
        setDisplay(noticeEl, "none");
        noticeEl.innerHTML = "";
      }
      const q = queries || { total: 0, last7Days: 0 };
      const c = counts || {};
      // "N stale" alone doesn't say how many bots exist at all; showing
      // it as a fraction of the total (stale + healthy + no-data, the
      // same set BOT_HEALTH_CADENCE_DAYS tracks) reads the same whether
      // it's 0 stale or all of them.
      const botsTotal = botHealth
        ? (botHealth.stale || []).length + (botHealth.healthy || []).length + (botHealth.noData || []).length
        : null;
      const staleCount = botHealth ? (botHealth.stale || []).length : null;
      const storagePct = storage ? Math.round((storage.pct || 0) * 100) : null;
      statsEl.innerHTML = [
        `<span><strong>${users.total}</strong> accounts <span class="ua-muted">(+${users.newLast7Days}/7d)</span></span>`,
        `<span><strong>${q.total}</strong> queries <span class="ua-muted">(+${q.last7Days}/7d)</span></span>`,
        Number.isFinite(c.versionsTotal) ? `<span><strong>${c.versionsTotal.toLocaleString()}</strong> versions tracked</span>` : "",
        Number.isFinite(c.cveTotal) ? `<span><strong>${c.cveTotal.toLocaleString()}</strong> CVEs</span>` : "",
        Number.isFinite(c.redditTotal) ? `<span><strong>${c.redditTotal.toLocaleString()}</strong> Reddit</span>` : "",
        Number.isFinite(c.stackoverflowTotal) ? `<span><strong>${c.stackoverflowTotal.toLocaleString()}</strong> StackOverflow</span>` : "",
        Number.isFinite(c.serverfaultTotal) ? `<span><strong>${c.serverfaultTotal.toLocaleString()}</strong> Server Fault</span>` : "",
        staleCount != null
          ? `<span class="${staleCount ? "ua-reg-stat-alert" : ""}"><strong>${staleCount}/${botsTotal}</strong> bots stale</span>`
          : "",
        storagePct != null ? `<span class="${storagePct >= 90 ? "ua-reg-stat-alert" : ""}"><strong>${storagePct}%</strong> storage used</span>` : "",
      ].filter(Boolean).join("");
    }

    // botGapLog.recent's rows (tryWikipediaFallback's own log, see its
    // comment in botVendorFallback.js) reuse the exact same .ua-bot-row
    // styling as bot-health, just repurposing stale/healthy's red/green
    // border-left for failed/succeeded instead of overdue/on-time, one
    // consistent "list of dated attempts, colored by outcome" visual
    // language across both sections rather than a second one invented
    // just for this. A row with no vendorName is skipped defensively
    // (shouldn't happen; every real log entry sets it) rather than
    // rendering a blank name.
    function uaRenderBotGapRecent(entries) {
      const rows = (entries || []).filter(e => e && e.vendorName);
      if (!rows.length) return "";
      const rowsHtml = rows.map(e => {
        const when = e.startedAt ? new Date(e.startedAt).toLocaleString() : "unknown time";
        const detail = e.success
          ? `resolved as "${uaEsc(e.resolvedTerm || e.vendorName)}"`
          : uaEsc(e.error || e.reason || "did not resolve");
        return `<div class="ua-bot-row ${e.success ? "ua-bot-row-healthy" : "ua-bot-row-stale"}">
          <span class="ua-bot-row-name">${uaEsc(e.vendorName)}</span>
          <span class="ua-bot-row-detail">${detail} &middot; ${uaEsc(when)}</span>
        </div>`;
      }).join("");
      return `<div class="ua-dash-bot-group">
        <div class="ua-dash-bot-group-title"><span>🔎</span> Recent vendor gap-fills (${rows.length})</div>
        ${rowsHtml}
      </div>`;
    }

    async function uaLoadDashboard() {
      const gridEl = document.getElementById("ua-dash-grid");
      const botsEl = document.getElementById("ua-dash-bots");
      const botGapEl = document.getElementById("ua-dash-botgap");
      const updatedEl = document.getElementById("ua-dash-updated");
      const res = await uaRequest("admin/overview").catch(() => null);
      if (!res || !res.ok) {
        gridEl.innerHTML = `<p class="st-189 ua-muted" >Could not load system overview.</p>`;
        botsEl.innerHTML = "";
        if (botGapEl) botGapEl.innerHTML = "";
        return;
      }
      const data = await res.json();
      const { botHealth, sourceAttribution, storage, counts, users, queries, botGapLog } = data;

      if (updatedEl) updatedEl.textContent = data.checkedAt ? "as of " + new Date(data.checkedAt).toLocaleTimeString() : "";
      uaRenderRegistrationNotice(users, queries, counts, botHealth, storage);

      const staleCount = (botHealth.stale || []).length;
      const storagePct = Math.round((storage.pct || 0) * 100);
      const attrPct = sourceAttribution.pct || 0;
      const gap = botGapLog || { total: 0, success: 0, recent: [] };
      const gapFailRate = gap.total ? Math.round(((gap.total - gap.success) / gap.total) * 100) : 0;

      gridEl.innerHTML = `
        <div class="ua-dash-card ${staleCount ? "ua-dash-card-alert" : "ua-dash-card-ok"}">
          <div class="ua-dash-card-label">Bot health</div>
          <div class="ua-dash-card-value">${staleCount ? staleCount + " stale" : "All OK"}</div>
          <div class="ua-dash-card-sub">${(botHealth.healthy || []).length} healthy · ${(botHealth.noData || []).length} no data</div>
        </div>
        <div class="ua-dash-card ${storagePct >= 90 ? "ua-dash-card-alert" : ""}">
          <div class="ua-dash-card-label">MongoDB storage</div>
          <div class="ua-dash-card-value">${storage.storageMb} MB</div>
          <div class="ua-dash-card-sub">of ${storage.limitMb} MB cap (${storagePct}%)</div>
          <div class="ua-dash-bar"><div class="ua-dash-bar-fill rt-w${storagePct >= 90 ? " ua-dash-bar-alert" : ""}" style="--rt-w:${Math.min(100, storagePct)}%"></div></div>
        </div>
        <div class="ua-dash-card ${attrPct >= 15 ? "ua-dash-card-alert" : ""}">
          <div class="ua-dash-card-label">Source attribution</div>
          <div class="ua-dash-card-value">${attrPct}% unknown</div>
          <div class="ua-dash-card-sub">${sourceAttribution.unknown + sourceAttribution.missing} of ${sourceAttribution.total} docs</div>
        </div>
        <div class="ua-dash-card">
          <div class="ua-dash-card-label">Collection totals</div>
          <div class="ua-dash-card-value">${counts.versionsTotal}</div>
          <div class="ua-dash-card-sub">${counts.cveTotal} CVE · ${counts.releaseNotesTotal} release · ${counts.redditTotal} reddit · ${counts.stackoverflowTotal} SO · ${counts.serverfaultTotal} SF</div>
        </div>
        <div class="ua-dash-card ${gap.total && gapFailRate >= 50 ? "ua-dash-card-alert" : ""}">
          <div class="ua-dash-card-label">Vendor gap-fills</div>
          <div class="ua-dash-card-value">${gap.total ? gap.success + "/" + gap.total : "None yet"}</div>
          <div class="ua-dash-card-sub">${gap.total ? "resolved, wikipedia.py auto-fallback" : "no web-verified vendor has had zero tracked data yet"}</div>
        </div>`;

      botsEl.innerHTML = uaRenderBotGroups(botHealth) ||
        `<p class="st-189 ua-muted" >No bot health data available.</p>`;
      if (botGapEl) botGapEl.innerHTML = uaRenderBotGapRecent(gap.recent);
    }

    const uaRefreshDashBtn = document.getElementById("ua-refresh-dash");
    if (uaRefreshDashBtn) uaRefreshDashBtn.addEventListener("click", uaLoadDashboard);

    // Each admin section's Refresh button lives inside its own <summary>
    // (see ua-admin-section's <details> markup); a click there would
    // otherwise also toggle the section open/closed via the browser's
    // native <summary> click handling, since the click bubbles up to it.
    // Stopping propagation here keeps "Refresh" from also collapsing the
    // section it just refreshed.
    document.querySelectorAll(".ua-admin-details summary button").forEach(btn => {
      btn.addEventListener("click", e => e.stopPropagation());
    });

    // Generic runtime settings / feature flags (GET/PUT /api/admin/settings
    // in app.js). Only display metadata (a label + hint) lives here per
    // key, since the value, its default, and its own valid range are owned
    // server-side (see ask.js's getAskRuntimeSettings/setAskRuntimeSettings)
    // and never duplicated here. A key GET returns with no entry below
    // still renders, just with its bare name as the label, so a new
    // server-side setting is usable from this panel immediately, before
    // anyone gets around to giving it a nicer label here.
    const UA_SETTINGS_META = {
      askRecentWindowDays: {
        label: "Ask recency window (days)",
        // Used to say these were independent, which was true right up
        // until it wasn't: they'd coincidentally shared a starting value
        // and someone (reasonably) expected changing this one to widen
        // the feed too. Per explicit request, this value now drives both:
        // the feed's own LOOKBACK_DAYS in index.html fetches this same
        // setting live from GET /api/ask/recent-window-days at page load
        // (see fetchAndApplyLookbackDays there) instead of carrying its
        // own separate hardcoded number.
        hint: "How far back Ask searches when a question names no explicit date. The feed's own lookback window reads this same value live at page load, so changing it here changes both.",
        min: 1, max: 90,
      },
      // "compare" is deliberately not offered here: the server rejects
      // it as a default anyway (see setAskRuntimeSettings in ask.js), so
      // it's left out of this list rather than shown and then silently
      // ignored on save.
      askDefaultPreset: {
        label: "Ask default pipeline",
        hint: "Which Pipeline option a new visitor's Ask form starts on.",
        options: Object.keys(ASK_PRESET_LABELS)
          .filter(k => k !== "compare")
          .map(k => ({ value: k, label: ASK_PRESET_LABELS[k] })),
      },
      askDefaultProvider: {
        label: "Ask default model provider",
        hint: "Which Model option a new visitor's Ask form starts on.",
        options: [
          { value: "anthropic", label: "Claude (Anthropic)" },
          { value: "groq", label: "Groq (free tier)" },
          { value: "ollama", label: "Ollama Cloud (free tier)" },
        ],
      },
      askDefaultSize: {
        label: "Ask default model size",
        hint: "Which Size tier a new visitor's Ask form starts on (exact model varies by provider).",
        options: [
          { value: "small", label: "Small" },
          { value: "medium", label: "Medium" },
          { value: "large", label: "Large" },
        ],
      },
      // LangGraph orchestration (see releasetrain-server's langgraphLoop.js):
      // the langgraph_delegated pipeline runs the Retriever/Evaluator retry
      // loop as a LangGraph graph. Value, default and valid range are all
      // owned server-side; these are display labels and hints only.
      langgraphEnabled: {
        label: "LangGraph: enabled",
        type: "boolean",
        hint: "Kill switch. When off, the LangGraph pipeline runs the normal retry loop instead (same answers, no graph).",
      },
      langgraphAutoRoute: {
        label: "LangGraph: use for Auto",
        type: "boolean",
        hint: "When on, Auto sends security, patch and general questions through the LangGraph pipeline instead of the standard multi-agent one.",
      },
      langgraphMaxRounds: {
        label: "LangGraph: max retrieval rounds",
        hint: "Most Retriever + Evaluator rounds a LangGraph run may take. 0 uses the Retriever retry guardrail's own limit.",
        min: 0, max: 5,
      },
      langgraphRecursionLimit: {
        label: "LangGraph: step limit",
        hint: "LangGraph's own cap on graph steps (each round is 2 steps). A run that needs more is stopped and handled by the error policy below.",
        min: 3, max: 100,
      },
      langgraphNodeTimeoutSeconds: {
        label: "LangGraph: node timeout (seconds)",
        hint: "Longest a single graph step (a retrieval + evaluation round, or a retry step) may take. 0 means no limit.",
        min: 0, max: 300,
      },
      langgraphTraceInResponse: {
        label: "LangGraph: include step trace in answers",
        type: "boolean",
        hint: "Adds which graph steps ran, how long each took, and whether the run fell back, to each LangGraph answer's response.",
      },
      langgraphOnError: {
        label: "LangGraph: on error",
        hint: "What happens if the graph fails (package missing, timeout, step limit): finish the question with the normal loop, or fail it.",
        options: [
          { value: "fallback", label: "Fall back to the normal loop" },
          { value: "fail", label: "Fail the question" },
        ],
      },
      // View visibility: which nav-menu links show up at all, server-
      // validated against the same TOGGLEABLE_VIEWS list app.js keys off
      // (see setViewVisibility). "Home" and "Account" aren't offered
      // here for the same reason the server won't accept them: hiding
      // either breaks core navigation or can lock an admin out of this
      // very panel.
      viewGraphVisible: { label: "Show Graph in the menu", type: "boolean" },
      viewArchVisible: { label: "Show Arch in the menu", type: "boolean" },
      viewCveVisible: { label: "Show CVE in the menu", type: "boolean" },
      viewDashboardVisible: { label: "Show Risk Report in the menu", type: "boolean" },
      viewDocsVisible: { label: "Show Docs in the menu", type: "boolean" },
      viewChangelogVisible: { label: "Show Changelog in the menu", type: "boolean" },
      viewAckVisible: { label: "Show Credits in the menu", type: "boolean" },
      viewNetworkVisible: { label: "Show Release in the menu", type: "boolean" },
      // Hides the nav link entirely, for every viewer including admins;
      // separate from evalRewriterAccess/evalEvaluatorAccess/
      // evalOrchestratorAccess below, which gate the raw HTTP API and
      // don't affect the nav link's own visibility.
      viewEvalRewriterVisible: { label: "Show Eval Rewriter in the menu", type: "boolean" },
      viewEvalEvaluatorVisible: { label: "Show Eval Evaluator in the menu", type: "boolean" },
      viewEvalOrchestratorVisible: { label: "Show Eval Orchestrator in the menu", type: "boolean" },
      // Eval tool API access: each of these calls a real LLM and runs a
      // real retrieval pass, so how open its raw HTTP endpoint is (not
      // the Eval Rewriter/Evaluator/Orchestrator nav link's own
      // admin-only visibility, which is unaffected by this) is its own
      // admin-tunable setting, server-validated against the same
      // disabled/admin/auth/public levels agenticGate accepts (see its
      // own comment in app.js). "Public" has no rate limiting behind
      // it anywhere in this codebase; only pick it deliberately, e.g.
      // to let an external script call it with no login step.
      evalRewriterAccess: {
        label: "Eval Rewriter API access",
        hint: "Who can call /api/eval-rewriter directly (not the admin-only nav link's own visibility). \"Public\" has no rate limiting behind it.",
        options: [
          { value: "disabled", label: "Disabled" },
          { value: "admin", label: "Admin only" },
          { value: "auth", label: "Any signed-in user" },
          { value: "public", label: "Public (no login)" },
        ],
      },
      evalEvaluatorAccess: {
        label: "Eval Evaluator API access",
        hint: "Who can call /api/eval-evaluator directly. Same access levels and caution as Eval Rewriter above.",
        options: [
          { value: "disabled", label: "Disabled" },
          { value: "admin", label: "Admin only" },
          { value: "auth", label: "Any signed-in user" },
          { value: "public", label: "Public (no login)" },
        ],
      },
      evalOrchestratorAccess: {
        label: "Eval Orchestrator API access",
        hint: "Who can call /api/eval-orchestrator directly. Same access levels and caution as Eval Rewriter above.",
        options: [
          { value: "disabled", label: "Disabled" },
          { value: "admin", label: "Admin only" },
          { value: "auth", label: "Any signed-in user" },
          { value: "public", label: "Public (no login)" },
        ],
      },
      // Plain finite-number and plain-string values both already fall
      // through to this renderer's generic number-input/text-input
      // fallback (see the inputHtml ternary in uaLoadSettings below), so
      // these two need no new markup or renderer branch, just metadata.
      rateLimitPerMinute: {
        label: "Global rate limit (requests/min per IP)",
        hint: "Applies to every API route except /api/health. Takes effect immediately, no restart needed.",
        min: 10, max: 2000,
      },
      adminRateLimitPerMinute: {
        label: "Admin rate limit (requests/min per IP)",
        hint: "Applies instead of the global limit above when the request's own JWT has role \"admin\": this Account view's admin panel alone fires 6+ requests per tab, so normal active use needs more headroom than anonymous public traffic.",
        min: 10, max: 5000,
      },
      allowedEmailDomains: {
        label: "Allowed registration email domains",
        hint: "Comma-separated (e.g. gmail.com,outlook.com). Any .edu (or .edu.<country>) address is always allowed regardless of this list.",
      },
      // Lets a signed-out visitor ask a small number of real questions
      // (not the free vendor/category lookups, which never needed
      // sign-in) before Ask falls back to requiring one. Enforced
      // server-side only, bucketed by IP + UTC day (see app.js's
      // AnonAskUsage) -- this panel just edits the two knobs. Limit 0,
      // or the toggle off, both reproduce the original
      // always-401-for-anonymous-questions behavior exactly.
      anonymousAskEnabled: {
        label: "Allow anonymous questions",
        hint: "Let a signed-out visitor ask real questions at all (up to the limit below) before requiring sign-in. Off reproduces the original behavior: any real question from a signed-out visitor is refused.",
        type: "boolean",
      },
      anonymousAskLimit: {
        label: "Free questions before sign-in",
        hint: "How many real questions one IP address may ask per day while signed out. 0 has the same effect as turning the toggle above off.",
        min: 0, max: 50,
      },
    };
    async function uaLoadSettings() {
      const listEl = document.getElementById("ua-settings-list");
      const countEl = document.getElementById("ua-settings-count");
      const res = await uaRequest("admin/settings").catch(() => null);
      if (!res || !res.ok) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >Could not load settings.</p>`;
        return;
      }
      const settings = await res.json();
      // `guardrails` rides along in this same flat response (see
      // getGuardrailSettings's own comment) but is an array of objects,
      // not a scalar this generic list's number/text/checkbox renderer
      // can meaningfully show. It fell through to the plain-text
      // fallback as a garbled "[object Object],[object Object]" string
      // before this filter existed. The dedicated Guardrails section
      // above (uaLoadGuardrails) already renders it properly.
      const keys = Object.keys(settings).filter(k => k !== "guardrails");
      if (countEl) countEl.textContent = keys.length ? "(" + keys.length + ")" : "";
      if (!keys.length) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >No settings defined yet.</p>`;
        return;
      }
      listEl.innerHTML = keys.map(key => {
        const meta = UA_SETTINGS_META[key] || {};
        const value = settings[key];
        // meta.type === "boolean" renders a checkbox; a fixed-choice
        // value (meta.options) renders a <select> so an admin can't type
        // an invalid string the server would just silently reject; a
        // plain finite number is a number input; anything else falls
        // back to free text.
        const inputHtml = meta.type === "boolean"
          ? `<input type="checkbox" class="ua-settings-input ua-settings-checkbox" data-key="${uaEsc(key)}"${value ? " checked" : ""}>`
          : Array.isArray(meta.options)
          ? `<select class="ua-settings-input" data-key="${uaEsc(key)}">${meta.options.map(o =>
              `<option value="${uaEsc(o.value)}"${o.value === value ? " selected" : ""}>${uaEsc(o.label)}</option>`
            ).join("")}</select>`
          : Number.isFinite(value)
          ? `<input type="number" class="ua-settings-input" data-key="${uaEsc(key)}" value="${value}"${Number.isFinite(meta.min) ? ` min="${meta.min}"` : ""}${Number.isFinite(meta.max) ? ` max="${meta.max}"` : ""}>`
          : `<input type="text" class="ua-settings-input" data-key="${uaEsc(key)}" value="${uaEsc(String(value))}">`;
        return `<div class="ua-settings-row">
          <div class="ua-settings-info">
            <strong>${uaEsc(meta.label || key)}</strong>
            ${meta.hint ? `<span class="ua-muted">${uaEsc(meta.hint)}</span>` : ""}
          </div>
          ${inputHtml}
          <button type="button" class="st-249 btn btn-ghost ua-settings-save" data-key="${uaEsc(key)}" >Save</button>
        </div>`;
      }).join("");

      listEl.querySelectorAll(".ua-settings-save").forEach(btn => {
        btn.addEventListener("click", async () => {
          const key = btn.dataset.key;
          const input = listEl.querySelector(`.ua-settings-input[data-key="${CSS.escape(key)}"]`);
          if (!input) return;
          const raw = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
          btn.disabled = true;
          const prevText = btn.textContent;
          btn.textContent = "Saving…";
          try {
            const putRes = await uaRequest("admin/settings", { method: "PUT", body: JSON.stringify({ [key]: raw }) });
            if (!putRes.ok) throw new Error((await putRes.json().catch(() => ({}))).error || "Save failed.");
            const applied = await putRes.json();
            // The server clamps/validates before persisting (a number to
            // its valid range, an enum string to one it actually
            // recognizes; see setAskRuntimeSettings in ask.js), so the
            // input reflects what actually took effect, not necessarily
            // the raw value just submitted.
            if (input.type === "checkbox" && typeof applied[key] === "boolean") input.checked = applied[key];
            else if (Number.isFinite(applied[key]) || typeof applied[key] === "string") input.value = applied[key];
            btn.textContent = "Saved";
            setTimeout(() => { btn.textContent = prevText; btn.disabled = false; }, 1200);
          } catch (err) {
            alert(err.message || "Save failed.");
            btn.textContent = prevText;
            btn.disabled = false;
          }
        });
      });
    }

    // Guardrails (also GET/PUT /api/admin/settings, same endpoint as
    // uaLoadSettings above, just its `guardrails` key): a fixed list of
    // { id, tier, label, description, enabled } entries, each rendered
    // into a Mandatory or Optional group rather than mixed into the flat
    // UA_SETTINGS_META list, since a guardrail carries a full sentence
    // description and a tier grouping that a plain label+hint pair
    // doesn't. Each row keeps its own explicit Save button rather than
    // saving on checkbox change, matching this same tab's existing
    // boolean-setting convention (see uaLoadSettings's checkbox rows
    // above, e.g. viewGraphVisible: a checkbox plus an explicit Save
    // button, not immediate-save on change).
    async function uaLoadGuardrails() {
      const mandatoryEl = document.getElementById("ua-guardrails-mandatory-list");
      const optionalEl = document.getElementById("ua-guardrails-optional-list");
      const countEl = document.getElementById("ua-guardrails-count");
      if (!mandatoryEl || !optionalEl) return;
      const res = await uaRequest("admin/settings").catch(() => null);
      if (!res || !res.ok) {
        mandatoryEl.innerHTML = `<p class="st-189 ua-muted" >Could not load guardrails.</p>`;
        optionalEl.innerHTML = "";
        return;
      }
      const settings = await res.json();
      const guardrails = Array.isArray(settings.guardrails) ? settings.guardrails : [];
      if (countEl) countEl.textContent = guardrails.length ? "(" + guardrails.length + ")" : "";
      // A handful of guardrails (the retry-shaped ones: retrieverRetry,
      // rewriterRetry, evaluatorSelfCheck, orchestratorRevise) also carry
      // a maxAttempts ceiling, admin-only regardless of the guardrail's
      // own tier (see guardrails.js's own comment on why this never goes
      // through a user's per-request preference the way `enabled` can for
      // an optional-tier one). Rendered only when the server actually
      // sent one, same conditional-field pattern already used for
      // Feedback Loop thresholds' own numeric inputs.
      const rowHtml = g => `<div class="ua-settings-row">
          <div class="ua-settings-info">
            <strong>${uaEsc(g.label || g.id)}</strong>
            <span class="ua-muted">${uaEsc(g.description || "")}</span>
          </div>
          ${Number.isFinite(g.maxAttempts) ? `<label class="st-198 ua-muted" >max attempts
            <input type="number" class="st-250 ua-settings-input ua-guardrail-maxattempts-input" data-id="${uaEsc(g.id)}" value="${g.maxAttempts}" min="1" max="${g.maxAttemptsCeiling || g.maxAttempts}" >
          </label>` : ""}
          <input type="checkbox" class="ua-settings-input ua-settings-checkbox ua-guardrail-input" data-id="${uaEsc(g.id)}"${g.enabled ? " checked" : ""}>
          <button type="button" class="st-249 btn btn-ghost ua-guardrail-save" data-id="${uaEsc(g.id)}" >Save</button>
        </div>`;
      const mandatory = guardrails.filter(g => g.tier === "mandatory");
      const optional = guardrails.filter(g => g.tier !== "mandatory");
      mandatoryEl.innerHTML = mandatory.length ? mandatory.map(rowHtml).join("")
        : `<p class="st-189 ua-muted" >No mandatory guardrails defined yet.</p>`;
      optionalEl.innerHTML = optional.length ? optional.map(rowHtml).join("")
        : `<p class="st-189 ua-muted" >No optional guardrails defined yet.</p>`;

      document.querySelectorAll("#ua-guardrails-section .ua-guardrail-save").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const esc = CSS.escape(id);
          const input = document.querySelector(`#ua-guardrails-section .ua-guardrail-input[data-id="${esc}"]`);
          const maxAttemptsInput = document.querySelector(`#ua-guardrails-section .ua-guardrail-maxattempts-input[data-id="${esc}"]`);
          if (!input) return;
          btn.disabled = true;
          const prevText = btn.textContent;
          btn.textContent = "Saving…";
          try {
            const patch = { id, enabled: input.checked };
            if (maxAttemptsInput) patch.maxAttempts = Number(maxAttemptsInput.value);
            const putRes = await uaRequest("admin/settings", { method: "PUT", body: JSON.stringify({ guardrails: [patch] }) });
            if (!putRes.ok) throw new Error((await putRes.json().catch(() => ({}))).error || "Save failed.");
            const applied = await putRes.json();
            const updated = Array.isArray(applied.guardrails) ? applied.guardrails.find(g => g.id === id) : null;
            if (updated && typeof updated.enabled === "boolean") input.checked = updated.enabled;
            if (updated && maxAttemptsInput && Number.isFinite(updated.maxAttempts)) maxAttemptsInput.value = updated.maxAttempts;
            btn.textContent = "Saved";
            setTimeout(() => { btn.textContent = prevText; btn.disabled = false; }, 1200);
          } catch (err) {
            alert(err.message || "Save failed.");
            btn.textContent = prevText;
            btn.disabled = false;
          }
        });
      });
    }

    const uaRefreshGuardrailsBtn = document.getElementById("ua-refresh-guardrails");
    if (uaRefreshGuardrailsBtn) uaRefreshGuardrailsBtn.addEventListener("click", uaLoadGuardrails);

    // Feedback Loop thresholds (also GET/PUT /api/admin/settings, same
    // endpoint as Guardrails above, just its `feedbackThresholds` key).
    // negativeRatio is stored server-side as a 0-1 fraction but edited
    // here as a whole-number percent, matching how an admin actually
    // thinks about "40% negative" rather than "0.4".
    async function uaLoadFeedbackThresholds() {
      const listEl = document.getElementById("ua-feedback-thresholds-list");
      const countEl = document.getElementById("ua-feedback-thresholds-count");
      if (!listEl) return;
      const res = await uaRequest("admin/settings").catch(() => null);
      if (!res || !res.ok) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >Could not load feedback thresholds.</p>`;
        return;
      }
      const settings = await res.json();
      const thresholds = Array.isArray(settings.feedbackThresholds) ? settings.feedbackThresholds : [];
      if (countEl) countEl.textContent = thresholds.length ? "(" + thresholds.length + ")" : "";
      if (!thresholds.length) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >No feedback thresholds defined yet.</p>`;
        return;
      }
      listEl.innerHTML = thresholds.map(t => `<div class="ua-settings-row" data-id="${uaEsc(t.id)}">
          <div class="ua-settings-info">
            <strong>${uaEsc(t.label || t.id)}</strong>
            <span class="ua-muted">${uaEsc(t.description || "")}</span>
          </div>
          <label class="st-198 ua-muted" >min ratings
            <input type="number" class="st-251 ua-settings-input ua-feedback-min-input" data-id="${uaEsc(t.id)}" value="${t.minRatings}" min="1" max="1000" >
          </label>
          <label class="st-198 ua-muted" >% negative
            <input type="number" class="st-250 ua-settings-input ua-feedback-ratio-input" data-id="${uaEsc(t.id)}" value="${Math.round((t.negativeRatio || 0) * 100)}" min="0" max="100" >
          </label>
          <input type="checkbox" class="ua-settings-input ua-settings-checkbox ua-feedback-enabled-input" data-id="${uaEsc(t.id)}"${t.enabled ? " checked" : ""}>
          <button type="button" class="st-249 btn btn-ghost ua-feedback-threshold-save" data-id="${uaEsc(t.id)}" >Save</button>
        </div>`).join("");

      listEl.querySelectorAll(".ua-feedback-threshold-save").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.id;
          const esc = CSS.escape(id);
          const minInput = listEl.querySelector(`.ua-feedback-min-input[data-id="${esc}"]`);
          const ratioInput = listEl.querySelector(`.ua-feedback-ratio-input[data-id="${esc}"]`);
          const enabledInput = listEl.querySelector(`.ua-feedback-enabled-input[data-id="${esc}"]`);
          if (!minInput || !ratioInput || !enabledInput) return;
          btn.disabled = true;
          const prevText = btn.textContent;
          btn.textContent = "Saving…";
          try {
            const patch = { id, enabled: enabledInput.checked, minRatings: Number(minInput.value), negativeRatio: Number(ratioInput.value) / 100 };
            const putRes = await uaRequest("admin/settings", { method: "PUT", body: JSON.stringify({ feedbackThresholds: [patch] }) });
            if (!putRes.ok) throw new Error((await putRes.json().catch(() => ({}))).error || "Save failed.");
            const applied = await putRes.json();
            const updated = Array.isArray(applied.feedbackThresholds) ? applied.feedbackThresholds.find(t => t.id === id) : null;
            if (updated) {
              minInput.value = updated.minRatings;
              ratioInput.value = Math.round((updated.negativeRatio || 0) * 100);
              enabledInput.checked = updated.enabled;
            }
            btn.textContent = "Saved";
            setTimeout(() => { btn.textContent = prevText; btn.disabled = false; }, 1200);
          } catch (err) {
            alert(err.message || "Save failed.");
            btn.textContent = prevText;
            btn.disabled = false;
          }
        });
      });
    }

    const uaRefreshFeedbackThresholdsBtn = document.getElementById("ua-refresh-feedback-thresholds");
    if (uaRefreshFeedbackThresholdsBtn) uaRefreshFeedbackThresholdsBtn.addEventListener("click", uaLoadFeedbackThresholds);

    // Bot health cadence thresholds (GET/PUT /api/admin/bot-cadence).
    // Kept separate from the generic UA_SETTINGS_META list above since
    // it's ~21 rows deep, not a handful of flat scalars. A dedicated
    // per-bot list reads better than 21 near-identical entries mixed
    // into Settings. Each row's effective value is overrides[bot] when
    // set, else defaults[bot]; "Reset to default" (PUT with
    // maxDays: null) only shows once a row actually has an override.
    async function uaLoadBotCadence() {
      const listEl = document.getElementById("ua-cadence-list");
      const countEl = document.getElementById("ua-cadence-count");
      if (!listEl) return;
      const res = await uaRequest("admin/bot-cadence").catch(() => null);
      if (!res || !res.ok) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >Could not load bot cadence thresholds.</p>`;
        return;
      }
      const { defaults, overrides } = await res.json();
      const bots = Object.keys(defaults || {}).sort();
      if (countEl) countEl.textContent = bots.length ? "(" + bots.length + ")" : "";
      if (!bots.length) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >No bots defined yet.</p>`;
        return;
      }
      listEl.innerHTML = bots.map(bot => {
        const def = defaults[bot];
        const ov = overrides ? overrides[bot] : null;
        const hasOverride = Number.isFinite(ov);
        const effective = hasOverride ? ov : def;
        return `<div class="ua-bot-row" data-bot="${uaEsc(bot)}">
          <span class="ua-bot-row-name">${uaEsc(bot)}</span>
          <span class="ua-bot-row-detail">default ${def}d</span>
          <input type="number" class="st-252 ua-settings-input ua-cadence-input" data-bot="${uaEsc(bot)}" value="${effective}" min="1" max="365" >
          <button type="button" class="st-249 btn btn-ghost ua-cadence-save" data-bot="${uaEsc(bot)}" >Save</button>
          <button type="button" class="btn btn-ghost ua-cadence-reset ua-cadence-reset-btn${hasOverride ? "" : " u-hide"}" data-bot="${uaEsc(bot)}">Reset to default</button>
        </div>`;
      }).join("");

      listEl.querySelectorAll(".ua-cadence-save").forEach(btn => {
        btn.addEventListener("click", async () => {
          const bot = btn.dataset.bot;
          const input = listEl.querySelector(`.ua-cadence-input[data-bot="${CSS.escape(bot)}"]`);
          if (!input) return;
          const maxDays = Number(input.value);
          btn.disabled = true;
          const prevText = btn.textContent;
          btn.textContent = "Saving…";
          try {
            const putRes = await uaRequest("admin/bot-cadence", { method: "PUT", body: JSON.stringify({ bot, maxDays }) });
            if (!putRes.ok) throw new Error((await putRes.json().catch(() => ({}))).error || "Save failed.");
            btn.textContent = "Saved";
            setTimeout(() => { btn.textContent = prevText; btn.disabled = false; }, 1200);
            const resetBtn = listEl.querySelector(`.ua-cadence-reset[data-bot="${CSS.escape(bot)}"]`);
            if (resetBtn) setDisplay(resetBtn, "");
          } catch (err) {
            alert(err.message || "Save failed.");
            btn.textContent = prevText;
            btn.disabled = false;
          }
        });
      });

      listEl.querySelectorAll(".ua-cadence-reset").forEach(btn => {
        btn.addEventListener("click", async () => {
          const bot = btn.dataset.bot;
          const input = listEl.querySelector(`.ua-cadence-input[data-bot="${CSS.escape(bot)}"]`);
          btn.disabled = true;
          try {
            const putRes = await uaRequest("admin/bot-cadence", { method: "PUT", body: JSON.stringify({ bot, maxDays: null }) });
            if (!putRes.ok) throw new Error((await putRes.json().catch(() => ({}))).error || "Reset failed.");
            const applied = await putRes.json();
            const def = applied.defaults ? applied.defaults[bot] : undefined;
            if (input && Number.isFinite(def)) input.value = def;
            setDisplay(btn, "none");
          } catch (err) {
            alert(err.message || "Reset failed.");
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    const uaRefreshCadenceBtn = document.getElementById("ua-refresh-cadence");
    if (uaRefreshCadenceBtn) uaRefreshCadenceBtn.addEventListener("click", uaLoadBotCadence);

    // Vendor catalog: alias manager (GET/POST/DELETE
    // /api/admin/vendor-aliases) plus a separate manual gap-fill
    // trigger (POST /api/admin/vendor-gap-fill) below it. Deleting an
    // alias just removes its row on success rather than reloading the
    // whole list.
    async function uaLoadVendorAliases() {
      const listEl = document.getElementById("ua-vendor-alias-list");
      const emptyEl = document.getElementById("ua-vendor-alias-empty");
      const countEl = document.getElementById("ua-vendor-alias-count");
      if (!listEl) return;
      const res = await uaRequest("admin/vendor-aliases").catch(() => null);
      if (!res || !res.ok) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >Could not load vendor aliases.</p>`;
        if (emptyEl) setDisplay(emptyEl, "none");
        return;
      }
      const { data } = await res.json();
      const rows = data || [];
      if (countEl) countEl.textContent = rows.length ? "(" + rows.length + ")" : "";
      if (emptyEl) setDisplay(emptyEl, rows.length ? "none" : "");
      listEl.innerHTML = rows.map(a => `<div class="ua-bm-item" data-id="${uaEsc(a._id)}">
        <span class="ua-bm-name">${uaEsc(a.alias)} &rarr; ${uaEsc(a.canonicalName)}</span>
        <div class="ua-bm-actions">
          <button class="st-253 btn btn-ghost ua-vendor-alias-del" data-id="${uaEsc(a._id)}" >Delete</button>
        </div>
      </div>`).join("");

      listEl.querySelectorAll(".ua-vendor-alias-del").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this alias?")) return;
          const id = btn.dataset.id;
          btn.disabled = true;
          const res = await uaRequest("admin/vendor-aliases/" + id, { method: "DELETE" }).catch(() => null);
          if (res && res.ok) {
            const row = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
            if (row) row.remove();
            const remaining = listEl.children.length;
            if (countEl) countEl.textContent = remaining ? "(" + remaining + ")" : "";
            if (emptyEl) setDisplay(emptyEl, remaining ? "none" : "");
          } else {
            alert("Failed to delete alias.");
            btn.disabled = false;
          }
        });
      });
    }

    const uaRefreshVendorAliasesBtn = document.getElementById("ua-refresh-vendor-aliases");
    if (uaRefreshVendorAliasesBtn) uaRefreshVendorAliasesBtn.addEventListener("click", uaLoadVendorAliases);

    const uaVendorAliasForm = document.getElementById("ua-vendor-alias-form");
    if (uaVendorAliasForm) {
      uaVendorAliasForm.addEventListener("submit", async e => {
        e.preventDefault();
        const aliasInput = document.getElementById("ua-vendor-alias-input");
        const canonicalInput = document.getElementById("ua-vendor-canonical-input");
        const alias = aliasInput.value.trim();
        const canonicalName = canonicalInput.value.trim();
        if (!alias || !canonicalName) return;
        const btn = uaVendorAliasForm.querySelector("button[type=submit]");
        btn.disabled = true;
        try {
          const res = await uaRequest("admin/vendor-aliases", { method: "POST", body: JSON.stringify({ alias, canonicalName }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to add alias.");
          aliasInput.value = "";
          canonicalInput.value = "";
          uaShowMsg("ua-vendor-alias-error", "");
          await uaLoadVendorAliases();
        } catch (err) {
          uaShowMsg("ua-vendor-alias-error", err.message || "Failed to add alias.");
        } finally {
          btn.disabled = false;
        }
      });
    }

    // Manual gap-fill trigger: a separate small form, its own inline
    // success/failure message (re-classed ua-msg-ok/ua-msg-error per
    // result, same as the password/keys/org forms above).
    const uaVendorGapfillForm = document.getElementById("ua-vendor-gapfill-form");
    if (uaVendorGapfillForm) {
      uaVendorGapfillForm.addEventListener("submit", async e => {
        e.preventDefault();
        const input = document.getElementById("ua-vendor-gapfill-input");
        const vendorName = input.value.trim();
        if (!vendorName) return;
        const msgEl = document.getElementById("ua-vendor-gapfill-msg");
        const btn = uaVendorGapfillForm.querySelector("button[type=submit]");
        btn.disabled = true;
        const prevText = btn.textContent;
        btn.textContent = "Running…";
        try {
          const res = await uaRequest("admin/vendor-gap-fill", { method: "POST", body: JSON.stringify({ vendorName }) });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed.");
          const data = await res.json();
          msgEl.className = "ua-msg " + (data.success ? "ua-msg-ok" : "ua-msg-error");
          uaShowMsg("ua-vendor-gapfill-msg", data.success
            ? "Resolved."
            : "Did not resolve, a search-term variant may be needed, or add it as an alias above instead.");
        } catch (err) {
          msgEl.className = "ua-msg ua-msg-error";
          uaShowMsg("ua-vendor-gapfill-msg", err.message || "Request failed.");
        } finally {
          btn.textContent = prevText;
          btn.disabled = false;
        }
      });
    }

    async function uaLoadUsers() {
      const listEl = document.getElementById("ua-user-list");
      listEl.innerHTML = `<p class="st-189 ua-muted" >Loading…</p>`;
      const res = await uaRequest("users/").catch(() => null);
      if (!res || !res.ok) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >Could not load users.</p>`;
        return;
      }
      const data = await res.json();
      const countEl = document.getElementById("ua-user-count");
      if (countEl) countEl.textContent = "(" + data.total + ")";
      if (!data.data.length) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >No users found.</p>`;
        return;
      }
      const currentUser = uaUser();
      listEl.innerHTML = data.data.map(u => {
        const isSelf = currentUser && String(u._id) === String(currentUser.id);
        return `<div class="ua-user-row" data-id="${uaEsc(u._id)}">
          <div class="ua-user-info">
            <strong>${uaEsc(u.name || u.email)}</strong>
            <span class="ua-muted">${uaEsc(u.email)}</span>
          </div>
          <div class="ua-user-actions">
            <select class="ua-role-sel" data-id="${uaEsc(u._id)}" aria-label="Role for ${uaEsc(u.email)}">
              <option value="user"${u.role === "user" ? " selected" : ""}>user</option>
              <option value="admin"${u.role === "admin" ? " selected" : ""}>admin</option>
            </select>
            ${isSelf
              ? `<span class="st-254" >you</span>`
              : `<button class="st-253 btn btn-ghost ua-del-btn" data-id="${uaEsc(u._id)}" >Delete</button>`
            }
          </div>
        </div>`;
      }).join("");

      listEl.querySelectorAll(".ua-role-sel").forEach(sel => {
        sel.addEventListener("change", async () => {
          const id = sel.dataset.id;
          const role = sel.value;
          const res = await uaRequest("users/" + id, { method: "PUT", body: JSON.stringify({ role }) });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || "Failed to update role.");
            uaLoadUsers();
          }
        });
      });

      listEl.querySelectorAll(".ua-del-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this user? This cannot be undone.")) return;
          const id = btn.dataset.id;
          const res = await uaRequest("users/" + id, { method: "DELETE" });
          if (res.ok) {
            uaLoadUsers();
          } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error || "Failed to delete user.");
          }
        });
      });
    }

    function uaSelectTab(name) {
      const panes = { login: "ua-login-form", register: "ua-register-form", why: "ua-why-pane" };
      for (const k of Object.keys(panes)) {
        setDisplay(document.getElementById(panes[k]), k === name ? "" : "none");
        document.getElementById("ua-tab-" + k).classList.toggle("ua-tab-active", k === name);
      }
    }
    ["login", "register", "why"].forEach(k => {
      document.getElementById("ua-tab-" + k).addEventListener("click", () => uaSelectTab(k));
    });

    document.getElementById("ua-login-form").addEventListener("submit", async e => {
      e.preventDefault();
      uaShowMsg("ua-login-error", "");
      const email = document.getElementById("ua-login-email").value.trim();
      const password = document.getElementById("ua-login-password").value;
      const btn = document.getElementById("ua-login-btn");
      btn.disabled = true; btn.textContent = "Signing in…";
      try {
        const res = await uaRequest("auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        const data = await res.json();
        if (!res.ok) { uaShowMsg("ua-login-error", data.error || "Login failed."); return; }
        uaSetSession(data.token, data.user);
        uaRender();
      } catch { uaShowMsg("ua-login-error", "Network error. Try again."); }
      finally { btn.disabled = false; btn.textContent = "Sign in"; }
    });

    document.getElementById("ua-register-form").addEventListener("submit", async e => {
      e.preventDefault();
      uaShowMsg("ua-register-error", "");
      uaShowMsg("ua-register-ok", "");
      const name = document.getElementById("ua-reg-name").value.trim();
      const email = document.getElementById("ua-reg-email").value.trim();
      const password = document.getElementById("ua-reg-password").value;
      const btn = document.getElementById("ua-register-btn");
      btn.disabled = true; btn.textContent = "Creating…";
      try {
        const res = await uaRequest("auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
        const data = await res.json();
        if (!res.ok) { uaShowMsg("ua-register-error", data.error || "Registration failed."); return; }
        uaShowMsg("ua-register-ok", "Account created. You can now sign in.");
        ["ua-reg-name", "ua-reg-email", "ua-reg-password"].forEach(id => { document.getElementById(id).value = ""; });
        document.getElementById("ua-tab-login").click();
      } catch { uaShowMsg("ua-register-error", "Network error. Try again."); }
      finally { btn.disabled = false; btn.textContent = "Create account"; }
    });

    document.getElementById("ua-logout-btn").addEventListener("click", async () => {
      await uaRequest("auth/logout", { method: "POST" }).catch(() => {});
      uaClearSession();
      uaRender();
    });

    document.getElementById("ua-pw-form").addEventListener("submit", async e => {
      e.preventDefault();
      uaShowMsg("ua-pw-error", "");
      uaShowMsg("ua-pw-ok", "");
      const user = uaUser();
      if (!user) return;
      const password = document.getElementById("ua-pw-new").value;
      const res = await uaRequest("users/" + user.id, { method: "PUT", body: JSON.stringify({ password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { uaShowMsg("ua-pw-error", data.error || "Failed to update password."); return; }
      uaShowMsg("ua-pw-ok", "Password updated.");
      document.getElementById("ua-pw-new").value = "";
    });

    document.getElementById("ua-org-save-btn").addEventListener("click", async () => {
      uaShowMsg("ua-org-error", "");
      uaShowMsg("ua-org-ok", "");
      const user = uaUser();
      if (!user) return;
      const slugRe = /^[a-zA-Z0-9_-]{1,32}$/;
      const orgs = [
        document.getElementById("ua-org-1").value.trim(),
        document.getElementById("ua-org-2").value.trim()
      ].filter(Boolean);
      if (orgs.some(o => !slugRe.test(o))) {
        uaShowMsg("ua-org-error", "Org names must be 1 to 32 alphanumeric, dash, or underscore characters.");
        return;
      }
      const res = await uaRequest("users/" + user.id, { method: "PUT", body: JSON.stringify({ orgs }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { uaShowMsg("ua-org-error", data.error || "Failed to save."); return; }
      const stored = uaUser();
      if (stored) { stored.orgs = orgs; localStorage.setItem("rt_user", JSON.stringify(stored)); }
      uaShowMsg("ua-org-ok", "Namespaces saved.");
    });

    /* ── Installed versions (account inventory) ───────────────── */
    // Shape: [{ component: string, version: string }]. Persisted on the user
    // document via PUT users/:id and mirrored to localStorage so the Arch view
    // (and offline reloads) can read it without a round-trip.
    const RT_INV_KEY = "rt_inventory";

    // Pulls the server's copy of the inventory on Account-page load and
    // reconciles it into localStorage, so a user switching devices/browsers
    // sees their real saved list instead of whatever (possibly empty)
    // localStorage this device happens to have. Falls back silently to
    // whatever's already local if the request fails (offline, etc.).
    async function uaLoadInventoryFromServer() {
      try {
        const res = await uaRequest("users/me");
        if (!res.ok) return uaRenderInventory();
        const me = await res.json();
        const list = uaInvNormalize(Array.isArray(me.inventory) ? me.inventory : []);
        localStorage.setItem(RT_INV_KEY, JSON.stringify(list));
        const stored = uaUser();
        if (stored) { stored.inventory = list; localStorage.setItem("rt_user", JSON.stringify(stored)); }
        uaRenderInventory(list);
      } catch { uaRenderInventory(); }
    }

    function uaInvGet() {
      const u = uaUser();
      if (u && Array.isArray(u.inventory)) return uaInvNormalize(u.inventory);
      try { return uaInvNormalize(JSON.parse(localStorage.getItem(RT_INV_KEY) || "[]")); }
      catch { return []; }
    }
    function uaInvNormalize(arr) {
      const seen = new Set(), out = [];
      for (const raw of (Array.isArray(arr) ? arr : [])) {
        const component = String(raw && raw.component || "").trim().slice(0, 64);
        const version = String(raw && raw.version || "").trim().slice(0, 32);
        if (!component || !version) continue;
        const key = component.toLowerCase();
        if (seen.has(key)) { out[out.findIndex(e => e.component.toLowerCase() === key)] = { component, version }; continue; }
        seen.add(key); out.push({ component, version });
      }
      out.sort((a, b) => a.component.toLowerCase().localeCompare(b.component.toLowerCase()));
      return out;
    }
    function uaInvValidVersion(v) { return /^[a-zA-Z0-9][a-zA-Z0-9 ._+:-]*$/.test(v); }

    async function uaInvPersist(arr) {
      const next = uaInvNormalize(arr);
      // Mirror locally first so the UI (and offline reloads) always has
      // something to show even if the server round-trip below fails.
      localStorage.setItem(RT_INV_KEY, JSON.stringify(next));
      const stored = uaUser();
      if (stored) { stored.inventory = next; localStorage.setItem("rt_user", JSON.stringify(stored)); }
      const user = uaUser();
      if (!user) return { list: next, serverOk: false, serverErr: "Not signed in." };
      try {
        const res = await uaRequest("users/" + user.id, {
          method: "PUT",
          body: JSON.stringify({ inventory: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { list: next, serverOk: false, serverErr: data.error || "Failed to save to your account." };
        return { list: next, serverOk: true, serverErr: "" };
      } catch {
        return { list: next, serverOk: false, serverErr: "Failed to reach the server; saved on this device only." };
      }
    }

    function uaInvMsg(text, kind) {
      const el = document.getElementById("ua-inv-msg");
      if (!el) return;
      el.textContent = text || "";
      el.className = "ua-msg " + (kind === "error" ? "ua-msg-error" : "ua-msg-ok");
      setDisplay(el, text ? "" : "none");
      if (text) setTimeout(() => { setDisplay(el, "none"); }, 4000);
    }

    let uaInvNamesLoaded = false;
    async function uaInvEnsureNames() {
      if (uaInvNamesLoaded) return;
      uaInvNamesLoaded = true;
      try {
        const res = await fetch(API_BASE + "c/names");
        if (!res.ok) return;
        const names = await res.json();
        const dl = document.getElementById("ua-comp-names");
        if (!dl || !Array.isArray(names)) return;
        dl.innerHTML = names.slice(0, 6000).map(n => `<option value="${uaEsc(n)}"></option>`).join("");
      } catch { /* autocomplete is best-effort */ }
    }

    async function uaInvApply(arr, okText) {
      const { list, serverOk, serverErr } = await uaInvPersist(arr);
      uaRenderInventory(list);
      uaInvMsg(serverOk ? (okText || "Saved.") : serverErr, serverOk ? "ok" : "error");
    }

    function uaRenderInventory(list) {
      const listEl = document.getElementById("ua-inv-list");
      const emptyEl = document.getElementById("ua-inv-empty");
      const countEl = document.getElementById("ua-inv-count");
      if (!listEl) return;
      uaInvEnsureNames();
      const inv = Array.isArray(list) ? list : uaInvGet();
      if (countEl) countEl.textContent = inv.length ? "(" + inv.length + ")" : "";
      if (!inv.length) {
        listEl.innerHTML = "";
        if (emptyEl) setDisplay(emptyEl, "");
        return;
      }
      if (emptyEl) setDisplay(emptyEl, "none");
      listEl.innerHTML = inv.map(e => `<div class="ua-bm-item" data-comp="${uaEsc(e.component)}">
        <div class="st-255" >
          <span class="ua-bm-name" title="${uaEsc(e.component)}">${uaEsc(e.component)}</span>
          <span class="st-256 ua-org-chip" >${uaEsc(e.version)}</span>
          <span class="u-show-block st-257 ua-inv-drift ua-muted" >checking latest…</span>
        </div>
        <div class="ua-bm-actions">
          <button class="st-258 btn btn-ghost ua-inv-edit-btn" data-comp="${uaEsc(e.component)}" data-ver="${uaEsc(e.version)}" >Edit</button>
          <button class="st-259 btn btn-ghost ua-inv-del-btn" data-comp="${uaEsc(e.component)}" >Delete</button>
        </div>
      </div>`).join("");
      uaInvAnnotate(inv);

      listEl.querySelectorAll(".ua-inv-del-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const comp = btn.dataset.comp;
          await uaInvApply(uaInvGet().filter(e => e.component !== comp), "Removed " + comp + ".");
        });
      });
      listEl.querySelectorAll(".ua-inv-edit-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const comp = btn.dataset.comp;
          const next = prompt("Version for " + comp + ":", btn.dataset.ver);
          if (next === null) return;
          const v = next.trim();
          if (!v || !uaInvValidVersion(v)) { uaInvMsg("Invalid version string.", "error"); return; }
          const cur = uaInvGet();
          const i = cur.findIndex(e => e.component === comp);
          if (i >= 0) cur[i] = { component: comp, version: v };
          await uaInvApply(cur, "Updated " + comp + ".");
        });
      });
    }

    // Live installed-vs-latest comparison (+ recent CVE flag) for each recorded row.
    async function uaInvAnnotate(inv) {
      const rows = Array.isArray(inv) ? inv : uaInvGet();
      if (!rows.length) return;
      const q = rows.map(e => "component=name:" + encodeURIComponent(e.component)).join("&");
      const names = rows.map(e => e.component);
      const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
      let data, cves = [];
      try {
        const [rLatest, rCve] = await Promise.all([
          fetch(API_BASE + "v/d/versionsByComponent?" + q, { headers: { Accept: "application/json" } }),
          fetch(API_BASE + "v/search?q=" + encodeURIComponent(names.join(",")) + "&isCve=true&start=" + start
            + "&limit=400&fields=versionProductName,versionProductBrand,versionReleaseDate,versionUrl,isCve",
            { headers: { Accept: "application/json" } }).catch(() => null),
        ]);
        if (!rLatest.ok) throw 0;
        data = await rLatest.json();
        if (rCve && rCve.ok) { const b = await rCve.json(); cves = Array.isArray(b) ? b : (b.data || []); }
      } catch {
        document.querySelectorAll("#ua-inv-list .ua-inv-drift").forEach(s => { s.textContent = ""; });
        return;
      }
      const byName = new Map((Array.isArray(data) ? data : []).map(c => [String(c.name).toLowerCase(), c]));
      const cveByName = new Map();
      for (const r of cves) {
        if (!r.isCve) continue;
        const t = aDateMs(r.versionReleaseDate);
        for (const k of [String(r.versionProductName || "").toLowerCase(), String(r.versionProductBrand || "").toLowerCase()]) {
          if (!k) continue;
          const prev = cveByName.get(k);
          if (!prev || t > prev._t) cveByName.set(k, { _t: t, code: aExtractCveCode(r.versionUrl), date: r.versionReleaseDate });
        }
      }
      document.querySelectorAll("#ua-inv-list .ua-bm-item").forEach(row => {
        const comp = row.dataset.comp;
        const slot = row.querySelector(".ua-inv-drift");
        const entry = rows.find(e => e.component === comp);
        if (!slot || !entry) return;
        const rec = byName.get(String(comp).toLowerCase());
        const lv = rec && rec.latestVersion && rec.latestVersion.versionNumber;
        const cve = (rec && rec.latestCveVersion)
          ? { code: aExtractCveCode(rec.latestCveVersion.versionUrl) }
          : cveByName.get(String(comp).toLowerCase());
        const cveHtml = cve ? ` <span class="st-260" >· ${uaEsc(cve.code)}${cve.date ? " (" + cve.date.slice(4, 6) + "/" + cve.date.slice(6, 8) + ")" : ""}</span>` : "";
        if (!lv) { slot.innerHTML = "no release data" + cveHtml; return; }
        const gap = aVerGap(entry.version, lv);
        if (gap.tier === "none") {
          slot.innerHTML = `<span class="ua-muted">on latest (${uaEsc(lv)})</span>` + cveHtml;
          return;
        }
        const color = A_FILLS.behind;
        slot.innerHTML =
          `<span class="st-261 ua-org-chip rt-bg" style="--rt-bg:${color}">→ ${uaEsc(lv)}</span> `
          + `<span class="ua-muted">${uaEsc(aGapLabel(gap))} behind</span>` + cveHtml;
      });
    }

    document.getElementById("ua-inv-refresh").addEventListener("click", () => uaLoadInventoryFromServer());

    document.getElementById("ua-inv-add-form").addEventListener("submit", async e => {
      e.preventDefault();
      const compEl = document.getElementById("ua-inv-comp");
      const verEl = document.getElementById("ua-inv-ver");
      const component = compEl.value.trim();
      const version = verEl.value.trim();
      if (!component || !version) return;
      if (!uaInvValidVersion(version)) { uaInvMsg("Version must start alphanumeric; letters, digits, . _ + : - only.", "error"); return; }
      await uaInvApply([...uaInvGet(), { component, version }], "Added " + component + ".");
      compEl.value = ""; verEl.value = ""; compEl.focus();
    });

    document.getElementById("ua-inv-bulk-btn").addEventListener("click", async () => {
      const ta = document.getElementById("ua-inv-bulk");
      const rows = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!rows.length) return;
      const merged = uaInvGet();
      let added = 0, skipped = 0;
      for (const line of rows) {
        const m = line.match(/^(.+?)\s*(?:@|,|\s)\s*([^\s,@]+)\s*$/);
        if (!m) { skipped++; continue; }
        const component = m[1].trim().slice(0, 64);
        const version = m[2].trim().slice(0, 32);
        if (!component || !version || !uaInvValidVersion(version)) { skipped++; continue; }
        const i = merged.findIndex(e => e.component.toLowerCase() === component.toLowerCase());
        if (i >= 0) merged[i] = { component, version }; else merged.push({ component, version });
        added++;
      }
      if (!added) { uaInvMsg("No valid lines found.", "error"); return; }
      await uaInvApply(merged, added + " imported" + (skipped ? ", " + skipped + " skipped." : "."));
      ta.value = "";
    });

    document.getElementById("ua-refresh-users").addEventListener("click", uaLoadUsers);
    document.getElementById("ua-refresh-searches").addEventListener("click", uaLoadSearchEvents);

    // Cached id -> {name, email} lookup, shared with uaLoadUsers's own list
    // so the search-events table can show a real name instead of a raw
    // ObjectId. Fetched at most once per page load (capped at the same
    // 100-user page size GET /api/users/ itself caps at) and reused by
    // both callers.
    let uaUsersMapPromise = null;
    function uaUsersMap() {
      if (!uaUsersMapPromise) {
        uaUsersMapPromise = uaRequest("users/?limit=100")
          .then(res => res.ok ? res.json() : { data: [] })
          .then(data => new Map((data.data || []).map(u => [String(u._id), u])))
          .catch(() => new Map());
      }
      return uaUsersMapPromise;
    }

    async function uaLoadSearchEvents() {
      const section = document.getElementById("ua-search-events-section");
      const listEl  = document.getElementById("ua-se-list");
      const countEl = document.getElementById("ua-se-count");
      setDisplay(section, "");
      listEl.innerHTML = `<p class="st-189 ua-muted" >Loading…</p>`;
      const [res, usersById] = await Promise.all([
        uaRequest("events/search?limit=200").catch(() => null),
        uaUsersMap(),
      ]);
      if (!res || !res.ok) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >Could not load search events.</p>`;
        return;
      }
      const data = await res.json();
      const events = data.data || [];
      if (countEl) countEl.textContent = "(" + events.length + ")";
      if (!events.length) {
        listEl.innerHTML = `<p class="st-189 ua-muted" >No searches recorded yet.</p>`;
        return;
      }
      const esc = s => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
      // Relative instead of a full timestamp: shorter (helps the table
      // stay narrow enough to never need its own horizontal scroll, see
      // .ua-se-table's own comment), and "3d ago" reads faster than a
      // full date/time for a list sorted newest-first anyway. The exact
      // timestamp is still the row's title attribute for anyone who
      // needs it precisely.
      const relTime = (iso) => {
        if (!iso) return "";
        const ms = Date.now() - new Date(iso).getTime();
        if (ms < 0) return "just now";
        const min = Math.floor(ms / 60000);
        if (min < 1) return "just now";
        if (min < 60) return min + "m ago";
        const hr = Math.floor(min / 60);
        if (hr < 24) return hr + "h ago";
        const day = Math.floor(hr / 24);
        if (day < 30) return day + "d ago";
        return new Date(iso).toISOString().slice(0, 10);
      };
      listEl.innerHTML = `<table class="ua-se-table">
        <thead><tr><th>Type</th><th>Query / prompt</th><th>User</th><th>Time</th></tr></thead>
        <tbody>` +
        events.map(e => {
          const isAsk = e.kind === "ask";
          // A real Ask prompt is a full sentence, not a comma-separated
          // list of component names — normalizeQuery is built for the
          // latter (trims each comma segment) and would only cosmetically
          // reflow a prompt's punctuation, so it's skipped here to show
          // exactly what was typed.
          const q = isAsk ? String(e.query || "") : normalizeQuery(e.query);
          // Clickable for a real Ask question only (a component search's
          // own `q` is a bare comma list, not something worth replaying
          // as a question) -- per explicit request, pastes this row's
          // exact query into the live Ask input so an admin can re-run
          // what a user actually asked without retyping it. A plain
          // <button>, not a link/span with a click handler bolted on, so
          // it's keyboard-reachable and reads as interactive on its own.
          const typeCell = isAsk
            ? `<button type="button" class="ua-se-type ua-se-type-ask ua-se-ask-btn" title="Click to paste this question into the Ask input" data-query="${esc(q)}">💬 ask</button>`
            : `<span class="ua-se-type" title="Vendor/component search">🔍 search</span>`;
          const isAnon = !e.userId || e.userId === "anonymous";
          const known = !isAnon && usersById.get(String(e.userId));
          const userCell = isAnon
            ? `<span class="ua-se-anon">anonymous</span>`
            : known
              ? `<span title="${esc(known.email)}">${esc(known.name || known.email)}</span>`
              : `<span title="${esc(e.userId)}">${esc((e.userId || "").slice(-8))}</span>`;
          return `<tr>
            <td class="st-262" >${typeCell}</td>
            <td title="${esc(q)}">${esc(q)}</td>
            <td>${userCell}</td>
            <td class="st-262"  title="${esc(e.timestamp ? new Date(e.timestamp).toLocaleString() : "")}">${esc(relTime(e.timestamp))}</td>
          </tr>`;
        }).join("") +
        `</tbody></table>`;
      // The Ask input (#askQuestion) is the same persistent, position:fixed
      // element visible from every view (see #stickyAskHeader's own
      // comment) -- including this Admin/Account view -- so pasting into
      // it and focusing it is enough; no view switch needed for the
      // admin to see and use it.
      listEl.querySelectorAll(".ua-se-ask-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const q = btn.getAttribute("data-query") || "";
          const input = document.getElementById("askQuestion");
          if (!input) return;
          input.value = q;
          input.focus();
          const prevText = btn.textContent;
          btn.textContent = "✓ pasted";
          setTimeout(() => { btn.textContent = prevText; }, 1200);
        });
      });
    }

    function trackSearch(q) {
      const normalized = normalizeQuery(q);
      if (!normalized) return;
      const headers = { "Content-Type": "application/json" };
      const token = localStorage.getItem("rt_token");
      if (token) headers["Authorization"] = "Bearer " + token;
      fetch(API_BASE + "events/search", {
        method: "POST", headers,
        body: JSON.stringify({ query: normalized })
      }).catch(() => {});
    }

    async function uaLoadBookmarks() {
      const listEl = document.getElementById("ua-bm-list");
      const emptyEl = document.getElementById("ua-bm-empty");
      const countEl = document.getElementById("ua-bm-count");
      if (!listEl) return;
      listEl.innerHTML = `<p class="st-263 ua-muted" >Loading…</p>`;
      if (emptyEl) setDisplay(emptyEl, "none");
      const res = await uaRequest("bookmarks/").catch(() => null);
      if (!res || !res.ok) {
        listEl.innerHTML = `<p class="st-263 ua-muted" >Could not load bookmarks.</p>`;
        return;
      }
      const data = await res.json();
      if (countEl) countEl.textContent = "(" + data.data.length + ")";
      if (!data.data.length) {
        listEl.innerHTML = "";
        if (emptyEl) setDisplay(emptyEl, "");
        return;
      }
      const shareBase = location.origin + location.pathname + "?share=";
      listEl.innerHTML = data.data.map(b => {
        const orgChips = (b.orgs && b.orgs.length)
          ? b.orgs.map(o => `<span class="ua-org-chip">${uaEsc(o)}</span>`).join("")
          : "";
        return `<div class="ua-bm-item" data-id="${uaEsc(b._id)}">
          <div class="st-255" >
            <span class="ua-bm-name" title="${uaEsc(b.name)}">${uaEsc(b.name)}</span>
            ${orgChips ? `<div class="u-show-flex st-264" >${orgChips}</div>` : ""}
          </div>
          <div class="ua-bm-actions">
            <a href="${uaEsc(b.url)}" class="st-258 btn btn-ghost"  title="Open saved search">Open</a>
            <button class="st-258 btn btn-ghost ua-bm-edit-btn" data-id="${uaEsc(b._id)}" data-name="${uaEsc(b.name)}"  title="Rename bookmark">Edit</button>
            <button class="st-258 btn btn-ghost ua-bm-share-btn" data-share="${uaEsc(b.shareId)}"  title="Copy share link">Copy link</button>
            <button class="st-259 btn btn-ghost ua-bm-del-btn" data-id="${uaEsc(b._id)}" >Delete</button>
          </div>
        </div>`;
      }).join("");

      listEl.querySelectorAll(".ua-bm-share-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const shareId = btn.dataset.share;
          const link = shareBase + encodeURIComponent(shareId);
          navigator.clipboard.writeText(link).then(() => {
            const orig = btn.textContent;
            btn.textContent = "Copied!";
            setTimeout(() => { btn.textContent = orig; }, 1500);
          }).catch(() => {
            prompt("Share link:", link);
          });
        });
      });

      listEl.querySelectorAll(".ua-bm-edit-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.id;
          const item = listEl.querySelector(`.ua-bm-item[data-id="${id}"]`);
          if (!item) return;
          const nameEl = item.querySelector(".ua-bm-name");
          const currentName = btn.dataset.name;
          const input = document.createElement("input");
          input.type = "text";
          input.value = currentName;
          input.classList.add("ua-inline-input");
          const saveBtn = document.createElement("button");
          saveBtn.textContent = "Save";
          saveBtn.className = "btn btn-ghost";
          saveBtn.classList.add("ua-inline-btn");
          const cancelBtn = document.createElement("button");
          cancelBtn.textContent = "Cancel";
          cancelBtn.className = "btn btn-ghost";
          cancelBtn.classList.add("ua-inline-btn", "ua-inline-btn-2");
          const editWrap = document.createElement("div");
          editWrap.classList.add("ua-inline-wrap");
          editWrap.appendChild(input);
          const editActions = document.createElement("div");
          editActions.appendChild(saveBtn);
          editActions.appendChild(cancelBtn);
          editWrap.appendChild(editActions);
          const actionsEl = item.querySelector(".ua-bm-actions");
          const nameParent = nameEl.parentElement;
          setDisplay(nameParent, "none");
          setDisplay(actionsEl, "none");
          item.appendChild(editWrap);
          input.focus();
          input.select();
          const doCancel = () => {
            item.removeChild(editWrap);
            setDisplay(nameParent, "");
            setDisplay(actionsEl, "");
          };
          cancelBtn.addEventListener("click", doCancel);
          const doSave = async () => {
            const newName = input.value.trim();
            if (!newName) { input.focus(); return; }
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving…";
            const res = await uaRequest("bookmarks/" + id, { method: "PUT", body: JSON.stringify({ name: newName }) });
            if (res.ok) {
              uaLoadBookmarks();
            } else {
              const err = await res.json().catch(() => ({}));
              alert(err.error || "Failed to rename bookmark.");
              saveBtn.disabled = false;
              saveBtn.textContent = "Save";
            }
          };
          saveBtn.addEventListener("click", doSave);
          input.addEventListener("keydown", e => {
            if (e.key === "Enter") doSave();
            if (e.key === "Escape") doCancel();
          });
        });
      });

      listEl.querySelectorAll(".ua-bm-del-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this bookmark?")) return;
          const id = btn.dataset.id;
          const res = await uaRequest("bookmarks/" + id, { method: "DELETE" });
          if (res.ok) {
            uaLoadBookmarks();
          } else {
            const err = await res.json().catch(() => ({}));
            alert(err.error || "Failed to delete bookmark.");
          }
        });
      });
    }

    document.getElementById("ua-bm-refresh").addEventListener("click", uaLoadBookmarks);

    // Restore shared bookmark on page load
    (async function uaBmHandleShare() {
      const shareId = new URLSearchParams(location.search).get("share");
      if (!shareId) return;
      try {
        const res = await fetch(API_BASE + "bookmarks/share/" + encodeURIComponent(shareId));
        if (!res.ok) return;
        const data = await res.json();
        if (!data.url) return;
        const target = new URL(data.url, location.href);
        target.searchParams.delete("view");
        const q = target.searchParams.get("q") || "";
        if (q) {
          history.replaceState({}, "", target.pathname + "?" + target.searchParams.toString());
          document.getElementById("components").value = q;
          document.getElementById("filterForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
        if (data.orgs && data.orgs.length) {
          const banner = document.createElement("div");
          banner.className = "shared-banner";
          banner.textContent = "Shared by: " + data.orgs.join(", ");
          document.body.appendChild(banner);
          setTimeout(() => banner.remove(), 4000);
        }
      } catch {}
    })();

    document.getElementById("ua-topbar-user").addEventListener("click", () => {
      if (!UA_ACTIVE) activateUsers();
    });

    function activateUsers() {
      if (ER_ACTIVE) deactivateEvalRewriter();
      if (EE_ACTIVE) deactivateEvalEvaluator();
      if (EO_ACTIVE) deactivateEvalOrchestrator();
      if (G_ACTIVE)  deactivateGraph();
      if (A_ACTIVE)  deactivateArch();
      if (CV_ACTIVE) deactivateCve();
      if (DB_ACTIVE) deactivateDashboard();
      if (D_ACTIVE)  deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE) deactivateChangelog();
      if (NET_ACTIVE) deactivateNetwork();
      UA_ACTIVE = true;
      setViewParam("account");
      setDisplay(document.getElementById("usersView"), "block");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.usersLink.classList.add("nav-active");
      uaRender();
    }

    function deactivateUsers() {
      UA_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("usersView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.usersLink.classList.remove("nav-active");
    }

    EL.usersLink.addEventListener("click", e => {
      e.preventDefault();
      if (UA_ACTIVE) { deactivateUsers(); return; }
      activateUsers();
    });

    // Restore session state in sidebar and topbar on load
    uaUpdateSidebar();
    // Hide the Ask intro panel's sign-in CTA if already logged in (see
    // uaUpdateAskIntroSignin's own comment on why this needs its own
    // bootstrap call, not just a ride on uaRender()).
    uaUpdateAskIntroSignin();

  
