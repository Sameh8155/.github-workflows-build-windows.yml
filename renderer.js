'use strict';

const $ = (id) => document.getElementById(id);
const video = $('video');
const CHUNK = 200;

const ARAB = ['sa', 'eg', 'ae', 'qa', 'kw', 'bh', 'om', 'jo', 'lb', 'sy', 'iq',
  'ye', 'ps', 'ma', 'dz', 'tn', 'ly', 'sd', 'mr', 'so', 'dj', 'km'];

const GROUP_NAMES = {
  General: 'عام', News: 'أخبار', Sports: 'رياضة', Movies: 'أفلام', Series: 'مسلسلات',
  Kids: 'أطفال', Religious: 'ديني', Music: 'موسيقى', Entertainment: 'ترفيه',
  Documentary: 'وثائقي', Education: 'تعليم', Comedy: 'كوميديا', Culture: 'ثقافة',
  Lifestyle: 'نمط حياة', Shop: 'تسوق', Business: 'أعمال', Animation: 'رسوم متحركة',
  Classic: 'كلاسيكي', Outdoor: 'طبيعة', Travel: 'سفر', Family: 'عائلة', Cooking: 'طبخ',
  Auto: 'سيارات', Legislative: 'برلمان', Undefined: 'غير مصنف'
};

let builtin = [];
let custom = [];
let all = [];
let shown = [];
let country = '';
let group = '';
let query = '';
let currentCh = null;
let hls = null;
let playToken = 0;
let rendered = 0;
let searchTimer = null;
let statusTimer = null;

// PARSER-START
function parseM3U(text, isCustom) {
  const out = [];
  let name = '';
  let grp = 'Undefined';
  let country = '';
  let ua = null;
  let ref = null;
  let pending = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      pending = true;
      ua = null;
      ref = null;
      country = '';
      let g = 'Undefined';
      const q = line.lastIndexOf('"');
      const c = line.indexOf(',', q >= 0 ? q : 0);
      name = c >= 0 ? line.slice(c + 1).trim() : '';
      for (const m of line.matchAll(/([\w-]+)="([^"]*)"/g)) {
        const k = m[1];
        const v = m[2];
        if (k === 'group-title') g = v;
        else if (k === 'http-user-agent') ua = v;
        else if (k === 'http-referrer' || k === 'http-referer') ref = v;
        else if (k === 'tvg-id') {
          const base = v.split('@')[0];
          const i = base.lastIndexOf('.');
          country = i >= 0 ? base.slice(i + 1).toLowerCase() : '';
        }
      }
      grp = g || 'Undefined';
    } else if (line.startsWith('#EXTVLCOPT:')) {
      const kv = line.slice(11);
      const i = kv.indexOf('=');
      if (i > 0) {
        const k = kv.slice(0, i).toLowerCase();
        const v = kv.slice(i + 1);
        if (k === 'http-user-agent') ua = v;
        else if (k === 'http-referrer' || k === 'http-referer') ref = v;
      }
    } else if (line.startsWith('#')) {
      // other directive
    } else if (pending || /^https?:\/\//i.test(line)) {
      out.push({
        name: name || line,
        url: line,
        group: grp,
        country: isCustom ? 'custom' : (country || '?'),
        ua: ua,
        ref: ref,
        custom: !!isCustom
      });
      pending = false;
      name = '';
    }
  }
  return out;
}
// PARSER-END

const regionNames = (() => {
  try { return new Intl.DisplayNames(['ar'], { type: 'region' }); } catch (e) { return null; }
})();

function countryName(code) {
  if (code === '?' || !code) return 'غير محدد';
  if (code === 'custom') return 'قنواتي';
  try {
    const r = regionNames && regionNames.of(code === 'uk' ? 'GB' : code.toUpperCase());
    return r || code.toUpperCase();
  } catch (e) {
    return code.toUpperCase();
  }
}

function groupName(g) { return GROUP_NAMES[g] || g; }

function fillSelect(sel, items, current) {
  sel.innerHTML = '';
  for (const it of items) {
    const o = document.createElement('option');
    o.value = it.value;
    o.textContent = it.label;
    sel.appendChild(o);
  }
  sel.value = current;
  return sel.value;
}

