// core.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

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
