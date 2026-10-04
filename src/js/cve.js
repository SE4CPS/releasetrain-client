// cve.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    /* ── CVE Module ──────────────────────────────────────────── */
    let CV_ACTIVE = false, CV_INIT = false;

    const CV_API_BASE = API_BASE.replace(/\/$/, ''); // same endpoint, no trailing slash
    const CV_BATCH    = 250;

    const CV_NVD_STATUSES = [
      { key: 'received',    label: 'Received',               cls: 'nvd-received',   bar: 'info',  desc: 'CVE recently published to the CVE List.' },
      { key: 'awaiting',   label: 'Awaiting Enrichment',     cls: 'nvd-awaiting',   bar: '',      desc: 'Marked for NVD enrichment efforts.' },
      { key: 'undergoing', label: 'Undergoing Enrichment',   cls: 'nvd-undergoing', bar: 'warn',  desc: 'Currently being enriched by the NVD team.' },
      { key: 'enriched',   label: 'Enriched',                cls: 'nvd-enriched',   bar: 'ok',    desc: 'NVD enrichment complete.' },
      { key: 'modified',   label: 'Modified After Enrichment', cls: 'nvd-modified', bar: 'warn',  desc: 'Record updated after enrichment was complete.' },
      { key: 'deferred',   label: 'Not Scheduled',           cls: 'nvd-deferred',   bar: 'muted', desc: 'Not currently scheduled for NVD enrichment.' },
      { key: 'rejected',   label: 'Rejected',                cls: 'nvd-rejected',   bar: 'bad',   desc: 'Marked Rejected in the CVE List.' },
      { key: 'unknown',    label: 'No History',              cls: 'nvd-unknown',    bar: 'muted', desc: 'No NVD change history captured.' },
    ];
    const CV_NVD_BY_KEY = Object.fromEntries(CV_NVD_STATUSES.map(s => [s.key, s]));

    const CV_EL = {};
    function cvCacheEl() {
      ['statusBar','statusText','loadProgress','loadProgressFill',
       'postList','cveSearch','statusFilter','versionFilter','sortSelect','timelineBadge',
       'srcTabs','tabCountAll','tabCountReddit','tabCountStackoverflow','tabCountOther',
       'nvdPipelineFlow','pipelineRange',
       'aggStatus','aggSource','aggCompType','aggSecType','aggSubreddit','aggMonthly'
      ].forEach(id => { CV_EL[id] = document.getElementById(id); });
    }

    const CV_STATE = {
      all: [], filtered: [], totalCount: 0,
      sourceFilter: '',
      nonCveProductSet: null, latestProductSet: null,
    };

    function cvSetStatus(msg, type = '') {
      if (!CV_EL.statusText) return;
      CV_EL.statusText.textContent = msg;
      CV_EL.statusBar.className = type;
    }

    function cvSetProgress(loaded, total) {
      if (!CV_EL.loadProgressFill) return;
      const pct = total > 0 ? Math.min(100, Math.round(loaded / total * 100)) : 0;
      CV_EL.loadProgressFill.classList.add("rt-w");
      CV_EL.loadProgressFill.style.setProperty("--rt-w", pct + "%");
    }

    async function cvFetchBatch(cursor = null) {
      const params = new URLSearchParams({ q: 'CVE-', limit: String(CV_BATCH), showCount: 'true' });
      if (cursor) params.set('cursor', cursor);
      const r = await fetch(`${CV_API_BASE}/reddit/query/cve?${params}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }

    async function cvLoadAll() {
      if (!CV_EL.loadProgress) return;
      setDisplay(CV_EL.loadProgress, 'block');
      try {
        const first = await cvFetchBatch();
        CV_STATE.totalCount = first.totalCount ?? first.data?.length ?? 0;
        CV_STATE.all        = first.data ?? [];
        cvSetStatus(`Loading ${CV_STATE.all.length} of ${CV_STATE.totalCount}…`);
        cvSetProgress(CV_STATE.all.length, CV_STATE.totalCount);
        cvApplyFilter();
        cvRenderAggregates();
        let cursor = first.cursor ?? null;
        while (cursor) {
          const batch = await cvFetchBatch(cursor);
          const items = batch.data ?? [];
          const existingIds = new Set(CV_STATE.all.map(p => p._id || p.redditId || p.id));
          CV_STATE.all = [...CV_STATE.all, ...items.filter(p => !existingIds.has(p._id || p.redditId || p.id))];
          cursor = batch.cursor ?? null;
          cvSetStatus(`Loading ${CV_STATE.all.length} of ${CV_STATE.totalCount}…`);
          cvSetProgress(CV_STATE.all.length, CV_STATE.totalCount);
          cvApplyFilter();
          cvRenderAggregates();
        }
        cvSetStatus(`${CV_STATE.all.length} CVE posts loaded`, 'done');
        setDisplay(CV_EL.loadProgress, 'none');
        cvFetchVersionIndex();
      } catch (e) {
        cvSetStatus('Failed to load: ' + e.message, 'error');
        if (CV_EL.postList) CV_EL.postList.innerHTML = `<li class="empty-state"><div class="icon">⚠️</div>${cvEscHtml(e.message)}</li>`;
        if (CV_EL.loadProgress) setDisplay(CV_EL.loadProgress, 'none');
      }
    }

    async function cvFetchVersionIndex() {
      try {
        const r = await fetch(`${CV_API_BASE}/v/search?isCve=false&limit=500&fields=versionId,versionNumber,versionProductName`);
        if (!r.ok) return;
        const json = await r.json();
        const versions = json.data ?? [];
        CV_STATE.nonCveProductSet = new Set(versions.map(v => (v.versionProductName ?? '').toLowerCase()).filter(Boolean));
        const latestByComp = {};
        versions.forEach(v => {
          const comp = cvCompFromVersionId(v.versionId);
          const dateStr = (v.versionId ?? '').slice(0, 8);
          if (!latestByComp[comp] || dateStr > latestByComp[comp].date)
            latestByComp[comp] = { date: dateStr, product: (v.versionProductName ?? '').toLowerCase() };
        });
        CV_STATE.latestProductSet = new Set(Object.values(latestByComp).map(v => v.product).filter(Boolean));
        cvApplyFilter();
      } catch (e) { console.warn('Version index fetch failed:', e); }
    }

    function cvGetSource(post) {
      const url = (post.url ?? '').toLowerCase();
      if (url.includes('reddit.com') || post.subreddit) return 'reddit';
      if (url.includes('stackoverflow.com') || url.includes('stackexchange.com')) return 'stackoverflow';
      return 'other';
    }

    function cvApplyFilter() {
      if (!CV_EL.cveSearch) return;
      const q      = CV_EL.cveSearch.value.trim().toLowerCase();
      const srt    = CV_EL.sortSelect?.value ?? 'date-desc';
      const stFilt = CV_EL.statusFilter?.value ?? '';
      const vFilt  = CV_EL.versionFilter?.value ?? '';
      const srcF   = CV_STATE.sourceFilter;

      let list = CV_STATE.all.filter(p => {
        if (srcF && cvGetSource(p) !== srcF) return false;
        if (q) {
          const cveIds = (p.detectedCVEs ?? []).flatMap(c => c.cveIds ?? (c.cveId ? [c.cveId] : [])).join(' ').toLowerCase();
          if (!cveIds.includes(q) && !(p.title ?? '').toLowerCase().includes(q) &&
              !(p.subreddit ?? '').toLowerCase().includes(q) && !(p.author ?? '').toLowerCase().includes(q)) return false;
        }
        if (stFilt && cvCurrentNvdStatus(p) !== stFilt) return false;
        if (vFilt) {
          const productSet = vFilt === 'has-noncve' ? CV_STATE.nonCveProductSet : CV_STATE.latestProductSet;
          if (productSet !== null) { const sub = (p.subreddit ?? '').toLowerCase(); if (!sub || !productSet.has(sub)) return false; }
        }
        return true;
      });

      list = list.slice().sort((a, b) => {
        switch (srt) {
          case 'date-asc':      return cvTs(a) - cvTs(b);
          case 'score-desc':    return (b.score ?? 0) - (a.score ?? 0);
          case 'comments-desc': return (b.num_comments ?? 0) - (a.num_comments ?? 0);
          case 'ratio-desc':    return (b.upvote_ratio ?? 0) - (a.upvote_ratio ?? 0);
          default:              return cvTs(b) - cvTs(a);
        }
      });
      CV_STATE.filtered = list;
      cvRenderTimeline();
    }

    function cvTs(p) { return p.created_utc ? new Date(p.created_utc).getTime() : 0; }

    const _cvNvdCache = new WeakMap();
    function cvCurrentNvdStatus(post) {
      if (_cvNvdCache.has(post)) return _cvNvdCache.get(post);
      const cves = post.detectedCVEs ?? [];
      let result = 'unknown';
      for (const cve of cves) {
        if (cve.cveChangeHistory?.trim()) {
          const entries = cvParseCveHistory(cve.cveChangeHistory);
          if (entries.length) { result = entries[entries.length - 1].statusKey; break; }
        }
      }
      _cvNvdCache.set(post, result);
      return result;
    }

    function cvRenderTimeline() {
      if (!CV_EL.postList) return;
      if (CV_EL.timelineBadge) CV_EL.timelineBadge.textContent = CV_STATE.filtered.length;
      const frag = document.createDocumentFragment();
      if (!CV_STATE.filtered.length) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        li.innerHTML = '<div class="icon">🔍</div>No posts match your filter.';
        frag.appendChild(li);
        CV_EL.postList.replaceChildren(frag);
        return;
      }
      CV_STATE.filtered.forEach(post => frag.appendChild(cvBuildPostCard(post)));
      CV_EL.postList.replaceChildren(frag);
    }

    function cvBuildPostCard(post) {
      const cves = post.detectedCVEs ?? [];
      const allCveIds = [...new Set(cves.flatMap(c => c.cveIds ?? (c.cveId ? [c.cveId] : [])))];
      const secTypes = post.classification?.securityType ?? [];
      const compTypes = post.classification?.componentType ?? [];
      const curStatus = cvCurrentNvdStatus(post);
      const nvdMeta = CV_NVD_BY_KEY[curStatus] ?? CV_NVD_BY_KEY.unknown;
      const date = post.created_utc ? cvFmtDate(post.created_utc) : '';
      const ratio = typeof post.upvote_ratio === 'number' ? Math.round(post.upvote_ratio * 100) : null;

      const li = document.createElement('li'); li.className = 'post-card';
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.className = 'post-summary';
      const meta = document.createElement('div'); meta.className = 'post-meta';

      const titleDiv = document.createElement('div'); titleDiv.className = 'post-title';
      const a = document.createElement('a');
      a.href = post.url ?? '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = cvDecodeHtml(post.title ?? '(no title)');
      titleDiv.appendChild(a);

      const chips = document.createElement('div'); chips.className = 'post-chips';
      allCveIds.forEach(id => chips.appendChild(cvMkCveChip(id)));
      chips.appendChild(cvMkSourceChip(post));
      secTypes.forEach(t => chips.appendChild(cvMkChip(t, 'sec')));
      compTypes.forEach(t => chips.appendChild(cvMkChip(t, 'info')));
      const badge = document.createElement('span');
      badge.className = 'nvd-badge ' + nvdMeta.cls;
      badge.textContent = nvdMeta.label; badge.title = nvdMeta.desc;
      chips.appendChild(badge);

      const row2 = document.createElement('div'); row2.className = 'post-row2';
      row2.innerHTML = `<span>📅 ${date}</span><span>⬆ ${post.score ?? 0}</span><span>💬 ${post.num_comments ?? 0}</span>` +
        (ratio !== null ? `<span><span class="score-bar"><span class="score-fill rt-w" style="--rt-w:${ratio}%"></span></span> ${ratio}%</span>` : '') +
        `<span>👤 ${cvEscHtml(post.author ?? '')}</span>`;

      meta.appendChild(titleDiv); meta.appendChild(chips); meta.appendChild(row2);
      summary.appendChild(meta); details.appendChild(summary);

      const detail = document.createElement('div'); detail.className = 'post-detail';
      if (post.author_description?.trim()) {
        const desc = document.createElement('div'); desc.className = 'detail-description reddit-body';
        desc.appendChild(cvHighlightCveIds(cvDecodeHtml(post.author_description).trim()));
        detail.appendChild(desc);
      }
      cves.forEach(cve => detail.appendChild(cvBuildCveTimeline(post, cve)));
      if (!cves.some(c => c.cveChangeHistory?.trim())) detail.appendChild(cvBuildRedditOnlyTimeline(post));

      details.addEventListener('toggle', function onToggle() {
        if (!details.open) return;
        details.removeEventListener('toggle', onToggle);
        cvEnrichTimeline(post, detail);
      });

      details.appendChild(detail); li.appendChild(details);
      return li;
    }

    function cvBuildCveTimeline(post, cve) {
      const wrap = document.createElement('div');
      const label = document.createElement('div'); label.className = 'tl-section-label';
      const cveIds = cve.cveIds ?? (cve.cveId ? [cve.cveId] : []);
      if (cveIds.length) {
        cveIds.forEach((id, i) => {
          if (i > 0) label.appendChild(document.createTextNode(' · '));
          const a = document.createElement('a');
          a.href = 'https://nvd.nist.gov/vuln/detail/' + encodeURIComponent(id);
          a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.classList.add("link-dotted");
          a.textContent = id; label.appendChild(a);
        });
        label.appendChild(document.createTextNode(' · Event Timeline'));
      } else { label.textContent = 'Event Timeline'; }
      wrap.appendChild(label);

      const events = [];
      events.push({ ts: post.created_utc ? new Date(post.created_utc) : null, type: 'post',
        label: 'Reddit post published',
        sub: `r/${post.subreddit ?? '?'} · by ${post.author ?? '?'} · score ${post.score ?? 0}`,
        body: cvDecodeHtml(post.author_description ?? '').trim() || null, dotCls: 'dot-post' });

      cvParseCveHistory(cve.cveChangeHistory ?? '').forEach(e => {
        events.push({ ts: e.rawDate, type: 'cve',
          label: 'NVD Status: ' + (CV_NVD_BY_KEY[e.statusKey]?.label ?? e.action),
          sub: e.action, body: e.changes || null,
          dotCls: 'dot-' + e.statusKey, nvdKey: e.statusKey });
      });

      (post.comments ?? []).forEach(c => {
        events.push({ ts: c.created_utc ? new Date(c.created_utc) : null, type: 'comment',
          label: 'Comment by ' + (c.author ?? 'unknown'), sub: null,
          body: (c.body ?? '').slice(0, 500) + ((c.body ?? '').length > 500 ? '…' : ''),
          dotCls: 'dot-comment' });
      });

      events.sort((a, b) => { if (!a.ts && !b.ts) return 0; if (!a.ts) return 1; if (!b.ts) return -1; return a.ts - b.ts; });

      const tlWrap = document.createElement('div'); tlWrap.className = 'tl-wrap';
      events.forEach(ev => {
        const item = document.createElement('div'); item.className = 'tl-item';
        item.dataset.ts = ev.ts ? ev.ts.getTime() : '';
        const dot = document.createElement('div'); dot.className = 'tl-dot ' + ev.dotCls;
        item.appendChild(dot);
        const header = document.createElement('div'); header.className = 'tl-header';
        if (ev.ts) { const ds = document.createElement('span'); ds.className = 'tl-date'; ds.textContent = cvFmtDateTime(ev.ts); header.appendChild(ds); }
        const lbl = document.createElement('span'); lbl.className = 'tl-label'; lbl.textContent = ev.label; header.appendChild(lbl);
        if (ev.nvdKey) { const nb = document.createElement('span'); nb.className = 'nvd-badge nvd-' + ev.nvdKey; nb.textContent = CV_NVD_BY_KEY[ev.nvdKey]?.label ?? ev.nvdKey; header.appendChild(nb); }
        item.appendChild(header);
        if (ev.sub) { const sub = document.createElement('div'); sub.className = 'tl-sublabel'; sub.textContent = ev.sub; item.appendChild(sub); }
        if (ev.body) {
          const body = document.createElement('div');
          body.className = 'tl-body' + (ev.type === 'post' ? ' reddit-body' : ev.type === 'comment' ? ' comment-body' : '');
          body.appendChild(cvHighlightCveIds(ev.body)); item.appendChild(body);
        }
        tlWrap.appendChild(item);
      });
      const ph = document.createElement('div'); ph.className = 'tl-version-loading'; ph.textContent = 'Loading release context…';
      tlWrap.appendChild(ph);
      wrap.appendChild(tlWrap);
      return wrap;
    }

    function cvBuildRedditOnlyTimeline(post) {
      return cvBuildCveTimeline(post, { cveId: [], cveChangeHistory: '' });
    }

    function cvParseCveHistory(raw) {
      if (!raw?.trim()) return [];
      const lines = raw.split('\n'), entries = [];
      let current = null;
      lines.forEach(line => {
        const top = line.match(/^(\d+)\.\s+(\d{4}-\d{2}-\d{2}T[\d:.]+)\s*\|\s*([^|]+?)(?:\s*\|.*)?$/);
        if (top) {
          if (current) entries.push(current);
          const rawDate = cvParseDate(top[2]);
          const action = top[3].trim();
          current = { rawDate, date: rawDate ? cvFmtDateTime(rawDate) : top[2], action, statusKey: cvActionToStatusKey(action), changes: '' };
          return;
        }
        if (!current) return;
        const sub = line.match(/^\s+[-–]\s+(.+)$/);
        if (sub) { current.changes += (current.changes ? '\n' : '') + sub[1].trim(); return; }
        const cont = line.match(/^(\s{6,})(\S.*)$/);
        if (cont && current.changes) current.changes += '\n  ' + cont[2].trim();
      });
      if (current) entries.push(current);
      entries.sort((a, b) => { if (!a.rawDate && !b.rawDate) return 0; if (!a.rawDate) return 1; if (!b.rawDate) return -1; return a.rawDate - b.rawDate; });
      return entries;
    }

    function cvActionToStatusKey(action) {
      const a = (action ?? '').toLowerCase().trim();
      if (a === 'cve rejected' || a === 'rejected' || a.startsWith('reject')) return 'rejected';
      if (a === 'deferred' || a.includes('not scheduled')) return 'deferred';
      if (a === 'initial analysis' || a === 'reanalysis' || a === 'cve translated' || a === 'analyzed' || a === 'cvss score update' || a.includes('enriched')) return 'enriched';
      if (a === 'undergoing analysis' || a.includes('undergoing') || a.includes('in progress')) return 'undergoing';
      if (a === 'awaiting analysis' || a.startsWith('awaiting')) return 'awaiting';
      if (a === 'cve modified' || a === 'modified' || a === 'cwe remap' || a === 'cpe deprecation remap' || a.includes('modified') || a.includes('changed') || a.includes('remap')) return 'modified';
      if (a === 'new cve received' || a.includes('received') || a.includes('new cve') || a.includes('published') || a.startsWith('added')) return 'received';
      return 'unknown';
    }

    async function cvEnrichTimeline(post, detailEl) {
      const postDate = post.created_utc ? new Date(post.created_utc) : null;
      if (!postDate) { detailEl.querySelectorAll('.tl-version-loading').forEach(el => el.remove()); return; }
      const end = cvToYMD(postDate);
      const compTypes = (post.classification?.componentType ?? []).filter(Boolean);
      const baseFields = 'versionId,versionNumber,versionReleaseDate';
      const gp = new URLSearchParams({ end, limit: '5', fields: baseFields });
      if (compTypes.length) gp.set('q', compTypes.join(','));
      const cp = new URLSearchParams({ end, isCve: 'true', limit: '3', fields: baseFields });
      if (compTypes.length) cp.set('q', compTypes.join(','));
      try {
        const [genRes, cveRes] = await Promise.allSettled([
          fetch(`${CV_API_BASE}/v/search?${gp}`).then(r => r.ok ? r.json() : { data: [] }),
          fetch(`${CV_API_BASE}/v/search?${cp}`).then(r => r.ok ? r.json() : { data: [] }),
        ]);
        const general = genRes.status === 'fulfilled' ? (genRes.value.data ?? []) : [];
        const cveFix  = cveRes.status === 'fulfilled' ? (cveRes.value.data ?? []) : [];
        const cveIds  = new Set(cveFix.map(v => v.versionId));
        const seen = new Set();
        const releases = [...cveFix, ...general].filter(v => {
          if (seen.has(v.versionId)) return false; seen.add(v.versionId);
          const rd = v.versionReleaseDate ? new Date(v.versionReleaseDate) : null;
          return rd && rd <= postDate;
        }).sort((a, b) => new Date(b.versionReleaseDate) - new Date(a.versionReleaseDate));
        const latestId = releases.find(v => !cveIds.has(v.versionId))?.versionId ?? null;
        detailEl.querySelectorAll('.tl-wrap').forEach(tlWrap => {
          const loading = tlWrap.querySelector('.tl-version-loading');
          if (loading) loading.remove();
          if (!releases.length) return;
          releases.forEach(v => {
            const rd = new Date(v.versionReleaseDate);
            const isCve = cveIds.has(v.versionId);
            const isLatest = v.versionId === latestId;
            const comp = cvCompFromVersionId(v.versionId);
            cvInsertChronologically(tlWrap, cvBuildTlReleaseItem(rd, comp, v.versionNumber ?? '', isCve, isLatest), rd);
          });
        });
      } catch { detailEl.querySelectorAll('.tl-version-loading').forEach(el => el.remove()); }
    }

    function cvBuildTlReleaseItem(date, comp, version, isCve, isLatest = false) {
      const item = document.createElement('div');
      item.className = 'tl-item tl-release' + (isLatest ? ' tl-latest' : '');
      item.dataset.ts = date ? date.getTime() : '';
      const dot = document.createElement('div');
      dot.className = 'tl-dot ' + (isLatest ? 'dot-release' : isCve ? 'dot-release-cve' : 'dot-release');
      item.appendChild(dot);
      const header = document.createElement('div'); header.className = 'tl-header';
      const ds = document.createElement('span'); ds.className = 'tl-date'; ds.textContent = cvFmtDateTime(date); header.appendChild(ds);
      const lbl = document.createElement('span'); lbl.className = 'tl-label';
      lbl.textContent = isLatest ? `★ Official release of v${version}` : (`${comp} ${version}`.trim() || 'Release');
      header.appendChild(lbl);
      const badge = document.createElement('span');
      badge.className = 'nvd-badge ' + (isLatest ? 'nvd-enriched' : isCve ? 'nvd-rejected' : 'nvd-awaiting');
      badge.textContent = isLatest ? 'Latest before CVE' : isCve ? 'CVE Release' : 'Release';
      header.appendChild(badge); item.appendChild(header);
      if (isLatest && comp) { const sub = document.createElement('div'); sub.className = 'tl-sublabel'; sub.textContent = `${comp} · latest stable release before this CVE post`; item.appendChild(sub); }
      return item;
    }

    function cvInsertChronologically(tlWrap, newItem, newDate) {
      const newTs = newDate ? newDate.getTime() : Infinity;
      const items = [...tlWrap.querySelectorAll('.tl-item')];
      for (const item of items) { const itemTs = Number(item.dataset.ts); if (!itemTs || newTs <= itemTs) { tlWrap.insertBefore(newItem, item); return; } }
      tlWrap.appendChild(newItem);
    }

    function cvCompFromVersionId(vid) { return (vid ?? '').replace(/^\d{8}/, '').replace(/[\d.]+$/, '') || vid; }
    function cvToYMD(date) { return date.toISOString().slice(0, 10).replace(/-/g, ''); }

    function cvRenderNvdPipeline(statusMap, totalPosts) {
      const mainFlow = [
        { key: 'received', label: 'Received', cls: 's-info' },
        { key: 'awaiting', label: 'Awaiting',  cls: 's-muted' },
        { key: 'undergoing', label: 'Undergoing', cls: 's-warn' },
        { key: 'enriched', label: 'Enriched',  cls: 's-ok' },
        { key: 'modified', label: 'Modified',  cls: 's-warn' },
      ];
      const sideStates = [
        { key: 'deferred', label: 'Deferred',   cls: 's-muted' },
        { key: 'rejected', label: 'Rejected',   cls: 's-bad' },
        { key: 'unknown',  label: 'No History', cls: 's-muted' },
      ];
      const raw = mainFlow.map(s => statusMap.get(s.key) ?? 0);
      const cumulative = raw.map((_, i) => raw.slice(i).reduce((a, b) => a + b, 0));
      let html = `<div class="npp-step s-source"><span class="npp-count">${totalPosts}</span><span class="npp-label">Reddit Posts</span><span class="npp-sub">with CVE mentions</span></div>`;
      html += `<span class="npp-arrow">›</span>`;
      html += `<div class="npp-step s-cvelist" title="CNA reserved this CVE ID."><span class="npp-count">${totalPosts}</span><span class="npp-label">Reserved</span><span class="npp-sub">CVE List · cve.org</span></div>`;
      html += `<span class="npp-arrow">›</span>`;
      html += `<div class="npp-step s-cvelist" title="CVE details now public on cve.org."><span class="npp-count">${totalPosts}</span><span class="npp-label">Published</span><span class="npp-sub">CVE List · cve.org</span></div>`;
      mainFlow.forEach((s, i) => {
        const cum = cumulative[i], own = raw[i];
        const pct = totalPosts > 0 ? Math.round(cum / totalPosts * 100) + '%' : '';
        const sub = own !== cum ? `${pct} · ${own} currently here` : `${pct} of posts`;
        html += `<span class="npp-arrow">›</span>`;
        html += `<div class="npp-step ${s.cls}" title="${cvEscHtml(CV_NVD_BY_KEY[s.key]?.desc ?? '')}"><span class="npp-count">${cum}</span><span class="npp-label">${cvEscHtml(s.label)}</span>${sub ? `<span class="npp-sub">${sub}</span>` : ''}</div>`;
      });
      html += `<span class="npp-divider"></span>`;
      sideStates.forEach(s => {
        const n = statusMap.get(s.key) ?? 0;
        if (!n) return;
        const pct = totalPosts > 0 ? Math.round(n / totalPosts * 100) + '%' : '';
        html += `<div class="npp-step ${s.cls}" title="${cvEscHtml(CV_NVD_BY_KEY[s.key]?.desc ?? '')}"><span class="npp-count">${n}</span><span class="npp-label">${cvEscHtml(s.label)}</span>${pct ? `<span class="npp-sub">${pct} of posts</span>` : ''}</div>`;
        html += `<span class="st-228 npp-arrow" >·</span>`;
      });
      if (CV_EL.nvdPipelineFlow) CV_EL.nvdPipelineFlow.innerHTML = html;
    }

    function cvRenderAggregates() {
      const posts = CV_STATE.all, total = posts.length || 1;
      const statusMap = new Map(CV_NVD_STATUSES.map(s => [s.key, 0]));
      posts.forEach(p => { const k = cvCurrentNvdStatus(p); statusMap.set(k, (statusMap.get(k) ?? 0) + 1); });
      cvUpdateStatusDropdown(statusMap, posts.length);
      cvRenderNvdPipeline(statusMap, posts.length);

      const dates = posts.map(p => p.created_utc ? new Date(p.created_utc) : null).filter(Boolean);
      if (dates.length && CV_EL.pipelineRange) {
        const oldest = new Date(Math.min(...dates.map(d => d.getTime())));
        const newest = new Date(Math.max(...dates.map(d => d.getTime())));
        CV_EL.pipelineRange.textContent = cvFmtMonthYear(oldest) + ' to ' + cvFmtMonthYear(newest);
      }

      const maxStatus = Math.max(...statusMap.values(), 1);
      if (CV_EL.aggStatus) CV_EL.aggStatus.innerHTML = CV_NVD_STATUSES
        .filter(s => (statusMap.get(s.key) ?? 0) > 0)
        .map(s => { const n = statusMap.get(s.key) ?? 0;
          return `<div class="bar-row" title="${cvEscHtml(s.desc)}"><span class="bar-label">${cvEscHtml(s.label)}</span><span class="bar-track"><span class="bar-fill ${s.bar} rt-w" style="--rt-w:${Math.round(n/maxStatus*100)}%"></span></span><span class="bar-count">${n}</span></div>`;
        }).join('') || '<span class="st-229" >No data yet</span>';

      const srcCount = { reddit: 0, stackoverflow: 0, other: 0 };
      posts.forEach(p => { srcCount[cvGetSource(p)]++; });
      if (CV_EL.tabCountAll) CV_EL.tabCountAll.textContent = posts.length;
      if (CV_EL.tabCountReddit) CV_EL.tabCountReddit.textContent = srcCount.reddit;
      if (CV_EL.tabCountStackoverflow) CV_EL.tabCountStackoverflow.textContent = srcCount.stackoverflow;
      if (CV_EL.tabCountOther) CV_EL.tabCountOther.textContent = srcCount.other;
      const srcMap = new Map([['Reddit', srcCount.reddit], ['Stack Overflow', srcCount.stackoverflow], ['Other', srcCount.other]]);
      if (CV_EL.aggSource) CV_EL.aggSource.innerHTML = cvRenderBars(srcMap, 'brand');

      const compMap = new Map();
      posts.forEach(p => { const ct = p.classification?.componentType ?? []; ct.forEach(t => compMap.set(t, (compMap.get(t) ?? 0) + 1)); if (!ct.length) compMap.set('Unclassified', (compMap.get('Unclassified') ?? 0) + 1); });
      if (CV_EL.aggCompType) CV_EL.aggCompType.innerHTML = cvRenderBars(compMap, 'brand');

      const secMap = new Map();
      posts.forEach(p => { const st = p.classification?.securityType ?? []; st.forEach(t => secMap.set(t, (secMap.get(t) ?? 0) + 1)); if (!st.length) secMap.set('No tag', (secMap.get('No tag') ?? 0) + 1); });
      if (CV_EL.aggSecType) CV_EL.aggSecType.innerHTML = cvRenderBars(secMap, 'bad');

      const subMap = new Map();
      posts.forEach(p => { const s = p.subreddit ?? 'unknown'; subMap.set(s, (subMap.get(s) ?? 0) + 1); });
      const topSubs = [...subMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
      if (CV_EL.aggSubreddit) CV_EL.aggSubreddit.innerHTML = `<div class="pill-list">${topSubs.map(([sub, n]) => `<span class="pill">r/${cvEscHtml(sub)} <span class="pct">${Math.round(n/total*100)}%</span></span>`).join('')}</div>`;

      const monthMap = new Map();
      posts.forEach(p => { if (!p.created_utc) return; const d = new Date(p.created_utc); const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; monthMap.set(key, (monthMap.get(key) ?? 0) + 1); });
      const months = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const maxM = Math.max(...months.map(m => m[1]), 1);
      if (CV_EL.aggMonthly) CV_EL.aggMonthly.innerHTML = months.length
        ? months.map(([mo, n]) => `<div class="bar-row"><span class="bar-label">${mo}</span><span class="bar-track"><span class="bar-fill rt-w" style="--rt-w:${Math.round(n/maxM*100)}%"></span></span><span class="bar-count">${n}</span></div>`).join('')
        : '<span class="st-229" >No date data yet</span>';
    }

    function cvUpdateStatusDropdown(statusMap, total) {
      if (!CV_EL.statusFilter) return;
      const selected = CV_EL.statusFilter.value;
      let html = `<option value="">All statuses (${total})</option>`;
      CV_NVD_STATUSES.forEach(s => { const n = statusMap.get(s.key) ?? 0; html += `<option value="${s.key}"${n===0?' disabled':''}>${cvEscHtml(s.label)} (${n})</option>`; });
      CV_EL.statusFilter.innerHTML = html;
      const opt = CV_EL.statusFilter.querySelector(`option[value="${selected}"]`);
      CV_EL.statusFilter.value = (opt && !opt.disabled) ? selected : '';
    }

    function cvRenderBars(map, colorClass) {
      const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const maxV = Math.max(...sorted.map(e => e[1]), 1);
      if (!sorted.length) return '<span class="st-229" >No data</span>';
      return sorted.map(([label, n]) => `<div class="bar-row"><span class="bar-label" title="${cvEscHtml(label)}">${cvEscHtml(label)}</span><span class="bar-track"><span class="bar-fill ${colorClass} rt-w" style="--rt-w:${Math.round(n/maxV*100)}%"></span></span><span class="bar-count">${n}</span></div>`).join('');
    }

    const CV_CVE_RE = /CVE-\d{4}-\d{4,}/gi;
    function cvHighlightCveIds(text) {
      const frag = document.createDocumentFragment();
      let last = 0; CV_CVE_RE.lastIndex = 0; let m;
      while ((m = CV_CVE_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const a = document.createElement('a');
        a.className = 'cve-highlight';
        a.href = 'https://nvd.nist.gov/vuln/detail/' + encodeURIComponent(m[0]);
        a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'View ' + m[0] + ' on NVD';
        a.textContent = m[0]; frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      return frag;
    }

    function cvMkChip(text, cls) { const s = document.createElement('span'); s.className = 'chip ' + cls; s.textContent = text; return s; }
    function cvMkSourceChip(post) {
      const src = cvGetSource(post);
      if (src === 'reddit') return cvMkChip('r/' + (post.subreddit ?? 'reddit'), 'sub');
      if (src === 'stackoverflow') { const s = document.createElement('span'); s.className = 'chip info'; s.textContent = 'Stack Overflow'; return s; }
      try { const s = document.createElement('span'); s.className = 'chip neutral'; s.textContent = new URL(post.url || 'http://x').hostname.replace('www.', ''); return s; }
      catch { const s = document.createElement('span'); s.className = 'chip neutral'; s.textContent = 'other'; return s; }
    }
    function cvMkCveChip(cveId) {
      const a = document.createElement('a');
      a.className = 'chip cve'; a.textContent = cveId;
      a.href = 'https://nvd.nist.gov/vuln/detail/' + encodeURIComponent(cveId);
      a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'View ' + cveId + ' on NVD';
      return a;
    }
    function cvParseDate(str) { try { const d = new Date(str); return isNaN(d) ? null : d; } catch { return null; } }
    function cvFmtMonthYear(d) { try { return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch { return String(d); } }
    function cvFmtDate(iso) { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return String(iso); } }
    function cvFmtDateTime(d) { if (!d) return ''; try { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); } catch { return String(d); } }
    function cvEscHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function cvDecodeHtml(s) { return String(s).replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }

    function cvWireEvents() {
      const tabs = document.getElementById('srcTabs');
      if (tabs) {
        tabs.addEventListener('click', e => {
          const btn = e.target.closest('.src-tab');
          if (!btn) return;
          tabs.querySelectorAll('.src-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          CV_STATE.sourceFilter = btn.dataset.src;
          cvApplyFilter();
        });
      }
      let cv_searchTimer;
      if (CV_EL.cveSearch) CV_EL.cveSearch.addEventListener('input', () => { clearTimeout(cv_searchTimer); cv_searchTimer = setTimeout(cvApplyFilter, 200); });
      if (CV_EL.sortSelect) CV_EL.sortSelect.addEventListener('change', cvApplyFilter);
      if (CV_EL.statusFilter) CV_EL.statusFilter.addEventListener('change', cvApplyFilter);
      if (CV_EL.versionFilter) CV_EL.versionFilter.addEventListener('change', cvApplyFilter);
    }

    function cvInitPage() {
      if (CV_INIT) return;
      CV_INIT = true;
      cvCacheEl();
      cvWireEvents();
      cvLoadAll();
    }

    function activateCve() {
      if (ER_ACTIVE)  deactivateEvalRewriter();
      if (EE_ACTIVE)  deactivateEvalEvaluator();
      if (EO_ACTIVE)  deactivateEvalOrchestrator();
      if (G_ACTIVE)   deactivateGraph();
      if (A_ACTIVE)   deactivateArch();
      if (DB_ACTIVE)  deactivateDashboard();
      if (D_ACTIVE)   deactivateDocs();
      if (ACK_ACTIVE) deactivateAck();
      if (CL_ACTIVE)  deactivateChangelog();
      if (UA_ACTIVE)  deactivateUsers();
      if (NET_ACTIVE) deactivateNetwork();
      if (T_ACTIVE)   deactivateTriage();
      CV_ACTIVE = true;
      setViewParam("cve");
      setDisplay(document.getElementById("cveView"), "flex");
      setDisplay(document.getElementById("feedPanel"), "none");
      setDisplay(document.getElementById("cveControls"), "");
      setDisplay(document.getElementById("feedSidebarSections"), "none");
      EL.cveLink.classList.add("nav-active");
      cvInitPage();
    }

    function deactivateCve() {
      CV_ACTIVE = false;
      setViewParam("");
      setDisplay(document.getElementById("cveView"), "none");
      setDisplay(document.getElementById("feedPanel"), "");
      setDisplay(document.getElementById("cveControls"), "none");
      setDisplay(document.getElementById("feedSidebarSections"), "");
      EL.cveLink.classList.remove("nav-active");
    }

    EL.cveLink.addEventListener("click", e => {
      e.preventDefault();
      if (CV_ACTIVE) { deactivateCve(); return; }
      activateCve();
    });
