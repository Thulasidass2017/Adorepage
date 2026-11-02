'use strict';
/* core.js – shared namespace, state, canvas, history, storage, zoom, grid */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PAGE = { w: 700, h: 900 };
const EDGE = { get l() { return App.box().l; }, get r() { return PAGE.w - S.guides.m; }, get c() { return PAGE.w / 2; } };
const PAPERS = { 'Default (700 × 900)': [700, 900], 'A3': [1123, 1587], 'A4': [794, 1123], 'A5': [559, 794], 'A6': [397, 559], 'B5': [665, 945], 'US Letter': [816, 1056], 'US Legal': [816, 1344], 'Tabloid': [1056, 1632],
  '5 × 8 in (book)': [480, 768], '5.5 × 8.5 in (book)': [528, 816], '6 × 9 in (book)': [576, 864], 'Square': [800, 800] };
// Custom props that must survive canvas.toJSON (the old version silently lost these)
const SERIAL = ['tocHeading', 'tocPage', 'isTable', 'tableData', 'styleName', 'tocLevel', 'tocText', 'isHF', 'originalLeft', 'originalWidth', 'forShape', 'uid', 'beforeSpace', 'afterSpace', 'marginClip', 'wrapStyle', 'wrapSide', 'wrapPad', 'noTextWrap', 'cropX', 'cropY'];

const App = {
  act: {},   // action registry: data-act="name" -> function(arg, el)
  mod: {},   // feature modules
  grid: null,
  S: {       // the whole persisted project
    pages: [], cur: 0, zoom: 1, hfEdit: false, gridOn: false, cols: 1, clip: null,
    guides: { showMargin: true, showBleed: true, m: 113.4, mL: 113.4, mLv: 3, same: true, bleed: 4.72 },   // same = all four margins are the same size   // m = top/right/bottom margin (3 cm), mL = left margin (3.5 cm: a little extra space on the left of every page)
    paper: { size: 'Default (700 × 900)', orient: 'portrait' },
    styles: [
      { id: 's-normal', name: 'Normal', level: 0, font: 'Poppins', size: 11, color: '#000000', bold: false, italic: false, before: 12, after: 12, line: 1.3, list: 'none', x: null, y: 246 },
      { id: 's-h1', name: 'Heading 1', level: 1, font: 'Poppins', size: 18, color: '#00006e', bold: true, italic: false, before: 12, after: 12, line: 1.2, list: 'heading1', x: null, y: 170 },
      { id: 's-h2', name: 'Heading 2', level: 2, font: 'Poppins', size: 16, color: '#00006e', bold: true, italic: false, before: 12, after: 12, line: 1.2, list: 'heading2', x: null, y: 205 },
      { id: 's-h3', name: 'Heading 3', level: 3, font: 'Poppins', size: 14, color: '#00006e', bold: true, italic: false, before: 12, after: 12, line: 1.2, list: 'heading3', x: null, y: 235 }
    ],
    hdr: { enabled: true, left: '', center: '', right: '', logo: ADORE_LOGO, logoH: 34, brand: true, pos: 'left', line: true },
    ftr: { enabled: true, left: 'My Document', logo: null, pos: 'left', line: true, pagePos: 'right' }
  }
};
const S = App.S;
const canvas = App.canvas = new fabric.Canvas('c', { width: PAGE.w, height: PAGE.h, backgroundColor: '#fff', preserveObjectStacking: true });
// the page can move on screen when panels / the top bar re-flow or the view scrolls; refresh Fabric's cached canvas position before every click so grabbing and resizing shapes always hits the right spot
['mousedown', 'mouseenter'].forEach(ev => canvas.upperCanvasEl.addEventListener(ev, () => canvas.calcOffset(), true));
document.addEventListener('scroll', () => canvas.calcOffset(), true);

App.status = m => { $('#status').textContent = m; };
App.setError = m => { const e = $('#err'); e.hidden = !m; e.textContent = m || ''; };
App.box = () => { const G = S.guides, m = G.m; return { l: G.mL ?? m, t: m, r: PAGE.w - m, b: PAGE.h - m }; };   // inside the margin (left margin can be wider)
App.pageOrient = () => (S.pages[S.cur] && S.pages[S.cur].orient) || S.paper.orient || 'portrait';
App.applyPaper = () => { const [w, h] = PAPERS[S.paper.size] || PAPERS['Default (700 × 900)']; [PAGE.w, PAGE.h] = App.pageOrient() === 'landscape' ? [h, w] : [w, h]; };
App.syncPaperUI = () => { $('#paperSize').value = S.paper.size; $$('[data-act=orient]').forEach(b => b.classList.toggle('orange', b.dataset.arg === App.pageOrient())); };
App.updateInfo = () => { $('#pageInfo').textContent = `Page ${S.cur + 1} of ${S.pages.length} · ${S.paper.size.split(' (')[0]} ${App.pageOrient()} · ${PAGE.w}×${PAGE.h}px`; };
App.setPaper = (size, orient) => {
  if (size) S.paper.size = size; if (orient) { if (S.pages[S.cur]) S.pages[S.cur].orient = orient; else S.paper.orient = orient; }
  App.applyPaper(); App.drawGrid(); App.mod.hf.draw(S.cur + 1); App.mod.wrap.relayout(true);
    App.mod.guides.refresh();
  App.syncPaperUI(); App.zoomFit(); App.updateInfo(); App.store.save();
};
App.active = () => canvas.getActiveObject();
App.isText = o => !!o && /^text(box)?$/.test(o.type);

