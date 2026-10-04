// feed.js: part of the app script; classic script, loaded in order by index.html (see the script list at the end of the page).

    /* ── Post helpers ─────────────────────────────────────────── */
    function getPostSource(p) {
      const s = norm(p?.source || "");
      if (s) return s;
      const url = String(p?.url || "");
      if (url.includes("stackoverflow.com")) return "stackoverflow";
      return "reddit";
    }
    const getPostId = p => p?.redditId || p?._id || p?.id || "";
    const isUpdateRelatedBoolean = p => !!(p?.metadata?.labeled?.isUpdateRelated || p?.metadata?.predicted?.isUpdateRelated);
    const getUpdateScore = p => typeof p?.metadata?.predicted?.positiveScore === "number" ? p.metadata.predicted.positiveScore : null;
    const isRisk = p => isUpdateRelatedBoolean(p) || ((getUpdateScore(p) ?? -1) > 0.5);

    // Exact-match anchor names for AI model releases. The server's `q` search matches
    // near-exact versionProductName (confirmed empirically: q=Claude finds only the
    // single doc named exactly "Claude", not "Claude 2" or "Claude 3.5 Sonnet"; a
    // handful of generic brand keywords like "mistral"/"openai" only turns up a
    // couple of real hits this way). This list is ai_model.py's actual scraped
    // catalog (Ollama library slugs + the OpenAI/Anthropic/Mistral/xAI/DeepSeek/
    // Meta/Gemini Wikipedia tables) as of 2026-08-18 — it's what makes the LLM
    // dataset fetch below actually complete instead of finding 3 of ~560 real docs.
    // Needs periodic regeneration from ai_model.py's fetchers as new models appear;
    // stale entries are harmless (they just stop matching anything).
    const KNOWN_LLM_PRODUCT_NAMES = ["1","1.0 Nano","1.0 Pro","1.0 Ultra","1.5","1.5 Flash","1.5 Pro","2","2.0 Flash","2.0 Flash-Lite","2.0 Pro","2.5 Flash","2.5 Flash Image (Nano Banana)","2.5 Flash-Lite","2.5 Pro","2mini","3","3 Deep Think","3 Flash","3 Pro","3 Pro Image (Nano Banana Pro)","3.1 Flash Image(Nano Banana 2)","3.1 Flash-Lite","3.1 Flash-Lite Image(Nano Banana 2 Lite)","3.1 Pro","3.5 Flash","3.5 Flash-Lite","3.6 Flash","3.7 Flash","3mini","4","4.1","4.1Fast","4.1Thinking","4.20","4.3","4.5","4.6","4Fast","4Heavy","Claude","Claude 2","Claude 2.1","Claude 3 Haiku","Claude 3 Opus","Claude 3 Sonnet","Claude 3.5 Haiku","Claude 3.5 Sonnet","Claude 3.5 Sonnet (new)","Claude 3.7 Sonnet","Claude Fable 5","Claude Haiku 4.5","Claude Instant 1.2","Claude Mythos 5","Claude Mythos Preview","Claude Opus 4","Claude Opus 4.1","Claude Opus 4.5","Claude Opus 4.6","Claude Opus 4.7","Claude Opus 4.8","Claude Opus 5","Claude Sonnet 4","Claude Sonnet 4.5","Claude Sonnet 4.6","Claude Sonnet 5","Code Fast1","Code Llama","Codestral 22B","Codestral Mamba 7B","Codestral25.01","Codestral25.08","DeepSeek-Coder","DeepSeek-LLM","DeepSeek-Math","DeepSeek-Math-V2","DeepSeek-MoE","DeepSeek-Prover-V2","DeepSeek-R1","DeepSeek-V2","DeepSeek-V3","DeepSeek-V3.1","DeepSeek-V3.2","DeepSeek-V4","DeepSeek-VL2","Devstral 2","Devstral Medium 1.0","Devstral Small 1.125.07","Devstral Small 2","Devstral Small25.05","GPT-3.5","GPT-4","GPT-4.1","GPT-4.5","GPT-4o","GPT-5","GPT-5.1","GPT-5.2","GPT-5.3","GPT-5.4","GPT-5.5","GPT-5.6","Llama","Llama 2","Llama 3","Llama 3.1","Llama 3.2","Llama 3.3","Llama 4","Magistral Medium","Magistral Medium 1.225.09","Magistral Small","Magistral Small 1.225.09","Mathstral 7B","Medium 3.5","Ministral 3","Ministral 3B24.10","Ministral 8B24.10","Mistral 7B","Mistral Large 224.07","Mistral Large 224.11","Mistral Large 3","Mistral Large24.02","Mistral Medium","Mistral Medium 3.125.08","Mistral Medium 325.05","Mistral Small","Mistral Small 3.125.03","Mistral Small 3.225.06","Mistral Small 325.01","Mistral Small 4","Mixtral 8x22B","Mixtral 8x7B","Pixtral Large24.11","Pixtral24.09","Voxtral Mini","Voxtral Mini Transcribe V2","Voxtral Realtime","Voxtral Small","Voxtral TTS","alfred","all-minilm","athene-v2","aya","aya-expanse","bakllava","bespoke-minicheck","bge-large","bge-m3","codebooga","codegeex4","codegemma","codellama","codeqwen","codestral","codeup","cogito","cogito-2.1","command-a","command-r","command-r-plus","command-r7b","command-r7b-arabic","dbrx","deepcoder","deepscaler","deepseek-coder","deepseek-coder-v2","deepseek-llm","deepseek-ocr","deepseek-r1","deepseek-v2","deepseek-v2.5","deepseek-v3","deepseek-v3.1","deepseek-v4-flash","deepseek-v4-pro","devstral","devstral-2","devstral-small-2","dolphin-llama3","dolphin-mistral","dolphin-mixtral","dolphin-phi","dolphin3","dolphincoder","duckdb-nsql","embeddinggemma","everythinglm","exaone-deep","exaone3.5","falcon","falcon2","falcon3","firefunction-v2","functiongemma","gemma","gemma2","gemma3","gemma3n","gemma4","glm-4.7-flash","glm-5.1","glm-5.2","glm-ocr","glm4","goliath","gpt-oss","gpt-oss-safeguard","granite-code","granite-embedding","granite3-dense","granite3-guardian","granite3-moe","granite3.1-dense","granite3.1-moe","granite3.2","granite3.2-vision","granite3.3","granite4","granite4.1","granite4.1-guardian","hermes3","internlm2","kimi-k2.6","kimi-k2.7-code","kimi-k3","laguna-s-2.1","laguna-xs-2.1","laguna-xs.2","lfm2","lfm2.5","lfm2.5-thinking","llama-guard3","llama-pro","llama2","llama2-chinese","llama2-uncensored","llama3","llama3-chatqa","llama3-gradient","llama3-groq-tool-use","llama3.1","llama3.2","llama3.2-vision","llama3.3","llama4","llava","llava-llama3","llava-phi3","magicoder","magistral","marco-o1","mathstral","medgemma","medgemma1.5","meditron","medllama2","megadolphin","minicpm-v","minicpm-v4.5","minicpm-v4.6","minimax-m2.7","minimax-m3","ministral-3","mistral","mistral-large","mistral-large-3","mistral-medium-3.5","mistral-nemo","mistral-openorca","mistral-small","mistral-small3.1","mistral-small3.2","mistrallite","mixtral","moondream","muse-glimmer","mxbai-embed-large","nemotron","nemotron-3-nano","nemotron-3-super","nemotron-3-ultra","nemotron-3.5-lightning","nemotron-cascade-2","nemotron-mini","nemotron3","neural-chat","nexusraven","nomic-embed-text","nomic-embed-text-v2-moe","north-mini-code-1.0","notus","notux","nous-hermes","nous-hermes2","nous-hermes2-mixtral","nuextract","o1","o3","olmo-3","olmo-3.1","olmo2","open-orca-platypus2","openchat","opencoder","openhermes","openthinker","orca-mini","orca2","ornith","paraphrase-multilingual","phi","phi3","phi3.5","phi4","phi4-mini","phi4-mini-reasoning","phi4-reasoning","phind-codellama","qwen","qwen2","qwen2-math","qwen2.5","qwen2.5-coder","qwen2.5vl","qwen3","qwen3-coder","qwen3-coder-next","qwen3-embedding","qwen3-next","qwen3-vl","qwen3.5","qwen3.6","qwen3.8","qwq","r1-1776","reader-lm","reflection","rnj-1","sailor2","samantha-mistral","shieldgemma","smallthinker","smollm","smollm2","snowflake-arctic-embed","snowflake-arctic-embed2","solar","solar-pro","sqlcoder","stable-beluga","stable-code","stablelm-zephyr","stablelm2","starcoder","starcoder2","starling-lm","tinydolphin","tinyllama","translategemma","tulu3","vicuna","wizard-math","wizard-vicuna","wizard-vicuna-uncensored","wizardcoder","wizardlm","wizardlm-uncensored","wizardlm2","xwinlm","yarn-llama2","yarn-mistral","yi","yi-coder","zephyr"];

    // Exact-match anchor names for hypervisor releases, same rationale as
    // KNOWN_LLM_PRODUCT_NAMES above (server `q` matches near-exact
    // versionProductName). This is hypervisor.py's full catalog — small and
    // stable, so it rarely needs regeneration.
    const KNOWN_HV_PRODUCT_NAMES = [
      "VMware ESXi", "VMware Workstation", "VMware Fusion",
      "Oracle VirtualBox", "VirtualBox", "Xen", "XCP-ng",
      "Proxmox VE", "Proxmox Virtual Environment"
    ];

    /* ── API ──────────────────────────────────────────────────── */
    const Api = {
      async versions(qCsv, cursor) {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (qCsv) params.set("q", encodeCsvKeepCommas(qCsv));
        if (cursor) params.set("cursor", cursor);
        // No start — server uses its 2-year rolling window; client filters to LOOKBACK_DAYS days.
        // Cap end at today so future-dated docs are never fetched.
        const today = new Date(); today.setHours(23,59,59,999);
        params.set("end", today.toISOString().slice(0,10).replace(/-/g,''));
        const url = `${API_BASE}v/search?${params}`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = await res.json();
        return { versions: json.data || [], nextCursor: json.nextCursor || null };
      },
      // Dedicated, date-window-independent fetch for the LLM category. There's no
      // server-side "filter by versionProductType" endpoint, so this leans on
      // KNOWN_LLM_PRODUCT_NAMES's exact-match terms (plus a few generic brand
      // keywords as a cheap catch-all) run as CSV OR queries over the full 2-year
      // window, chunked to keep each request's query string a reasonable size and
      // run in parallel. The caller-facing filter to real versionProductType values
      // discards any incidental noise a term might also match.
      async llmVersions() {
        const brandTerms = ["ollama","openai","anthropic","mistral","xai","deepseek","meta","google","gpt","claude","llama","gemini","grok"];
        const allTerms = uniq([...brandTerms, ...KNOWN_LLM_PRODUCT_NAMES]);
        const CHUNK = 60;
        const chunks = [];
        for (let i = 0; i < allTerms.length; i += CHUNK) chunks.push(allTerms.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(async terms => {
          try {
            const params = new URLSearchParams({ q: encodeCsvKeepCommas(terms.join(",")), limit: "300" });
            const res = await fetch(`${API_BASE}v/search?${params}`, { headers: { Accept: "application/json" } });
            if (!res.ok) return [];
            const json = await res.json();
            return json.data || [];
          } catch (_) { return []; }
        }));
        return dedupeByVersionId(results).filter(isLLMVersion);
      },
      // Same shape as llmVersions() — a date-window-independent fetch for the
      // Hypervisor category, since hypervisor releases (like AI models) are
      // sparse enough in time to almost never fall inside the default feed window.
      async hypervisorVersions() {
        const brandTerms = ["hypervisor", "virtualization", "vmware", "virtualbox", "esxi", "xen", "proxmox", "xcp-ng"];
        const allTerms = uniq([...brandTerms, ...KNOWN_HV_PRODUCT_NAMES]);
        const CHUNK = 60;
        const chunks = [];
        for (let i = 0; i < allTerms.length; i += CHUNK) chunks.push(allTerms.slice(i, i + CHUNK));
        const results = await Promise.all(chunks.map(async terms => {
          try {
            const params = new URLSearchParams({ q: encodeCsvKeepCommas(terms.join(",")), limit: "300" });
            const res = await fetch(`${API_BASE}v/search?${params}`, { headers: { Accept: "application/json" } });
            if (!res.ok) return [];
            const json = await res.json();
            return json.data || [];
          } catch (_) { return []; }
        }));
        return dedupeByVersionId(results).filter(isHypervisorVersion);
      },
      async reddit() {
        // Fetch all recent posts sorted by date; positiveScore filter was too strict
        // includeComments=false: measured live, the raw comments array
        // (every comment's full body text) is by far the largest field on
        // these documents and this map() below never reads it - this
        // client only needs sentiment.authorTrajectory/communityTrajectory
        // (precomputed server-side, far smaller) and num_comments (a plain
        // count, already a separate field). Reported live: "the loading
        // time of reddit is very slow" - the server's own GET /api/reddit
        // measured at ~19s for 400 posts, almost entirely in transferring
        // comments text this client throws away immediately.
        const res = await fetch(`${API_BASE}reddit?limit=${REDDIT_LIMIT}&includeComments=false`, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const list = await res.json();
        const arr = Array.isArray(list) ? list : (list.data || list.posts || list.results || []);
        return arr.map(p => {
          // Reddit API stores created_utc as Unix seconds; convert to ISO so Date() works correctly
          const rawDate = p.created_utc || p.createdAt || p.updatedAt;
          let created_utc = rawDate;
          if (typeof rawDate === 'number' && rawDate < 1e10) {
            created_utc = new Date(rawDate * 1000).toISOString();
          } else if (typeof rawDate === 'string' && /^\d{9,10}$/.test(rawDate.trim())) {
            created_utc = new Date(Number(rawDate) * 1000).toISOString();
          }
          return {
            redditId: p.redditId || p._id || p.id,
            title: p.title, subreddit: p.subreddit, url: p.url,
            author: p.author,
            created_utc,
            num_comments: p.num_comments, score: p.score,
            metadata: p.metadata, source: p.source,
            isAboutLatestUpdate: p.isAboutLatestUpdate, isAboutCve: p.isAboutCve,
            // Author-vs-community sentiment, computed server-side
            // (src/sentiment.js) and already attached to the raw post -
            // just passed through here like every other field above.
            sentiment: p.sentiment || null
          };
        });
      }
    };

    /* ── Canon names ──────────────────────────────────────────── */
    const canonComponentName = v => {
      const display = titleCase((v && v.versionProductName) || "");
      return { key: normKey(display), nameOut: display };
    };

    let _homeRTotalNum = null;   // total reddit/community count from /api/reddit/count
    let _rTodayApi = null, _rYestApi = null; // per-day community counts from aggregate API
    let _activityChart = null;   // Chart.js instance for sidebar activity chart
    let _chartJsLoading = false; // prevents duplicate CDN injections
    let _activityDayStrs = null; // YYYYMMDD strings for the chart's LOOKBACK_DAYS window (LLM line refresh)

    /* ── State ────────────────────────────────────────────────── */
    const STATE = {
      rawVersions: [], redditAll: [],
      redditBySub: new Map(), redditByUrl: new Map(),
      groupsFiltered: [], groupIndex: 0,
      observer: null, loading: false,
      filters: { components: [], toggles: new Set() },
      expandedAll: false,
      candidates: [],
      redditReady: null,   // promise — set once, never re-fetched
      nextCursor: null,    // server cursor for the next versions page
      fetchingPage: false, // prevents concurrent server page fetches
      llmVersions: [],        // full, date-window-independent AI model dataset (see ensureLlmVersionsLoaded)
      llmVersionsLoaded: false,
      llmReady: null,         // promise — set once, never re-fetched
      hvVersions: [],         // full, date-window-independent hypervisor dataset (see ensureHvVersionsLoaded)
      hvVersionsLoaded: false,
      hvReady: null           // promise — set once, never re-fetched
    };

    // Merges arrays of raw version docs, dropping duplicates by versionId (falling
    // back to _id). Used when combining the windowed feed with the full LLM dataset.
    function dedupeByVersionId(arrays) {
      const seen = new Set(), out = [];
      for (const arr of arrays) {
        for (const v of arr) {
          const key = v.versionId || v._id;
          if (key) { if (seen.has(key)) continue; seen.add(key); }
          out.push(v);
        }
      }
      return out;
    }

    /* ── Reddit indexing ──────────────────────────────────────── */
    function getSourceCounts() {
      let reddit = 0, stackoverflow = 0;
      for (const p of STATE.redditAll) {
        if (norm(p.source || "") === "stackoverflow") stackoverflow++; else reddit++;
      }
      return { reddit, stackoverflow };
    }

    function buildRedditIndex(list) {
      STATE.redditBySub = new Map(); STATE.redditByUrl = new Map();
      for (const p of list) {
        const k = norm(p.subreddit); if (!k) continue;
        if (!STATE.redditBySub.has(k)) STATE.redditBySub.set(k, []);
        STATE.redditBySub.get(k).push(p);
        if (p.url) STATE.redditByUrl.set(String(p.url), p);
      }
      for (const arr of STATE.redditBySub.values())
        arr.sort((a, b) => redditTime(b) - redditTime(a) || (b.score || 0) - (a.score || 0));
    }

    function redditTime(p) {
      const raw = p.created_utc || p.updatedAt || p.createdAt || 0;
      if (typeof raw === 'number') return raw < 1e10 ? raw * 1000 : raw;
      const t = +new Date(raw); return isFinite(t) ? t : 0;
    }

    // versionTimestamp is set to Date.now() on every bot upsert — use versionReleaseDate instead
    function versionTime(v) {
      const rd = String(v.versionReleaseDate || '').trim().replace(/-/g, '');
      if (/^\d{8}$/.test(rd)) {
        return +new Date(rd.slice(0,4) + '-' + rd.slice(4,6) + '-' + rd.slice(6,8) + 'T12:00:00Z');
      }
      return 0;
    }

    // Returns all posts from subreddits that match the component name (exact or partial)
    function postsForComponent(name) {
      if (!name || name.length < 3) return [];
      const seen = new Set();
      const result = [];
      for (const [sub, posts] of STATE.redditBySub) {
        if (sub === name || (sub.length >= 3 && (sub.includes(name) || name.includes(sub)))) {
          for (const p of posts) { if (!seen.has(p.redditId)) { seen.add(p.redditId); result.push(p); } }
        }
      }
      result.sort((a, b) => redditTime(b) - redditTime(a) || (b.score || 0) - (a.score || 0));
      return result;
    }

    function redditMatchesForVersionBase(v, limit = 6, onlyRisks = false) {
      const name = norm(canonComponentName(v).nameOut); if (!name) return [];
      const arr = postsForComponent(name), out = [];
      for (const p of arr) {
        if (getPostSource(p) !== "reddit") continue;
        if (redditTime(p) < LOOKBACK_AGO) continue;
        if (onlyRisks && !isRisk(p)) continue;
        out.push(p); if (out.length >= limit) break;
      }
      return out;
    }

    function stackoverflowMatchesForVersionBase(v, limit = 6, onlyRisks = false) {
      const name = norm(canonComponentName(v).nameOut); if (!name) return [];
      const arr = postsForComponent(name), out = [];
      for (const p of arr) {
        if (getPostSource(p) !== "stackoverflow") continue;
        if (redditTime(p) < LOOKBACK_AGO) continue;
        if (onlyRisks && !isRisk(p)) continue;
        out.push(p); if (out.length >= limit) break;
      }
      return out;
    }

    /* ── Grouping ─────────────────────────────────────────────── */
    // User-selectable, remembered across visits. "comments" (most
    // discussed) is the default, reported live - surfaces whatever
    // components people are actually talking about right now, ahead of
    // "recency" (what just changed, which can be dominated by noisy
    // low-signal patch-bump components); "alpha"/"cve"/"risk" are for
    // when a different question matters more: predictable browsing, or
    // triaging by vulnerability/risk instead of discussion volume.
    const FEED_SORT_KEY = "rt_feed_sort";
    function getFeedSort() {
      try { return localStorage.getItem(FEED_SORT_KEY) || "comments"; } catch { return "comments"; }
    }
    function setFeedSort(mode) {
      try { localStorage.setItem(FEED_SORT_KEY, mode); } catch { /* best-effort only */ }
    }

    function groupByComponentName(list) {
      const map = new Map();
      for (const v of list) {
        const c = canonComponentName(v);
        if (!map.has(c.key)) map.set(c.key, { key: c.key, name: c.nameOut, items: [] });
        map.get(c.key).items.push(v);
      }
      const arr = Array.from(map.values());
      arr.forEach(g => g.items.sort((a, b) => versionTime(b) - versionTime(a)));

      const mode = getFeedSort();
      if (mode === "alpha") {
        // Predictable position over recency, the same tradeoff the old
        // always-alphabetical default used to make, now opt-in.
        arr.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      } else if (mode === "cve") {
        arr.forEach(g => { g._cveCount = g.items.filter(v => v.isCve).length; });
        arr.sort((a, b) => (b._cveCount - a._cveCount) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else if (mode === "risk") {
        // Reddit data loads in the background (see ensureRedditLoaded)
        // and may not be in yet on the very first sort. That callback
        // re-runs applyFilters() (which calls back in here) once it
        // lands, specifically when this mode is active, so the order
        // corrects itself rather than staying wrong until some other
        // filter change happens to re-trigger it.
        arr.forEach(g => {
          const posts = postsForComponent(norm(g.name))
            .filter(p => getPostSource(p) === "reddit" && redditTime(p) >= LOOKBACK_AGO);
          g._riskScore = posts.reduce((max, p) => Math.max(max, getUpdateScore(p) ?? 0), 0);
        });
        arr.sort((a, b) => (b._riskScore - a._riskScore) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else if (mode === "comments") {
        // Reported live: "allow me to sort by most comments." Same shape
        // as the "risk" mode just above (and the same reason it re-sorts
        // once reddit data arrives - see that mode's own comment): a
        // group's sort key is its single most-discussed recent post's
        // comment count, not a sum across all its posts, so one busy
        // thread surfaces the component even if its other posts are
        // quiet - consistent with "risk" using a post's peak score, not
        // a total, for the same reason.
        arr.forEach(g => {
          const posts = postsForComponent(norm(g.name))
            .filter(p => getPostSource(p) === "reddit" && redditTime(p) >= LOOKBACK_AGO);
          g._commentCount = posts.reduce((max, p) => Math.max(max, p.num_comments || 0), 0);
        });
        arr.sort((a, b) => (b._commentCount - a._commentCount) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else if (mode === "activity") {
        arr.sort((a, b) => (b.items.length - a.items.length) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else if (mode === "sources") {
        // How many distinct bots actually produced this component's own
        // content: the same count each group's own "Source(s): ..." line
        // shows (see renderComponentNode), computed here across every
        // group up front so the feed can be ordered by it. "unknown"
        // isn't counted as a real source: a group whose only documents
        // are unattributed shouldn't out-rank one confirmed genuinely
        // single-sourced.
        arr.forEach(g => {
          const botSet = new Set();
          for (const v of g.items) {
            if (v._synthetic) continue;
            botSet.add((v.sourceBot || "unknown").trim() || "unknown");
          }
          const posts = postsForComponent(norm(g.name)).filter(p => redditTime(p) >= LOOKBACK_AGO);
          if (posts.some(p => getPostSource(p) === "reddit")) botSet.add("reddit.py");
          if (posts.some(p => getPostSource(p) === "stackoverflow")) botSet.add("stackoverflow.py");
          botSet.delete("unknown");
          g._sourceCount = botSet.size;
        });
        arr.sort((a, b) => (b._sourceCount - a._sourceCount) || (versionTime(b.items[0]) - versionTime(a.items[0])));
      } else {
        // Groups (component names) sorted by recency: whichever group has
        // the most recently updated item leads. This is a "Recent Updates"
        // feed, so surfacing what actually just changed matters more than
        // a stable, alphabetically-predictable position, and finding one
        // specific component by name is already better served by the
        // search/filter box than by scanning an alphabetized list. Each
        // group's own items are already sorted newest first (just above),
        // so a group's own most recent timestamp is simply its first item's.
        arr.sort((a, b) => versionTime(b.items[0]) - versionTime(a.items[0]));
      }
      return arr;
    }

    /* ── Aggregates ───────────────────────────────────────────── */
    function computeAggregates(list) {
      let major = 0, minor = 0, patch = 0, cve = 0, llm = 0, hv = 0; const uniqComps = new Set(), typeCounts = new Map();
      const rIds = new Set(), rRiskIds = new Set(), rRiskLatIds = new Set(), rRiskCveIds = new Set(), soIds = new Set(), soRiskIds = new Set();
      let potentialCve = 0;
      for (const it of list) {
        const ch = norm(it.versionReleaseChannel);
        if (ch === "major") major++; else if (ch === "minor") minor++; else if (ch === "patch") patch++;
        const isLlm = isLLMVersion(it), isHv = isHypervisorVersion(it);
        if (it.isCve) cve++;
        if (isLlm) llm++;
        if (isHv) hv++;
        for (const p of redditMatchesForVersionBase(it, REDDIT_LIMIT, false)) if (getPostSource(p) === "reddit") rIds.add(getPostId(p));
        for (const p of redditMatchesForVersionBase(it, REDDIT_LIMIT, true)) if (getPostSource(p) === "reddit") {
          const id = getPostId(p); rRiskIds.add(id);
          if (p.isAboutLatestUpdate) rRiskLatIds.add(id);
          if (p.isAboutCve) rRiskCveIds.add(id);
        }
        const mltlSrc = it.mltl && Array.isArray(it.mltl.src) ? it.mltl.src : [];
        const potPosts = mltlSrc.map(u => STATE.redditByUrl.get(String(u))).filter(p => p?.isAboutLatestUpdate && p?.isAboutCve);
        if (potPosts.length) potentialCve++;
        for (const p of stackoverflowMatchesForVersionBase(it, REDDIT_LIMIT, false)) if (getPostSource(p) === "stackoverflow") soIds.add(getPostId(p));
        for (const p of stackoverflowMatchesForVersionBase(it, REDDIT_LIMIT, true)) if (getPostSource(p) === "stackoverflow") soRiskIds.add(getPostId(p));
        uniqComps.add(canonComponentName(it).key);
        for (const t of (it.classification?.componentType || [])) {
          if (!t || t === "UNKNOWN") continue;
          const k = String(t).toLowerCase(); typeCounts.set(k, (typeCounts.get(k) || 0) + 1);
        }
      }
      return {
        major, minor, patch, cve, llm, hv, reddit: rIds.size, redditRisk: rRiskIds.size,
        redditRiskLatest: rRiskLatIds.size, redditRiskCve: rRiskCveIds.size,
        so: soIds.size, soRisk: soRiskIds.size, potentialCve, uniq: uniqComps.size, typeCounts
      };
    }

    function paintFixedCounts(a) {
      EL["btn-major"].textContent = a.major;
      EL["btn-minor"].textContent = a.minor;
      EL["btn-patch"].textContent = a.patch;
      EL["btn-cve"].textContent = a.cve;
      // Once the full LLM dataset has loaded, show its true total rather than the
      // windowed count — AI model releases are sparse enough in time that the
      // windowed count is misleadingly 0 far more often than not (see
      // ensureLlmVersionsLoaded).
      const llmCount = STATE.llmVersionsLoaded ? STATE.llmVersions.length : a.llm;
      EL["btn-llm"].textContent = llmCount;
      EL["kpi-llm"].textContent = llmCount;
      // Same treatment as LLM — prefer the full dataset's true total once loaded.
      const hvCount = STATE.hvVersionsLoaded ? STATE.hvVersions.length : a.hv;
      EL["btn-hv"].textContent = hvCount;
      EL["kpi-hv"].textContent = hvCount;
      EL["btn-potential-cve"].textContent = a.potentialCve;
      EL["btn-reddit"].textContent = a.reddit;
      EL["btn-reddit-risk"].textContent = a.redditRisk;
      EL["btn-reddit-risk-latest"].textContent = a.redditRiskLatest;
      EL["btn-reddit-risk-cve"].textContent = a.redditRiskCve;
      EL["btn-so"].textContent = a.so;
      EL["btn-so-risk"].textContent = a.soRisk;
      EL["kpi-uniq"].textContent = a.uniq;
    }

    /* ── Active filter display ────────────────────────────────── */
    function refreshActiveFilters() {
      const set = STATE.filters.toggles;
      if (!set.size) { EL.activeFilters.classList.remove("visible"); return; }
      EL.activeFilters.classList.add("visible");
      EL.afTags.innerHTML = [...set].map(k => `<span class="af-tag">${k}</span>`).join("");
    }

    /* ── Type buttons ─────────────────────────────────────────── */
    function buildTypeButtons(typeCounts) {
      EL.typeToggles.innerHTML = "";
      const entries = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, TOP_TYPES);
      if (!entries.length) {
        EL.typeToggles.innerHTML = `<button class="toggle disabled" type="button" aria-disabled="true"><span class="lbl">No types</span></button>`;
        return;
      }
      for (const [type, count] of entries) {
        const btn = document.createElement("button");
        btn.className = "toggle"; btn.type = "button"; btn.dataset.key = `type:${type}`;
        btn.setAttribute("aria-pressed", STATE.filters.toggles.has(`type:${type}`) ? "true" : "false");
        btn.innerHTML = `<span class="lbl">${type}</span><span class="count">${count}</span>`;
        btn.addEventListener("click", () => {
          const key = btn.dataset.key, on = btn.getAttribute("aria-pressed") === "true";
          btn.setAttribute("aria-pressed", on ? "false" : "true");
          on ? STATE.filters.toggles.delete(key) : STATE.filters.toggles.add(key);
          refreshActiveFilters(); applyFilters();
        });
        EL.typeToggles.appendChild(btn);
      }
    }

    /* ── Toggle matching ──────────────────────────────────────── */
    function matchesToggles(v, rc, rRiskCount, soCount, soRiskCount, rRiskLatestCount, rRiskCveCount, hasPotentialCve) {
      const set = STATE.filters.toggles, channel = norm(v.versionReleaseChannel);
      const compTypes = (v.classification?.componentType || []).map(norm);
      const truth = {
        major: channel === "major", minor: channel === "minor", patch: channel === "patch",
        cve: !!v.isCve, llm: isLLMVersion(v), hv: isHypervisorVersion(v), reddit: rc > 0,
        "reddit-risk": rRiskCount > 0, "reddit-risk-latest": rRiskLatestCount > 0,
        "reddit-risk-cve": rRiskCveCount > 0, so: soCount > 0, "so-risk": soRiskCount > 0,
        "potential-cve": hasPotentialCve
      };
      for (const k of set) {
        if (k.startsWith("type:")) { if (!compTypes.includes(k.slice(5))) return false; }
        else if (!truth[k]) return false;
      }
      return true;
    }

    /* ── Range KPI helper ────────────────────────────────────── */
    // "Recent Updates (last N weeks)" also states how many components
    // that window currently holds, so the header itself answers "how
    // much is actually in here": the separate #status text used to
    // repeat this same count on the right, which was just redundant.
    // Weeks computed from LOOKBACK_DAYS rather than hardcoded, same
    // reasoning as everywhere else this constant is the source of truth.
    function updateFeedWindowLabel() {
      if (!EL.feedWindowLabel) return;
      const n = STATE.groupsFiltered.length;
      EL.feedWindowLabel.textContent = `(last ${LOOKBACK_WEEKS} week${LOOKBACK_WEEKS !== 1 ? "s" : ""}, ${n.toLocaleString()} component${n !== 1 ? "s" : ""})`;
    }

    function updateRangeKpi(items) {
      const fmt = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      // Reflects what's actually displayed: inside LOOKBACK_DAYS for the
      // default no-search feed, but a named component search can span
      // further back than that window (see withinFeedWindow's own
      // comment on skipRecencyCap), so this range legitimately widens
      // once a search is active.
      const times = (items || []).map(versionTime).filter(Boolean);
      if (!times.length) { EL["kpi-range"].innerHTML = `📅 Range: <em>—</em>`; return; }
      const min = Math.min(...times), max = Math.max(...times);
      EL["kpi-range"].innerHTML = `📅 Range: <em>${fmt(new Date(min))} – ${fmt(new Date(max))}</em>`;
    }

    // The recency window is a hard cap on the default, no-search "Recent
    // Updates" feed: nothing older than LOOKBACK_DAYS shows up there
    // regardless of the LLM/Hypervisor toggles, so that view can't
    // quietly surface a release from a year ago. A named component
    // search (STATE.filters.components, e.g. typed into the search box
    // or pre-filled from a ?q=name,name URL like /?q=Hibernate,java) is
    // the one exception: per explicit request, searching for a specific
    // vendor means "show me everything about it," not "show me only
    // what's recent enough for the front page," so skipRecencyCap is
    // true whenever that filter is active.
    function withinFeedWindow(v, skipRecencyCap) {
      const ts = versionTime(v);
      if (!ts) return false;
      if (!skipRecencyCap && ts < LOOKBACK_AGO) return false;
      if (ts > Date.now() && !v.isVendorPublished) return false;
      return true;
    }

    /* ── Apply filters ────────────────────────────────────────── */
    function applyFilters() {
      buildSuggestionPool();
      const comps = STATE.filters.components;
      const llmActive = STATE.filters.toggles.has("llm");
      const hvActive = STATE.filters.toggles.has("hv");
      // Extends the candidate pool with the full LLM / hypervisor
      // datasets whenever relevant, since STATE.rawVersions alone
      // doesn't necessarily include them. withinFeedWindow below still
      // applies the LOOKBACK_DAYS cap to every candidate when there's no
      // named component search active, regardless of which pool it came
      // from, so the toggles alone only widen WHERE a recent match can
      // be found, not whether an old one can slip through.
      const pool = (llmActive || hvActive || comps.length)
        ? dedupeByVersionId([STATE.rawVersions, STATE.llmVersions, STATE.hvVersions])
        : STATE.rawVersions;
      const candidates = pool.filter(v => {
        if (!withinFeedWindow(v, comps.length > 0)) return false;
        if (!comps.length) return true;
        const name = norm(v.versionProductName);
        const tags = (Array.isArray(v.versionSearchTags) ? v.versionSearchTags.join(",") : "").toLowerCase();
        return comps.some(t => name.includes(t) || tags.includes(t));
      });

      const ag = computeAggregates(candidates);
      paintFixedCounts(ag);
      buildTypeButtons(ag.typeCounts);

      const filtered = candidates.filter(v => {
        const r = redditMatchesForVersionBase(v, 6, false);
        const rr = redditMatchesForVersionBase(v, 6, true);
        const soAll = stackoverflowMatchesForVersionBase(v, 6, false);
        const soRiskA = stackoverflowMatchesForVersionBase(v, 6, true);
        const rLatest = rr.filter(p => p.isAboutLatestUpdate).length;
        const rCve = rr.filter(p => p.isAboutCve).length;
        const mltlSrc = v.mltl && Array.isArray(v.mltl.src) ? v.mltl.src : [];
        const potPosts = mltlSrc.map(u => STATE.redditByUrl.get(String(u))).filter(p => p?.isAboutLatestUpdate && p?.isAboutCve);
        return matchesToggles(v, r.length, rr.length, soAll.length, soRiskA.length, rLatest, rCve, potPosts.length > 0);
      });

      EL["kpi-reddit"].textContent = getSourceCounts().reddit;

      updateRangeKpi(filtered);

      STATE.candidates = candidates;
      STATE.groupsFiltered = groupByComponentName(filtered);

      // Inject subreddit-only groups for search terms that match a subreddit
      // but have no version data — so community posts are still surfaced.
      if (STATE.filters.components.length) {
        const existingKeys = new Set(STATE.groupsFiltered.map(g => g.key));
        for (const term of STATE.filters.components) {
          const posts = postsForComponent(term);
          const recent = posts.filter(p => getPostSource(p) === "reddit" && redditTime(p) >= LOOKBACK_AGO);
          if (!recent.length) continue;
          const c = canonComponentName({ versionProductName: term });
          if (existingKeys.has(c.key)) continue;
          STATE.groupsFiltered.push({ key: c.key, name: c.nameOut, items: [{ versionProductName: term, _synthetic: true }] });
        }
      }

      STATE.groupIndex = 0;
      EL.feed.innerHTML = "";
      EL["kpi-page"].textContent = STATE.groupsFiltered.length;
      EL.sentinel.textContent = STATE.groupsFiltered.length ? "Loading more…" : "No results";
      if (STATE.groupsFiltered.length) {
        hideEmptyState();
      } else {
        // A named component search no longer has a day-window to blame
        // (see withinFeedWindow's own comment: it's bypassed whenever
        // comps.length), so "matched, but still empty" here now means
        // something else excluded it -- most likely the Reddit/Stack
        // Overflow risk toggles, occasionally a version with no usable
        // timestamp at all. Distinguish that from a genuine no-match.
        const matchedButFiltered = comps.length && pool.some(v => {
          const name = norm(v.versionProductName);
          const tags = (Array.isArray(v.versionSearchTags) ? v.versionSearchTags.join(",") : "").toLowerCase();
          return comps.some(t => name.includes(t) || tags.includes(t));
        });
        showEmptyState(matchedButFiltered
          ? "Found matches for that search, but none match the other active filters."
          : (comps.length ? "No versions found for that search." : "No updates match the current filters."));
      }
      // The header's own "(last N weeks, M components)" label now states
      // this same count. #status stays reserved for transient messages
      // (Loading…, Filtering…, error states) elsewhere in this file, not
      // a steady-state repeat of a number already shown above the feed.
      EL.status.textContent = "";
      updateFeedWindowLabel();
      appendNextGroups();

      if (G_ACTIVE && G_VIS_LOADED) gBuildAndRender(gGetVersions(), STATE.redditAll);
      if (A_ACTIVE) aLoadAndRender();
    }

    /* ── Chip builder ─────────────────────────────────────────── */
    const chip = (t, k) => `<span class="chip ${k || ""}">${t}</span>`;

    /* ── Sentiment chart (author vs community, below a reddit post) ─ */
    // Reported live, with a screenshot of a 135-comment thread, right
    // after the single-bar version shipped: "show a thin 2 line chart on
    // comment sentiment change." Replaces the old two-segment bar
    // entirely - one chart, two overlaid polylines (author/community),
    // x = each comment's own position in the full chronological comment
    // sequence (shared across both series - sentiment.forCommentCount is
    // the shared denominator, so a real gap between an author reply and
    // the next community one is visible as a jump along x, not hidden),
    // y = that comment's compound score. A series with zero points draws
    // nothing; exactly one point draws a dot (a <polyline> needs 2+
    // points to render a visible line).
    // Internal coordinate space only (not the on-screen size - the SVG
    // stretches to fill its row via CSS, see .sentiment-chart). Wider
    // than the display will ever realistically be so a stretched chart's
    // polylines still look smooth, not blocky, at full row width.
    const SENTIMENT_CHART_W = 600, SENTIMENT_CHART_H = 30;
    function sentimentChartX(i, forCommentCount) {
      const span = Math.max(1, forCommentCount - 1);
      return (i / span) * SENTIMENT_CHART_W;
    }
    function sentimentChartY(v) {
      return SENTIMENT_CHART_H / 2 - Math.max(-1, Math.min(1, v)) * (SENTIMENT_CHART_H / 2 - 2);
    }
    function sentimentChartSeries(points, forCommentCount, cls) {
      if (!points.length) return "";
      if (points.length === 1) {
        const x = sentimentChartX(points[0].i, forCommentCount), y = sentimentChartY(points[0].v);
        return `<circle class="sentiment-dot ${cls}" cx="${x}" cy="${y}" r="2"></circle>`;
      }
      const coords = points.map((p) => `${sentimentChartX(p.i, forCommentCount)},${sentimentChartY(p.v)}`).join(" ");
      return `<polyline class="sentiment-line ${cls}" points="${coords}"></polyline>`;
    }
    function renderSentimentBar(sentiment) {
      const wrap = document.createElement("div");
      wrap.className = "sentiment-bar";
      wrap.title = "Author vs. community sentiment over the comment thread";
      const n = sentiment.forCommentCount;
      // Reported live: "every line chart starts with the author
      // title+description, every chart shall have as the first data
      // point the author sentiment." sentiment.author (the post's own
      // title+description score, always present) is prepended to the
      // author line at x=0; every actual comment's own index shifts by
      // +1 so it sits to the right of that anchor instead of overlapping
      // it. The shared x-axis span widens from n to n+1 positions to fit
      // the extra anchor point - sentimentChartX's own "span = count - 1"
      // math already does the right thing when handed n+1 here.
      const authorPoints = [
        { i: 0, v: sentiment.author },
        ...((sentiment.authorTrajectory || []).map((p) => ({ i: p.i + 1, v: p.v }))),
      ];
      const communityPoints = (sentiment.communityTrajectory || []).map((p) => ({ i: p.i + 1, v: p.v }));
      const span = n + 1;
      // Reported live, with a screenshot: "stretch it there is room" (CSS
      // width:100%, preserveAspectRatio="none" so it actually fills the
      // row instead of staying pinned to its viewBox's own aspect ratio)
      // and "show the baseline from negative to positive at .5" - two
      // extra reference lines at +/-0.5, same muted dashed style as the
      // existing zero line, still no numbers/labels on any of them.
      wrap.innerHTML =
        `<svg class="sentiment-chart" viewBox="0 0 ${SENTIMENT_CHART_W} ${SENTIMENT_CHART_H}" preserveAspectRatio="none">` +
        `<line class="sentiment-ref" x1="0" y1="${sentimentChartY(0.5)}" x2="${SENTIMENT_CHART_W}" y2="${sentimentChartY(0.5)}"></line>` +
        `<line class="sentiment-zero" x1="0" y1="${SENTIMENT_CHART_H / 2}" x2="${SENTIMENT_CHART_W}" y2="${SENTIMENT_CHART_H / 2}"></line>` +
        `<line class="sentiment-ref" x1="0" y1="${sentimentChartY(-0.5)}" x2="${SENTIMENT_CHART_W}" y2="${sentimentChartY(-0.5)}"></line>` +
        sentimentChartSeries(communityPoints, span, "community") +
        sentimentChartSeries(authorPoints, span, "author") +
        `</svg>`;
      // Reported live: "add a legend which color is author vs others."
      const legend = document.createElement("div");
      legend.className = "sentiment-legend";
      legend.innerHTML =
        `<span class="sentiment-swatch author"></span>Author` +
        `<span class="sentiment-swatch community"></span>Community`;
      wrap.appendChild(legend);
      if (!sentiment.authorHasReplies) {
        const note = document.createElement("span");
        note.className = "sentiment-note";
        note.textContent = "no author reply yet";
        wrap.appendChild(note);
      }
      return wrap;
    }

    /* ── Component-level sentiment trend chart ────────────────── */
    // Reported live: "for each component in the feedview add the line
    // chart with the sentiment of the last 50 reddit posts and their
    // author title+description sentiment... reuse the same pip package"
    // - sentiment.author (each post's own title+description score) is
    // already computed server-side the same way the releasetrain-
    // sentiment pip package's own score.py does (see src/sentiment.js on
    // the server), just re-derived in JS for the live feed - there's no
    // second computation to add here, only a new chart reading the field
    // that already exists on every post. Time-based x-axis (unlike the
    // per-post chart's comment-order one), since this spans real posts
    // over real calendar time, with release (green) and CVE (red)
    // vertical markers from this component's own version history
    // overlaid at their real timestamps - reported live: "integrate...a
    // subtle vertical line when a release was made (green) and CVE a
    // red vertical line."
    // A plain "MMM D" label, not dayLabelFromMillis's relative one
    // ("Just now"/"Yesterday") - this spans a real date range that can
    // be weeks or months wide, where a relative label stops being useful.
    function shortDate(ms) {
      try { return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
      catch { return ""; }
    }
    // Collapses "Oct 3 - Oct 3" into a single label when both ends land
    // on the same calendar day (every post happened today, or all on one
    // other day) - reported live, with a screenshot: "if from and to
    // date are the same just say today." Only says "Today" when that
    // shared day actually IS today (the viewer's own local calendar
    // day); any other single-day range still shows its real date rather
    // than being mislabeled as "Today."
    function rangeLabel(minT, maxT) {
      const a = shortDate(minT), b = shortDate(maxT);
      if (a !== b) return `${a} - ${b}`;
      const isToday = new Date(minT).toDateString() === new Date().toDateString();
      return isToday ? "Today" : a;
    }
    function fdEsc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    // A real-looking semantic version (optionally "v"-prefixed, at least
    // major.minor) - only the LEADING portion needs to match; the full
    // string is still escaped before being shown, since matching a
    // prefix doesn't guarantee nothing untrusted follows it.
    const SEMVER_RE = /^v?\d+(?:\.\d+){1,3}/;
    const COMPONENT_CHART_W = 600, COMPONENT_CHART_H = 36;
    // The window spans this component's own earliest-to-latest Reddit
    // post, not a fixed calendar window - reported live: "start with
    // earliest reddit post (title+description) sentiment and end with
    // the latest one. not a hard 3 weeks window." A fixed window was
    // tried first (to fix an earlier "Oct 3 - Oct 3" complaint about a
    // post-COUNT-based window truncating to one day), but the real ask
    // was the opposite: show each component's genuine span of Reddit
    // activity, however wide or narrow that actually is, not force every
    // component onto the same artificial window.
    function renderComponentSentimentChart(group) {
      const posts = postsForComponent(norm(group.name))
        .filter((p) => getPostSource(p) === "reddit" && typeof p.sentiment?.author === "number")
        .sort((a, b) => redditTime(a) - redditTime(b));

      if (!posts.length) return null; // nothing to anchor a window to

      const postTimes = posts.map((p) => redditTime(p));
      const rawMinT = Math.min(...postTimes), rawMaxT = Math.max(...postTimes);
      // No padding - the earliest post sits at the chart's left edge and
      // the latest at its right edge, using the full width, every time.
      // Reported live, with a screenshot: an earlier version padded a
      // narrow real span out to a minimum width, which visibly inset the
      // plotted line from both edges instead of stretching it full-width.
      // span still has a tiny floor (1ms, not a full day) purely to avoid
      // a literal divide-by-zero when every post shares one timestamp -
      // at that point there's only one on-screen point anyway, so the
      // floor's size has no visible effect.
      const windowStart = rawMinT, windowEnd = rawMaxT;
      const span = Math.max(1, windowEnd - windowStart);
      const inRange = (t) => t >= windowStart && t <= windowEnd;

      // Release/CVE markers are kept only when they fall inside this
      // component's own post-derived window (everything outside it is
      // dropped, not pinned to an edge it doesn't really belong at).
      // Each marker keeps
      // its real version number (when it looks like a real semver - e.g.
      // not a blank/placeholder value) and whether it's a major release
      // (versionReleaseChannel === "major", the same field the group's
      // own Major/Minor/Patch chips already read) - reported live: "if a
      // semantic version is available show it also month, day for major
      // updates."
      const toEvent = (v) => {
        const t = versionTime(v);
        const ver = String(v.versionNumber || "").trim();
        return { t, version: SEMVER_RE.test(ver) ? ver : null, isMajor: (v.versionReleaseChannel || "").toLowerCase() === "major" };
      };
      const releaseEvents = (group.items || [])
        .filter((v) => !v.isCve && !v._synthetic)
        .map(toEvent)
        .filter((e) => inRange(e.t));
      const cveEvents = (group.items || [])
        .filter((v) => v.isCve)
        .map(toEvent)
        .filter((e) => inRange(e.t));

      const x = (t) => ((t - windowStart) / span) * COMPONENT_CHART_W;
      const y = (v) => COMPONENT_CHART_H / 2 - Math.max(-1, Math.min(1, v)) * (COMPONENT_CHART_H / 2 - 3);

      // A single post in the window can't draw a line (needs 2+ points),
      // so it's a dot instead - same convention as the per-post trajectory
      // chart's own single-point fallback.
      let seriesMarkup = "";
      if (posts.length === 1) {
        seriesMarkup = `<circle class="component-chart-dot" cx="${x(redditTime(posts[0]))}" cy="${y(posts[0].sentiment.author)}" r="2"></circle>`;
      } else if (posts.length >= 2) {
        const linePoints = posts.map((p) => `${x(redditTime(p))},${y(p.sentiment.author)}`).join(" ");
        seriesMarkup = `<polyline class="component-chart-line" points="${linePoints}"></polyline>`;
      }
      const eventLine = (e, cls) => `<line class="component-chart-event ${cls}" x1="${x(e.t)}" y1="0" x2="${x(e.t)}" y2="${COMPONENT_CHART_H}"></line>`;
      // A real HTML label, not an SVG <text> - the chart is only 36px
      // tall, nowhere near enough room to fit legible in-SVG text, so
      // this renders in its own slim strip above the plot instead. Major
      // releases get the date added since they're the rarer, higher-
      // impact marker worth the extra detail; minor/patch/CVE markers
      // just get the bare version number to keep a dense chart readable.
      //
      // Two labels landing close together in time (a release and its own
      // CVE record often share nearly the same date) otherwise render on
      // top of each other, overlapping into illegible garbled text -
      // reported live with a real screenshot of exactly that. Fixed by
      // staggering labels into rows: walk them oldest-to-newest, and put
      // each one in the first row whose last-placed label is at least
      // MIN_LABEL_GAP_MS away; a label too close to every existing row's
      // last entry starts a new row instead of overlapping it. This is a
      // time-based heuristic, not a pixel-measured one (nothing here
      // knows the chart's actual rendered width), but it directly fixes
      // the near-identical-timestamp case that was actually colliding.
      const ROW_HEIGHT_PX = 10;
      const MIN_LABEL_GAP_MS = span * 0.05;
      // A component with a dense CVE/release history (e.g. 100+ CVEs in
      // one window) would otherwise try to stack one row per label,
      // growing into an unreadable wall of text that dwarfs the rest of
      // the feed - reported live with a screenshot (Linux: "CVE 127,"
      // stacked into 15+ rows of overlapping numbers). Cap how many
      // actually get a text label: every "major" release (rare, high-
      // value) plus the most recent others, up to MAX_LABELED_EVENTS
      // total. Every event still gets its vertical tick line regardless
      // (eventLine, below) - only the TEXT label is capped, so cadence
      // density is still visible, just not as a wall of numbers.
      const MAX_LABELED_EVENTS = 6;
      const allLabelCandidates = [...releaseEvents.map((e) => [e, "release"]), ...cveEvents.map((e) => [e, "cve"])]
        .filter(([e]) => e.version);
      const majors = allLabelCandidates.filter(([e]) => e.isMajor);
      const nonMajorsByRecency = allLabelCandidates.filter(([e]) => !e.isMajor).sort((a, b) => b[0].t - a[0].t);
      const labeledEvents = [...majors, ...nonMajorsByRecency]
        .slice(0, MAX_LABELED_EVENTS)
        .sort((a, b) => a[0].t - b[0].t);
      const rowLastT = [];
      for (const pair of labeledEvents) {
        const t = pair[0].t;
        let row = rowLastT.findIndex((lastT) => t - lastT >= MIN_LABEL_GAP_MS);
        if (row === -1) { row = rowLastT.length; rowLastT.push(t); } else { rowLastT[row] = t; }
        pair[2] = row;
      }
      const eventLabel = (e, cls, row) => {
        const text = e.isMajor ? `${e.version} · ${shortDate(e.t)}` : e.version;
        return `<span class="component-chart-label ${cls}${e.isMajor ? " major" : ""}" style="--rt-left:${((e.t - windowStart) / span * 100).toFixed(2)}%;--rt-top:${row * ROW_HEIGHT_PX}px">${fdEsc(text)}</span>`;
      };
      const labelRows = rowLastT.length;
      const labelsHtml = labelRows
        ? `<div class="component-chart-labels" style="--rt-h:${labelRows * ROW_HEIGHT_PX}px">${labeledEvents.map(([e, cls, row]) => eventLabel(e, cls, row)).join("")}</div>`
        : "";

      const wrap = document.createElement("div");
      wrap.className = "component-chart-wrap";
      wrap.title = `${group.name}: title+description sentiment from its earliest to its latest Reddit post (${posts.length} Reddit post${posts.length === 1 ? "" : "s"})`;
      wrap.innerHTML =
        labelsHtml +
        `<svg class="component-chart" viewBox="0 0 ${COMPONENT_CHART_W} ${COMPONENT_CHART_H}" preserveAspectRatio="none">` +
        `<line class="sentiment-zero" x1="0" y1="${COMPONENT_CHART_H / 2}" x2="${COMPONENT_CHART_W}" y2="${COMPONENT_CHART_H / 2}"></line>` +
        releaseEvents.map((e) => eventLine(e, "release")).join("") +
        cveEvents.map((e) => eventLine(e, "cve")).join("") +
        seriesMarkup +
        `</svg>` +
        `<div class="component-chart-meta">` +
        // The real (unpadded) post range, not the internal plotting
        // window - "label range in legend," reported live. A single-post
        // component legitimately shows the same date twice here; that's
        // an honest reflection of there being exactly one post, not a bug.
        `<span class="component-chart-range">${rangeLabel(rawMinT, rawMaxT)}</span>` +
        `<span class="component-chart-legend">` +
        `<span class="component-chart-swatch line"></span>sentiment ` +
        `<span class="component-chart-swatch release"></span>release ` +
        `<span class="component-chart-swatch cve"></span>CVE` +
        `</span>` +
        `</div>`;
      return wrap;
    }

    /* ── Render group ─────────────────────────────────────────── */
    function renderComponentNode(group, groupIndex = 0) {
      const onlyRedditRisks = STATE.filters.toggles.has("reddit-risk") ||
        STATE.filters.toggles.has("reddit-risk-latest") ||
        STATE.filters.toggles.has("reddit-risk-cve");
      const onlySoRisks = STATE.filters.toggles.has("so-risk");

      const seen = new Set(); const rUnion = [];
      for (const v of group.items) {
        for (const p of redditMatchesForVersionBase(v, REDDIT_LIMIT, onlyRedditRisks)) {
          const id = getPostId(p); if (seen.has(id)) continue; seen.add(id); rUnion.push(p);
        }
        for (const p of stackoverflowMatchesForVersionBase(v, REDDIT_LIMIT, onlySoRisks)) {
          const id = getPostId(p); if (seen.has(id)) continue; seen.add(id); rUnion.push(p);
        }
      }

      const vEntries = group.items.filter(v => !v._synthetic).map(v => ({
        t: versionTime(v),
        kind: v.isCve ? "cve" : "update",
        channel: (v.versionReleaseChannel || "other").toLowerCase(),
        label: `${safe(v.versionProductName, "")} ${v.versionNumber || ""}`.trim(),
        url: (v.versionUrl && v.versionUrl.startsWith("http")) ? v.versionUrl : ((v.versionReleaseNotes && v.versionReleaseNotes.startsWith("http")) ? v.versionReleaseNotes : "#"),
        raw: v
      }));
      const rEntries = rUnion.map(p => {
        const src = getPostSource(p);
        const t = redditTime(p);
        return { t, kind: src === "stackoverflow" ? "stackoverflow" : "reddit", channel: null, label: p.title, url: p.url, raw: p };
      });
      // Merge two already-sorted-desc arrays into one sorted timeline
      vEntries.sort((a, b) => b.t - a.t);
      rEntries.sort((a, b) => b.t - a.t);
      const timeline = [];
      let vi = 0, ri = 0;
      while (vi < vEntries.length && ri < rEntries.length) {
        timeline.push(vEntries[vi].t >= rEntries[ri].t ? vEntries[vi++] : rEntries[ri++]);
      }
      while (vi < vEntries.length) timeline.push(vEntries[vi++]);
      while (ri < rEntries.length) timeline.push(rEntries[ri++]);

      // "Most comments" reorders the documents inside a component too,
      // not just which component leads - reported live, right after the
      // group-level version shipped: "most comments shall apply to both
      // the component and documents inside each component." A CVE/patch
      // entry has no num_comments of its own (treated as 0), so it still
      // sorts below any actually-discussed post, falling back to recency
      // among itself and any other 0-comment entries.
      if (getFeedSort() === "comments") {
        timeline.sort((a, b) => ((b.raw?.num_comments || 0) - (a.raw?.num_comments || 0)) || (b.t - a.t));
      }

      const cveCount = timeline.filter(x => x.kind === "cve").length;
      const redditCount = timeline.filter(x => x.kind === "reddit").length;
      const soCount = timeline.filter(x => x.kind === "stackoverflow").length;
      // A CVE record carries its own versionReleaseChannel too (e.g. a CVE
      // affecting 6.31.1 reads channel "patch"), which double-counted it
      // into both the CVE chip and the Major/Minor/Patch chips. These are
      // meant to read as real release-notes activity, so only count
      // kind==="update" entries here, never a CVE's own channel value.
      const majorCount = timeline.filter(x => x.kind === "update" && x.channel === "major").length;
      const minorCount = timeline.filter(x => x.kind === "update" && x.channel === "minor").length;
      const patchCount = timeline.filter(x => x.kind === "update" && x.channel === "patch").length;

      const summaryChips = [
        cveCount ? chip(`🔴 CVE ${cveCount}`, "bad") : "",
        redditCount ? chip(`💬 Reddit ${redditCount}`, "reddit") : "",
        soCount ? chip(`🟧 SO ${soCount}`, "soft") : "",
        majorCount ? chip(`🔖 Major ${majorCount}`, "ok") : "",
        minorCount ? chip(`🔹 Minor ${minorCount}`, "soft") : "",
        patchCount ? chip(`🩹 Patch ${patchCount}`, "soft") : "",
      ].filter(Boolean).join("");

      // Which bot(s) actually produced this component's own content:
      // replaces the old global, deck-wide "Recent Updates" source
      // breakdown (which just listed raw totals with no way to tell
      // which component each count belonged to). Reddit/StackOverflow
      // posts carry no sourceBot field of their own (they're keyed by
      // "source" instead), but there's only ever one bot that creates
      // each: reddit.py, stackoverflow.py.
      const botSet = new Set();
      for (const v of group.items) {
        if (v._synthetic) continue;
        botSet.add((v.sourceBot || "unknown").trim() || "unknown");
      }
      if (redditCount) botSet.add("reddit.py");
      if (soCount) botSet.add("stackoverflow.py");
      // "videoCall"/"videoCall.py" is a legacy sourceBot value from
      // before videoCall.py started stamping the actual vendor
      // (zoom/teams/webex) it found in each document's own URL; older
      // documents saved before that fix still carry it. It's never the
      // real source, just the bot's own filename, so it's excluded here
      // rather than shown alongside (or instead of) the real vendor
      // label a reader actually wants (e.g. "mitre, teams", not "mitre,
      // teams, videoCall").
      botSet.delete("videoCall"); botSet.delete("videoCall.py");
      const bots = [...botSet].sort((a, b) => (a === "unknown") - (b === "unknown") || a.localeCompare(b));
      // ".py" is an implementation detail (the actual script filename,
      // kept as the real sourceBot value so it stays consistent with
      // maintainer.py's own naming), not something a reader needs to see.
      const botLabel = b => b === "unknown" ? "unknown" : b.replace(/\.py$/, "");
      const sourceLine = bots.length
        ? `<div class="groupSource">📦 ${bots.length > 1 ? "Sources" : "Source"}: ${bots.map(b => uaEsc(botLabel(b))).join(", ")}</div>`
        : "";

      const det = document.createElement("details");
      det.className = "feedGroup";
      // Every group starts collapsed, including the first one. It used
      // to default open, which read as one arbitrarily-expanded group
      // sitting above an otherwise all-collapsed list.
      det.open = false;
      det.dataset.component = group.name;
      det.dataset.itemCount = String(timeline.length);

      const sum = document.createElement("summary");
      // Name + latest-version bracket share one row (version pushed to
      // the far right via .group-latest-ver's own margin-left:auto);
      // the CVE/Reddit/SO/Major/Minor/Patch total chips get their own
      // row below rather than competing for space on the name's line.
      // All three rows live in .groupSummaryText now, a flex sibling of
      // the sentiment chart (if any) - reported live: "use the available
      // space on the right" - the chart sits in exactly the blank space
      // that used to sit unused to the right of this text block.
      const textWrap = document.createElement("div");
      textWrap.className = "groupSummaryText";
      textWrap.innerHTML = `<span class="groupHead">${safe(group.name, "")}<span class="group-latest-ver"></span></span>` +
        (summaryChips ? `<div class="groupChips">${summaryChips}</div>` : "") + sourceLine;
      sum.appendChild(textWrap);
      const chartEl = renderComponentSentimentChart(group);
      if (chartEl) sum.appendChild(chartEl);
      det.appendChild(sum);
      // Fetched live (fetchLatestVersionFor, shared with the Ask
      // suggestion dropdown's own version bracket, cached the same way)
      // rather than derived from this group's own vEntries above.
      // Verified live: a group's currently-loaded items (bounded by
      // whatever date window/filters the feed is showing right now) can
      // genuinely have no real release in view at all. A component
      // showing "Patch 1"/"Minor 2" chips can still have zero non-CVE
      // items loaded, because those chips count a CVE record's own
      // versionReleaseChannel field too, not only real releases, while
      // the real latest release exists but is simply older than the
      // feed's current window. A live fetch by name isn't limited to
      // what happens to be loaded right now.
      const verSlot = sum.querySelector(".group-latest-ver");
      fetchLatestVersionFor(group.name).then(({ version, date }) => {
        if (!version) return;
        // How fresh "latest" actually is, right next to the version
        // number itself, since a version can be genuinely current or a
        // year stale, and the bare number alone doesn't say which.
        // calendarDaysAgo, not aDateMs vs Date.now() (see its own
        // comment): a plain calendar-day diff in the viewer's own
        // timezone, not one that can flip to "1d ago" on the same local
        // day just because UTC noon has passed.
        const days = date ? calendarDaysAgo(date) : null;
        const freshness = days == null ? "" : (days <= 0 ? ", today" : `, ${days}d ago`);
        verSlot.textContent = ` (latest: ${version}${freshness})`;
      });

      const wrap = document.createElement("div"); wrap.className = "updates";
      const list = document.createElement("div"); list.className = "list";

      for (const it of timeline) {
        const li = document.createElement("div");
        const dayLabel = dayLabelFromMillis(it.t);
        const _todayMidnight = new Date(); _todayMidnight.setHours(0, 0, 0, 0);
        const isNew = it.t >= _todayMidnight.getTime();

        let liClass = "li";
        if (it.kind === "cve") liClass += " kind-cve";
        else if (it.kind === "reddit") liClass += " kind-reddit" + (isRisk(it.raw) ? " risk" : "");
        else if (it.kind === "stackoverflow") liClass += " kind-stackoverflow" + (isRisk(it.raw) ? " risk" : "");
        else if (it.kind === "update" && it.channel) liClass += ` kind-update ${it.channel}`;
        if (isLLMVersion(it.raw)) liClass += " kind-llm";
        if (isHypervisorVersion(it.raw)) liClass += " kind-hv";
        if (isNew) liClass += " is-new";
        li.className = liClass;

        li.dataset.kind = it.kind;
        if (it.channel) li.dataset.channel = it.channel;
        li.dataset.timestamp = new Date(it.t).toISOString();
        if (it.kind === "reddit" || it.kind === "stackoverflow") {
          li.dataset.source = it.kind;
          const score = getUpdateScore(it.raw);
          if (score != null) li.dataset.riskScore = score.toFixed(2);
          if (it.raw?.subreddit) li.dataset.subreddit = it.raw.subreddit;
          if (typeof it.raw?.num_comments === "number") li.dataset.comments = String(it.raw.num_comments);
        }
        if (it.raw?.versionNumber) li.dataset.version = it.raw.versionNumber;

        const dcol = document.createElement("div"); dcol.className = "datecol";
        dcol.innerHTML = `<span class="day${isNew ? " today" : ""}">${dayLabel}</span><span class="time">${shortTime(it.t)}</span>`;
        li.appendChild(dcol);

        if (it.kind === "reddit") {
          const av = document.createElement("img");
          av.className = "avatar redditIcon" + (isRisk(it.raw) ? " risky" : "");
          av.src = "./img/reddit.png"; av.alt = "Reddit"; av.title = isRisk(it.raw) ? "Reddit (risk)" : "Reddit";
          li.appendChild(av);
        } else if (it.kind === "stackoverflow") {
          const av = document.createElement("img");
          av.className = "avatar soIcon" + (isRisk(it.raw) ? " risky" : "");
          av.src = "./img/stackoverflow.png"; av.alt = "StackOverflow";
          li.appendChild(av);
        } else {
          const av = document.createElement("img"); av.className = "avatar"; av.alt = group.name; av.src = avatarFor(it.raw);
          li.appendChild(av);
        }

        const body = document.createElement("div");
        const chipsEl = document.createElement("div"); chipsEl.className = "chips";

        if (it.kind === "reddit") {
          // The reddit/StackOverflow icon already sits to the left of every
          // row (and the group header already totals each source), so a
          // repeated "reddit"/"stackoverflow" text chip on every single row
          // is pure noise, not new information.
          if (it.raw?.subreddit) chipsEl.insertAdjacentHTML("beforeend", chip(`r/${it.raw.subreddit}`, "soft"));
          const scorePred = it.raw?.metadata?.predicted?.positiveScore;
          const scoreField = typeof it.raw?.score === "number" ? it.raw.score : null;
          const scoreVal = typeof scorePred === "number" ? scorePred : scoreField;
          if (isRisk(it.raw)) {
            chipsEl.insertAdjacentHTML("beforeend", chip(scoreVal != null ? `⚠️ RISK ${Number(scoreVal).toFixed(2)}` : "⚠️ RISK", "warn"));
          } else if (scoreVal != null) {
            chipsEl.insertAdjacentHTML("beforeend", chip(`score ${Number(scoreVal).toFixed(2)}`, "soft"));
          }
          const flags = it.raw || {};
          if (flags.isAboutLatestUpdate) chipsEl.insertAdjacentHTML("beforeend", chip("🆕 latest", "soft"));
          if (flags.isAboutCve) chipsEl.insertAdjacentHTML("beforeend", chip("🔐 security", "bad"));
          const comments = typeof flags.num_comments === "number" ? flags.num_comments : null;
          if (comments != null) chipsEl.insertAdjacentHTML("beforeend", chip(`💬 ${comments}`, "soft"));
          // Yes/No poll: only offered when the post reads like a question
          // actually shaped for a binary answer, and has at least one
          // comment to poll. A WH-question ("What's the best way to fix
          // this?", "Why did this happen?") asks for an explanation, not
          // a yes/no, so classifying comments against one is meaningless -
          // flagged live. Mirrors the server's own isYesNoShapedQuestion
          // (ask.js), same reasoning, kept in sync by hand.
          const questionText = flags.author_description || flags.title || "";
          if (askLooksLikeYesNoQuestion(questionText) && comments) {
            const rid = getPostId(flags);
            if (rid) {
              chipsEl.insertAdjacentHTML("beforeend",
                `<button type="button" class="chip poll-btn" data-reddit-id="${uaEsc(rid)}" title="Classify comments as Yes/No answers to this question">📊 Poll</button>`);
            }
          }
        } else if (it.kind === "stackoverflow") {
          const scorePred = it.raw?.metadata?.predicted?.positiveScore;
          const scoreVal = typeof scorePred === "number" ? scorePred : (typeof it.raw?.score === "number" ? it.raw.score : null);
          if (isRisk(it.raw)) chipsEl.insertAdjacentHTML("beforeend", chip(scoreVal != null ? `⚠️ RISK ${Number(scoreVal).toFixed(2)}` : "⚠️ RISK", "warn"));
        } else if (it.kind === "cve") {
          // Its own red icon + red-tinted row (.kind-cve) already say "CVE" -
          // no need to say it a third time after the group header's own count.
          const cveHref = (it.url && it.url.startsWith("http")) ? it.url : (it.raw?._id ? `https://releasetrain.io/api/v/${it.raw._id}` : null);
          if (cveHref) chipsEl.insertAdjacentHTML("beforeend", `<span class="chip link"><a href="${cveHref}" target="_blank" rel="noopener">open ↗</a></span>`);
          // versionPatchUrl (mitre.py's own extract_patch_url, see its
          // comment there): the CVE link above is always just NVD's
          // description page, never the actual fix - "CVE patch
          // artifacts are hard to find" was a real, reported gap. A
          // separate chip, not a replacement for the link above, since
          // the description page is still useful on its own and only
          // some CVE docs have a tagged patch reference to show here.
          const patchHref = it.raw?.versionPatchUrl;
          if (patchHref && String(patchHref).startsWith("http")) {
            chipsEl.insertAdjacentHTML("beforeend", `<span class="chip link"><a href="${uaEsc(patchHref)}" target="_blank" rel="noopener">🩹 patch ↗</a></span>`);
          }
        } else {
          // Channel (major/minor/patch) is the one row-level distinction with
          // no icon of its own, so it keeps a visual cue (the row's own
          // left-border color, see .li.kind-update.major) even though the
          // repeated text chip, already totalled in the group header, is
          // gone.
          if (isLLMVersion(it.raw)) chipsEl.insertAdjacentHTML("beforeend", chip("🤖 LLM", "llm"));
          if (isHypervisorVersion(it.raw)) chipsEl.insertAdjacentHTML("beforeend", chip("🖥️ Hypervisor", "hv"));
        }

        if (it.kind !== "reddit" && it.kind !== "stackoverflow" && it.raw) {
          const r = it.raw;
          // Only the chips that flag something actionable stay on the row by
          // default: a security classification or a breaking-change classification.
          // License and component-type were repetitive noise (every row in a
          // group carries the same values) — dropped.
          (r.classification?.securityType || []).filter(x => x && x !== "UNKNOWN").slice(0, 1)
            .forEach(t => chipsEl.insertAdjacentHTML("beforeend", chip(String(t).toLowerCase(), "bad")));
          (r.classification?.breakingType || []).filter(x => x && x !== "UNKNOWN").slice(0, 1)
            .forEach(t => chipsEl.insertAdjacentHTML("beforeend", chip(String(t).toLowerCase(), "warn")));
          if (r._id && it.kind !== "cve") chipsEl.insertAdjacentHTML("beforeend", `<span class="chip link"><a href="https://releasetrain.io/api/v/${r._id}" target="_blank" rel="noopener">open ↗</a></span>`);
        }

        body.appendChild(chipsEl);

        const titleRow = document.createElement("div"); titleRow.className = "titleRow";
        const a = document.createElement("a"); a.href = it.url || "#"; a.target = "_blank"; a.rel = "noopener"; a.textContent = it.label;
        titleRow.appendChild(a);
        body.appendChild(titleRow);

        // Author-vs-community sentiment, below the post - reported live,
        // with a screenshot of a post row: "show a sentiment below the
        // reddit post, author vs comments." A small bar pair, no text
        // labels (per direct instruction) - hidden entirely when there
        // are zero comments (nothing to compare against yet), since a
        // half-empty indicator reads as broken, not as "no data."
        if (it.kind === "reddit" && it.raw?.sentiment && it.raw.sentiment.forCommentCount > 0) {
          body.appendChild(renderSentimentBar(it.raw.sentiment));
        }

        // versionReleaseNotes is a human-readable summary for some bots (e.g. GitHub
        // commit messages) but a bare URL for others (python.py, java.py, eclipse.py,
        // ai_model.py). A URL there is already the clickable title link above — showing
        // it again as body text is just clutter, so prefer versionReleaseComments in
        // that case instead of dumping the raw link into the description.
        const notesRaw = safe(it.raw?.versionReleaseNotes, "");
        const notesIsUrl = notesRaw.startsWith("http");
        const descTxt = notesIsUrl
          ? safe(it.raw?.versionReleaseComments, "")
          : (truncate(notesRaw) || safe(it.raw?.versionReleaseComments, ""));
        if (descTxt) {
          const d = document.createElement("div"); d.className = "meta";
          let inner = "";

          if (it.kind !== "reddit" && it.kind !== "stackoverflow" && it.raw) {
            const mltlSrc = it.raw.mltl && Array.isArray(it.raw.mltl.src) ? it.raw.mltl.src : [];
            const potPosts = mltlSrc.map(u => STATE.redditByUrl.get(String(u))).filter(p => p?.isAboutLatestUpdate && p?.isAboutCve);
            if (potPosts.length) {
              inner += `<span class="chip warn potentialCveBadge">⚠️ Potential CVE discussion (${potPosts.length})</span>`;
              inner += `<div class="chips potentialCveChips">`;
              for (const p of potPosts) {
                const id = getPostId(p) || "post";
                inner += `<a class="chip potentialCveChip" href="${p.url || `https://reddit.com/comments/${id}`}" target="_blank" rel="noopener">${id}</a>`;
              }
              inner += `</div>`;
            }
          }

          d.innerHTML = inner + descTxt;
          body.appendChild(d);
        }

        li.appendChild(body);
        list.appendChild(li);
      }

      wrap.appendChild(list);
      det.appendChild(wrap);
      return det;
    }

    /* ── Infinite scroll ──────────────────────────────────────── */

    // Apply current component + toggle filters to a list of versions (used for incoming pages)
    function filterVersions(vers) {
      const comps = STATE.filters.components;
      const candidates = vers.filter(v => {
        if (!withinFeedWindow(v, comps.length > 0)) return false;
        if (!comps.length) return true;
        const name = norm(v.versionProductName);
        const tags = (Array.isArray(v.versionSearchTags) ? v.versionSearchTags.join(",") : "").toLowerCase();
        return comps.some(t => name.includes(t) || tags.includes(t));
      });
      if (!STATE.filters.toggles.size) return candidates;
      return candidates.filter(v => {
        const r  = redditMatchesForVersionBase(v, 6, false);
        const rr = redditMatchesForVersionBase(v, 6, true);
        const soAll  = stackoverflowMatchesForVersionBase(v, 6, false);
        const soRisk = stackoverflowMatchesForVersionBase(v, 6, true);
        const rLatest = rr.filter(p => p.isAboutLatestUpdate).length;
        const rCve    = rr.filter(p => p.isAboutCve).length;
        const potPosts = (v.mltl && Array.isArray(v.mltl.src) ? v.mltl.src : [])
          .map(u => STATE.redditByUrl.get(String(u))).filter(p => p && p.isAboutLatestUpdate && p.isAboutCve);
        return matchesToggles(v, r.length, rr.length, soAll.length, soRisk.length, rLatest, rCve, potPosts.length > 0);
      });
    }

    function appendNextGroups() {
      if (STATE.loading || STATE.fetchingPage) return;

      // Render next batch of already-loaded groups
      if (STATE.groupIndex < STATE.groupsFiltered.length) {
        STATE.loading = true;
        const frag = document.createDocumentFragment();
        const end = Math.min(STATE.groupIndex + GROUPS_BATCH, STATE.groupsFiltered.length);
        for (let i = STATE.groupIndex; i < end; i++) frag.appendChild(renderComponentNode(STATE.groupsFiltered[i], i));
        EL.feed.appendChild(frag);
        STATE.groupIndex = end;
        STATE.loading = false;
        // Always continue via rAF: next local batch OR (when groupIndex reaches
        // the end) fall through to the cursor-fetch branch so older server pages
        // load automatically without requiring a user scroll.
        requestAnimationFrame(appendNextGroups);
        return;
      }

      // All client groups rendered — fetch next server page if cursor exists
      if (STATE.nextCursor) {
        STATE.fetchingPage = true;
        EL.sentinel.textContent = "Loading more…";
        const q = (EL.components && EL.components.value || "").trim();
        Api.versions(q, STATE.nextCursor).then(({ versions: newVers, nextCursor }) => {
          STATE.nextCursor = nextCursor;
          STATE.fetchingPage = false;
          if (!newVers.length) { EL.sentinel.textContent = ""; return; }

          STATE.rawVersions = STATE.rawVersions.concat(newVers);
          const newFiltered = filterVersions(newVers);
          const newGroups   = groupByComponentName(newFiltered);

          // Merge: accumulate items into existing groups, collect truly new ones
          const existingMap = new Map(STATE.groupsFiltered.map(g => [g.key, g]));
          const brandNew = [];
          let mergedIntoExisting = false;
          newGroups.forEach(g => {
            if (existingMap.has(g.key)) { existingMap.get(g.key).items.push(...g.items); mergedIntoExisting = true; }
            else brandNew.push(g);
          });
          STATE.groupsFiltered = STATE.groupsFiltered.concat(brandNew);
          EL["kpi-page"].textContent = STATE.groupsFiltered.length;
          updateFeedWindowLabel();
          updateRangeKpi(STATE.groupsFiltered.flatMap(g => g.items));

          // A later page's new CVE/changelog items just got pushed into an
          // already-rendered group's own items array above - the DOM node
          // built from that group earlier won't reflect them (including
          // its sentiment chart's release/CVE markers) without this.
          // Reported live: "refresh the line chart after each data
          // retrieval (eg cve, changelogs, etc)."
          if (mergedIntoExisting) refreshRenderedGroups();

          if (brandNew.length) appendNextGroups();
          else if (!nextCursor) EL.sentinel.textContent = "";
        }).catch(e => {
          STATE.fetchingPage = false;
          console.error("[FEED] page fetch:", e);
          EL.sentinel.textContent = "Error loading more";
        });
        return;
      }

      EL.sentinel.textContent = STATE.groupsFiltered.length ? "" : "🔍 No results";
    }

    function setupObserver() {
      if (STATE.observer) STATE.observer.disconnect();
      STATE.observer = new IntersectionObserver(es => {
        if (es[0]?.isIntersecting) appendNextGroups();
      }, { rootMargin: "400px 0px" });
      STATE.observer.observe(EL.sentinel);
    }

    /* ── Expand / collapse all ────────────────────────────────── */
    EL.expandAllBtn.addEventListener("click", () => {
      STATE.expandedAll = !STATE.expandedAll;
      $$(".feedGroup").forEach(d => { d.open = STATE.expandedAll; });
      EL.expandAllBtn.textContent = STATE.expandedAll ? "Collapse all" : "Expand all";
    });

    /* ── Feed sort ────────────────────────────────────────────── */
    EL.feedSortSelect.value = getFeedSort();
    EL.feedSortSelect.addEventListener("change", () => {
      setFeedSort(EL.feedSortSelect.value);
      applyFilters();
    });

    /* ── Boot ─────────────────────────────────────────────────── */
    // Re-renders every group card already in the DOM from the CURRENT
    // STATE.groupsFiltered data - not reddit-specific despite its original
    // name/call site, just "whatever's on screen may be stale, redraw it
    // from the latest data." Each card (including its sentiment chart,
    // since renderComponentNode rebuilds that too) is a one-time snapshot
    // of its group's data at render time; later data arriving - reddit
    // posts, or a later cursor-fetched page merging new CVE/changelog
    // items into an already-displayed group's own items array - does NOT
    // automatically update an already-built DOM node, so every such
    // arrival needs to call this. Reported live: "refresh the line chart
    // after each data retrieval (eg cve, changelogs, etc)" - reddit's own
    // refresh already existed (ensureRedditLoaded calls this below); the
    // gap was the cursor-fetch merge branch in appendNextGroups, which
    // updated the data but never told the DOM.
    function refreshRenderedGroups() {
      const rendered = Array.from(EL.feed.querySelectorAll(".feedGroup[data-component]"));
      rendered.forEach(existingNode => {
        const compName = existingNode.dataset.component;
        const idx = STATE.groupsFiltered.findIndex(g => g.name === compName);
        if (idx < 0) return;
        const wasOpen = existingNode.open;
        const scrollTop = existingNode.scrollTop;
        const newNode = renderComponentNode(STATE.groupsFiltered[idx], idx);
        newNode.open = wasOpen;
        existingNode.replaceWith(newNode);
        newNode.scrollTop = scrollTop;
      });
    }

    function ensureRedditLoaded() {
      if (!STATE.redditReady) {
        STATE.redditReady = Api.reddit().catch(() => []).then(reddit => {
          STATE.redditAll = reddit;
          buildRedditIndex(reddit);
          EL["kpi-reddit"].textContent = getSourceCounts().reddit;
          // Recompute sidebar toggle counts now that reddit index is populated
          const list = STATE.candidates.length ? STATE.candidates : STATE.rawVersions;
          if (list.length) paintFixedCounts(computeAggregates(list));
          // Re-render rendered feed cards so reddit posts, chips, and the
          // sentiment chart (which needs reddit data to draw anything) appear.
          refreshRenderedGroups();
          updateCommunityBracket();
          if (G_ACTIVE && G_VIS_LOADED) gBuildAndRender(gGetVersions(), STATE.redditAll);
          // "Highest risk", "Most sources", and "Most comments" all read
          // reddit data that wasn't in yet on whichever earlier call
          // actually computed the current group order, same pattern as
          // ensureLlmVersionsLoaded re-running applyFilters() only when
          // the LLM toggle is the reason its own data matters right now.
          const fs = getFeedSort();
          if (fs === "risk" || fs === "sources" || fs === "comments") applyFilters();
        });
      }
      return STATE.redditReady;
    }

    // Loads the full, date-window-independent LLM dataset in the background — AI
    // model releases are sparse enough in time that the default LOOKBACK_DAYS feed
    // essentially never contains any, so the "AI Models" KPI/toggle count would
    // otherwise show 0 even when real data exists (as it currently does).
    function ensureLlmVersionsLoaded() {
      if (!STATE.llmReady) {
        STATE.llmReady = Api.llmVersions().catch(() => []).then(list => {
          STATE.llmVersions = dedupeByVersionId([list]);
          STATE.llmVersionsLoaded = true;
          EL["btn-llm"].textContent = STATE.llmVersions.length;
          EL["kpi-llm"].textContent = STATE.llmVersions.length;
          refreshActivityChartLlmLine();
          // If the LLM toggle is already active, re-render now that data has landed.
          if (STATE.filters.toggles.has("llm")) applyFilters();
        });
      }
      return STATE.llmReady;
    }

    // Hypervisor counterpart of ensureLlmVersionsLoaded() — hypervisor releases are
    // sparse enough in time that the default feed window essentially never contains
    // any, so the "Hypervisors" KPI/toggle would otherwise sit at 0.
    function ensureHvVersionsLoaded() {
      if (!STATE.hvReady) {
        STATE.hvReady = Api.hypervisorVersions().catch(() => []).then(list => {
          STATE.hvVersions = dedupeByVersionId([list]);
          STATE.hvVersionsLoaded = true;
          EL["btn-hv"].textContent = STATE.hvVersions.length;
          EL["kpi-hv"].textContent = STATE.hvVersions.length;
          refreshActivityChartHvLine();
          if (STATE.filters.toggles.has("hv")) applyFilters();
        });
      }
      return STATE.hvReady;
    }

    // Turns a fetch/API failure into a plain-language message that still
    // states the real cause, rather than a bare "⚠️ Error: 502 Bad
    // Gateway" dump, which reads as a crash report to a viewer with no
    // reason to know what a gateway even is. Api.versions() throws
    // `new Error("${status} ${statusText}")` for a non-ok response; a
    // genuine network failure (offline, DNS, CORS) instead throws a
    // native error with no leading status code at all, so that case is
    // told apart by the absence of one, not assumed away.
    function friendlyFetchError(e) {
      const msg = String((e && e.message) || "");
      const m5xx = msg.match(/^5\d\d\b/);
      if (m5xx) {
        return { headline: `The server is temporarily unavailable (${m5xx[0]}).`, detail: "This isn't your connection; try again in a minute." };
      }
      const m4xx = msg.match(/^4\d\d\b/);
      if (m4xx) {
        return { headline: `That request was rejected (${m4xx[0]}).`, detail: "Try reloading the page." };
      }
      return { headline: "Can't reach the server right now.", detail: "Check your connection and try again." };
    }

    // Single shared "nothing to show" surface for every reason the feed
    // can come up empty: a plain over-filtered search, a component with
    // nothing inside the day window, or a genuine fetch failure. Before
    // this, a failed fetch wrote its own ad-hoc error paragraph straight
    // into #feed while the unrelated pagination sentinel independently
    // set itself to "No results" and #status said "Failed to load," all
    // three visible at once, none of them coordinated (see this file's
    // own GLOBAL RULE on redundant elements). Routing every case through
    // here means #emptyState.show ~ #sentinel (that same rule's fix)
    // suppresses the sentinel regardless of which reason triggered this.
    function showEmptyState(message, opts) {
      opts = opts || {};
      EL.emptyState.classList.toggle("emptyState-error", !!opts.isError);
      EL.emptyState.classList.add("show");
      if (EL.emptyStateIcon) EL.emptyStateIcon.textContent = opts.icon || "🔍";
      if (EL.emptyStateMsg) EL.emptyStateMsg.textContent = message;
      if (EL.emptyStateDetail) {
        EL.emptyStateDetail.textContent = opts.detail || "";
        EL.emptyStateDetail.hidden = !opts.detail;
      }
    }
    function hideEmptyState() {
      EL.emptyState.classList.remove("show", "emptyState-error");
    }

    // The five most recently released distinct components, shown under the prompt on the
    // Ask home until a question is asked. Reads the same list the feed renders.
    function renderHomeLatest() {
      const host = document.getElementById("askHomeLatest");
      if (!host) return;
      const seen = new Set();
      const rows = [];
      for (const v of STATE.rawVersions) {
        if (v.isCve) continue;
        const name = String(v.versionProductName || v.sourceBot || "").trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        rows.push({ name, v });
        if (rows.length >= 5) break;
      }
      if (!rows.length) { host.hidden = true; return; }
      host.querySelector("ul").innerHTML = rows.map(({ name, v }) => {
        const d = String(v.versionReleaseDate || "");
        const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : "";
        return `<li><strong>${uaEsc(name)}</strong>`
          + `<span class="m">${uaEsc(v.versionNumber || "")}</span>`
          + `<span class="m">${uaEsc(v.versionReleaseChannel || "")}</span>`
          + `<span class="m">${uaEsc(date)}</span></li>`;
      }).join("");
      host.hidden = false;
    }

    async function boot() {
      EL.status.textContent = "Loading…";
      EL.navLoader.classList.add("active");
      EL.feed.innerHTML = "";
      hideEmptyState();
      STATE.groupIndex = 0;
      STATE.nextCursor = null;
      STATE.rawVersions = [];

      try {
        const rawQ = new URL(location.href).searchParams.get("q") || "";
        EL.components.value = rawQ;
        STATE.filters.components = tokens(rawQ);
        setLinksHref();

        // Restore a quick-filter toggle from the URL, e.g. ?type=llm — lets a link
        // like releasetrain.io/?type=llm land with that filter already active.
        const typeParam = (new URL(location.href).searchParams.get("type") || "").toLowerCase().trim();
        if (typeParam) {
          const btn = document.querySelector(`#fixedToggles .toggle[data-key="${CSS.escape(typeParam)}"]`);
          if (btn && !btn.classList.contains("disabled")) {
            STATE.filters.toggles.add(typeParam);
            btn.setAttribute("aria-pressed", "true");
            refreshActiveFilters();
          }
        }

        // First page only — renders immediately, more loaded lazily as user scrolls
        trackSearch(rawQ);
        // Kicked off here, in parallel with the main versions fetch below,
        // not after it finishes - reported live: "reddit/stackoverflow are
        // loading very slow... since the linechart depends on them load
        // them first." ensureRedditLoaded() used to run only after
        // versions/applyFilters/renderHomeLatest had already completed,
        // so the (often slower) reddit+stackoverflow fetch didn't even
        // start until well into the page load - every component's
        // sentiment chart then sat empty until that late start finally
        // finished. Starting it here instead means it's already been
        // loading for the same stretch of time the versions fetch took,
        // so it lands sooner relative to first render. It's still
        // fire-and-forget (ensureRedditLoaded returns a cached promise
        // nothing here needs to await - see refreshRenderedGroups, which
        // re-renders every visible group, charts included, once it
        // resolves) so this doesn't delay the main feed render either.
        ensureRedditLoaded();
        // Run alongside the feed's own fetch, not before it: neither
        // depends on the other, and every LOOKBACK_* consumer below
        // (sorting, applyFilters, the activity chart) only runs once
        // both have settled, so there's nothing to gain by sequencing
        // them.
        const [{ versions: vers, nextCursor }] = await Promise.all([
          Api.versions(rawQ),
          lookbackDaysReady,
        ]);
        STATE.nextCursor = nextCursor;

        if (!vers.length) {
          EL.status.textContent = "No versions found";
          showEmptyState("No versions found for that search.");
          return;
        }

        vers.sort((a, b) => (versionTime(b) || +new Date(b.versionTimestampLastUpdate || b.versionTimestamp || 0)) - (versionTime(a) || +new Date(a.versionTimestampLastUpdate || a.versionTimestamp || 0)));
        STATE.rawVersions = vers;
        applyFilters();
        renderHomeLatest();

        // LLM and hypervisor datasets load in background — never block the
        // feed. Reddit/stackoverflow's own ensureRedditLoaded() already
        // started above, in parallel with the versions fetch - not
        // repeated here.
        ensureLlmVersionsLoaded();
        ensureHvVersionsLoaded();
      } catch (e) {
        console.error(e);
        EL.feed.innerHTML = "";
        const { headline, detail } = friendlyFetchError(e);
        showEmptyState(headline, { icon: "⚠️", detail, isError: true });
        EL.status.textContent = "Failed to load";
      } finally {
        EL.navLoader.classList.remove("active");
      }
    }

    /* ── Events ───────────────────────────────────────────────── */
    EL.filterForm.addEventListener("submit", async e => {
      e.preventDefault();
      const input = EL.components.value.replace(/ /g, " ").replace(/\s*,\s*/g, ",").trim();
      history.replaceState({}, "", buildHrefWithQ(location.pathname, input));
      setLinksHref();
      EL.status.textContent = "Filtering…";
      EL.navLoader.classList.add("active");
      try {
        STATE.filters.components = tokens(input);
        if (DB_ACTIVE) riPopulateVersions();
        STATE.nextCursor = null;
        STATE.rawVersions = [];
        trackSearch(input);
        const { versions: vers, nextCursor: nc } = await Api.versions(input);
        STATE.nextCursor = nc;
        if (!vers.length) {
          EL.feed.innerHTML = "";
          showEmptyState("No versions found for that search.");
          EL.status.textContent = "No versions";
          return;
        }
        vers.sort((a, b) => (versionTime(b) || +new Date(b.versionTimestampLastUpdate || b.versionTimestamp || 0)) - (versionTime(a) || +new Date(a.versionTimestampLastUpdate || a.versionTimestamp || 0)));
        STATE.rawVersions = vers;
        applyFilters();
      } catch (e) { console.error(e); EL.status.textContent = friendlyFetchError(e).headline; }
      finally { EL.navLoader.classList.remove("active"); }
    });

    EL.clearBtn.addEventListener("click", () => {
      EL.components.value = "";
      // #components is the hidden internal-only mirror now (see
      // #filterForm's own comment). #askQuestion is what the user
      // actually typed into and sees, so Clear needs to reset that too -
      // and #askContext beside it (its own optional field, not reset by
      // clearing #askQuestion alone).
      const askQ = document.getElementById("askQuestion");
      if (askQ) askQ.value = "";
      const askCtx = document.getElementById("askContext");
      if (askCtx) askCtx.value = "";
      hideAskRail();
      STATE.filters.components = [];
      STATE.filters.toggles.clear();
      history.replaceState({}, "", buildHrefWithQ(location.pathname, ""));
      setLinksHref();
      $$("#fixedToggles .toggle, #typeToggles .toggle").forEach(b => b.setAttribute("aria-pressed", "false"));
      refreshActiveFilters();
      if (DB_ACTIVE) riPopulateVersions();
      boot();
    });

    EL.fixedToggles.addEventListener("click", e => {
      const btn = e.target.closest(".toggle");
      if (!btn || btn.classList.contains("disabled")) return;
      const key = btn.dataset.key, on = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", on ? "false" : "true");
      on ? STATE.filters.toggles.delete(key) : STATE.filters.toggles.add(key);
      // Only "llm" / "hv" round-trip to the URL (see setTypeParam) — shareable
      // ?type=llm / ?type=hv links, not a general mechanism for every toggle.
      if (key === "llm" || key === "hv") setTypeParam(on ? null : key);
      refreshActiveFilters();
      applyFilters();
    });

    EL.afClearAll.addEventListener("click", () => {
      STATE.filters.toggles.clear();
      $$("#fixedToggles .toggle, #typeToggles .toggle").forEach(b => b.setAttribute("aria-pressed", "false"));
      setTypeParam(null);
      refreshActiveFilters();
      applyFilters();
    });

    /* ── Autocomplete ─────────────────────────────────────────── */
    // #components/#suggestions (this pool's original home) are hidden,
    // internal-only now that Search and Ask are one box. See the merged
    // askQuestion typeahead above, which is the real consumer of
    // suggestionPool/getCurrentToken/replaceCurrentToken/highlightMatch.
    let suggestionPool = [];

    // Full distinct-component-name list from the server (not just what's currently
    // loaded in the feed). Without this, searching for e.g. "Mistral" or "Ollama"
    // wouldn't even suggest the name unless one of their releases happened to fall
    // inside the current LOOKBACK_DAYS window and had already been paginated in.
    let _allComponentNames = null;
    let _allComponentNamesPromise = null;
    function ensureAllComponentNames() {
      if (_allComponentNamesPromise) return _allComponentNamesPromise;
      _allComponentNamesPromise = fetch(API_BASE + "c/names")
        .then(r => r.ok ? r.json() : [])
        .then(arr => { _allComponentNames = (Array.isArray(arr) ? arr : []).map(norm).filter(Boolean); })
        .catch(() => { _allComponentNames = _allComponentNames || []; });
      return _allComponentNamesPromise;
    }

    function buildSuggestionPool() {
      const names = new Set(_allComponentNames || []);
      for (const v of STATE.rawVersions) {
        const n = norm(v.versionProductName);
        if (n) names.add(n);
        if (Array.isArray(v.versionSearchTags)) {
          for (const t of v.versionSearchTags) { const tn = norm(t); if (tn) names.add(tn); }
        }
      }
      suggestionPool = Array.from(names).sort();
    }

    function getCurrentToken(val) {
      const parts = val.split(",");
      return parts[parts.length - 1].trimStart();
    }

    function replaceCurrentToken(val, replacement) {
      const parts = val.split(",");
      parts[parts.length - 1] = parts.length > 1 ? " " + replacement : replacement;
      return parts.join(",") + ", ";
    }

    function highlightMatch(str, query) {
      const idx = str.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) return str;
      return str.slice(0, idx) + `<strong>${str.slice(idx, idx + query.length)}</strong>` + str.slice(idx + query.length);
    }

    /* ── Community bracket ── uses aggregate API counts when available ── */
    function updateCommunityBracket() {
      if (_homeRTotalNum == null) return;
      let todayN, yestN;
      if (_rTodayApi != null) {
        todayN = _rTodayApi; yestN = _rYestApi ?? 0;
      } else {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const yestStart = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1);
        const todayMs = todayStart.getTime(), yestMs = yestStart.getTime();
        todayN = 0; yestN = 0;
        for (const p of STATE.redditAll) {
          const t = redditTime(p);
          if (t >= todayMs) todayN++;
          else if (t >= yestMs) yestN++;
        }
      }
      const fmtN = n => n.toLocaleString();
      const pct = yestN ? Math.round((todayN - yestN) / yestN * 100) : null;
      const deltaHtml = pct != null
        ? `, <span class="rt-c u-bold" style="--rt-c:${pct > 0 ? '#475569' : pct < 0 ? '#dc2626' : '#6b7280'}">${pct >= 0 ? '+' : ''}${pct}%</span>`
        : '';
      const el = document.getElementById('home-r-total');
      if (el) el.innerHTML = fmtN(_homeRTotalNum) + ` [${fmtN(todayN)} today${deltaHtml}]`;
    }

    /* ── Sidebar activity chart ── only loadHomeStats calls this ── */
    // llmData / hvData are best-effort: there's no server-side "X releases per day"
    // aggregate endpoint for either, so they're computed client-side from the full
    // LLM / hypervisor datasets at render time (see refreshActivityChart*Line,
    // called once boot() / the background fetches have loaded data).
    function updateActivityChart(labels, vData, cveData, rData, llmData, hvData) {
      const canvas = document.getElementById('home-activity-chart');
      if (!canvas) return;
      _activityDays = labels;
      const doRender = () => {
        try {
          if (_activityChart) { try { _activityChart.destroy(); } catch (_) {} _activityChart = null; }
          _activityChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [
              { label: 'Versions',  data: vData,   borderColor: '#2563eb', backgroundColor: 'rgba(99,102,241,0.10)', tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: true },
              { label: 'CVE',       data: cveData, borderColor: '#dc2626', backgroundColor: 'rgba(239,68,68,0.07)',   tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: false },
              { label: 'Community', data: rData,   borderColor: '#64748b', backgroundColor: 'rgba(34,197,94,0.07)',  tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: true },
              { label: 'LLM',       data: llmData || labels.map(() => 0), borderColor: '#475569', backgroundColor: 'rgba(124,58,237,0.08)', tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: false },
              { label: 'Hypervisor', data: hvData || labels.map(() => 0), borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.08)', tension: 0.3, pointRadius: 2, borderWidth: 1.5, fill: false },
            ]},
            options: {
              responsive: true, maintainAspectRatio: false, animation: false,
              plugins: {
                // Labeled and clickable — Chart.js's default legend behavior toggles a
                // line's visibility on click, which is exactly the enable/disable ask.
                legend: {
                  display: true, position: 'bottom',
                  labels: { boxWidth: 8, boxHeight: 8, font: { size: 9 }, color: '#6b7280', padding: 6, usePointStyle: true }
                },
                tooltip: { mode: 'index', intersect: false, bodyFont: { size: 10 }, titleFont: { size: 10 } }
              },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9ca3af', maxRotation: 0 } },
                y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 9 }, color: '#9ca3af', maxTicksLimit: 3 }, beginAtZero: true }
              }
            }
          });
        } catch (e) { console.warn('[activity-chart]', e); }
      };
      if (typeof Chart !== 'undefined') { doRender(); }
      else if (!_chartJsLoading) {
        _chartJsLoading = true;
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = () => { _chartJsLoading = false; doRender(); };
        document.head.appendChild(s);
      }
    }

    // Best-effort LLM-per-day counts from whatever's currently in STATE.rawVersions
    // (no server-side aggregate endpoint for this yet, unlike the other three lines).
    function computeLlmDailyFromRaw(dayStrs) {
      const counts = Object.fromEntries(dayStrs.map(s => [s, 0]));
      // Source of truth is STATE.llmVersions (full, date-window-independent dataset,
      // see ensureLlmVersionsLoaded) once it's loaded — STATE.rawVersions alone almost
      // never has any LLM docs, since AI model releases are sparse enough in time that
      // they rarely fall inside the default feed window. Falls back to rawVersions
      // before that dataset has landed so the chart still renders something on first paint.
      const source = STATE.llmVersionsLoaded ? STATE.llmVersions : STATE.rawVersions;
      for (const v of source) {
        if (!isLLMVersion(v)) continue;
        const d = String(v.versionReleaseDate || '').trim().replace(/-/g, '');
        if (Object.prototype.hasOwnProperty.call(counts, d)) counts[d]++;
      }
      return dayStrs.map(s => counts[s]);
    }

    // Re-paints just the LLM dataset once boot()/ensureLlmVersionsLoaded() has actually
    // populated real data (loadHomeStats renders the chart independently/earlier, so
    // the LLM line starts flat).
    function refreshActivityChartLlmLine() {
      if (!_activityChart || !_activityDayStrs) return;
      const ds = _activityChart.data?.datasets?.find(d => d.label === 'LLM');
      if (!ds) return;
      ds.data = computeLlmDailyFromRaw(_activityDayStrs);
      try { _activityChart.update('none'); } catch (_) {}
    }

    // Hypervisor counterpart of computeLlmDailyFromRaw — same fallback logic.
    function computeHvDailyFromRaw(dayStrs) {
      const counts = Object.fromEntries(dayStrs.map(s => [s, 0]));
      const source = STATE.hvVersionsLoaded ? STATE.hvVersions : STATE.rawVersions;
      for (const v of source) {
        if (!isHypervisorVersion(v)) continue;
        const d = String(v.versionReleaseDate || '').trim().replace(/-/g, '');
        if (Object.prototype.hasOwnProperty.call(counts, d)) counts[d]++;
      }
      return dayStrs.map(s => counts[s]);
    }

    function refreshActivityChartHvLine() {
      if (!_activityChart || !_activityDayStrs) return;
      const ds = _activityChart.data?.datasets?.find(d => d.label === 'Hypervisor');
      if (!ds) return;
      ds.data = computeHvDailyFromRaw(_activityDayStrs);
      try { _activityChart.update('none'); } catch (_) {}
    }

    // Load the full component name list in the background so autocomplete can suggest
    // e.g. "Mistral" or "Ollama" even before/without any of their releases being loaded
    // into the current feed window. Rebuild the pool once it lands.
    ensureAllComponentNames().then(() => buildSuggestionPool());

    // Fetch live collection stats for home sidebar on page load
    (async function loadTopSearches() {
      const listEl = document.getElementById("top-searches-list");
      if (!listEl) return;
      try {
        const res = await fetch(API_BASE + "events/search/top?n=3");
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const items = data.data || [];
        if (!items.length) {
          listEl.innerHTML = '<span class="st-224" >No searches yet.</span>';
          return;
        }
        listEl.innerHTML = items.map(item => {
          const q = normalizeQuery(item.query);
          if (!q) return "";
          return '<a href="/?q=' + encodeCsvKeepCommas(q) + '" class="u-show-flex st-225" >'
            + '<span class="st-201" >' + q.replace(/&/g,"&amp;").replace(/</g,"&lt;") + '</span>'
            + '<span class="st-226" >' + item.count + (item.count === 1 ? ' search' : ' searches') + '</span>'
            + '</a>';
        }).filter(Boolean).join("");
      } catch {
        listEl.innerHTML = '<span class="st-224" >Could not load.</span>';
      }
    })();

    (async function loadHomeStats() {
      // Runs concurrently with boot() at page load, not after it; without
      // this, the LOOKBACK_DAYS-sized day array below could be built from
      // the fallback value if this resolves first, a live race that would
      // show a different window here than the feed itself ends up using.
      await lookbackDaysReady;
      const fmtDate = d => d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
      const today = new Date();
      const fmt = n => typeof n === 'number' ? n.toLocaleString() : '—';
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
      const fmtSize = bytes => { const mb = bytes / (1024*1024); return mb < 1 ? (bytes/1024).toFixed(0)+' KB' : mb.toFixed(1)+' MB'; };
      const colorDelta = (todayN, yestN) => {
        if (!yestN || !todayN) return '';
        const pct = Math.round((todayN - yestN) / yestN * 100);
        const sign = pct >= 0 ? '+' : '';
        const color = pct > 0 ? '#475569' : pct < 0 ? '#dc2626' : '#6b7280';
        return `, <span class="st-227 rt-c" style="--rt-c:${color}">${sign}${pct}%</span>`;
      };
      // Build LOOKBACK_DAYS-day date array (oldest → today)
      const days = Array.from({ length: LOOKBACK_DAYS }, (_, i) => {
        const d = new Date(today); d.setDate(today.getDate() - (LOOKBACK_DAYS - 1 - i));
        return { str: fmtDate(d), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      });
      try {
        const startStr = days[0].str, endStr = days[LOOKBACK_DAYS - 1].str;
        const [vData, rData, vByDay, cveByDay, rByDay] = await Promise.all([
          fetch('https://releasetrain.io/api/v/count').then(r => r.json()).catch(() => null),
          fetch('https://releasetrain.io/api/reddit/count').then(r => r.json()).catch(() => null),
          fetch(`https://releasetrain.io/api/aggregate/v/versionCountByDay?start=${startStr}&end=${endStr}`).then(r => r.json()).catch(() => null),
          fetch(`https://releasetrain.io/api/aggregate/v/cveCountByDay?start=${startStr}&end=${endStr}`).then(r => r.json()).catch(() => null),
          fetch(`https://releasetrain.io/api/aggregate/reddit/countByDay?start=${startStr}&end=${endStr}`).then(r => r.json()).catch(() => null),
        ]);
        // Map sparse per-day results (only dates with data) to the full LOOKBACK_DAYS-day array
        const vMap   = Object.fromEntries((vByDay?.days   ?? []).map(d => [d._id, d.count]));
        const cveMap = Object.fromEntries((cveByDay?.days ?? []).map(d => [d._id, d.count]));
        const rMap   = Object.fromEntries((rByDay?.days   ?? []).map(d => [d._id, d.count]));
        const vDaily   = days.map(d => vMap[d.str]   ?? 0);
        const cveDaily = days.map(d => cveMap[d.str] ?? 0);
        const rDaily   = days.map(d => rMap[d.str]   ?? 0);
        const vTodayN = vDaily[LOOKBACK_DAYS - 1], vYestN = vDaily[LOOKBACK_DAYS - 2];
        _rTodayApi = rDaily[LOOKBACK_DAYS - 1]; _rYestApi = rDaily[LOOKBACK_DAYS - 2];
        if (vData) {
          const vTotal = vData.totalVersions, vCve = vData.cveCount ?? 0, vNon = vData.nonCveCount ?? (vTotal - vCve);
          const vBracket = vTodayN > 0 ? ` [${fmt(vTodayN)} today${colorDelta(vTodayN, vYestN)}]` : '';
          setHtml('home-v-total', fmt(vTotal) + vBracket);
          setText('home-v-cve', fmt(vCve));
          setText('home-v-noncve', fmt(vNon));
          setText('dsb-v-total', fmt(vTotal));
          setText('dsb-v-cve', fmt(vCve));
          setText('dsb-v-noncve', fmt(vNon));
          setText('dsb-v-size', fmtSize(vTotal * 800) + ' / 5 MB');
        }
        if (rData) {
          _homeRTotalNum = rData.totalRedditPosts;
          const rReddit = rData.redditCount ?? 0, rSO = rData.stackoverflowCount ?? 0, rSF = rData.serverfaultCount ?? 0;
          setHtml('home-r-total', fmt(_homeRTotalNum));
          setText('home-r-reddit', fmt(rReddit));
          setText('home-r-so', fmt(rSO));
          setText('home-r-sf', fmt(rSF));
          setText('dsb-r-total', fmt(_homeRTotalNum));
          setText('dsb-r-reddit', fmt(rReddit));
          setText('dsb-r-so', fmt(rSO));
          setText('dsb-r-sf', fmt(rSF));
          setText('dsb-r-size', fmtSize(_homeRTotalNum * 2000) + ' / 5 MB');
          updateCommunityBracket();
        }
        _activityDayStrs = days.map(d => d.str);
        updateActivityChart(days.map(d => d.label), vDaily, cveDaily, rDaily, computeLlmDailyFromRaw(_activityDayStrs), computeHvDailyFromRaw(_activityDayStrs));
      } catch (_) { /* stats are non-critical */ }
    })();

    setupObserver();
