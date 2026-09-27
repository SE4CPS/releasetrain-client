// ask.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

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
      if (ASK_INTENT_KEYWORDS.opinion.some(kw => text.indexOf(kw) !== -1)) return "opinion";
      // Mirrors the server's isWhenQuestion: a "when" question is always answered with a date.
      return ASK_WHEN_QUESTION_RX.test(text) ? "when" : "fact";
    }
    const ASK_WHEN_QUESTION_RX = /^\s*(?:so|well|ok(?:ay)?)?\s*(?:when\b|what\s+(?:date|day|year)\b|which\s+(?:date|day)\b|how\s+long\s+ago\b)|\b(?:release|released|launch|launched)\s+date\b/i;
    const ASK_QUESTION_TYPE_BADGE_LABELS = { fact: "Fact question", opinion: "Opinion question", when: "When question: date" };
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
