// app.js
// Ecosystem Architecture Monitoring
// - Uses ?q= (raw commas, no %2C) for internal links (/ /graph /arch)
// - Falls back to today's updated components when q is missing or empty
// - No vertical page scrolling (diagram scales to viewport)
// - PlantUML legend on right, single row
// - Code dialog: high-contrast, smaller monospace font

import {} from "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";

/* ---------- Config ---------- */
const IS_PRODUCTION = false;
const config = {
  production: {
    API_ENDPOINT: "https://releasetrain.io/api",
    PLANTUML_SERVER: "https://www.plantuml.com/plantuml/png/"
  },
  development: {
    API_ENDPOINT: "https://releasetrain.io/api",
    // API_ENDPOINT: "http://localhost:3000/api",
    UPDATED_TODAY: "https://releasetrain.io/api/v/d/updatedToday",
    PLANTUML_SERVER: "https://www.plantuml.com/plantuml/png/"
  }
};
const URL_API_ENDPOINT  = IS_PRODUCTION ? config.production.API_ENDPOINT  : config.development.API_ENDPOINT;
let   PLANTUML_SERVER   = IS_PRODUCTION ? config.production.PLANTUML_SERVER: config.development.PLANTUML_SERVER;
const URL_UPDATED_TODAY = IS_PRODUCTION
  ? (config.production.API_ENDPOINT + "/v/d/updatedToday")
  : config.development.UPDATED_TODAY;

/* ---------- State ---------- */
let versions = [];
let startTime = Date.now();
let plantumlUrl = "";
let currentComponents = []; // names only

const allowedOperatingSystems = [
  "linux","windows","macos","ubuntu","centos","debian","redhat","fedora","arch","suse",
  "mint","mac","solaris","freebsd","opensuse","gentoo","slackware","manjaro","android","ios",
  "fedora","android-x86","raspbian","kali-linux","opensolaris","zorin","popos","puppylinux","steamos","beaglebone"
];

/* ---------- DOM helpers ---------- */
const $id = id => document.getElementById(id);
const setText = (id,v) => { const el=$id(id); if(el) el.textContent=v; };
const qs = () => new URLSearchParams(window.location.search);
const uniq = arr => Array.from(new Set(arr));

/* ---------- Fetch ---------- */
function fetchJSON(url){
  return new Promise((resolve,reject)=>{
    $.ajax({ url, type:'GET', dataType:'json', success:resolve, error:(_,s,e)=>reject(new Error(s||e||'error')) });
  });
}

/* ---------- URL parsing/building ---------- */
// read components from ?q= (comma separated) OR legacy ?component=
function parseComponentsFromUrl(){
  const params = qs();

  // Prefer ?q= (raw commas)
  if (params.has('q')) {
    const raw = params.get('q') || '';
    // keep commas literal; do a light decode to strip accidental %2C if present
    const qstring = raw.replace(/%2C/gi, ',');
    const list = qstring.split(',').map(s=>s.trim()).filter(Boolean);
    return uniq(list);
  }

  // legacy support ?component=name:linux&component=name:nginx...
  const comps = params.getAll('component');
  const out = [];
  comps.forEach(c=>{
    const parts = c.split(',');
    let name=null;
    parts.forEach(p=>{
      const [k,v]=p.split(':'); if(!k||!v) return;
      if(k.trim()==='name') name=v.trim();
    });
    if(name) out.push(name);
  });
  return uniq(out);
}

// when user edits chips/stacks, keep URL using ?q= (visible commas)
function setUrlFromComponents(names){
  const base = `${window.location.origin}${window.location.pathname}`;
  // raw commas, no encoding of commas
  const q = names.join(',');
  window.location.href = `${base}?q=${q}`;
}

// Build API query for versionsByComponent from a list of names (component=name:x)
// (encode here for safety on backend)
function buildApiQueryFromComponents(names){
  return names.map(n => `component=name:${encodeURIComponent(n)}`).join('&');
}