function buildCountries() {
  const counts = new Map();
  for (const c of all) counts.set(c.country, (counts.get(c.country) || 0) + 1);
  const rank = (code) => (code === 'custom' ? 0 : ARAB.includes(code) ? 1 : 2);
  const codes = [...counts.keys()].sort((a, b) =>
    rank(a) - rank(b) || counts.get(b) - counts.get(a) || a.localeCompare(b));
  const items = [{ value: '', label: `كل الدول (${all.length})` }];
  for (const c of codes) items.push({ value: c, label: `${countryName(c)} (${counts.get(c)})` });
  country = fillSelect($('country'), items, country);
}

function buildGroups() {
  const counts = new Map();
  let total = 0;
  for (const c of all) {
    if (country && c.country !== country) continue;
    total++;
    counts.set(c.group, (counts.get(c.group) || 0) + 1);
  }
  const keys = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const items = [{ value: '', label: `كل التصنيفات (${total})` }];
  for (const k of keys) items.push({ value: k, label: `${groupName(k)} (${counts.get(k)})` });
  group = fillSelect($('group'), items, group);
}

function apply() {
  const q = query.trim().toLowerCase();
  shown = all.filter((c) =>
    (!country || c.country === country) &&
    (!group || c.group === group) &&
    (!q || c.name.toLowerCase().includes(q)));
  $('count').textContent = `${shown.length} قناة`;
  const list = $('list');
  list.innerHTML = '';
  list.scrollTop = 0;
  rendered = 0;
  renderMore();
}

function isPlaying(ch) { return currentCh && ch.url === currentCh.url; }

function makeItem(ch) {
  const d = document.createElement('div');
  d.className = 'item' + (isPlaying(ch) ? ' playing' : '');
  d.dataset.url = ch.url;
  const n = document.createElement('span');
  n.className = 'name';
  n.textContent = ch.name;
  d.appendChild(n);
  if (ch.custom) {
    const x = document.createElement('button');
    x.className = 'del';
    x.textContent = '✕';
    x.title = 'حذف';
    x.onclick = (e) => { e.stopPropagation(); removeCustom(ch); };
    d.appendChild(x);
  }
  d.onclick = () => play(ch);
  return d;
}

function renderMore() {
  const frag = document.createDocumentFragment();
  const end = Math.min(rendered + CHUNK, shown.length);
  for (let i = rendered; i < end; i++) frag.appendChild(makeItem(shown[i]));
  rendered = end;
  $('list').appendChild(frag);
}

function markPlaying() {
  for (const el of $('list').children) {
    el.classList.toggle('playing', !!currentCh && el.dataset.url === currentCh.url);
  }
}

function rebuild() {
  all = custom.map((c) => ({ ...c, country: 'custom', custom: true })).concat(builtin);
  buildCountries();
  buildGroups();
  apply();
}

function showStatus(text, ms) {
  const s = $('status');
  s.textContent = text;
  s.style.display = 'block';
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { s.style.display = 'none'; }, ms);
}

function hideStatus() {
  clearTimeout(statusTimer);
  $('status').style.display = 'none';
}

function destroyHls() {
  if (hls) { try { hls.destroy(); } catch (e) { /* ignore */ } hls = null; }
}

function startHls(url, token) {
  hls = new Hls({ maxBufferLength: 30 });
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    if (token === playToken) video.play().catch(() => {});
  });
  hls.on(Hls.Events.ERROR, (_e, data) => {
    if (token !== playToken || !data.fatal) return;
    destroyHls();
    playDirect(url, token);
  });
  hls.loadSource(url);
  hls.attachMedia(video);
}

function playDirect(url, token) {
  video.onerror = () => {
    if (token === playToken) showStatus('تعذّر تشغيل هذه القناة');
  };
  video.src = url;
  video.play().catch(() => {});
}

