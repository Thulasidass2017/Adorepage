'use strict';
/* guides.js – red margin + blue bleed overlay (all pages) and the over-the-line error check */
App.mod.guides = (() => {
  canvas.on('after:render', () => {   // overlay only: never saved, never exported
    const G = S.guides; if (!G.showMargin && !G.showBleed) return;
    const ctx = canvas.getContext(), b = App.box();
    ctx.save(); ctx.scale(S.zoom, S.zoom); ctx.lineWidth = 1 / S.zoom;
    // Bleed is shown by a red CSS outline outside the paper, not inside the page.
    if (G.showMargin) { ctx.strokeStyle = '#2563eb'; ctx.strokeRect(b.l, b.t, b.r - b.l, b.b - b.t); }
    ctx.restore();
  });

  // Smart guides: snap an object's left/center/right and top/middle/bottom to nearby objects.
  canvas.on('object:moving', e => {
    const o = e.target; if (!o || o.isHF || o.isGrid) return;
    const tol = 6 / Math.max(0.2, S.zoom), peers = canvas.getObjects().filter(p => p !== o && !p.isHF && !p.isGrid && p.visible !== false);
    const ow = o.getScaledWidth(), oh = o.getScaledHeight();
    const ox = [o.left, o.left + ow / 2, o.left + ow], oy = [o.top, o.top + oh / 2, o.top + oh];
    let bestX = null, bestY = null, dxBest = tol + 1, dyBest = tol + 1;
    peers.forEach(p => { const pw = p.getScaledWidth(), ph = p.getScaledHeight(), px = [p.left, p.left + pw / 2, p.left + pw], py = [p.top, p.top + ph / 2, p.top + ph];
      ox.forEach((x, xi) => px.forEach(v => { const d = v - x; if (Math.abs(d) < dxBest) { dxBest = Math.abs(d); bestX = d; } }));
      oy.forEach(y => py.forEach(v => { const d = v - y; if (Math.abs(d) < dyBest) { dyBest = Math.abs(d); bestY = d; } }));
    });
    if (bestX !== null) o.left += bestX; if (bestY !== null) o.top += bestY; o.setCoords();
  });

  // Any object (text box, image, shape, group) crossing the margin line or the bleed line is an error.
  // Text boxes additionally have their text outside the margin hidden.
  function check(o) {
    if (o.isHF || o.isGrid || o.tocPage || (o.selectable === false && o.evented === false)) { o.overMargin = o.overBleed = false; return; }
    const G = S.guides, B = G.bleed, m = App.box(), r = o.getBoundingRect(true, true), t = 0.5 + (o.strokeWidth || 0);   // fabric's bounding box always includes the object's strokeWidth (default 1px), so allow for it
    const out = (l, tp, rt, bt) => r.left < l - t || r.top < tp - t || r.left + r.width > rt + t || r.top + r.height > bt + t;
    o.overMargin = out(m.l, m.t, m.r, m.b);                 // errors are always checked – the Margin / Bleed boxes only show or hide the guide lines
    o.overBleed = out(B, B, PAGE.w - B, PAGE.h - B);
    if (o.type === 'textbox') {
      if (o.overMargin) o.clipPath = new fabric.Rect({ left: m.l, top: m.t, width: m.r - m.l, height: m.b - m.t, absolutePositioned: true, marginClip: true });
      else if (o.clipPath && o.clipPath.marginClip) o.clipPath = null;
      o.dirty = true;
    }
  }
  function checkAll() {
    const os = canvas.getObjects(); os.forEach(check);
    const nm = os.filter(o => o.overMargin).length, nb = os.filter(o => o.overBleed).length;
    const s = n => `${n} object${n > 1 ? 's' : ''}`;
    App.setError(nm || nb ? '⚠ ERROR: ' + [nm && `${s(nm)} over the margin line`, nb && `${s(nb)} over the bleed line`].filter(Boolean).join(' · ') : '');
  }
  const refresh = () => { checkAll(); canvas.requestRenderAll(); };
  ['object:moving', 'object:scaling', 'object:rotating', 'object:modified', 'object:added', 'object:removed', 'text:changed', 'selection:cleared', 'mouse:up'].forEach(ev => canvas.on(ev, checkAll));

  /* ---- left space: a wider left margin on every page; existing content is shifted along with it ---- */
  const DEFAULT_LEFT = 113.4;   // 3 cm – same as the other margins
  const pageSize = pg => { const [w, h] = PAPERS[S.paper.size] || PAPERS['Default (700 × 900)']; return ((pg && pg.orient) || S.paper.orient) === 'landscape' ? [h, w] : [w, h]; };
  function shiftPages(d) {   // data only (works before a page is on screen): move every object of every page by d px
    S.pages.forEach(pg => {
      const limit = pageSize(pg)[0] - S.guides.m;
      ((pg.json && pg.json.objects) || []).forEach(o => {
        if (o.isHF || o.isGrid || o.originX === 'right') return;   // right-anchored items (TOC page numbers) stay on the right margin
        o.left = (o.left || 0) + d;
        if (o.type === 'textbox') { const right = o.left + (o.width || 0) * (o.scaleX || 1); if (right > limit) o.width = Math.max(40, (limit - o.left) / (o.scaleX || 1)); }   // keep text inside the right margin
      });
    });
  }
  function setLeft(v, move = true) {
    v = Math.max(0, +v || 0); const old = App.box().l, d = v - old;
    App.saveCurPage(); S.guides.mL = v;
    if (move && d) shiftPages(d);
    $$('[data-gnum="mL"]').forEach(i => { i.value = v; });
    return App.showPage(S.cur).then(() => { App.commit(`Left space ${(v / 37.8).toFixed(1)} cm on all ${S.pages.length} page(s)` + (move && d ? ' – content moved' : '')); });
  }
  // projects without a left margin get the default left space once (and their content moves to fit it)
  function ensureLeft() {
    const G = S.guides;
    if (G.mL == null) { const d = DEFAULT_LEFT - G.m; G.mL = DEFAULT_LEFT; if (d) shiftPages(d); }
    else if (G.mLv !== 3) {   // earlier versions used a wider left margin by default (3.5 / 4 cm): make all margins the same size
      if (G.same === undefined) { const wide = Math.abs(G.mL - 132.3) < 0.01 || Math.abs(G.mL - 151.2) < 0.01; if (wide) { shiftPages(G.m - G.mL); G.mL = G.m; } G.same = Math.abs(G.mL - G.m) < 0.01; }
    }
    G.mLv = 3; if (G.same) G.mL = G.m;
  }

  function set(k, v) {
    S.guides[k] = v;
    if (k === 'm' && S.guides.same) { const mv = $('#moveContent'); setLeft(v, mv ? mv.checked : true); }   // same size on all sides: the left margin follows $$(`[data-guide="${k}"]`).forEach(c => { c.checked = v; });
    document.querySelectorAll('.canvas-container').forEach(el => { el.style.outline = S.guides.showBleed ? '2px solid #dc2626' : 'none'; });
    if (typeof v === 'number') App.mod.hf.draw(S.cur + 1);
    refresh(); App.store.save();
  }
  function syncUI() {
    ['showMargin', 'showBleed'].forEach(k => $$(`[data-guide="${k}"]`).forEach(c => { c.checked = S.guides[k]; }));
    $$('[data-gnum]').forEach(i => { i.value = S.guides[i.dataset.gnum] ?? S.guides.m; });
    const sm = $('#sameMargin'); if (sm) { sm.checked = !!S.guides.same; $('#leftSpace').disabled = !!S.guides.same; }
  }
  return { set, setLeft, ensureLeft, shiftPages, refresh, checkAll, syncUI, DEFAULT_LEFT };
})();
