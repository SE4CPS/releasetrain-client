// arch.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    /* ── Arch Module ──────────────────────────────────────────── */
    // Fallback OS names for aIsOsComponent() — only consulted when the feed record
    // carries no usable OS classification of its own.
    const A_OS = new Set(["linux","windows","macos","ubuntu","centos","debian","redhat","fedora","arch","suse",
      "mint","mac","solaris","freebsd","opensuse","gentoo","slackware","manjaro","android","ios",
      "raspbian","kali-linux","zorin","popos"]);
    let A_ACTIVE = false, A_LOADED = false;
    let A_PLANTUML_SERVER = "https://www.plantuml.com/plantuml/svg/";
    let A_PLANTUML_URL = "", A_VERSIONS = [], A_UML_CODE = "";
    // Cached last Update Triage result (POST /api/ask/triage), so
    // switching back to the Triage mode (or any aSetMode() call that
    // isn't the explicit button click) re-shows it instead of either
    // re-firing a real model call or going blank. Cleared whenever a new
    // component list loads (aLoadAndRender/aLoadUpdatedToday), since a
    // stale triage for the previous machine/search would be misleading.
    let A_TRIAGE_RESULTS = null;
    const aEl = id => document.getElementById("a-" + id);

    function aLoadPako() {
      if (A_LOADED || typeof pako !== "undefined") { A_LOADED = true; return Promise.resolve(); }
      return new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";
        s.crossOrigin = "anonymous";
        s.onload = () => { A_LOADED = true; res(); };
        s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    function aSanitize(s) { return String(s || "").replace(/[":]/g, "-"); }
    function aExtractCveCode(url) {
      if (!url) return "Unknown CVE";
      const m = url.match(/CVE-\d{4}-\d+/);
      return m ? m[0] : "Generic Security Issue";
    }
    function aFormatDate(yyyymmdd) {
      if (!yyyymmdd || String(yyyymmdd).length < 8) return "Unknown";
      const y = yyyymmdd.slice(0, 4), mo = yyyymmdd.slice(4, 6), d = yyyymmdd.slice(6, 8);
      const dt = new Date(y, mo - 1, d), today = new Date();
      const diff = Math.floor((today - dt) / 86400000);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const base = `${months[dt.getMonth()]}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`;
      const rel = diff === 0 ? "(Today)" : diff === 1 ? "(Yesterday)" : diff < 7 ? "(This week)" : diff < 30 ? "(This month)" : "";
      return `${base} ${rel}`.trim();
    }
    // Is this component an operating system? Prefer the feed's own classification;
    // fall back to A_OS only for OSes the data leaves unclassified (linux, macos, …).
    function aIsOsComponent(v) {
      const lv = v.latestVersion || v.currentVersion || {};
      if (String(lv.versionProductType || "").trim().toUpperCase() === "OS") return true;
      const ct = (lv.classification && lv.classification.componentType) || [];
      // Sole "OS" tag only — e.g. chrome carries ["OS","MOBILE","BROWSER"] and is not an OS.
      if (Array.isArray(ct) && ct.length === 1 && String(ct[0]).toUpperCase() === "OS") return true;
      return A_OS.has((v.name || "").toLowerCase());
    }
    function aSortByOS(arr) {
      return arr.slice().sort((a, b) =>
        (aIsOsComponent(b) ? 1 : 0) - (aIsOsComponent(a) ? 1 : 0));
    }
    // Fallback hypervisor names — only consulted when the feed record carries no
    // usable "Hypervisor" productType of its own (hypervisor.py sets it). A
    // hypervisor is the base layer: everything else (OS, apps) runs on top of it.
    const A_HYPERVISOR = new Set(["vmware esxi","vmware workstation","vmware fusion",
      "oracle virtualbox","virtualbox","xen","xcp-ng","proxmox ve","proxmox",
      "hyper-v","kvm","qemu","bhyve","nutanix ahv"]);
    function aIsHypervisorComponent(v) {
      const lv = v.latestVersion || v.currentVersion || {};
      if (String(lv.versionProductType || "").trim().toLowerCase() === "hypervisor") return true;
      const ct = (lv.classification && lv.classification.componentType) || [];
      if (Array.isArray(ct) && ct.map(x => String(x).toUpperCase()).includes("HYPERVISOR")) return true;
      return A_HYPERVISOR.has((v.name || "").toLowerCase());
    }
    const A_STACKS = [
      { name:"LAMP",   components:["apache","mysql","php","linux"] },
      { name:"LEMP",   components:["nginx","mysql","php","linux"] },
      { name:"UNN",    components:["ubuntu","nginx","nodejs"] },
      { name:"RAILS",  components:["macos","rails","postgresql"] },
      { name:"DWS",    components:["django","windows","sqlite"] },
      { name:"FLASK",  components:["flask","arch","postgresql"] },
      { name:"SPRING", components:["redhat","spring","java"] },
      { name:"CRP",    components:["centos","rails","postgresql"] },
      { name:"DDS",    components:["debian","django","sqlite"] },
      { name:"USP",    components:["ubuntu","prisma","svelte"] },
      { name:"VIRT",   components:["xen","debian","nginx"] },
    ];
    function aGetStack(list) {
      const stacks = A_STACKS;
      const out = [], used = new Set();
      for (const s of stacks) {
        if (s.components.every(c => list.includes(c.toLowerCase()))) {
          out.push({ stackName: s.name, matchedComponents: s.components });
          s.components.forEach(c => used.add(c.toLowerCase()));
        }
      }
      const extra = list.filter(c => !used.has(c.toLowerCase())).map(c => ({ component: c, belongsToStack: false }));
      return { groupedStacks: out, extraComponents: extra };
    }
    function aVersionDelta(cur, latest) {
      const toN = v => String(v || "").split(/[^\d]+/).map(x => parseInt(x || "0", 10)).slice(0, 3);
      const [cM, cm, cp] = toN(cur), [lM, lm, lp] = toN(latest);
      if (lM > cM) return "major";
      if (lM === cM && lm > cm) return "minor";
      if (lM === cM && lm === cm && lp > cp) return "patch";
      return "none";
    }
    /* ── Drift helpers: installed vs latest ───────────────────── */
    function aDateMs(yyyymmdd) {
      const s = String(yyyymmdd || "").replace(/-/g, "");
      if (!/^\d{8}$/.test(s)) return 0;
      return +new Date(s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + "T12:00:00Z");
    }
    // Whole calendar days between a YYYYMMDD date-only value and "today",
    // in the viewer's own local timezone. Deliberately NOT
    // aDateMs(date) vs Date.now(). aDateMs pins every date to a fixed
    // noon-UTC instant; diffing that against Date.now() (a real, moving
    // instant) means the result silently depends on how far the viewer's
    // own timezone sits from UTC, not on whether a calendar day has
    // actually passed for them. Confirmed live: a release dated "today"
    // and posted at 5am Pacific already read "1d ago" by evening the
    // same Pacific day, purely because Pacific time is far enough behind
    // UTC that "now" had already crossed past the item's noon-UTC anchor
    // by more than 12 hours, even though the viewer's own calendar date
    // hadn't changed at all. Building both sides as local-midnight
    // Date objects instead makes the diff a plain, exact day count that
    // only moves once the viewer's own local date actually does.
    function calendarDaysAgo(yyyymmdd) {
      const s = String(yyyymmdd || "").replace(/-/g, "");
      if (!/^\d{8}$/.test(s)) return null;
      const itemMidnight = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).getTime();
      const now = new Date();
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return Math.round((todayMidnight - itemMidnight) / 86400000);
    }
    // Per-position step counts from installed → latest, plus the dominant tier.
    function aVerGap(cur, lat) {
      const P = v => String(v || "").split(/[^\d]+/).filter(x => x !== "").map(n => parseInt(n, 10));
      const c = P(cur), l = P(lat), d = i => (l[i] || 0) - (c[i] || 0);
      const M = d(0), m = d(1), p = d(2);
      let tier = "none";
      if (M > 0) tier = "major";
      else if (M === 0 && m > 0) tier = "minor";
      else if (M === 0 && m === 0 && p > 0) tier = "patch";
      return { tier, major: Math.max(0, M), minor: Math.max(0, m), patch: Math.max(0, p) };
    }
    // How long the current latest has been available while you're not on it (staleness proxy).
    function aDaysBehind(version) {
      const cur = version.currentVersion || {}, lat = version.latestVersion || {};
      if (aVersionDelta(cur.versionNumber, lat.versionNumber) === "none") return 0;
      const ld = aDateMs(lat.versionReleaseDate);
      return ld ? Math.max(0, Math.round((Date.now() - ld) / 86400000)) : 0;
    }
    function aGapLabel(g) {
      if (!g || g.tier === "none") return "";
      const bits = [];
      if (g.major) bits.push(g.major + " major");
      if (g.minor) bits.push(g.minor + " minor");
      if (g.patch && g.tier === "patch") bits.push(g.patch + " patch");
      return bits.join(" +") || (g.tier + " update");
    }
    // 10-cell ASCII magnitude bar, full near ~1 year behind.
    function aLagBar(days) {
      const f = Math.max(0, Math.min(10, Math.round(days / 36.5)));
      return "[" + "#".repeat(f) + "-".repeat(10 - f) + "]";
    }
    // Rank for sorting: worst first.
    const A_COLOR_RANK = { cve: 0, behind: 1, unknown: 2, current: 3, nodata: 4 };
    // Ecosystem freshness score + headline counts for the scorecard.
    function aScore(vers) {
      const pts = { current: 100, unknown: 70, behind: 55, cve: 15 };
      // A component ReleaseTrain doesn't track at all ("nodata") used to
      // fall into the same bucket as a genuinely-confirmed-current one and
      // scored a free 100 - silently inflating the freshness score for any
      // account with untracked software in it. Excluded from the average
      // entirely now, the same way aSummarize already excludes it.
      let sum = 0, behind = 0, current = 0, cve = 0, unknown = 0, counted = 0;
      const lags = [];
      vers.forEach(v => {
        const k = aColorKey(v);
        if (k === "nodata") return;
        counted++;
        sum += pts[k];
        if (k === "cve") cve++;
        else if (k === "behind") behind++;
        else if (k === "unknown") unknown++;
        else current++;
        const d = aDaysBehind(v); if (d > 0) lags.push(d);
      });
      lags.sort((a, b) => a - b);
      return {
        score: counted ? Math.round(sum / counted) : 100,
        behind, current, cve, unknown,
        medianLag: lags.length ? lags[Math.floor(lags.length / 2)] : 0,
      };
    }
    /* One component = one bucket, matching aColorKey(). */
    function aSummarize(arr) {
      const out = { cve: 0, behind: 0, current: 0, unknown: 0 };
      arr.forEach(v => {
        const cur = v.currentVersion || v.latestVersion, lat = v.latestVersion;
        if (!cur || !lat) return;
        const k = aColorKey(v);
        out[k] = (out[k] || 0) + 1;
      });
      return out;
    }
    function aIsRecent(version) {
      const rd = String((version.latestVersion || {}).versionReleaseDate || "");
      if (rd.length < 8) return false;
      const dt = new Date(rd.slice(0, 4), rd.slice(4, 6) - 1, rd.slice(6, 8));
      return (Date.now() - dt) / 86400000 <= 7;
    }
    // CVE affecting this component, from the per-component aggregate or the
    // secondary isCve lookup (aAttachCve) — the aggregate misses some, e.g. the
    // 2026-08 Chrome advisories whose brand differs from the release feed.
    function aCveOf(version) {
      if (version.latestCveVersion) {
        return { code: aExtractCveCode(version.latestCveVersion.versionUrl), url: version.latestCveVersion.versionUrl };
      }
      if (version._cve) return version._cve;
      return null;
    }
    /* The only colour axis: act-now / behind / current / no-data.
       Everything finer (how far behind, community chatter, freshly released)
       is carried by the text label, not by more colours.
       "nodata" (ReleaseTrain doesn't track this component at all, so there's
       nothing to compare the installed version against) is NOT the same as
       "current" (we have both a latest and an installed version, and they
       genuinely match) - collapsing the two used to show plainly-untracked
       software (e.g. Adobe Acrobat Reader, Audacity - nothing wrong with
       either, ReleaseTrain simply has no release data for them) as
       "on latest" in the table, which is a claim this system has no basis
       to make. */
    /* aTypeLabel: the component's type, when the server actually recorded
       one on the version object (classification.componentType, an array
       like ["OS","BROWSER"], or the older versionProductType string) -
       falls back to "" (rendered as a dash) rather than guessing. */
    function aTypeLabel(v) {
      const lv = (v.latestVersion || v.currentVersion || {});
      const ct = (lv.classification && lv.classification.componentType) || [];
      const tag = Array.isArray(ct) ? ct.find(t => t && !["OS", "HYPERVISOR"].includes(String(t).toUpperCase())) : null;
      if (tag) {
        const s = String(tag).trim();
        return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      }
      const pt = String(lv.versionProductType || "").trim();
      if (pt && !["OS", "Hypervisor"].includes(pt)) return pt;
      return "";
    }
    // Buckets a list of components by aTypeLabel, folding anything with no
    // classification-derived type into one catch-all "Other" bucket. Used
    // to cut diagram clutter: a flat list of a dozen unrelated leftover
    // components (nothing else groups them into a named stack) reads much
    // more clearly as a few named type clusters ("Browser (2)", "Database
    // (3)") than as a dozen individual boxes.
    function aGroupByType(list) {
      const byType = new Map();
      list.forEach(v => {
        const t = aTypeLabel(v) || "Other";
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t).push(v);
      });
      return byType;
    }
    function aColorKey(version) {
      const cur = version.currentVersion || version.latestVersion, lat = version.latestVersion;
      if (!lat) return "nodata";
      if (!cur) return "nodata";
      if (aCveOf(version)) return "cve";
      const behind = aVerGap(cur.versionNumber, lat.versionNumber).tier !== "none";
      if (behind || (version._risk || 0) > 0) return "behind";
      if (!version._hasInstalled) return "unknown";
      return "current";
    }
    function aComponentLine(version, fills) {
      const cur = version.currentVersion || version.latestVersion, lat = version.latestVersion;
      if (!cur || !lat) return `component "${aSanitize(version.name)}\\nno release data"`;
      const fill = fills[aColorKey(version)] || fills.current;
      const name = aSanitize(cur.versionProductName || version.name);
      const cv = aSanitize(cur.versionNumber), lv = aSanitize(lat.versionNumber);
      const gap = aVerGap(cur.versionNumber, lat.versionNumber);
      const days = aDaysBehind(version);
      let headline;
      if (gap.tier !== "none") {
        // installed → latest, magnitude bar, semver distance, staleness
        headline = `${name}  ${cv} -> ${lv} \\n${aLagBar(days)} ${aGapLabel(gap)} - ${days}d behind`;
      } else if (!version._hasInstalled) {
        headline = `${name}  ${lv} \\ninstalled version unknown`;
      } else {
        headline = `${name}  ${cv} \\non latest${aIsRecent(version) ? " [NEW]" : " [OK]"}`;
      }
      const cve = aCveOf(version);
      const cveText = cve ? `\\nCVE: ${cve.code}${cve.date ? " (" + aFormatDate(cve.date) + ")" : ""}` : "";
      const rp = (version._riskPosts || [])[0];
      const riskText = rp
        ? `\\ncommunity: ${rp.url ? `[[${rp.url} u/${rp.handle}]]` : `u/${rp.handle}`}`
        : `\\ncommunity: no risk posts (${A_RISK_DAYS}d)`;
      return `component "${headline}${cveText}${riskText}" #${fill.replace("#", "")}`;
    }
    /* Two colours, used only where something needs attention. A calm component
       (on latest, version unknown, or no release data at all) gets no fill. */
    const A_FILLS = {
      cve:     "#fca5a5",  /* red   : security advisory — act now      */
      behind:  "#fcd34d",  /* amber : an update is available           */
      current: "#ffffff",  /* none                                     */
      unknown: "#ffffff",  /* none                                     */
      nodata:  "#ffffff",  /* none                                     */
    };
    const A_RISK_DAYS = 10;  // community-risk lookback for the arch view
    // Recent high-risk community (Reddit) posts for a component, newest first.
    function aRiskPostsFor(name) {
      const n = norm(name);
      if (n.length < 3 || !STATE.redditBySub) return [];
      const cutoff = Date.now() - A_RISK_DAYS * 86400000;
      const hits = [];
      for (const p of postsForComponent(n)) {
        if (getPostSource(p) !== "reddit") continue;
        if (redditTime(p) < cutoff) continue;
        if (!isRisk(p)) continue;
        hits.push(p);
      }
      hits.sort((a, b) => redditTime(b) - redditTime(a) || (b.score || 0) - (a.score || 0));
      return hits.map(p => ({
        handle: String(p.author || "").replace(/^u\//i, "") || "unknown",
        // the source discussion thread, not any external link the post points at
        url: p.redditId ? `https://reddit.com/comments/${p.redditId}` : (p.url || ""),
        sub: p.subreddit || "",
      }));
    }
    function aAttachRisk(vers) {
      vers.forEach(v => {
        const posts = aRiskPostsFor(v.name);
        v._risk = posts.length;
        v._riskPosts = posts.slice(0, 1);  // just the latest
      });
      return vers;
    }

    // Secondary CVE lookup: /v/d/versionsByComponent's `latestCveVersion` misses
    // advisories whose product brand differs from the release feed, so pull recent
    // isCve versions by name and attach the newest per component as v._cve.
    async function aAttachCve(vers) {
      const names = Array.from(new Set(vers.map(v => v.name).filter(Boolean)));
      if (!names.length) return vers;
      const start = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
      try {
        const url = `${API_BASE}v/search?q=${encodeURIComponent(names.join(","))}`
          + `&isCve=true&start=${start}&limit=400`
          + `&fields=versionProductName,versionProductBrand,versionReleaseDate,versionUrl,isCve`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) return vers;
        const body = await res.json();
        const list = Array.isArray(body) ? body : (body.data || []);
        const byName = new Map();
        for (const r of list) {
          if (!r.isCve) continue;
          const t = aDateMs(r.versionReleaseDate);
          for (const k of [norm(r.versionProductName), norm(r.versionProductBrand)]) {
            if (!k) continue;
            const prev = byName.get(k);
            if (!prev || t > prev._t) {
              byName.set(k, { _t: t, code: aExtractCveCode(r.versionUrl), url: r.versionUrl, date: r.versionReleaseDate });
            }
          }
        }
        vers.forEach(v => { const hit = byName.get(norm(v.name)); if (hit) v._cve = hit; });
      } catch { /* best-effort */ }
      return vers;
    }

    function aBuildUml(vers) {
      const sorted = aSortByOS(vers), names = sorted.map(v => v.name);
      const { groupedStacks } = aGetStack(names);
      const ts = new Date().toLocaleString("en-US", { weekday:"short", year:"numeric", month:"short", day:"numeric", hour:"numeric", minute:"numeric", second:"numeric", hour12:false, timeZoneName:"short" });
      const fills = A_FILLS;
      const legend =
        `legend bottom left\n` +
        `|= Key ` +
        `|= <${A_FILLS.cve}> CVE - act now ` +
        `| <${A_FILLS.behind}> Update available |\n` +
        `endlegend\n`;
      // Scorecard: one-line overview across the whole set.
      const sc = aScore(sorted);
      const scorecard = `header Freshness ${sc.score}/100  |  ${sc.behind} behind  |  ${sc.current} current  |  ${sc.cve} CVE  |  ${sc.unknown} version unknown  |  median lag ${sc.medianLag}d\n`;
      // Font sizes bumped from PlantUML's own small defaults (2026-09-23,
      // "make the arch view diagram more readable" / "use the available
      // height"): the rendered SVG only ever scaled up to the width of
      // .a-canvas (height:auto preserves its aspect ratio), so a diagram
      // with few, short rows rendered small with real vertical space
      // left unused below it. Bigger source fonts make the same layout
      // both more legible and taller relative to its own width, so it
      // fills more of that available height once scaled (see
      // aFitDiagramSvg). Bumped again after a live render still read as
      // cramped at the first pass (16/17/15/13 -> 20/22/20/16).
      // `skinparam Padding`/`ComponentPadding` were tried for extra
      // breathing room but are not real PlantUML skinparams (newer
      // PlantUML rejects them and renders a "please use CSS style
      // instead" warning banner inline in the diagram itself -- caught
      // from a live render, not assumed) -- removed rather than chasing
      // the CSS-style-block syntax PlantUML wants instead, since the
      // font-size bumps alone already grow each box's default internal
      // margin along with its text.
      let uml = `@startuml\nskinparam BackgroundColor #ffffff\nskinparam DefaultTextAlignment left\nskinparam Shadowing false\nskinparam PackageBorderColor #cbd5e1\nskinparam PackageBackgroundColor #ffffff\nskinparam ComponentBorderColor #94a3b8\nskinparam ComponentBackgroundColor #ffffff\nskinparam ArrowColor #111827\nskinparam FontColor #111827\nskinparam DefaultFontSize 20\nskinparam PackageFontSize 22\nskinparam PackageFontStyle bold\nskinparam ComponentFontSize 20\nskinparam ArrowFontSize 16\n${scorecard}left footer Software Ecosystem: ${ts}\n${legend}`;
      // Renders the stack groups + leftover components for a given subset of versions.
      const groupedNames = new Set();
      groupedStacks.forEach(s => s.matchedComponents.forEach(c => groupedNames.add(c)));
      const renderGroups = (pad, list) => {
        let out = "";
        groupedStacks.forEach(s => {
          const members = list.filter(v => s.matchedComponents.includes(v.name));
          if (!members.length) return;
          out += `${pad}package "${s.stackName} stack" #transparent {\n`;
          members.forEach(v => { out += `${pad}  ${aComponentLine(v, fills)}\n`; });
          out += `${pad}}\n`;
        });
        // Leftovers (not part of any detected stack) used to render as one
        // flat list of individually-unrelated boxes, which got cluttered
        // fast on a real machine's real software list. Split them instead:
        // components ReleaseTrain actually tracks a type for get grouped
        // into named clusters ("Browser (2)", "Database (3)"); everything
        // with no release data at all (untracked software - nothing wrong
        // with it, ReleaseTrain just has no data to compare) is bucketed
        // into one "No release data (N)" package instead of N separate
        // boxes, since by-type grouping can't help there (no classification
        // data exists for them either).
        const leftovers = list.filter(v => !groupedNames.has(v.name));
        const tracked = leftovers.filter(v => aColorKey(v) !== "nodata");
        const untracked = leftovers.filter(v => aColorKey(v) === "nodata");
        aGroupByType(tracked).forEach((members, type) => {
          // A lone member of its own type isn't worth boxing on its own -
          // that just trades one kind of clutter for another.
          if (members.length < 2) {
            members.forEach(v => { out += `${pad}${aComponentLine(v, fills)}\n`; });
            return;
          }
          out += `${pad}package "${aSanitize(type)} (${members.length})" #transparent {\n`;
          members.forEach(v => { out += `${pad}  ${aComponentLine(v, fills)}\n`; });
          out += `${pad}}\n`;
        });
        if (untracked.length) {
          out += `${pad}package "No release data (${untracked.length})" #transparent {\n`;
          untracked.forEach(v => { out += `${pad}  ${aComponentLine(v, fills)}\n`; });
          out += `${pad}}\n`;
        }
        return out;
      };

      // #4 — hoist everything that needs action into one cluster at the top,
      // worst (most days behind) first. These are pulled OUT of the normal layout.
      // Urgent = a CVE, or a major-version gap.
      const isUrgent = v => {
        const cur = v.currentVersion || v.latestVersion, lat = v.latestVersion;
        return !!aCveOf(v) || (cur && lat && aVerGap(cur.versionNumber, lat.versionNumber).tier === "major");
      };
      const urgent = sorted.filter(isUrgent).sort((a, b) => aDaysBehind(b) - aDaysBehind(a));
      const rest = sorted.filter(v => !isUrgent(v));
      // Three stacked tiers, base first: hypervisor -> OS -> application. Each is
      // mutually exclusive (a hypervisor never also counts as OS) and each is
      // optional — an empty tier is skipped and the tier above bubbles up.
      const hvVers  = rest.filter(aIsHypervisorComponent);
      const osVers  = rest.filter(v => !aIsHypervisorComponent(v) && aIsOsComponent(v));
      const appVers = rest.filter(v => !aIsHypervisorComponent(v) && !aIsOsComponent(v));

      // OS layer wrapping the application layer (the arrangement used when there
      // is no hypervisor tier, and reused nested inside the hypervisor tier).
      const osBlock = (pad) => {
        let out = "";
        if (osVers.length) {
          const osLabel = osVers.length === 1 ? `${aSanitize(osVers[0].name)} - OS layer` : "OS layer";
          out += `${pad}package "${osLabel}" #transparent {\n`;
          osVers.forEach(v => { out += `${pad}  ${aComponentLine(v, fills)}\n`; });
          if (appVers.length) {
            out += `${pad}  package "Application layer" #transparent {\n`;
            out += renderGroups(`${pad}    `, appVers);
            out += `${pad}  }\n`;
          }
          out += `${pad}}\n`;
        } else if (appVers.length) {
          out += renderGroups(pad, appVers);
        }
        return out;
      };

      uml += `package "Ecosystem" #transparent {\n`;
      if (urgent.length) {
        uml += `  package "Upgrade now (${urgent.length})" #${A_FILLS.cve.replace("#", "")} {\n`;
        urgent.forEach(v => { uml += `    ${aComponentLine(v, fills)}\n`; });
        uml += `  }\n`;
      }
      if (hvVers.length) {
        // Hypervisor is the base layer — OS + apps nest inside it.
        const hvLabel = hvVers.length === 1 ? `${aSanitize(hvVers[0].name)} - Hypervisor layer` : "Hypervisor layer";
        uml += `  package "${hvLabel}" #transparent {\n`;
        hvVers.forEach(v => { uml += `    ${aComponentLine(v, fills)}\n`; });
        uml += osBlock("    ");
        uml += `  }\n`;
      } else {
        uml += osBlock("  ");
      }
      uml += `}\n@enduml\n`;
      return uml;
    }
    // Second diagram option, per instructor/user request ("add option
    // diagram (mermaid) keep diagram (plantuml) and structure it more
    // readable and also hierarchical by type"): a Mermaid flowchart
    // mirroring the exact same tiering aBuildUml uses (urgent -> hypervisor
    // -> OS -> application, stacks first, then leftovers grouped by type,
    // then untracked components bucketed together) - same information,
    // rendered entirely client-side (no PlantUML server round-trip).
    function aMermaidLabel(v) {
      const cur = v.currentVersion || v.latestVersion, lat = v.latestVersion;
      const esc = s => String(s == null ? "" : s).replace(/"/g, "'");
      if (!cur || !lat) return `${esc(v.name)}<br/>no release data`;
      const name = esc(cur.versionProductName || v.name);
      const cv = esc(cur.versionNumber), lv = esc(lat.versionNumber);
      const gap = aVerGap(cur.versionNumber, lat.versionNumber);
      const days = aDaysBehind(v);
      if (gap.tier !== "none") return `${name}<br/>${cv} to ${lv}<br/>${aGapLabel(gap)} - ${days}d behind`;
      if (!v._hasInstalled) return `${name}<br/>${lv}<br/>installed version unknown`;
      return `${name}<br/>${cv}<br/>on latest${aIsRecent(v) ? " [NEW]" : ""}`;
    }
    function aBuildMermaid(vers) {
      const sorted = aSortByOS(vers), names = sorted.map(v => v.name);
      const { groupedStacks } = aGetStack(names);
      const groupedNames = new Set();
      groupedStacks.forEach(s => s.matchedComponents.forEach(c => groupedNames.add(c)));

      let idx = 0, sgIdx = 0;
      const mEsc = s => String(s == null ? "" : s).replace(/"/g, "'");
      const node = v => `n${idx++}["${aMermaidLabel(v)}"]:::${aColorKey(v)}`;
      const sgOpen = label => `subgraph sg${sgIdx++}["${mEsc(label)}"]\n`;

      // Same leftover split as aBuildUml's renderGroups: stacks first, then
      // remaining tracked components grouped by type, then everything with
      // no release data bucketed into one cluster.
      const renderGroups = list => {
        let out = "";
        groupedStacks.forEach(s => {
          const members = list.filter(v => s.matchedComponents.includes(v.name));
          if (!members.length) return;
          out += sgOpen(`${s.stackName} stack`);
          members.forEach(v => { out += `${node(v)}\n`; });
          out += `end\n`;
        });
        const leftovers = list.filter(v => !groupedNames.has(v.name));
        const tracked = leftovers.filter(v => aColorKey(v) !== "nodata");
        const untracked = leftovers.filter(v => aColorKey(v) === "nodata");
        aGroupByType(tracked).forEach((members, type) => {
          if (members.length < 2) {
            members.forEach(v => { out += `${node(v)}\n`; });
            return;
          }
          out += sgOpen(`${type} (${members.length})`);
          members.forEach(v => { out += `${node(v)}\n`; });
          out += `end\n`;
        });
        if (untracked.length) {
          out += sgOpen(`No release data (${untracked.length})`);
          untracked.forEach(v => { out += `${node(v)}\n`; });
          out += `end\n`;
        }
        return out;
      };

      const isUrgent = v => {
        const cur = v.currentVersion || v.latestVersion, lat = v.latestVersion;
        return !!aCveOf(v) || (cur && lat && aVerGap(cur.versionNumber, lat.versionNumber).tier === "major");
      };
      const urgent = sorted.filter(isUrgent).sort((a, b) => aDaysBehind(b) - aDaysBehind(a));
      const rest = sorted.filter(v => !isUrgent(v));
      const hvVers  = rest.filter(aIsHypervisorComponent);
      const osVers  = rest.filter(v => !aIsHypervisorComponent(v) && aIsOsComponent(v));
      const appVers = rest.filter(v => !aIsHypervisorComponent(v) && !aIsOsComponent(v));

      const osBlock = () => {
        let out = "";
        if (osVers.length) {
          const osLabel = osVers.length === 1 ? `${osVers[0].name} - OS layer` : "OS layer";
          out += sgOpen(osLabel);
          osVers.forEach(v => { out += `${node(v)}\n`; });
          if (appVers.length) {
            out += sgOpen("Application layer");
            out += renderGroups(appVers);
            out += `end\n`;
          }
          out += `end\n`;
        } else if (appVers.length) {
          out += renderGroups(appVers);
        }
        return out;
      };

      // %%init%% must be the very first line. Overrides Mermaid's default
      // pale-yellow cluster (subgraph) background, which otherwise clashes
      // with the calm white style the PlantUML diagram already uses and
      // makes nested tiers hard to tell apart (same background all the
      // way down, distinguishable only by border lines).
      let mmd = "%%{init: {'themeVariables': {'clusterBkg':'#ffffff','clusterBorder':'#cbd5e1','primaryTextColor':'#111827','fontFamily':'inherit'}}}%%\n" +
        "graph TD\n" +
        "classDef cve fill:#fca5a5,stroke:#dc2626,color:#111827;\n" +
        "classDef behind fill:#fcd34d,stroke:#d97706,color:#111827;\n" +
        "classDef current fill:#ffffff,stroke:#94a3b8,color:#111827;\n" +
        "classDef unknown fill:#ffffff,stroke:#94a3b8,color:#111827;\n" +
        "classDef nodata fill:#ffffff,stroke:#cbd5e1,color:#94a3b8;\n";
      if (urgent.length) {
        mmd += sgOpen(`Upgrade now (${urgent.length})`);
        urgent.forEach(v => { mmd += `${node(v)}\n`; });
        mmd += `end\n`;
      }
      if (hvVers.length) {
        const hvLabel = hvVers.length === 1 ? `${hvVers[0].name} - Hypervisor layer` : "Hypervisor layer";
        mmd += sgOpen(hvLabel);
        hvVers.forEach(v => { mmd += `${node(v)}\n`; });
        mmd += osBlock();
        mmd += `end\n`;
      } else {
        mmd += osBlock();
      }
      return mmd;
    }
    let A_MERMAID_LOADED = false;
    function aEnsureMermaid() {
      return new Promise((resolve, reject) => {
        if (window.mermaid) { A_MERMAID_LOADED = true; return resolve(); }
        const sc = document.createElement("script");
        sc.src = "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js";
        sc.crossOrigin = "anonymous";
        sc.onload = () => { A_MERMAID_LOADED = true; resolve(); };
        sc.onerror = reject;
        document.head.appendChild(sc);
      });
    }
    let A_MERMAID_SEQ = 0;
    async function aRenderMermaid(vers) {
      const host = aEl("mermaid"); if (!host) return;
      const mySeq = ++A_MERMAID_SEQ;
      const text = aBuildMermaid(vers);
      try {
        await aEnsureMermaid();
        window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", flowchart: { curve: "linear", htmlLabels: false } });
        await window.mermaid.parse(text);
        const out = await window.mermaid.render(`archMermaidSvg${mySeq}`, text);
        if (mySeq !== A_MERMAID_SEQ) return;  // a newer render started meanwhile
        host.innerHTML = out.svg;
        // Left at its own natural size (CSS overrides Mermaid's own inline
        // max-width so a dense diagram doesn't get squashed illegibly) and
        // scrolls within #a-mermaid when larger than the visible area -
        // see the #a-mermaid/#a-mermaid svg rule in styles.css.
      } catch (e) {
        if (mySeq !== A_MERMAID_SEQ) return;
        console.error("Mermaid render error:", e);
        host.innerHTML = `<p class="a-muted-note">Could not render diagram.</p>`;
      }
    }
    function aEncode6bit(b) {
      if (b < 10) return String.fromCharCode(48 + b);
      b -= 10; if (b < 26) return String.fromCharCode(65 + b);
      b -= 26; if (b < 26) return String.fromCharCode(97 + b);
      b -= 26; return b === 0 ? "-" : b === 1 ? "_" : "?";
    }
    function aAppend3bytes(b1, b2, b3) {
      return aEncode6bit((b1 >> 2) & 0x3F) + aEncode6bit((((b1 & 3) << 4) | (b2 >> 4)) & 0x3F) +
             aEncode6bit((((b2 & 0xF) << 2) | (b3 >> 6)) & 0x3F) + aEncode6bit(b3 & 0x3F);
    }
    function aEncode64(data) {
      let res = "";
      for (let i = 0; i < data.length; i += 3) {
        if (i + 2 === data.length) res += aAppend3bytes(data[i], data[i + 1], 0);
        else if (i + 1 === data.length) res += aAppend3bytes(data[i], 0, 0);
        else res += aAppend3bytes(data[i], data[i + 1], data[i + 2]);
      }
      return res;
    }
    function aEncodePlantUML(text) {
      const deflated = pako.deflateRaw(unescape(encodeURIComponent(text)), { level: 9 });
      return aEncode64(deflated);
    }
    // Scales the current ecosystem SVG to fill whichever dimension of
    // .a-canvas is the real constraint (2026-09-23, "use the available
    // height"): a plain width:100%/height:auto fit only ever grows the
    // diagram until its WIDTH matches the container, so a diagram with
    // few, short rows (wide-and-short) rendered small with real unused
    // vertical space below it, even though there was room to grow
    // further. This reads the SVG's own intrinsic viewBox size (stored
    // once at render time, see aRenderDiagram) and the container's
    // current client size, then sets an explicit pixel width/height at
    // whichever scale is the tighter of the two -- a real "contain" fit,
    // not a distorting stretch, since both axes scale by the same factor.
    // Re-run on window resize (the container's own size can change) so
    // this stays correct after the initial render too.
    function aFitDiagramSvg() {
      const host = aEl("ecosysImage");
      const s = host && host.querySelector("svg");
      const canvas = host && host.closest(".a-canvas");
      if (!s || !canvas) return;
      const vw = Number(s.dataset.vbW), vh = Number(s.dataset.vbH);
      if (!vw || !vh) return;
      const cw = canvas.clientWidth - 4, ch = canvas.clientHeight - 4;  // minus .a-canvas's own 2px padding per side
      if (cw <= 0 || ch <= 0) return;
      const scale = Math.min(cw / vw, ch / vh);
      s.style.setProperty("--rt-fit-w", Math.floor(vw * scale) + "px");
      s.style.setProperty("--rt-fit-h", Math.floor(vh * scale) + "px");
      s.classList.add("a-fit");
    }
    let A_FIT_RESIZE_WIRED = false;
    function aRenderDiagram(uml) {
      A_UML_CODE = uml;
      A_PLANTUML_URL = A_PLANTUML_SERVER + aEncodePlantUML(uml);
      const host = aEl("ecosysImage"), loader = aEl("loader");
      const done = () => { if (loader) setDisplay(loader, "none"); };
      // Inline the SVG so diagram links (community post handles) are clickable.
      fetch(A_PLANTUML_URL)
        .then(r => r.ok ? r.text() : Promise.reject(r.status))
        .then(svg => {
          host.innerHTML = svg;
          const s = host.querySelector("svg");
          if (s) {
            // Read the intrinsic size PlantUML encoded into viewBox
            // ("0 0 W H") before removing width/height, then let
            // aFitDiagramSvg compute the actual on-screen size.
            const vb = (s.getAttribute("viewBox") || "").trim().split(/\s+/);
            s.dataset.vbW = vb[2] || ""; s.dataset.vbH = vb[3] || "";
            s.removeAttribute("width"); s.removeAttribute("height");
            setDisplay(s, "block"); s.classList.add("a-fit");
            aFitDiagramSvg();
          }
          host.querySelectorAll("a").forEach(a => { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); });
        })
        .catch(() => { host.innerHTML = `<p class="a-muted-note">Could not render diagram.</p>`; })
        .finally(done);
      const codeEl = aEl("plantumlCode");
      if (codeEl) codeEl.textContent = uml;
      if (!A_FIT_RESIZE_WIRED) { A_FIT_RESIZE_WIRED = true; window.addEventListener("resize", aFitDiagramSvg); }
    }
    function aUpdateMetrics(vers) {
      const { groupedStacks } = aGetStack(vers.map(v => v.name));
      const sum = aSummarize(vers);
      const set = (id, val) => { const el = aEl(id); if (el) el.textContent = val; };
      set("totalComponents", vers.length);
      set("stackCount", groupedStacks.length);
      set("cveCount", sum.cve);
      set("behindCount", sum.behind);
      set("currentCount", sum.current);
      set("unknownCount", sum.unknown);
      const detC = aEl("detComponents"), detS = aEl("detStacks");
      if (detC) detC.innerHTML = vers.map(v => `• ${v.name}`).join("<br>");
      if (detS) detS.innerHTML = groupedStacks.length ? groupedStacks.map(s => `• ${s.stackName}: ${s.matchedComponents.join(", ")}`).join("<br>") : "None";
    }
    function aMapVers(data) {
      return (Array.isArray(data) ? data : []).map(c => ({
        name: c.name, latestVersion: c.latestVersion,
        currentVersion: c.currentVersion || c.latestVersion, latestCveVersion: c.latestCveVersion,
        _hasInstalled: false
      }));
    }
    // Installed versions the user recorded on the Account page (device-local).
    function aInventoryMap() {
      let list = [];
      try {
        const u = (typeof uaUser === "function") ? uaUser() : null;
        if (u && Array.isArray(u.inventory)) list = u.inventory;
        else list = JSON.parse(localStorage.getItem("rt_inventory") || "[]");
      } catch { list = []; }
      const m = new Map();
      (Array.isArray(list) ? list : []).forEach(e => {
        if (e && e.component && e.version) m.set(String(e.component).toLowerCase(), String(e.version));
      });
      return m;
    }
    // Overlay recorded installed versions onto each component as currentVersion.
    // Used to require v.latestVersion (a real ReleaseTrain-tracked release) to
    // even apply the user's OWN recorded install - so a real, uploaded version
    // (e.g. "TeXInfo 6.8-4build1", scanned and uploaded via the CLI tool) was
    // silently discarded and the table showed "?" for Installed, for every
    // component ReleaseTrain simply doesn't track. Applying "what version did
    // the user actually record" has nothing to do with whether ReleaseTrain
    // separately tracks a latest release to compare it against.
    function aApplyInventory(vers) {
      const inv = aInventoryMap();
      vers.forEach(v => {
        const iv = inv.get(String(v.name).toLowerCase());
        if (iv) {
          v.currentVersion = {
            versionNumber: iv,
            versionReleaseDate: "",
            versionProductName: (v.latestVersion && v.latestVersion.versionProductName) || v.name
          };
          v._hasInstalled = true;
        } else {
          v._hasInstalled = false;
        }
      });
      return vers;
    }

    const A_MODES = ["diagram", "table", "mermaid", "triage"];
    let A_MODE = A_MODES.includes(localStorage.getItem("rt_arch_mode")) ? localStorage.getItem("rt_arch_mode") : "diagram";

    const aCanvasEl = () => document.querySelector("#archView .a-canvas");

    // Show the result area (canvas, table, mermaid flowchart, or triage
    // per A_MODE), hide the empty state. Exactly one of the four is visible.
    function aShowResult() {
      const e = aEl("empty"); if (e) setDisplay(e, "none");
      const c = aCanvasEl(), t = aEl("table"), m = aEl("mermaid"), tr = aEl("triage");
      if (c) setDisplay(c, (A_MODE === "diagram") ? "" : "none");
      if (t) setDisplay(t, (A_MODE === "table") ? "" : "none");
      if (m) setDisplay(m, (A_MODE === "mermaid") ? "" : "none");
      if (tr) setDisplay(tr, (A_MODE === "triage") ? "" : "none");
    }
    // Diagram/Table/Flowchart/Triage's display label - the <select>'s own
    // option text already says this, but the chip (aSetMode below) needs
    // it as plain text too, and "mermaid" (the internal mode id, kept for
    // backward compatibility with already-saved localStorage values) reads
    // oddly as a label where the UI has always called it "Flowchart".
    const A_MODE_LABELS = { diagram: "Diagram", table: "Table", mermaid: "Flowchart", triage: "Triage" };
    function aSetMode(mode) {
      A_MODE = A_MODES.includes(mode) ? mode : "diagram";
      try { localStorage.setItem("rt_arch_mode", A_MODE); } catch {}
      // A single <select> (one mutually-exclusive choice) replaced the old
      // 4 separate buttons each manually toggling btn-primary/btn-ghost -
      // the select's own selected option already shows the active mode,
      // and the chip right next to it repeats that as a small always-
      // visible label so the active mode still reads at a glance without
      // opening the dropdown.
      const sel = document.getElementById("a-viewMode");
      if (sel) sel.value = A_MODE;
      const chip = document.getElementById("a-modeChip");
      if (chip) chip.textContent = A_MODE_LABELS[A_MODE] || A_MODE;
      const e = aEl("empty");
      if (e && !e.classList.contains("u-hide")) return;  // empty state stays put
      aShowResult();
      // If the diagram was last fit while .a-canvas was hidden behind the
      // table (0 client size, e.g. restoring "table" as the saved mode
      // on load), its size never got computed -- redo it now that the
      // canvas is actually visible and has a real size to fit against.
      if (A_MODE === "diagram") aFitDiagramSvg();
      if (A_MODE === "table") aRenderTable();
      if (A_MODE === "mermaid" && Array.isArray(A_VERSIONS) && A_VERSIONS.length) aRenderMermaid(A_VERSIONS);
      // Triage is NOT re-run here (unlike table/mermaid, which just
      // re-render already-fetched A_VERSIONS client-side) - it's a real
      // model call, so it only runs when the Triage button itself is
      // explicitly clicked (see its own listener below), never as a
      // side effect of switching modes/restoring a saved mode on load.
      if (A_MODE === "triage" && !A_TRIAGE_RESULTS) aRenderTriagePrompt();
    }
    function aEsc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    // #5b — dense sortable drift table, most-behind first.
    function aRenderTable() {
      const el = aEl("table"); if (!el) return;
      const vers = Array.isArray(A_VERSIONS) ? A_VERSIONS : [];
      if (!vers.length) { el.innerHTML = `<p class="a-muted-note">No components.</p>`; return; }
      const sc = aScore(vers);
      const rows = vers.map(v => {
        const cur = v.currentVersion || v.latestVersion || {}, lat = v.latestVersion || {};
        return { v, cur, lat, key: aColorKey(v), gap: aVerGap(cur.versionNumber, lat.versionNumber), days: aDaysBehind(v) };
      }).sort((a, b) => b.days - a.days || (A_COLOR_RANK[a.key] - A_COLOR_RANK[b.key]) || a.v.name.localeCompare(b.v.name));
      el.innerHTML =
        `<div class="a-score">Freshness <b>${sc.score}/100</b> &nbsp;·&nbsp; ${sc.behind} behind &nbsp;·&nbsp; ${sc.current} current &nbsp;·&nbsp; ${sc.cve} CVE &nbsp;·&nbsp; ${sc.unknown} version unknown &nbsp;·&nbsp; median lag ${sc.medianLag}d</div>` +
        `<table class="a-drift"><thead><tr>` +
        `<th>Component</th><th>Type</th><th>Installed</th><th>Latest</th><th>Change</th><th>Behind</th><th>CVE</th><th>Community</th>` +
        `</tr></thead><tbody>` +
        rows.map(r => {
          // Colour only marks a problem. Calm rows stay plain.
          const statusText = r.key === "nodata" ? "no release data" : r.key === "unknown" ? "version ?" : "on latest";
          const chip = r.gap.tier !== "none"
            ? `<span class="a-chip-t rt-bg" style="--rt-bg:${A_FILLS.behind}">${aEsc(aGapLabel(r.gap))}</span>`
            : `<span class="a-muted-note">${statusText}</span>`;
          const typeLabel = aTypeLabel(r.v);
          return `<tr>` +
            `<td>${aEsc(r.v.name)}</td>` +
            `<td>${typeLabel ? aEsc(typeLabel) : '<span class="a-muted-note">-</span>'}</td>` +
            `<td class="mono">${r.v._hasInstalled ? aEsc(r.cur.versionNumber) : '<span class="a-muted-note">?</span>'}</td>` +
            `<td class="mono">${aEsc(r.lat.versionNumber || "-")}</td>` +
            `<td>${chip}</td>` +
            `<td class="mono">${r.days ? r.days + "d" : "-"}</td>` +
            `<td>${(() => { const c = aCveOf(r.v); return c ? `<span class="a-chip-t rt-bg" style="--rt-bg:${A_FILLS.cve}">${aEsc(c.code)}</span>` : "-"; })()}</td>` +
            `<td>${(() => {
              const p = (r.v._riskPosts || [])[0];
              if (!p) return `<span class="a-muted-note">no risk posts (${A_RISK_DAYS}d)</span>`;
              return p.url
                ? `<a href="${aEsc(p.url)}" target="_blank" rel="noopener noreferrer">u/${aEsc(p.handle)}</a>`
                : `u/${aEsc(p.handle)}`;
            })()}</td>` +
            `</tr>`;
        }).join("") +
        `</tbody></table>`;
    }
    function aShowEmptyState() {
      const loader = aEl("loader"), titleEl = aEl("title");
      if (loader) setDisplay(loader, "none");
      if (titleEl) titleEl.textContent = "Add your own components to begin";
      const c = aCanvasEl(); if (c) setDisplay(c, "none");
      const t = aEl("table"); if (t) setDisplay(t, "none");
      const m = aEl("mermaid"); if (m) setDisplay(m, "none");
      const tr = aEl("triage"); if (tr) setDisplay(tr, "none");
      const e = aEl("empty"); if (e) setDisplay(e, "block");
    }

    // ── Update Triage ("here are my current installed software, how
    // would you recommend updating them in which order? with reasoning")
    // ─────────────────────────────────────────────────────────────────
    // A plain placeholder shown whenever the Triage panel is visible but
    // has no (or stale) results yet - switching into Triage mode never
    // auto-fires the real model call on its own (see aSetMode above).
    function aRenderTriagePrompt() {
      const el = aEl("triage"); if (!el) return;
      const vers = Array.isArray(A_VERSIONS) ? A_VERSIONS : [];
      el.innerHTML = !vers.length
        ? `<p class="a-muted-note">No components.</p>`
        : `<p class="a-muted-note">Get a recommended update order for these ${vers.length} component(s).</p>` +
          `<button type="button" class="btn btn-primary a-run-triage-btn">Run Triage</button>`;
    }

    // Build the {name, version} list the server deterministically looks
    // up facts for (POST /api/ask/triage never trusts a client-supplied
    // version/CVE claim - see that route in src/app.js) and POST it,
    // then render the sorted, reasoned result. A_TRIAGE_RESULTS caches
    // the last response so switching modes away and back just re-shows
    // it (see aSetMode) instead of re-running a real model call.
    async function aRunTriage() {
      const el = aEl("triage"); if (!el) return;
      const vers = Array.isArray(A_VERSIONS) ? A_VERSIONS : [];
      if (!vers.length) { aRenderTriagePrompt(); return; }
      const components = vers
        .map(v => ({ name: v.name, version: (v.currentVersion && v.currentVersion.versionNumber) || null }))
        .filter(c => c.name);
      const optimizeSel = document.getElementById("a-triageOptimize");
      const optimizeFor = (optimizeSel && optimizeSel.value) || "both";
      const loader = aEl("loader");
      el.innerHTML = `<p class="a-muted-note">Analyzing update order...</p>`;
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
        A_TRIAGE_RESULTS = data;
        aRenderTriageResult(data);
      } catch (e) {
        console.error("Triage error:", e);
        A_TRIAGE_RESULTS = null;
        el.innerHTML = `<p class="a-muted-note">Could not run triage: ${aEsc(String(e.message || e))}</p>` +
          `<button type="button" class="btn btn-ghost a-run-triage-btn">Retry</button>`;
      } finally {
        if (loader) setDisplay(loader, "none");
      }
    }

    // Renders a cached/just-fetched triage response. Reuses the same
    // .a-drift/.a-score table styling aRenderTable already established,
    // so this reads as "the same kind of table, with an extra Order/
    // Reasoning pair of columns" rather than an unrelated new widget.
    function aRenderTriageResult(data) {
      const el = aEl("triage"); if (!el) return;
      const results = Array.isArray(data && data.results) ? data.results : [];
      if (!results.length) { el.innerHTML = `<p class="a-muted-note">No components.</p>`; return; }
      const optimizeLabel = { security: "Security", stability: "Stability", both: "Both" }[data.optimizeFor] || "Both";
      const cveCount = results.filter(r => r.cve).length;
      el.innerHTML =
        `<div class="a-score">Update order &middot; optimized for <b>${aEsc(optimizeLabel)}</b> &nbsp;&middot;&nbsp; ${results.length} component(s) &nbsp;&middot;&nbsp; ${cveCount} with a known CVE ` +
        `<button type="button" class="btn btn-ghost st-59 a-run-triage-btn" title="Re-run triage">&#8635; Re-run</button></div>` +
        `<table class="a-drift"><thead><tr>` +
        `<th>#</th><th>Component</th><th>Installed</th><th>Latest</th><th>Change</th><th>CVE</th><th>Reasoning</th>` +
        `</tr></thead><tbody>` +
        results.map(r => {
          const bumpChip = r.versionBump && r.versionBump !== "unknown"
            ? `<span class="a-chip-t rt-bg" style="--rt-bg:${A_FILLS.behind}">${aEsc(r.versionBump)}</span>`
            : `<span class="a-muted-note">-</span>`;
          const cveChip = r.cve
            ? `<span class="a-chip-t rt-bg" style="--rt-bg:${A_FILLS.cve}">${aEsc(r.cve.id)}</span>`
            : "-";
          return `<tr>` +
            `<td class="mono">${aEsc(r.order)}</td>` +
            `<td>${aEsc(r.name)}</td>` +
            `<td class="mono">${aEsc(r.currentVersion || "?")}</td>` +
            `<td class="mono">${aEsc(r.latestVersion || "-")}</td>` +
            `<td>${bumpChip}</td>` +
            `<td>${cveChip}</td>` +
            `<td class="a-reasoning-cell">${aEsc(r.reasoning)}</td>` +
            `</tr>`;
        }).join("") +
        `</tbody></table>`;
    }

    async function aLoadUpdatedToday() {
      const loader = aEl("loader"), titleEl = aEl("title");
      aShowResult();
      if (loader) setDisplay(loader, "block");
      try {
        const res = await fetch(`${API_BASE}v/d/updatedToday`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        await ensureRedditLoaded().catch(() => {});  // risk posts need the reddit index
        const vers = aApplyInventory(aAttachRisk(aMapVers(data)));
        if (titleEl) titleEl.textContent = "Today's updated components";
        A_VERSIONS = vers;
        A_TRIAGE_RESULTS = null;
        if (!vers.length) {
          if (titleEl) titleEl.textContent = "No components updated today";
          if (loader) setDisplay(loader, "none");
          return;
        }
        await aAttachCve(vers);
        aRenderDiagram(aBuildUml(vers));
        aUpdateMetrics(vers);
        if (A_MODE === "table") aRenderTable();
        if (A_MODE === "mermaid") aRenderMermaid(vers);
        if (A_MODE === "triage") aRenderTriagePrompt();
      } catch (e) {
        console.error("Arch load error:", e);
        if (loader) setDisplay(loader, "none");
      }
    }

    async function aLoadAndRender() {
      const compsCsv = (EL.components.value || "").trim();
      const names = compsCsv ? compsCsv.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (!names.length) { aShowEmptyState(); return; }
      const loader = aEl("loader"), titleEl = aEl("title");
      aShowResult();
      if (loader) setDisplay(loader, "block");
      try {
        const query = names.map(n => `component=name:${encodeURIComponent(n)}`).join("&");
        const res = await fetch(`${API_BASE}v/d/versionsByComponent?${query}`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        await ensureRedditLoaded().catch(() => {});  // risk posts need the reddit index
        const vers = aApplyInventory(aAttachRisk(aMapVers(data)));
        if (titleEl) titleEl.textContent = names.join(", ");
        A_VERSIONS = vers;
        A_TRIAGE_RESULTS = null;
        if (!vers.length) {
          if (titleEl) titleEl.textContent = "No data";
          if (loader) setDisplay(loader, "none");
          return;
        }
        await aAttachCve(vers);
        const uml = aBuildUml(vers);
        aRenderDiagram(uml);
        aUpdateMetrics(vers);
        if (A_MODE === "table") aRenderTable();
        if (A_MODE === "mermaid") aRenderMermaid(vers);
        if (A_MODE === "triage") aRenderTriagePrompt();
      } catch (e) {
        console.error("Arch load error:", e);
        if (loader) setDisplay(loader, "none");
      }
    }

    /* ── Arch view: show / hide ───────────────────────────────── */
    function activateArch() {
      aPopulateMachineStacks();
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (G_ACTIVE)   deactivateGraph();
      if (CV_ACTIVE)  deactivateCve();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      A_ACTIVE = true;
      setViewParam("arch");
      setDisplay(document.getElementById("archView"), "flex");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("archControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.archLink.classList.add("nav-active");
      aSetMode(A_MODE);  // sync the Diagram / Table toggle buttons
    }
    function deactivateArch() {
      A_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("archView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("archControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.archLink.classList.remove("nav-active");
    }

    EL.archLink.addEventListener("click", async e => {
      e.preventDefault();
      if (A_ACTIVE) { deactivateArch(); return; }
      activateArch();
      EL.navLoader.classList.add("active");
      try { await aLoadPako(); } finally { EL.navLoader.classList.remove("active"); }
      aLoadAndRender();
    });

    /* ── Arch sidebar controls ────────────────────────────────── */
    // Adds one option per machine recorded in Installed versions (see
    // inventory.js) to #a-stackSelect - each one's value is that machine's
    // own component list, so "+ Add Stack" (the existing handler just below,
    // unchanged) loads every component recorded on that machine into the
    // search the same way a preset stack used to. Rebuilt every time Arch is
    // activated. uaInvGet() alone only reads whatever's cached in
    // localStorage, which is stale the moment inventory changes anywhere
    // other than this browser (e.g. the CLI tool uploading from a second
    // machine) - so this refreshes that cache from the server first
    // (uaLoadInventoryFromServer, the same call the Account page's own
    // Refresh button makes) whenever the user is actually signed in.
    async function aPopulateMachineStacks() {
      const sel = document.getElementById("a-stackSelect");
      if (!sel || typeof uaInvGet !== "function") return;
      if (typeof uaUser === "function" && uaUser() && typeof uaLoadInventoryFromServer === "function") {
        await uaLoadInventoryFromServer();
      }
      const old = sel.querySelector("optgroup[data-machine-group]");
      if (old) old.remove();
      const byMachine = new Map();
      for (const e of uaInvGet()) {
        if (!e.machine) continue;
        if (!byMachine.has(e.machine)) byMachine.set(e.machine, new Set());
        byMachine.get(e.machine).add(e.component);
      }
      if (!byMachine.size) return;
      const group = document.createElement("optgroup");
      group.label = "Your machines";
      group.setAttribute("data-machine-group", "1");
      for (const [machine, comps] of byMachine) {
        const opt = document.createElement("option");
        opt.value = Array.from(comps).join(",");
        opt.textContent = `${machine} (${comps.size})`;
        group.appendChild(opt);
      }
      sel.appendChild(group);
    }

    // Empty-state CTA ("Or use your own machine's real software"): jump to
    // the Account page's own "Installed versions" section (data-ua-group
    // "saved", selected via the same [data-ua-tab] mechanism the sub-tab
    // nav buttons already use) rather than duplicating that form here.
    document.getElementById("a-goToAccountBtn")?.addEventListener("click", () => {
      if (typeof activateUsers === "function") activateUsers();
      setTimeout(() => {
        document.querySelector('[data-ua-tab="saved"]')?.click();
        const details = document.getElementById("ua-inv-count")?.closest("details");
        if (details) {
          details.open = true;
          details.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);
    });

    document.getElementById("a-addStackBtn").addEventListener("click", () => {
      const sel = document.getElementById("a-stackSelect");
      const val = sel.value; if (!val) return;
      const toAdd = val.split(",").map(s => s.trim()).filter(Boolean);
      const existing = (EL.components.value || "").split(",").map(s => s.trim()).filter(Boolean);
      const merged = Array.from(new Set([...existing, ...toAdd]));
      EL.components.value = merged.join(", ");
      // Not reset to "" anymore - reported live: "when i pick a vm keep
      // it selected until i change it." The select's own value isn't
      // used as a "change"-event trigger anywhere (this button's click
      // handler reads it directly, every time), so leaving it selected
      // costs nothing and gives a clear, persistent "this is the machine
      // currently loaded" indicator instead of reverting to the bare
      // placeholder right after use.
      if (A_ACTIVE) aLoadAndRender();
    });

    document.getElementById("a-todayBtn").addEventListener("click", () => {
      EL.components.value = "";
      aLoadUpdatedToday();
    });

    // Diagram/Table/Flowchart/Triage used to be 4 separate buttons each
    // doing their own aSetMode() call; now it's one mutually-exclusive
    // <select>, so there's one change listener instead of 4 click ones.
    // Triage is still the one mode that's also an action: picking it both
    // switches the visible panel AND fires the real model call (see
    // aRunTriage's own comment on why this isn't done inside aSetMode).
    document.getElementById("a-viewMode")?.addEventListener("change", (e) => {
      const mode = e.target.value;
      aSetMode(mode);
      if (mode === "triage") aRunTriage();
    });
    // Changing "Optimize for" while already looking at a triage result
    // re-runs it with the new weighting; otherwise it's just remembered
    // for the next time the Triage button is clicked.
    document.getElementById("a-triageOptimize")?.addEventListener("change", () => { if (A_MODE === "triage" && A_TRIAGE_RESULTS) aRunTriage(); });
    // One delegated listener covers the "Run Triage"/"Retry"/"Re-run"
    // button regardless of which of the three states (prompt/error/
    // result) currently has it, since #a-triage's own innerHTML gets
    // replaced wholesale by each of those - reported live: picking a new
    // machine while already in Triage mode left a "Click Triage..."
    // prompt with no actual way to trigger it (the bolded word "Triage"
    // in that prompt was never a real button - the ONLY existing trigger
    // was the mode <select>'s own "change" event, which doesn't fire
    // again just because the underlying component list changed).
    document.getElementById("a-triage")?.addEventListener("click", (e) => {
      if (e.target.closest(".a-run-triage-btn")) aRunTriage();
    });

    document.getElementById("a-metricsBtn").addEventListener("click", () => document.getElementById("a-metricsDialog").showModal());
    document.getElementById("a-codeBtn").addEventListener("click", () => document.getElementById("a-codeDialog").showModal());
    document.getElementById("a-detailsBtn").addEventListener("click", () => document.getElementById("a-detailsDialog").showModal());
    document.getElementById("a-configBtn").addEventListener("click", () => {
      document.getElementById("a-cfgApi").value = API_BASE.replace(/\/$/, "");
      document.getElementById("a-cfgPlant").value = A_PLANTUML_SERVER;
      document.getElementById("a-configDialog").showModal();
    });
    document.getElementById("a-copyLinkBtn").addEventListener("click", () => {
      if (!A_PLANTUML_URL) return;
      navigator.clipboard.writeText(A_PLANTUML_URL).then(() => alert("Ecosystem image URL copied!"));
    });
    document.getElementById("a-copyCodeBtn").addEventListener("click", () => {
      navigator.clipboard.writeText(A_UML_CODE).then(() => alert("PlantUML code copied!"));
    });
    document.getElementById("a-cfgCopyApi").addEventListener("click", () => {
      navigator.clipboard.writeText(API_BASE.replace(/\/$/, "")).then(() => alert("API endpoint copied!"));
    });
    document.getElementById("a-cfgApplyPlant").addEventListener("click", () => {
      const v = document.getElementById("a-cfgPlant").value.trim();
      if (!v) return alert("Enter a PlantUML server URL.");
      A_PLANTUML_SERVER = v.endsWith("/") ? v : v + "/";
      if (A_UML_CODE) { aRenderDiagram(A_UML_CODE); }
      alert("PlantUML server updated for this session.");
    });