async function play(ch) {
  const token = ++playToken;
  currentCh = ch;
  markPlaying();
  showStatus(ch.name + ' ...');
  destroyHls();
  video.onerror = null;
  video.pause();
  video.removeAttribute('src');
  video.load();
  await window.api.setHeaders(ch.ua || null, ch.ref || null);
  if (token !== playToken) return;
  const looksDirect = /\.(mp4|webm|mkv|mp3|aac|m4a)(\?|$)/i.test(ch.url);
  if (!looksDirect && window.Hls && Hls.isSupported()) startHls(ch.url, token);
  else playDirect(ch.url, token);
}

function step(delta) {
  if (!shown.length) return;
  const cur = currentCh ? shown.findIndex((c) => c.url === currentCh.url) : -1;
  const next = cur < 0 ? 0 : (cur + delta + shown.length) % shown.length;
  while (rendered <= next && rendered < shown.length) renderMore();
  play(shown[next]);
  const el = $('list').children[next];
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('stage').requestFullscreen();
}

async function saveCustom() { await window.api.saveCustom(custom); }

async function removeCustom(ch) {
  custom = custom.filter((c) => !(c.url === ch.url && c.name === ch.name));
  await saveCustom();
  rebuild();
}

function msg(t) { $('msg').textContent = t; }

async function addParsed(text) {
  const list = parseM3U(text, true);
  if (!list.length) { msg('ما لقيتش قنوات في القائمة دي'); return; }
  const have = new Set(custom.map((c) => c.url));
  let n = 0;
  for (const c of list) {
    if (have.has(c.url)) continue;
    have.add(c.url);
    custom.push({
      name: c.name,
      url: c.url,
      group: c.group === 'Undefined' ? 'قنواتي' : c.group,
      ua: c.ua,
      ref: c.ref
    });
    n++;
  }
  await saveCustom();
  rebuild();
  msg(`تمت إضافة ${n} قناة`);
}

// ---- events ----
$('country').onchange = (e) => { country = e.target.value; group = ''; buildGroups(); apply(); };
$('group').onchange = (e) => { group = e.target.value; apply(); };
$('search').oninput = (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { query = e.target.value; apply(); }, 150);
};
$('list').onscroll = (e) => {
  const l = e.target;
  if (l.scrollTop + l.clientHeight > l.scrollHeight - 400 && rendered < shown.length) renderMore();
};
video.addEventListener('playing', hideStatus);
video.addEventListener('waiting', () => showStatus('جاري التحميل...'));
video.addEventListener('dblclick', toggleFullscreen);

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if ($('dlg').open) return;
  if (e.key === 'ArrowUp') { step(-1); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { step(1); e.preventDefault(); }
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

$('addBtn').onclick = () => { msg(''); $('dlg').showModal(); };
$('closeDlg').onclick = () => $('dlg').close();

$('saveCh').onclick = async () => {
  const name = $('chName').value.trim();
  const url = $('chUrl').value.trim();
  if (!/^https?:\/\//i.test(url)) { msg('الرابط لازم يبدأ بـ http أو https'); return; }
  custom.unshift({
    name: name || url,
    url: url,
    group: $('chGroup').value.trim() || 'قنواتي',
    ua: $('chUa').value.trim() || null,
    ref: $('chRef').value.trim() || null
  });
  await saveCustom();
  rebuild();
  for (const id of ['chName', 'chUrl', 'chGroup', 'chUa', 'chRef']) $(id).value = '';
  msg('تمت إضافة القناة (هتلاقيها في "قنواتي")');
};

$('loadUrl').onclick = async () => {
  const url = $('plUrl').value.trim();
  if (!/^https?:\/\//i.test(url)) { msg('اكتب رابط القائمة الأول'); return; }
  msg('جاري التحميل...');
  const r = await window.api.fetchPlaylist(url);
  if (!r.ok) { msg('فشل التحميل: ' + r.error); return; }
  await addParsed(r.text);
};

$('loadFile').onclick = async () => {
  const r = await window.api.openPlaylistFile();
  if (!r) return;
  if (!r.ok) { msg('فشل فتح الملف: ' + r.error); return; }
  await addParsed(r.text);
};

async function init() {
  const text = await window.api.loadBuiltin();
  builtin = parseM3U(text, false);
  custom = await window.api.loadCustom();
  rebuild();
}

init().catch((e) => showStatus('خطأ: ' + e.message));