/* ---------- Chips UI ---------- */
function refreshChips(){
  const bar = $id('chipbar'); if(!bar) return;
  const input = $id('chipInput');
  Array.from(bar.querySelectorAll('.chip')).forEach(n => n.remove());
  currentComponents.forEach(name=>{
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span>${name}</span><span class="x" title="Remove">×</span>`;
    chip.querySelector('.x').addEventListener('click', ()=>{
      currentComponents = currentComponents.filter(nm => nm!==name);
      setUrlFromComponents(currentComponents);
    });
    bar.insertBefore(chip, input);
  });
}

function wireChipInput(){
  const input = $id('chipInput');
  input.addEventListener('keydown', e=>{
    if(e.key === 'Enter'){
      const v = input.value.trim().replace(/%2C/gi, ',');
      if(!v) return;
      if(!currentComponents.includes(v)) currentComponents.push(v);
      setUrlFromComponents(currentComponents);
    }
  });
}

/* ---------- Stacks dropdown (+ adds; does not replace) ---------- */
function wireStackAdder(){
  const sel = $id('stackSelect');
  const btn = $id('addStackBtn');
  btn.addEventListener('click', ()=>{
    const val = sel.value;
    if(!val) return;
    const namesToAdd = val.split(',').map(s=>s.trim()).filter(Boolean);
    const merged = uniq(currentComponents.concat(namesToAdd));
    setUrlFromComponents(merged);
  });
}

/* ---------- Metrics / Details ---------- */
function getStack(list){
  const stacks = [
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
  ];
  const out = []; const used = new Set();
  for (const s of stacks){
    const strict = s.components.every(c=> list.includes(c.toLowerCase()));
    if(strict){ out.push({ stackName:s.name, matchedComponents:s.components }); s.components.forEach(c=>used.add(c.toLowerCase())); }
  }
  const extraComponents = list.filter(c=>!used.has(c.toLowerCase())).map(c=>({component:c,belongsToStack:false}));
  return { groupedStacks: out, extraComponents };
}

function versionDelta(cur, latest){
  const toN = v => (String(v||'').split(/[^\d]+/).map(x=>parseInt(x||'0',10))).slice(0,3);
  const [cM,cm,cp] = toN(cur);
  const [lM,lm,lp] = toN(latest);
  if (lM>cM) return "major";
  if (lM===cM && lm>cm) return "minor";
  if (lM===cM && lm===cm && lp>cp) return "patch";
  return "none";
}
function summarize(arr){
  const out = { cve:0, major:0, minor:0, patch:0, ok:0 };
  arr.forEach(v=>{
    const cur = v.currentVersion || v.latestVersion;
    const lat = v.latestVersion;
    if(!cur || !lat) return;
    if (v.latestCveVersion) out.cve++;
    const d = versionDelta(cur.versionNumber, lat.versionNumber);
    if (d==="major") out.major++;
    else if (d==="minor") out.minor++;
    else if (d==="patch") out.patch++;
    else out.ok++;
  });
  return out;
}

/* ---------- PlantUML (light scheme in image) ---------- */
function sanitize(s){ return String(s||'').replace(/[":]/g, '-'); }
function extractCveCode(url){
  if(!url) return "Unknown CVE";
  const m = url.match(/CVE-\d{4}-\d+/);
  return m ? m[0] : "Generic Security Issue";
}
function formatDateWithRelativeTime(yyyymmdd){
  if(!yyyymmdd || String(yyyymmdd).length<8) return "Unknown";
  const y=yyyymmdd.slice(0,4), m=yyyymmdd.slice(4,6), d=yyyymmdd.slice(6,8);
  const dt = new Date(y, m-1, d);
  const today = new Date();
  const diff = Math.floor((today - dt)/(1000*3600*24));
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const base = `${months[dt.getMonth()]}/${String(dt.getDate()).padStart(2,'0')}/${dt.getFullYear()}`;
  let rel = "";
  if (diff===0) rel="(Today)";
  else if (diff===1) rel="(Yesterday)";
  else if (diff<7) rel="(This week)";
  else if (diff<30) rel="(This month)";
  return `${base} ${rel}`.trim();
}
function sortVersionsByOperatingSystem(arr){
  if(!Array.isArray(arr) || !arr.length) return arr;
  return arr.sort((a,b)=>{
    const A = allowedOperatingSystems.includes((a.name||'').toLowerCase());
    const B = allowedOperatingSystems.includes((b.name||'').toLowerCase());
    return (B?1:0) - (A?1:0);
  });
}

function buildEcosystemUml(vers){
  const sorted = sortVersionsByOperatingSystem(vers.slice());
  const names  = sorted.map(v=> v.name);
  const { groupedStacks, extraComponents } = getStack(names);

  const timestamp = new Date().toLocaleString('en-US',{
    weekday:'short', year:'numeric', month:'short', day:'numeric',
    hour:'numeric', minute:'numeric', second:'numeric', hour12:false, timeZoneName:'short'
  });

  // Light UI in image
  const bg          = "#ffffff";
  const fontColor   = "#111827";
  const borderColor = "#cbd5e1";
  const pkgBg       = "#ffffff";
  const nodeLine    = "#94a3b8";
  const nodeBg      = "#ffffff";

  const css = getComputedStyle(document.documentElement);
  const cveFill   = (css.getPropertyValue('--cve-light')   || "#fecaca").trim();
  const majorFill = (css.getPropertyValue('--major-light') || "#fed7aa").trim();
  const minorFill = (css.getPropertyValue('--minor-light') || "#bbf7d0").trim();
  const patchFill = (css.getPropertyValue('--patch-light') || "#ffe8cc").trim();
  const okFill    = (css.getPropertyValue('--ok-light')    || "#ffffff").trim();

  let uml = `@startuml
skinparam BackgroundColor ${bg}
skinparam DefaultTextAlignment left
skinparam Shadowing false
skinparam PackageBorderColor ${borderColor}
skinparam PackageBackgroundColor ${pkgBg}
skinparam ComponentBorderColor ${nodeLine}
skinparam ComponentBackgroundColor ${nodeBg}
skinparam ArrowColor ${fontColor}
skinparam FontColor ${fontColor}
title "Software Ecosystem: ${timestamp}"
legend right
  |= Legend |= <${cveFill}> CVE | <${majorFill}> Major | <${minorFill}> Minor | <${patchFill}> Patch | <${okFill}> OK |
endlegend
`;

  uml += `package "Ecosystem" #transparent {\n`;

  if (groupedStacks.length){
    groupedStacks.forEach(s=>{
      uml += `  package "${s.stackName} stack" #transparent {\n`;
      const subset = sorted.filter(v=> s.matchedComponents.includes(v.name));
      subset.forEach(v=> uml += `    ${componentLine(v, {cveFill, majorFill, minorFill, patchFill, okFill})}\n`);
      uml += `  }\n`;
    });
  }
  const extraSubset = sorted.filter(v=> extraComponents.some(e=> e.component===v.name));
  if (extraSubset.length){
    uml += `  package "Extra components" #transparent {\n`;
    extraSubset.forEach(v=> uml += `    ${componentLine(v, {cveFill, majorFill, minorFill, patchFill, okFill})}\n`);
    uml += `  }\n`;
  }

  uml += `}\n@enduml\n`;
  return uml;
}

function componentLine(version, fills){
  const cur = version.currentVersion || version.latestVersion;
  const lat = version.latestVersion;
  if (!cur || !lat) return `component "${sanitize(version.name)}"`;

  const diff = versionDelta(cur.versionNumber, lat.versionNumber);
  const hasCve = !!version.latestCveVersion;
  const fill = hasCve ? fills.cveFill
        : diff==="major" ? fills.majorFill
        : diff==="minor" ? fills.minorFill
        : diff==="patch" ? fills.patchFill
        : fills.okFill;

  const name  = sanitize(cur.versionProductName || version.name);
  const ver   = sanitize(cur.versionNumber);
  const rdate = formatDateWithRelativeTime(cur.versionReleaseDate);
  const lver  = sanitize(lat.versionNumber);
  const lr    = formatDateWithRelativeTime(lat.versionReleaseDate);
  const updateText = diff==="none" ? "Up-to-date" : `Needs ${diff.toUpperCase()} update`;
  const cveText    = hasCve ? `\\nCVE: ${extractCveCode(version.latestCveVersion.versionUrl)}` : "";

  const label = `"${name}@${ver} \\nVersion: ${ver} \\nRelease: ${rdate} \\nLatest: ${name}@${lver} \\nLatest Release: ${lr} \\nUpdate: ${updateText}${cveText}"`;
  return `component ${label} #${fill.replace('#','')}`;
}

/* ---------- PlantUML transport ---------- */
function encodePlantUML(text) {
  const deflated = window.pako.deflateRaw(unescape(encodeURIComponent(text)), { level: 9 });
  return encode64(deflated);
}
function encode64(data) {
  let res = "";
  for (let i = 0; i < data.length; i += 3) {
    if (i+2 == data.length) res += append3bytes(data[i], data[i+1], 0);
    else if (i+1 == data.length) res += append3bytes(data[i], 0, 0);
    else res += append3bytes(data[i], data[i+1], data[i+2]);
  }
  return res;
}
function append3bytes(b1, b2, b3) {
  const c1 = b1 >> 2;
  const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
  const c3 = ((b2 & 0xF) << 2) | (b3 >> 6);
  const c4 = b3 & 0x3F;
  return encode6bit(c1 & 0x3F) + encode6bit(c2 & 0x3F) + encode6bit(c3 & 0x3F) + encode6bit(c4 & 0x3F);
}
function encode6bit(b) {
  if (b < 10) return String.fromCharCode(48 + b);
  b -= 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  return '?';
}

/* ---------- Render ---------- */
function renderDiagram(uml){
  const img = $id('ecosysImage');
  plantumlUrl = PLANTUML_SERVER + encodePlantUML(uml);
  img.src = plantumlUrl;
  img.onload = finishLoading;
  img.onerror = finishLoading;

  // pretty-code in modal
  $id("plantuml-code").innerHTML = formatPlantUML(uml);
  $id("copy-btn").setAttribute("data-code", uml);
}
function finishLoading(){
  const end = Date.now();
  const secs = ((end - startTime)/1000).toFixed(2);
  setText("generationTime", secs);
  const loader = $id('loader'); if (loader) loader.style.display = 'none';
  const timer  = $id('timer');  if (timer)  timer.style.display  = 'none';
  clearInterval(window.__timer);
}
function formatPlantUML(code){
  return code
    .replace(/(@startuml|@enduml|title|legend|endlegend|skinparam|package|component)/g, '<span class="kw">$1</span>')
    .replace(/package\s+"([^"]+)"/g, '<span class="kw">package</span> "<span class="pkg">$1</span>"')
    .replace(/component/g, '<span class="cmp">component</span>')
    .replace(/"([^"]*)"/g, '<span class="str">"$1"</span>')
    .replace(/\n/g,'<br/>');
}

