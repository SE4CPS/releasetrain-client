// account.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    /************************* USER ACCOUNT MANAGEMENT *************************/

    let UA_ACTIVE = false;

    function uaToken() { return localStorage.getItem("rt_token"); }
    function uaUser() {
      try { return JSON.parse(localStorage.getItem("rt_user") || "null"); } catch { return null; }
    }
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
        uaSetAdminTabs(user.role === "admin");
        if (user.role === "admin") {
          setDisplay(adminSection, "");
          uaLoadServerAlerts();
          uaLoadVisitsChart();
          uaLoadVisitsTab();
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


    // Account page sub-tabs: each section carries data-ua-group and only the
    // selected tab's sections are shown. Uses its own hide class (ua-tab-hidden)
    // so it never fights the show/hide logic some sections already have.
    function uaSelectSubtab(name) {
      const panel = document.getElementById("ua-profile-panel");
      if (!panel) return;
      panel.querySelectorAll("details.ua-admin-details[data-ua-group]").forEach((d) => {
        d.classList.toggle("ua-tab-hidden", d.dataset.uaGroup !== name);
      });
      panel.querySelectorAll("[data-ua-tab]").forEach((b) => {
        b.classList.toggle("ua-tab-active", b.dataset.uaTab === name);
      });
      try { sessionStorage.setItem("ua-subtab", name); } catch { /* private mode */ }
    }
    function uaSetAdminTabs(isAdmin) {
      document.querySelectorAll(".ua-subtab-admin").forEach((b) => setDisplay(b, isAdmin ? "" : "none"));
      setDisplay(document.getElementById("ua-visits-top"), isAdmin ? "" : "none");
      let stored = "account";
      try { stored = sessionStorage.getItem("ua-subtab") || "account"; } catch { /* private mode */ }
      const adminOnly = ["overview", "visits", "alerts", "settings", "bots", "users"];
      uaSelectSubtab(!isAdmin && adminOnly.includes(stored) ? "account" : stored);
    }
    document.getElementById("ua-profile-panel")?.addEventListener("click", (e) => {
      const b = e.target.closest("[data-ua-tab]");
      if (b) uaSelectSubtab(b.dataset.uaTab);
    });
    uaSelectSubtab("account");

    // Server alerts (admin): GET /api/admin/server-alerts reads the VM's alert log.
    async function uaLoadServerAlerts() {
      const list = document.getElementById("ua-alerts-list");
      if (!list) return;
      const res = await uaRequest("admin/server-alerts?limit=50").catch(() => null);
      if (!res || !res.ok) {
        list.innerHTML = '<p class="ua-muted">Could not load alerts.</p>';
        return;
      }
      const data = await res.json().catch(() => ({}));
      const alerts = Array.isArray(data.alerts) ? data.alerts : [];
      const levels = ["critical", "warn", "ok", "info"];
      const countEl = document.getElementById("ua-alerts-count");
      if (countEl) countEl.textContent = alerts.length ? "(" + alerts.length + ")" : "";
      // Badge on the tab: problems (critical or warn) from the last 24 hours.
      const since = Date.now() - 24 * 3600 * 1000;
      const recent = alerts.filter((a) => (a.level === "critical" || a.level === "warn") && Date.parse(a.ts) >= since).length;
      const badge = document.getElementById("ua-alerts-badge");
      if (badge) {
        badge.textContent = String(recent);
        setDisplay(badge, recent ? "" : "none");
      }
      list.innerHTML = alerts.length
        ? alerts.map((a) => {
          const lvl = levels.includes(a.level) ? a.level : "info";
          const when = Number.isNaN(Date.parse(a.ts)) ? a.ts : new Date(a.ts).toLocaleString();
          return `<div class="ua-alert-row ua-alert-${lvl}"><span class="ua-alert-dot"></span><span class="ua-alert-time">${uaEsc(when)}</span><span class="ua-alert-msg">${uaEsc(a.message)}</span></div>`;
        }).join("")
        : '<p class="ua-muted">No alerts yet. The server watchdog reports here when something goes wrong.</p>';
    }
    document.getElementById("ua-refresh-alerts")?.addEventListener("click", (e) => { e.preventDefault(); uaLoadServerAlerts(); });
    setInterval(() => {
      const u = uaUser();
      if (u && u.role === "admin" && !document.hidden) uaLoadServerAlerts();
    }, 60000);



    // ---- Visits (admin): chart at the top of the Account page, and the Visits tab.
    // Data: GET /api/admin/visits?days=N, computed on the server from the web
    // server's access log (IP addresses as-is, country looked up from the IP).
    let uaVisitsChart = null;
    function uaWithChartJs(cb) {
      if (typeof Chart !== "undefined") { cb(); return; }
      let s = document.querySelector('script[src*="chart.umd"]');
      if (!s) {
        s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js";
        s.crossOrigin = "anonymous";
        document.head.appendChild(s);
      }
      s.addEventListener("load", cb, { once: true });
    }
    function uaCountryLabel(code) {
      if (!/^[A-Z]{2}$/.test(code || "") || code === "ZZ") return "Unknown";
      let name = code;
      try { name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch { /* old browser */ }
      return name + " (" + code + ")";
    }
    async function uaFetchVisits(days) {
      const res = await uaRequest("admin/visits?days=" + days).catch(() => null);
      if (!res || !res.ok) return null;
      return res.json().catch(() => null);
    }
    async function uaLoadVisitsChart() {
      const canvas = document.getElementById("ua-visits-chart");
      if (!canvas) return;
      const data = await uaFetchVisits(14);
      const sum = document.getElementById("ua-visits-top-sum");
      if (!data || !Array.isArray(data.daily)) {
        if (sum) sum.textContent = "Could not load visits.";
        return;
      }
      if (sum) sum.textContent = data.totals.visits + " visits, " + data.totals.uniques + " unique visitors";
      const labels = data.daily.map((d) => new Date(d.date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }));
      uaWithChartJs(() => {
        try {
          if (uaVisitsChart) { uaVisitsChart.destroy(); uaVisitsChart = null; }
          uaVisitsChart = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
              labels,
              datasets: [
                { type: "bar", label: "Total visits", data: data.daily.map((d) => d.visits), backgroundColor: "rgba(99,102,241,0.25)", borderColor: "rgba(99,102,241,0.6)", borderWidth: 1, order: 2 },
                { type: "line", label: "Unique visitors", data: data.daily.map((d) => d.uniques), borderColor: "#2563eb", backgroundColor: "#2563eb", tension: 0.3, pointRadius: 3, order: 1 },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              plugins: { legend: { position: "top", align: "end", labels: { boxWidth: 12 } } },
              scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            },
          });
        } catch (e) { console.warn("[visits-chart]", e); }
      });
    }
    function uaVisitsTable(head, rows, empty) {
      if (!rows.length) return `<p class="ua-muted">${uaEsc(empty)}</p>`;
      return `<table class="ua-data-table"><thead><tr>${head.map((h, i) => `<th${i ? ' class="ua-num"' : ""}>${uaEsc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
    }
    async function uaLoadVisitsTab() {
      const sel = document.getElementById("ua-visits-days");
      const days = sel ? Number(sel.value) || 14 : 14;
      const $ = (id) => document.getElementById(id);
      if (!$("ua-visits-cards")) return;
      const data = await uaFetchVisits(days);
      if (!data || !Array.isArray(data.daily)) {
        $("ua-visits-summary").textContent = "(could not load)";
        return;
      }
      $("ua-visits-summary").textContent = "(" + data.from + " to " + data.to + ")";
      $("ua-visits-n-visits").textContent = data.totals.visits;
      $("ua-visits-n-uniques").textContent = data.totals.uniques;
      $("ua-visits-n-ask").textContent = data.totals.ask;
      $("ua-visits-n-api").textContent = data.totals.api;
      $("ua-visits-countries").innerHTML = uaVisitsTable(["Country", "Visits", "Visitors"],
        data.countries.map((c) => `<tr><td>${uaEsc(uaCountryLabel(c.code))}</td><td class="ua-num">${c.visits}</td><td class="ua-num">${c.uniques}</td></tr>`), "No visits yet.");
      $("ua-visits-pages").innerHTML = uaVisitsTable(["View", "Visits"],
        data.pages.map((p) => `<tr><td>${uaEsc(p.page)}</td><td class="ua-num">${p.visits}</td></tr>`), "No visits yet.");
      $("ua-visits-refs").innerHTML = uaVisitsTable(["Referrer", "Visits"],
        data.referrers.map((r) => `<tr><td>${uaEsc(r.host)}</td><td class="ua-num">${r.visits}</td></tr>`), "No visits yet.");
      $("ua-visits-visitors").innerHTML = uaVisitsTable(["IP address", "Country", "Visits", "Asked", "Last seen", "View", "Browser"],
        data.visitors.map((v) => `<tr><td class="ua-mono">${uaEsc(v.ip)}</td><td>${uaEsc(uaCountryLabel(v.country))}</td><td class="ua-num">${v.visits}</td><td class="ua-num">${v.ask}</td><td>${uaEsc(new Date(v.last).toLocaleString())}</td><td>${uaEsc(v.page || "")}</td><td>${uaEsc(v.browser || "")}</td></tr>`),
        "No visitors in this period.");
    }
    document.getElementById("ua-refresh-visits")?.addEventListener("click", (e) => { e.preventDefault(); uaLoadVisitsTab(); uaLoadVisitsChart(); });
    document.getElementById("ua-visits-days")?.addEventListener("change", uaLoadVisitsTab);
    let uaVisitsTick = 0;
    setInterval(() => {
      const u = uaUser();
      if (u && u.role === "admin" && !document.hidden && ++uaVisitsTick % 5 === 0) { uaLoadVisitsChart(); uaLoadVisitsTab(); }
    }, 60000);


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
