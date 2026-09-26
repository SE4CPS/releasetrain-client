// network.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

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