/* ---------- Data load paths ---------- */
async function loadFromParamsAndRender(){
  // build internal links with RAW commas (no %2C)
  const q = currentComponents.join(',');
  const g = $id('toGraph'); if(g) g.href = '/graph?q=' + q;
  const f = $id('toFeed');  if(f) f.href = '/?q=' + q;

  // loader
  startTime = Date.now();
  const loader = $id('loader'); const timer = $id('timer'); const secsEl = $id('seconds');
  if (loader && timer){ let t=0; loader.style.display='block'; timer.style.display='block'; window.__timer = setInterval(()=>{ t++; secsEl.textContent=t; }, 1000); }

  try{
    const apiQuery = buildApiQueryFromComponents(currentComponents);
    const data = await fetchJSON(`${URL_API_ENDPOINT}/v/d/versionsByComponent?${apiQuery}`);
    renderFromVersions(data);
    $id('diagramTitle').textContent = 'Ecosystem Diagram';
  }catch(e){
    console.error(e);
    finishLoading();
  }
}

async function loadTodayAndRender(){
  // loader
  startTime = Date.now();
  const loader = $id('loader'); const timer = $id('timer'); const secsEl = $id('seconds');
  if (loader && timer){ let t=0; loader.style.display='block'; timer.style.display='block'; window.__timer = setInterval(()=>{ t++; secsEl.textContent=t; }, 1000); }

  try{
    const data = await fetchJSON(URL_UPDATED_TODAY);
    if(Array.isArray(data) && data.length){
      versions = data.map(c=>{
        const { name, latestVersion, currentVersion, latestCveVersion } = c;
        return { name, latestVersion, currentVersion: currentVersion || latestVersion, latestCveVersion };
      });
      currentComponents = uniq(versions.map(v=>v.name));
      refreshChips();

      const q = currentComponents.join(','); // raw commas
      const g = $id('toGraph'); if(g) g.href = '/graph?q=' + q;
      const f = $id('toFeed');  if(f) f.href = '/?q=' + q;

      const uml = buildEcosystemUml(versions);
      renderDiagram(uml);

      const { groupedStacks } = getStack(versions.map(v=>v.name));
      const sum = summarize(versions);
      setText("totalComponents", versions.length);
      setText("stackCount", groupedStacks.length);
      setText("cveCount", sum.cve);
      setText("majorCount", sum.major);
      setText("minorCount", sum.minor);
      setText("patchCount", sum.patch);
      setText("okCount", sum.ok);

      $id('detComponents').innerHTML = versions.map(v=>`• ${v.name}`).join('<br/>');
      $id('detStacks').innerHTML = groupedStacks.length
        ? groupedStacks.map(s=>`• ${s.stackName}: ${s.matchedComponents.join(', ')}`).join('<br/>')
        : 'None';

      $id('diagramTitle').textContent = "Today's Updated Components";
    }else{
      $id('diagramTitle').textContent = "No components updated today";
      finishLoading();
    }
  }catch(e){
    console.error('updatedToday fetch failed', e);
    $id('diagramTitle').textContent = "No components updated today";
    finishLoading();
  }
}

