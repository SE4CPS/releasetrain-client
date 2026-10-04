// docs.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

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
      if (T_ACTIVE)   deactivateTriage();
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
      if (T_ACTIVE)   deactivateTriage();
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
      if (T_ACTIVE) deactivateTriage();
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
