'use strict';
/* wrap.js – image border, text wrap + space around image, wrap inside a shape, include all in one shape, layout dialog */
App.mod.wrap = (() => {
  const STYLES = [['inline', 'In line'], ['square', 'Square'], ['tight', 'Tight'], ['through', 'Through'], ['topbottom', 'Top/bottom'], ['behind', 'Behind'], ['front', 'In front']];
  const CM = 37.8, DEF = { t: 10, r: 10, b: 10, l: 10 }, FIELDS = { t: 'distTop', r: 'distRight', b: 'distBottom', l: 'distLeft' };
  let style = 'inline';
  const imageOnly = () => { const o = App.active(); if (o && o.type === 'image') return o; App.status('Select an image first'); return null; };
  const padOf = img => ({ ...DEF, ...(img.wrapPad || {}) });

  /* ---- border (fabric's own stroke) ---- */
  function border(w, color, kind) {
    const img = imageOnly(); if (!img) return; w = +w || 0;
    img.set({ stroke: color, strokeWidth: w, strokeUniform: true, strokeDashArray: kind === 'dashed' ? [8, 4] : kind === 'dotted' ? [2, 4] : null });
    canvas.renderAll(); App.commit(`IMAGE BORDER: ${w}px ${kind}`);
  }
  const borderFromForm = () => border($('#borderW').value, $('#borderColor').value, $('#borderStyle').value);
  function borderPreset(arg) { const [w, c, k] = arg.split(','); $('#borderW').value = w; $('#borderColor').value = c; $('#borderStyle').value = k; $('#borderWVal').textContent = w; border(w, c, k); }

  /* ---- text wrap with space (top/right/bottom/left) around the image ----
     The image only stores its wrap settings; the text boxes (paragraph.js) lay their lines out around it. */
  const PUSH = ['square', 'tight', 'topbottom'];
  function relayout(force, cv = canvas) {
    const os = cv.getObjects();
    if (!force && !os.some(o => (o.type === 'image' && PUSH.includes(o.wrapStyle)) || o._rowFlags)) return;
    os.forEach(o => { if (o.type === 'textbox' && !o.isHF && !o.isEditing) { o.initDimensions(); o.setCoords(); o.dirty = true; } });
    cv.requestRenderAll();
  }
  ['object:moving', 'object:scaling', 'object:modified', 'object:removed'].forEach(ev => canvas.on(ev, () => relayout()));

  function apply(s, side, commit = true) {
    const img = imageOnly(); if (!img) return;
    s = s || img.wrapStyle || 'inline'; side = side || img.wrapSide || 'both'; style = s;
    img.set({ wrapStyle: s, wrapSide: side, wrapPad: padOf(img), opacity: s === 'behind' ? 0.5 : s === 'through' ? 0.85 : 1 });
    canvas.getObjects().filter(t => t.originalLeft !== undefined).forEach(t => { t.set({ left: t.originalLeft, width: t.originalWidth }); t.originalLeft = t.originalWidth = undefined; });   // old-version leftovers
    if (s === 'behind') { canvas.sendToBack(img); if (App.grid) App.grid.sendToBack(); } else if (s !== 'inline') canvas.bringToFront(img);
    relayout(true); canvas.renderAll(); if (commit) App.commit(`WRAP: ${s.toUpperCase()}`);
  }
  function setPad(side, v, live) {
    const img = imageOnly(); if (!img) return;
    img.set('wrapPad', { ...padOf(img), [side]: Math.max(0, +v || 0) }); apply(null, null, !live);
  }

  /* ---- shapes ---- */
  const isShape = o => ['rect', 'circle', 'triangle', 'polygon', 'ellipse'].includes(o.type) && !o.isHF && !o.isGrid;
  const inner = (shape, pad = 12) => {
    const w = shape.getScaledWidth(), h = shape.getScaledHeight(), round = shape.type === 'circle' || shape.type === 'ellipse', k = round ? 0.15 : 0;
    return { l: shape.left + w * k + pad, t: shape.top + h * k + pad, w: w * (1 - 2 * k) - 2 * pad, h: h * (1 - 2 * k) - 2 * pad };
  };
  function inside() {
    const sel = canvas.getActiveObjects(); let shape = sel.find(isShape); const text = sel.find(App.isText);
    if (!shape && text) shape = canvas.getObjects().slice().reverse().find(o => isShape(o) && o.left <= text.left && o.left + o.getScaledWidth() >= text.left + text.getScaledWidth() / 2);
    if (!shape || !text) return App.status('Select one shape and one text box (Ctrl+click)');
    const b = inner(shape); canvas.discardActiveObject();
    text.set({ originX: 'left', originY: 'top', textAlign: 'left', left: b.l, top: b.t, width: b.w }); text.setCoords();
    canvas.setActiveObject(text); canvas.renderAll(); App.commit('TEXT WRAPPED INSIDE SHAPE');
  }
  function resetInside() {
    const o = App.active(); if (!App.isText(o)) return App.status('Select a text box first');
    o.set({ left: App.box().l, top: 150, width: 360 }); canvas.renderAll(); App.commit('TEXT RESET');
  }

  /* all selected objects (text, images, shapes) are fitted into ONE shape and move with it */
  function contain() {
    const sel = canvas.getActiveObjects().filter(o => !o.isHF);
    let shape = sel.find(isShape); const kids = sel.filter(o => o !== shape);
    if (!kids.length) return App.status('Select the objects to include (Ctrl+click), plus an optional shape');
    canvas.discardActiveObject();
    if (!shape) {   // no shape selected: build one around the selection
      const L = Math.min(...kids.map(o => o.left)) - 16, T = Math.min(...kids.map(o => o.top)) - 16;
      shape = new fabric.Rect({ left: L, top: T, fill: '#f1f5f9', stroke: '#2563eb', strokeWidth: 2,
        width: Math.max(...kids.map(o => o.left + o.getScaledWidth())) + 16 - L, height: Math.max(...kids.map(o => o.top + o.getScaledHeight())) + 16 - T });
      canvas.add(shape); shape.sendToBack(); if (App.grid) App.grid.sendToBack();
    }
    shape.uid = shape.uid || 'sh' + Date.now().toString(36);
    const b = inner(shape);
    kids.forEach(o => {
      o.forShape = shape.uid;
      if (App.isText(o)) o.set({ originX: 'left', originY: 'top', width: Math.min(o.width * (o.scaleX || 1), b.w), scaleX: 1, scaleY: 1 });
      else { if (o.getScaledWidth() > b.w) o.scaleToWidth(b.w); if (o.getScaledHeight() > b.h) o.scaleToHeight(b.h); }
      o.set({ left: Math.min(Math.max(o.left, b.l), b.l + Math.max(0, b.w - o.getScaledWidth())), top: Math.min(Math.max(o.top, b.t), b.t + Math.max(0, b.h - o.getScaledHeight())) });
      o.setCoords();
    });
    canvas.renderAll(); App.commit(`${kids.length} object(s) included in one shape – they move with it`);
  }
  canvas.on('mouse:down', e => {
    const t = e.target; if (!t || !t.uid) return;
    t._from = { l: t.left, t: t.top }; t._kids = canvas.getObjects().filter(o => o.forShape === t.uid).map(c => ({ c, l: c.left, t: c.top }));
  });
  canvas.on('object:moving', e => {
    const t = e.target; if (!t || !t._kids) return;
    const dx = t.left - t._from.l, dy = t.top - t._from.t;
    t._kids.forEach(k => { k.c.set({ left: k.l + dx, top: k.t + dy }); k.c.setCoords(); });
  });
  canvas.on('mouse:up', () => canvas.getObjects().forEach(o => { o._kids = null; }));

  /* ---- layout dialog ---- */
  function pickStyle(s) { style = s; $$('.wrapItem').forEach(e => e.classList.toggle('active', e.dataset.arg === s)); }
  function openDialog() {
    const img = imageOnly(); if (!img) return; const p = padOf(img);
    Object.entries(FIELDS).forEach(([k, id]) => { $('#' + id).value = (p[k] / CM).toFixed(2); });
    $('#layoutDialog').hidden = false; pickStyle(img.wrapStyle || style);
  }
  const closeDialog = () => { $('#layoutDialog').hidden = true; };
  function applyDialog() {
    const img = imageOnly(); if (!img) return;
    const p = {}; Object.entries(FIELDS).forEach(([k, id]) => { p[k] = Math.round((+$('#' + id).value || 0) * CM); });
    img.set('wrapPad', p); closeDialog(); apply(style, ($('input[name=wrapSide]:checked') || {}).value || 'both'); App.ui.showProps(img);
  }
  const buildUI = () => {
    $('#wrapGrid').innerHTML = STYLES.map(([k, n]) => `<div class="wrapItem" data-act="pickStyle" data-arg="${k}">${n}</div>`).join('');
    $('#wrapBtns').innerHTML = STYLES.map(([k, n]) => `<button class="btn" data-act="wrapStyle" data-arg="${k}">${n}</button>`).join('');
  };
  return { relayout, border, borderFromForm, borderPreset, apply, setPad, inside, resetInside, contain, openDialog, closeDialog, applyDialog, pickStyle, buildUI };
})();
