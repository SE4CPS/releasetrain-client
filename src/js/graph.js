// graph.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

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
