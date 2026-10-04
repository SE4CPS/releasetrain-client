// triage.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    /* ── Update Triage ("here are my current installed software, how
       would you recommend updating them in which order? with
       reasoning") ─────────────────────────────────────────────────────
       Its own top-level view, not a mode inside the Arch view: "pick a
       VM, pick an optimization, click Run Triage" answers a different
       question than Arch's diagram/table/flowchart (a visual map of a
       searched component list) do, and never needed the search box,
       "+ Add Stack", or any of that machinery - just one machine and one
       weighting. */
    let T_ACTIVE = false;
    // Cached last response, so switching away and back without touching
    // the machine/weighting just re-shows it instead of re-running a
    // real model call. Cleared the moment a different machine is picked
    // or Run Triage is clicked again - a stale table for a different
    // machine would be misleading.
    let T_RESULTS = null;
    const tEl = id => document.getElementById("t-" + id);

    function tEsc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // One <option> per machine recorded in Installed versions (see
    // inventory.js), value = the machine name itself so
    // tComponentsForMachine can look up that machine's own {name,
    // version} pairs directly - unlike Arch's #a-stackSelect (whose
    // value is a CSV of component names, since it feeds a search box
    // instead of running anything on its own). Rebuilt every time Triage
    // is activated. Same server-refresh-when-signed-in reasoning as
    // aPopulateMachineStacks in arch.js: uaInvGet() alone only reads
    // whatever's cached in localStorage, which is stale the moment
    // inventory changes anywhere other than this browser.
    async function tPopulateMachines() {
      const sel = tEl("stackSelect");
      if (!sel || typeof uaInvGet !== "function") return;
      if (typeof uaUser === "function" && uaUser() && typeof uaLoadInventoryFromServer === "function") {
        await uaLoadInventoryFromServer();
      }
      const prev = sel.value;
      sel.innerHTML = `<option value="">Pick a machine…</option>`;
      const counts = new Map();
      for (const e of uaInvGet()) {
        if (!e.machine) continue;
        counts.set(e.machine, (counts.get(e.machine) || 0) + 1);
      }
      for (const [machine, count] of counts) {
        const opt = document.createElement("option");
        opt.value = machine;
        opt.textContent = `${machine} (${count})`;
        sel.appendChild(opt);
      }
      // Not reset to "" after a repopulate - same "keep it selected
      // until the user changes it" reasoning as arch.js's own
      // #a-stackSelect/"+ Add Stack" fix.
      if (prev && counts.has(prev)) sel.value = prev;
    }

    function tComponentsForMachine(machine) {
      if (typeof uaInvGet !== "function" || !machine) return [];
      return uaInvGet()
        .filter(e => e.machine === machine && e.component)
        .map(e => ({ name: e.component, version: e.version || null }));
    }

    function tRenderPlaceholder(msg) {
      const el = tEl("result"); if (el) el.innerHTML = `<p class="a-muted-note">${tEsc(msg)}</p>`;
    }

    // Build the {name, version} list the server deterministically looks
    // up facts for (POST /api/ask/triage never trusts a client-supplied
    // version/CVE claim - see that route in releasetrain-server's
    // src/app.js) and POST it, then render the sorted, reasoned result.
    async function tRunTriage() {
      const sel = tEl("stackSelect");
      const machine = sel && sel.value;
      if (!machine) { tRenderPlaceholder("Pick a machine first."); return; }
      const components = tComponentsForMachine(machine);
      if (!components.length) { tRenderPlaceholder("No components recorded for that machine."); return; }
      const optimizeSel = tEl("optimize");
      const optimizeFor = (optimizeSel && optimizeSel.value) || "both";
      const loader = tEl("loader"), el = tEl("result");
      if (el) el.innerHTML = `<p class="a-muted-note">Analyzing update order...</p>`;
      if (loader) setDisplay(loader, "block");
      try {
        const token = localStorage.getItem("rt_token");
        const headers = { "Content-Type": "application/json", Accept: "application/json" };
        if (token) headers["Authorization"] = "Bearer " + token;
        const res = await fetch(`${API_BASE}ask/triage`, {
          method: "POST",
          headers,
          body: JSON.stringify({ components, optimizeFor }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `${res.status}`);
        }
        const data = await res.json();
        T_RESULTS = data;
        tRenderResult(data);
      } catch (e) {
        console.error("Triage error:", e);
        T_RESULTS = null;
        if (el) el.innerHTML = `<p class="a-muted-note">Could not run triage: ${tEsc(String(e.message || e))}</p>`;
      } finally {
        if (loader) setDisplay(loader, "none");
      }
    }

    // Same .a-drift/.a-score table styling the Arch view's own drift
    // table already established (arch.js's aRenderTable), reused as-is
    // so this reads as "the same kind of table, with an extra Order/
    // Reasoning pair of columns" rather than an unrelated new widget.
    function tRenderResult(data) {
      const el = tEl("result"); if (!el) return;
      const results = Array.isArray(data && data.results) ? data.results : [];
      if (!results.length) { el.innerHTML = `<p class="a-muted-note">No components.</p>`; return; }
      const optimizeLabel = { security: "Security", stability: "Stability", both: "Both" }[data.optimizeFor] || "Both";
      const cveCount = results.filter(r => r.cve).length;
      const FILL_BEHIND = "#fcd34d", FILL_CVE = "#fca5a5";
      el.innerHTML =
        `<div class="a-score">Update order &middot; optimized for <b>${tEsc(optimizeLabel)}</b> &nbsp;&middot;&nbsp; ${results.length} component(s) &nbsp;&middot;&nbsp; ${cveCount} with a known CVE</div>` +
        `<table class="a-drift"><thead><tr>` +
        `<th>#</th><th>Component</th><th>Installed</th><th>Latest</th><th>Change</th><th>CVE</th><th>Reasoning</th>` +
        `</tr></thead><tbody>` +
        results.map(r => {
          const bumpChip = r.versionBump && r.versionBump !== "unknown"
            ? `<span class="a-chip-t rt-bg" style="--rt-bg:${FILL_BEHIND}">${tEsc(r.versionBump)}</span>`
            : `<span class="a-muted-note">-</span>`;
          const cveChip = r.cve
            ? `<span class="a-chip-t rt-bg" style="--rt-bg:${FILL_CVE}">${tEsc(r.cve.id)}</span>`
            : "-";
          return `<tr>` +
            `<td class="mono">${tEsc(r.order)}</td>` +
            `<td>${tEsc(r.name)}</td>` +
            `<td class="mono">${tEsc(r.currentVersion || "?")}</td>` +
            `<td class="mono">${tEsc(r.latestVersion || "-")}</td>` +
            `<td>${bumpChip}</td>` +
            `<td>${cveChip}</td>` +
            `<td class="a-reasoning-cell">${tEsc(r.reasoning)}</td>` +
            `</tr>`;
        }).join("") +
        `</tbody></table>`;
    }

    /* ── Triage view: show / hide ─────────────────────────────── */
    async function activateTriage() {
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
      if (NET_ACTIVE) deactivateNetwork();
      T_ACTIVE = true;
      setViewParam("triage");
      setDisplay(document.getElementById("triageView"), "flex");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.triageLink.classList.add("nav-active");
      T_RESULTS = null;
      tRenderPlaceholder("Pick a machine, then click Run Triage.");
      await tPopulateMachines();
    }
    function deactivateTriage() {
      T_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("triageView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.triageLink.classList.remove("nav-active");
    }

    EL.triageLink.addEventListener("click", e => {
      e.preventDefault();
      if (T_ACTIVE) { deactivateTriage(); return; }
      activateTriage();
    });

    tEl("runBtn")?.addEventListener("click", tRunTriage);
    // Picking a different machine clears any stale result left over
    // from the previous one, so a leftover table never silently reads
    // as belonging to the newly-picked machine.
    tEl("stackSelect")?.addEventListener("change", () => {
      T_RESULTS = null;
      tRenderPlaceholder("Pick a machine, then click Run Triage.");
    });
    // Changing "Optimize for" while already looking at a result re-runs
    // it with the new weighting; otherwise it's just remembered for the
    // next time Run Triage is clicked.
    tEl("optimize")?.addEventListener("change", () => { if (T_RESULTS) tRunTriage(); });

    // Home-page shortcut (see uaUpdateAskIntroSignin in account.js,
    // which shows/hides #askTriageCallout for a signed-in visitor):
    // opens Triage the same way clicking the nav link would.
    document.getElementById("askTriageCalloutLink")?.addEventListener("click", e => {
      e.preventDefault();
      activateTriage();
    });
