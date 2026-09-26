// risk.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

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
