// helpers.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

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