function renderFromVersions(data){
  if(!Array.isArray(data)){ finishLoading(); return; }
  versions = data.map(c=>{
    const { name, latestVersion, currentVersion, latestCveVersion } = c;
    return { name, latestVersion, currentVersion: currentVersion || latestVersion, latestCveVersion };
  });

  const uml = buildEcosystemUml(versions);
  renderDiagram(uml);

  const { groupedStacks } = getStack(versions.map(v=>v.name));
  const sum = summarize(versions);
  setText("totalComponents", versions.length);
  setText("stackCount", groupedStacks.length);
  setText("cveCount", sum.cve);
  setText("majorCount", sum.major);
  setText("minorCount", sum.minor);
  setText("patchCount", sum.patch);
  setText("okCount", sum.ok);

  $id('detComponents').innerHTML = versions.map(v=>`• ${v.name}`).join('<br/>');
  $id('detStacks').innerHTML = groupedStacks.length
    ? groupedStacks.map(s=>`• ${s.stackName}: ${s.matchedComponents.join(', ')}`).join('<br/>')
    : 'None';
}

/* ---------- Events / Modals / Copy / Config ---------- */
document.addEventListener('DOMContentLoaded', async ()=>{
  // init chips from URL (?q= or legacy ?component=)
  currentComponents = parseComponentsFromUrl();
  // If q is present but empty -> treat as no params
  const qParamPresentButEmpty = qs().has('q') && (qs().get('q')||'').trim() === '';
  if (qParamPresentButEmpty) currentComponents = [];

  refreshChips();
  wireChipInput();
  wireStackAdder();

  // dialogs
  $id('openMetrics').addEventListener('click', ()=> $id('metricsModal').style.display='flex');
  $id('openCode').addEventListener('click',    ()=> $id('codeModal').style.display='flex');
  $id('openDetails').addEventListener('click', ()=> $id('detailsModal').style.display='flex');
  $id('openConfig').addEventListener('click',  ()=>{
    $id('cfgApi').value = URL_API_ENDPOINT;
    $id('cfgPlant').value = PLANTUML_SERVER;
    $id('configModal').style.display='flex';
  });

  // modal close
  document.querySelectorAll('.modal').forEach(m=>{
    m.addEventListener('click',(e)=>{ if(e.target===m) m.style.display='none'; });
  });
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-close]');
    if(!btn) return;
    const sel = btn.getAttribute('data-close');
    const m = document.querySelector(sel);
    if (m) m.style.display = 'none';
  });

  // copy ecosystem image URL
  $id('copyLink').addEventListener('click', ()=>{
    if(!plantumlUrl){ return; }
    navigator.clipboard.writeText(plantumlUrl).then(()=> alert('Ecosystem image URL copied!'));
  });

  // copy code
  $id('copy-btn').addEventListener('click', ()=>{
    const uml = $id('copy-btn').getAttribute('data-code') || '';
    navigator.clipboard.writeText(uml).then(()=> alert('PlantUML code copied!'));
  });

  // config actions
  $id('cfgCopyApi').addEventListener('click', ()=>{
    navigator.clipboard.writeText(URL_API_ENDPOINT).then(()=> alert('API endpoint copied!'));
  });
  $id('cfgApplyPlant').addEventListener('click', ()=>{
    const v = $id('cfgPlant').value.trim();
    if(!v) return alert('Enter a PlantUML server URL (e.g. https://www.plantuml.com/plantuml/png/ )');
    PLANTUML_SERVER = v.endsWith('/') ? v : v + '/';
    // re-render using last code (strip formatting)
    const codeHtml = $id('plantuml-code').innerHTML;
    if(codeHtml){
      const codeText = codeHtml.replace(/<br\/?>/g,'\n').replace(/<[^>]+>/g,'');
      plantumlUrl = PLANTUML_SERVER + encodePlantUML(codeText);
      $id('ecosysImage').src = plantumlUrl;
    }
    alert('PlantUML server updated for this session.');
  });

  // decide source: ?q= / legacy ?component= OR updatedToday fallback
  if(currentComponents.length){
    // preload links with RAW commas
    const q = currentComponents.join(',');
    const g = $id('toGraph'); if(g) g.href = '/graph?q=' + q;
    const f = $id('toFeed');  if(f) f.href = '/?q=' + q;

    // show loader
    const loader = $id('loader'); const timer = $id('timer'); const secsEl = $id('seconds');
    if (loader && timer){ let t=0; loader.style.display='block'; timer.style.display='block'; window.__timer = setInterval(()=>{ t++; secsEl.textContent=t; }, 1000); }

    await loadFromParamsAndRender();
  }else{
    // /arch with no q or empty q -> today's components
    await loadTodayAndRender();
  }
});