/* ---- page <-> canvas ---- */
App.snapshot = () => { const j = JSON.parse(JSON.stringify(canvas.toJSON(SERIAL))); j.objects = j.objects.filter(o => !o.isHF); j.background = (S.pages[S.cur] && S.pages[S.cur].background) || canvas.backgroundColor || '#ffffff'; return j; };
App.saveCurPage = () => { if (S.pages[S.cur]) { S.pages[S.cur].json = App.snapshot(); S.pages[S.cur].orient = App.pageOrient(); S.pages[S.cur].background = S.pages[S.cur].background || canvas.backgroundColor || '#ffffff'; } };
App.showPage = i => new Promise(res => {
  S.cur = i;
  if (S.pages[i] && S.pages[i].orient) S.paper.orient = S.pages[i].orient;
  App.applyPaper();
  canvas.loadFromJSON(S.pages[i].json, async () => {
    const pageBg = (S.pages[i] && S.pages[i].background) || (S.pages[i].json && S.pages[i].json.background) || '#ffffff';
    canvas.setBackgroundColor(pageBg, canvas.renderAll.bind(canvas));
    if (S.pages[i]) S.pages[i].background = pageBg;
    App.grid = null; App.drawGrid();
    await App.mod.hf.draw(i + 1);
    App.mod.wrap.relayout(true);
    App.mod.guides.refresh();
    App.setZoom(S.zoom); App.mod.pages.renderList(); App.syncPaperUI(); App.updateInfo(); res();
  });
});

/* ---- history ---- */
App.hist = {
  stack: [], i: -1,
  push() {
    this.stack = this.stack.slice(0, this.i + 1);
    this.stack.push(JSON.stringify({ pages: S.pages, cur: S.cur, guides: S.guides }));   // margins are part of history, so Undo restores the left space too
    if (this.stack.length > 50) this.stack.shift();
    this.i = this.stack.length - 1;
  },
  go(d) {
    const n = this.i + d; if (n < 0 || n >= this.stack.length) return;
    this.i = n; const s = JSON.parse(this.stack[n]);
    S.pages = s.pages; if (s.guides) { S.guides = s.guides; App.mod.guides.syncUI(); } App.showPage(Math.min(s.cur, s.pages.length - 1));
  }
};

/* ---- storage ---- */
const KEY = 'ind_project_v2';
App.store = {
  save() { try { const { pages, cur, styles, hdr, ftr, guides, paper } = S; localStorage.setItem(KEY, JSON.stringify({ pages, cur, styles, hdr, ftr, guides, paper })); } catch (e) {} },
  load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (!d || !d.pages || !d.pages.length) return false; Object.assign(S, d); return true; }
    catch (e) { return false; }
  }
};
// One call replaces the old saveCurPage(); pushHistory(); saveAll(); triple
App.commit = msg => { App.saveCurPage(); App.hist.push(); App.store.save(); if (msg) App.status(msg); };

/* ---- zoom & grid ---- */
App.setZoom = z => {
  S.zoom = Math.max(0.2, Math.min(3, z));
  canvas.setZoom(S.zoom); canvas.setDimensions({ width: PAGE.w * S.zoom, height: PAGE.h * S.zoom });
  $('#zoomLabel').textContent = Math.round(S.zoom * 100) + '%';
};
App.drawGrid = () => {
  if (App.grid) { canvas.remove(App.grid); App.grid = null; }
  if (S.gridOn) {
    const ln = (p, major) => new fabric.Line(p, { stroke: major ? '#cbd5e1' : '#e5e7eb', strokeWidth: major ? 0.8 : 0.3 });
    const L = [];
    for (let x = 0; x <= PAGE.w; x += 20) L.push(ln([x, 0, x, PAGE.h], x % 100 === 0));
    for (let y = 0; y <= PAGE.h; y += 20) L.push(ln([0, y, PAGE.w, y], y % 100 === 0));
    App.grid = new fabric.Group(L, { selectable: false, evented: false, excludeFromExport: true, isGrid: true });
    canvas.add(App.grid); App.grid.sendToBack();
  }
  canvas.renderAll();
};

// Snap to the margin box and page centre
canvas.on('object:moving', e => {
  if (!$('#snapOn').checked || e.target.isHF) return;
  const o = e.target, w = o.getScaledWidth(), h = o.getScaledHeight(), t = 6 / S.zoom, b = App.box();
  [[o.left, b.l, v => o.set('left', v)], [o.left + w / 2, EDGE.c, v => o.set('left', v - w / 2)], [o.left + w, b.r, v => o.set('left', v - w)],
   [o.top, b.t, v => o.set('top', v)], [o.top + h / 2, PAGE.h / 2, v => o.set('top', v - h / 2)], [o.top + h, b.b, v => o.set('top', v - h)]]
    .forEach(([cur, target, set]) => { if (Math.abs(cur - target) < t) set(target); });
});
