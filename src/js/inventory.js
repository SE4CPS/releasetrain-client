// inventory.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    /* ── Installed versions (account inventory) ───────────────── */
    // Shape: [{ component: string, version: string, vendor?: string, machine?: string }].
    // vendor/machine are both optional and omitted from a saved entry entirely
    // when blank (see the server's identical rule in PUT users/:id). vendor
    // exists because ReleaseTrain only tracks a bare product name, no
    // publisher field, so "Google Chrome" needs somewhere to keep "Google"
    // once matched down to "Chrome". machine exists for a user with more than
    // one computer, where the same component can legitimately be a different
    // version on each one. Persisted on the user document via PUT users/:id
    // and mirrored to localStorage so the Arch view (and offline reloads) can
    // read it without a round-trip.
    const RT_INV_KEY = "rt_inventory";
    function uaInvKey(component, vendor, machine) {
      return component.toLowerCase() + "|" + (vendor || "").toLowerCase() + "|" + (machine || "").toLowerCase();
    }
    // A row is no longer uniquely identified by component alone (two
    // vendors, or two machines, can share one), so every lookup needs the
    // full (component, vendor, machine) triple, not just a component match.
    function uaInvFind(list, component, vendor, machine) {
      return list.findIndex(e => e.component === component && (e.vendor || "") === (vendor || "") && (e.machine || "") === (machine || ""));
    }
    // Small relative-time label for a "when did ReleaseTrain last check
    // this component" stamp. Not shared with uaLoadSearchEvents' own
    // near-identical relTime() further down this file, which is scoped to
    // that function's own event-timestamp formatting.
    function uaRelTime(iso) {
      if (!iso) return "";
      const ms = Date.now() - new Date(iso).getTime();
      if (!Number.isFinite(ms)) return "";
      if (ms < 0) return "just now";
      const min = Math.floor(ms / 60000);
      if (min < 1) return "just now";
      if (min < 60) return min + "m ago";
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + "h ago";
      const day = Math.floor(hr / 24);
      if (day < 30) return day + "d ago";
      return uaLocalDate(iso);
    }
    // Everything stored (recordedAt, versionTimestampLastUpdate, ...) is UTC,
    // as it should be in the database; these two convert it to the viewer's
    // own local time zone only for display, via the browser's own Intl
    // support, not string manipulation on the UTC value.
    function uaLocalDate(iso) {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-CA"); // en-CA: YYYY-MM-DD, but in local time
    }
    function uaLocalDateTime(iso) {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
    }

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
      const seen = new Map(), out = [];
      for (const raw of (Array.isArray(arr) ? arr : [])) {
        const component = String(raw && raw.component || "").trim().slice(0, 64);
        const version = String(raw && raw.version || "").trim().slice(0, 32);
        const vendor = String(raw && raw.vendor || "").trim().slice(0, 64);
        const machine = String(raw && raw.machine || "").trim().slice(0, 80);
        // recordedAt: when this row's version was actually captured (a scan
        // run, or a manual add/edit) - re-validated as a real date rather
        // than trusted as any string, same as the server's own check.
        const recordedAtMs = Date.parse((raw && raw.recordedAt) || "");
        if (!component || !version) continue;
        const entry = { component, version };
        if (vendor) entry.vendor = vendor;
        if (machine) entry.machine = machine;
        if (Number.isFinite(recordedAtMs)) entry.recordedAt = new Date(recordedAtMs).toISOString();
        const key = uaInvKey(component, vendor, machine);
        if (seen.has(key)) { out[seen.get(key)] = entry; continue; }
        seen.set(key, out.length); out.push(entry);
      }
      out.sort((a, b) => a.component.toLowerCase().localeCompare(b.component.toLowerCase())
        || (a.machine || "").localeCompare(b.machine || "") || (a.vendor || "").localeCompare(b.vendor || ""));
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
      listEl.innerHTML = inv.map(e => `<div class="ua-bm-item" data-comp="${uaEsc(e.component)}" data-vendor="${uaEsc(e.vendor || "")}" data-machine="${uaEsc(e.machine || "")}">
        <div class="st-255" >
          ${e.machine ? `<span class="ua-inv-machine-chip" title="Machine">${uaEsc(e.machine)}</span>` : ""}
          ${e.vendor ? `<span class="ua-inv-vendor-chip" title="Vendor">${uaEsc(e.vendor)}</span>` : ""}
          <span class="ua-bm-name" title="${uaEsc(e.component)}">${uaEsc(e.component)}</span>
          <span class="st-256 ua-org-chip" >${uaEsc(e.version)}</span>
          ${e.recordedAt ? `<span class="ua-muted ua-inv-fetched" title="Recorded ${uaEsc(uaLocalDateTime(e.recordedAt))}">recorded ${uaEsc(uaRelTime(e.recordedAt))}</span>` : ""}
          <span class="u-show-block st-257 ua-inv-drift ua-muted" >checking latest…</span>
        </div>
        <div class="ua-bm-actions">
          <button class="st-258 btn btn-ghost ua-inv-edit-btn" data-comp="${uaEsc(e.component)}" data-vendor="${uaEsc(e.vendor || "")}" data-machine="${uaEsc(e.machine || "")}" data-ver="${uaEsc(e.version)}" >Edit</button>
          <button class="st-259 btn btn-ghost ua-inv-del-btn" data-comp="${uaEsc(e.component)}" data-vendor="${uaEsc(e.vendor || "")}" data-machine="${uaEsc(e.machine || "")}" >Delete</button>
        </div>
      </div>`).join("");
      uaInvAnnotate(inv);

      listEl.querySelectorAll(".ua-inv-del-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const { comp, vendor, machine } = btn.dataset;
          const cur = uaInvGet();
          const i = uaInvFind(cur, comp, vendor, machine);
          if (i < 0) return;
          cur.splice(i, 1);
          await uaInvApply(cur, "Removed " + comp + ".");
        });
      });
      listEl.querySelectorAll(".ua-inv-edit-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const { comp, vendor, machine } = btn.dataset;
          const nextVer = prompt("Version for " + comp + ":", btn.dataset.ver);
          if (nextVer === null) return;
          const v = nextVer.trim();
          if (!v || !uaInvValidVersion(v)) { uaInvMsg("Invalid version string.", "error"); return; }
          const nextVendor = prompt("Vendor for " + comp + " (blank for none):", vendor);
          if (nextVendor === null) return;
          const nextMachine = prompt("Machine for " + comp + " (blank for none):", machine);
          if (nextMachine === null) return;
          const cur = uaInvGet();
          const i = uaInvFind(cur, comp, vendor, machine);
          if (i >= 0) {
            const entry = { component: comp, version: v, recordedAt: new Date().toISOString() };
            const vd = nextVendor.trim(), mc = nextMachine.trim();
            if (vd) entry.vendor = vd;
            if (mc) entry.machine = mc;
            cur[i] = entry;
          }
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
      // The server compares each component against the whole release history
      // with a per-component, unindexed regex scan (see its own code), so a
      // larger inventory can genuinely take a while - but "checking latest…"
      // must not sit there forever with no feedback if it ever really is
      // stuck, so this is bounded rather than an unlimited wait.
      const timeoutMs = 15000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const [rLatest, rCve] = await Promise.all([
          fetch(API_BASE + "v/d/versionsByComponent?" + q, { headers: { Accept: "application/json" }, signal: controller.signal }),
          fetch(API_BASE + "v/search?q=" + encodeURIComponent(names.join(",")) + "&isCve=true&start=" + start
            + "&limit=400&fields=versionProductName,versionProductBrand,versionReleaseDate,versionUrl,isCve",
            { headers: { Accept: "application/json" } }).catch(() => null),
        ]);
        if (!rLatest.ok) throw 0;
        data = await rLatest.json();
        if (rCve && rCve.ok) { const b = await rCve.json(); cves = Array.isArray(b) ? b : (b.data || []); }
      } catch (e) {
        const msg = e && e.name === "AbortError" ? "took too long to check" : "couldn't check";
        document.querySelectorAll("#ua-inv-list .ua-inv-drift").forEach(s => { s.textContent = msg; });
        return;
      } finally {
        clearTimeout(timer);
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
        const { comp, vendor, machine } = row.dataset;
        const slot = row.querySelector(".ua-inv-drift");
        const entry = rows.find(e => e.component === comp && (e.vendor || "") === vendor && (e.machine || "") === machine);
        if (!slot || !entry) return;
        const rec = byName.get(String(comp).toLowerCase());
        const lv = rec && rec.latestVersion && rec.latestVersion.versionNumber;
        row.dataset.hasMatch = lv ? "1" : "0";
        const cve = (rec && rec.latestCveVersion)
          ? { code: aExtractCveCode(rec.latestCveVersion.versionUrl) }
          : cveByName.get(String(comp).toLowerCase());
        const cveHtml = cve ? ` <span class="st-260" >· ${uaEsc(cve.code)}${cve.date ? " (" + cve.date.slice(4, 6) + "/" + cve.date.slice(6, 8) + ")" : ""}</span>` : "";
        // When ReleaseTrain itself last saw/updated this component's latest-
        // release record, not when this browser happened to run the check
        // just now - versionTimestampLastUpdate is the real per-component
        // scrape time, versionTimestamp (epoch ms) is its own fallback.
        const lvDoc = rec && rec.latestVersion;
        const fetchedIso = lvDoc && (lvDoc.versionTimestampLastUpdate
          || (lvDoc.versionTimestamp ? new Date(lvDoc.versionTimestamp).toISOString() : null));
        const fetchedHtml = fetchedIso
          ? ` <span class="ua-muted ua-inv-fetched" title="Checked ${uaEsc(uaLocalDateTime(fetchedIso))}">· checked ${uaEsc(uaRelTime(fetchedIso))}</span>`
          : "";
        if (!lv) { slot.innerHTML = "no release data" + cveHtml; return; }
        const gap = aVerGap(entry.version, lv);
        if (gap.tier === "none") {
          slot.innerHTML = `<span class="ua-muted">on latest (${uaEsc(lv)})</span>` + cveHtml + fetchedHtml;
          return;
        }
        const color = A_FILLS.behind;
        slot.innerHTML =
          `<span class="st-261 ua-org-chip rt-bg" style="--rt-bg:${color}">→ ${uaEsc(lv)}</span> `
          + `<span class="ua-muted">${uaEsc(aGapLabel(gap))} behind</span>` + cveHtml + fetchedHtml;
      });
      // A component ReleaseTrain actually tracks a latest version for is
      // more actionable to look at than one it has no data on, so those
      // rows move to the top - relative order within each of the two
      // groups is left as-is (still the existing component/machine/vendor
      // sort from uaInvNormalize). Element.appendChild on a node already
      // in the DOM moves it rather than cloning it, so this reorders in
      // place without re-rendering anything.
      const invListEl = document.getElementById("ua-inv-list");
      if (invListEl) {
        const items = [...invListEl.querySelectorAll(".ua-bm-item")];
        const matched = items.filter(el => el.dataset.hasMatch === "1");
        const rest = items.filter(el => el.dataset.hasMatch !== "1");
        for (const el of [...matched, ...rest]) invListEl.appendChild(el);
      }
    }

    document.getElementById("ua-inv-refresh").addEventListener("click", () => uaLoadInventoryFromServer());

    document.getElementById("ua-inv-add-form").addEventListener("submit", async e => {
      e.preventDefault();
      const compEl = document.getElementById("ua-inv-comp");
      const verEl = document.getElementById("ua-inv-ver");
      const vendorEl = document.getElementById("ua-inv-vendor");
      const machineEl = document.getElementById("ua-inv-machine");
      const component = compEl.value.trim();
      const version = verEl.value.trim();
      const vendor = vendorEl.value.trim();
      const machine = machineEl.value.trim();
      if (!component || !version) return;
      if (!uaInvValidVersion(version)) { uaInvMsg("Version must start alphanumeric; letters, digits, . _ + : - only.", "error"); return; }
      const entry = { component, version, recordedAt: new Date().toISOString() };
      if (vendor) entry.vendor = vendor;
      if (machine) entry.machine = machine;
      await uaInvApply([...uaInvGet(), entry], "Added " + component + ".");
      compEl.value = ""; verEl.value = ""; vendorEl.value = ""; machineEl.value = ""; compEl.focus();
    });

    document.getElementById("ua-inv-bulk-btn").addEventListener("click", async () => {
      const ta = document.getElementById("ua-inv-bulk");
      const rows = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!rows.length) return;
      const merged = uaInvGet();
      let added = 0, skipped = 0;
      for (const line of rows) {
        // component@version@vendor@machine (3 or 4 @-separated segments; a
        // blank segment, e.g. "apache@2.4.58@@Web Server", just skips that
        // field) takes priority over the plain 2-field forms, since a bare
        // "@"-joined line with 3+ parts can't also match the simple form.
        const atParts = line.split("@");
        let component, version, vendor = "", machine = "";
        if (atParts.length >= 3) {
          component = atParts[0].trim().slice(0, 64);
          version = atParts[1].trim().slice(0, 32);
          vendor = (atParts[2] || "").trim().slice(0, 64);
          machine = (atParts[3] || "").trim().slice(0, 80);
        } else {
          const m = line.match(/^(.+?)\s*(?:@|,|\s)\s*([^\s,@]+)\s*$/);
          if (!m) { skipped++; continue; }
          component = m[1].trim().slice(0, 64);
          version = m[2].trim().slice(0, 32);
        }
        if (!component || !version || !uaInvValidVersion(version)) { skipped++; continue; }
        const entry = { component, version, recordedAt: new Date().toISOString() };
        if (vendor) entry.vendor = vendor;
        if (machine) entry.machine = machine;
        const i = uaInvFind(merged, component, vendor, machine);
        if (i >= 0) merged[i] = entry; else merged.push(entry);
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
