'use strict';
/* objects.js – insert, clipboard, text formatting, align/order, styles */
App.mod.obj = (() => {
  const SHAPES = {
    rect: p => new fabric.Rect({ ...p, width: 200, height: 130, fill: '#dbeafe', stroke: '#2563eb' }),
    circle: p => new fabric.Circle({ ...p, radius: 70, fill: '#fef3c7', stroke: '#d97706' }),
    triangle: p => new fabric.Triangle({ ...p, width: 120, height: 120, fill: '#dcfce7', stroke: '#16a34a' }),
    diamond: p => new fabric.Polygon([{ x: 60, y: 0 }, { x: 120, y: 60 }, { x: 60, y: 120 }, { x: 0, y: 60 }], { ...p, fill: '#fef9c3', stroke: '#ca8a04' })
  };
  const jitter = () => ({ left: App.box().l + Math.random() * 40, top: 160 + Math.random() * 60, strokeWidth: 2 });

  function numberingText(txt, st) {
    const mode = st && st.list || 'none'; if (!mode || mode === 'none') return txt;
    if (mode === 'bullet') return '• ' + txt;
    const saved = S.pages.flatMap((p, i) => i === S.cur ? [] : (p.json && p.json.objects || []).map(o => ({ ...o, _page: i })));
    const live = canvas.getObjects().filter(o => !o.isHF).map(o => ({ ...o.toObject(['styleName','listStyle','tocLevel']), _page: S.cur }));
    const all = [...saved, ...live].filter(o => o.type === 'textbox' || o.type === 'text');
    if (mode === 'number') return `${all.filter(o => o.listStyle === 'number').length + 1}. ${txt}`;
    let chapter = 0, sub = 0, third = 0;
    all.forEach(o => {
      if (o.listStyle === 'heading1') { chapter++; sub = 0; third = 0; }
      else if (o.listStyle === 'heading2') { if (!chapter) chapter = 1; sub++; third = 0; }
      else if (o.listStyle === 'heading3') { if (!chapter) chapter = 1; if (!sub) sub = 1; third++; }
    });
    if (mode === 'heading1') return `${chapter + 1}. ${txt}`;
    if (mode === 'heading2') { if (!chapter) chapter = 1; return `${chapter}.${sub + 1} ${txt}`; }
    if (mode === 'heading3') { if (!chapter) chapter = 1; if (!sub) sub = 1; return `${chapter}.${sub}.${third + 1} ${txt}`; }
    return txt;
  }
  function makeText(txt, styleName, x, y, w) {
    const st = S.styles.find(s => s.name === styleName) || S.styles[0];
    txt = numberingText(txt, st);
    return new fabric.Textbox(txt, {
      left: x, top: y, width: w || 360,
      ...styleProps(st), tocText: txt.split('\n')[0].substring(0, 70), listStyle: st.list || 'none'
    });
  }
  // text box in a style without automatic heading numbering (used when importing a document)
  function makeRaw(txt, styleName, x, y, w) {
    const st = S.styles.find(s => s.name === styleName) || S.styles[0];
    return new fabric.Textbox(txt, { left: x, top: y, width: w || 360, ...styleProps(st), tocText: txt.split('\n')[0].substring(0, 70), listStyle: 'none' });
  }
  function place(o) { canvas.add(o).setActiveObject(o); canvas.renderAll(); App.commit(); App.ui.showProps(o); }
  const edit = (fn, commit = true) => { const o = App.active(); if (o) { fn(o); o.setCoords(); canvas.renderAll(); if (commit) App.commit(); App.mod.guides.checkAll(); } };

  /* ---- insert ---- */
  const addText = () => { const st = S.styles.find(s => s.name === 'Heading 1'); place(makeText('My Heading – edit me', 'Heading 1', st?.x ?? App.box().l, st?.y ?? 170, App.box().r - (st?.x ?? App.box().l))); };
  const addShape = k => place(SHAPES[k](jitter()));
  const addImage = url => fabric.Image.fromURL(url, img => { img.set({ left: App.box().l, top: 150, wrapStyle: 'square', wrapSide: 'both', wrapPad: { t: 10, r: 10, b: 10, l: 10 } }); img.scaleToWidth(260); place(img); App.mod.wrap.relayout(true); App.commit(); });
  /* ---- lists: turn the lines of the selected text box into a bullet list or a numbered list (press again to remove) ---- */
  const BUL = /^\s*[•\-*–]\s+/, NUM = /^\s*\d+[.)]\s+/;
  function listify(kind) {
    const o = App.active();
    if (!o || !/textbox|i-text/.test(o.type)) return App.status('Select a text box first');
    const lines = String(o.text).split('\n'), real = lines.filter(l => l.trim());
    if (!real.length) return App.status('The text box is empty');
    const has = kind === 'bullet' ? BUL : NUM, on = real.every(l => has.test(l)), strip = l => l.replace(BUL, '').replace(NUM, '');
    let n = 0;
    const out = lines.map(l => !l.trim() ? l : on ? strip(l) : (kind === 'bullet' ? '• ' : `${++n}. `) + strip(l));
    o.set({ text: out.join('\n'), listStyle: on ? 'none' : kind }); o.setCoords(); canvas.renderAll(); App.mod.guides.checkAll(); App.commit(on ? 'List removed' : kind === 'bullet' ? 'Bullet list' : 'Numbered list');
  }

  /* ---- columns: split the selected text box into N side-by-side boxes with balanced heights (or insert empty column boxes) ---- */
  function makeColumns() {
    const n = Math.max(1, S.cols || 1), gap = 20, b = App.box(), src = App.active();
    const isText = src && /textbox/.test(src.type) && String(src.text).trim();
    const left = isText ? src.left : b.l, total = isText ? Math.max(120, src.getScaledWidth()) : b.r - b.l, w = (total - (n - 1) * gap) / n, top = isText ? src.top : b.t + 40;
    if (!isText) {   // nothing selected: empty column boxes
      for (let i = 0; i < n; i++) canvas.add(makeText(n === 1 ? 'Single column – type here.' : `Column ${i + 1} of ${n} – type here.`, 'Normal', left + i * (w + gap), top, w));
      canvas.renderAll(); App.commit(`${n} column box(es) added`); return;
    }
    const keep = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fill', 'textAlign', 'lineHeight', 'beforeSpace', 'afterSpace', 'styleName', 'tocLevel', 'listStyle', 'underline', 'charSpacing'];
    const props = Object.fromEntries(keep.map(k => [k, src[k]]));
    const mk = (t, x) => new fabric.Textbox(t, { ...props, left: x, top, width: w, tocText: String(t).split('\n')[0].substring(0, 70) });
    const tokens = String(src.text).match(/\S+\s*/g) || [String(src.text)];
    const full = mk(tokens.join(''), 0).height, target = full / n;
    let at = 0; const chunks = [];
    for (let c = 0; c < n; c++) {
      if (c === n - 1) { chunks.push(tokens.slice(at).join('')); break; }
      let lo = at + 1, hi = tokens.length - (n - 1 - c);                        // largest chunk whose height still fits the target
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; mk(tokens.slice(at, mid).join(''), 0).height <= target ? lo = mid : hi = mid - 1; }
      chunks.push(tokens.slice(at, lo).join('')); at = lo;
    }
    canvas.remove(src); canvas.discardActiveObject();
    chunks.forEach((t, i) => canvas.add(mk(t.replace(/\s+$/, ''), left + i * (w + gap))));
    canvas.renderAll(); App.mod.guides.checkAll(); App.commit(`Text split into ${n} column${n > 1 ? 's' : ''}`);
  }

  /* ---- clipboard / delete ---- */
  const copy = () => { const o = App.active(); o ? o.clone(c => { S.clip = c; App.status('COPIED'); }, SERIAL) : App.status('Select an object first'); };
  const paste = () => S.clip ? S.clip.clone(c => { c.set({ left: c.left + 20, top: c.top + 20, isHF: false }); place(c); }, SERIAL) : App.status('Nothing copied');
  const del = () => { const o = App.active(); if (!o) return App.status('Select an object first'); canvas.remove(...canvas.getActiveObjects()); canvas.discardActiveObject(); canvas.renderAll(); App.commit(); };

  /* ---- properties ---- */
  const setProp = (k, v, live) => edit(ob => ob.set(k, v), !live);   // live = slider drag, committed on release
  const toggle = k => edit(o => {
    if (k === 'bold') o.set('fontWeight', o.fontWeight === 'bold' ? 'normal' : 'bold');
    if (k === 'italic') o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic');
    if (k === 'underline') o.set('underline', !o.underline);
  });
  const align = a => edit(o => o.set('textAlign', a));

  /* ---- arrange ---- */
  function alignObj(type) {
    const objs = canvas.getActiveObjects(); if (!objs.length) return App.status('Select an object first');
    canvas.discardActiveObject();               // makes left/top absolute again
    const b = objs.length === 1 ? App.box() : {
      l: Math.min(...objs.map(o => o.left)), r: Math.max(...objs.map(o => o.left + o.getScaledWidth())),
      t: Math.min(...objs.map(o => o.top)), b: Math.max(...objs.map(o => o.top + o.getScaledHeight())) };
    objs.forEach(o => {
      const w = o.getScaledWidth(), h = o.getScaledHeight();
      ({ left: () => o.set('left', b.l), right: () => o.set('left', b.r - w), centerH: () => o.set('left', (b.l + b.r) / 2 - w / 2),
         top: () => o.set('top', b.t), bottom: () => o.set('top', b.b - h), centerV: () => o.set('top', (b.t + b.b) / 2 - h / 2) })[type]();
      o.setCoords();
    });
    canvas.setActiveObject(objs.length > 1 ? new fabric.ActiveSelection(objs, { canvas }) : objs[0]);
    canvas.renderAll(); App.commit();
  }

  /* ---- distribute (InDesign-style "Align & Distribute"): spread 3+ selected objects evenly ----
     edges / centres : the first and last objects stay, the ones between are spaced so the chosen edge/centre is evenly stepped
     space           : the empty gap between objects is made equal (or set to the fixed gap typed in the Distribute box)  */
  function distribute(type) {
    const objs = canvas.getActiveObjects().filter(o => !o.isHF && !o.isGrid);
    const gapIn = $('#distGapPx') ? $('#distGapPx').value : '', fixed = gapIn !== '' && Number.isFinite(+gapIn) ? Math.max(0, +gapIn) : null;
    const isSpace = /^space/.test(type), need = isSpace && fixed !== null ? 2 : 3;
    if (objs.length < need) return App.status(`Select at least ${need} objects (Shift+click or drag a box) to distribute`);
    canvas.discardActiveObject();                                     // makes left/top absolute again
    const H = /H$/.test(type) || /^(left|centerH|right)$/.test(type) ? true : false;
    const pos = o => H ? o.left : o.top, size = o => H ? o.getScaledWidth() : o.getScaledHeight(), put = (o, v) => o.set(H ? 'left' : 'top', v);
    const key = { left: o => pos(o), top: o => pos(o), centerH: o => pos(o) + size(o) / 2, centerV: o => pos(o) + size(o) / 2, right: o => pos(o) + size(o), bottom: o => pos(o) + size(o) }[type];
    const sorted = objs.slice().sort((a, b) => (isSpace ? pos(a) : key(a)) - (isSpace ? pos(b) : key(b)));
    const n = sorted.length;
    if (isSpace) {
      const first = sorted[0], last = sorted[n - 1], span = pos(last) + size(last) - pos(first), total = sorted.reduce((a, o) => a + size(o), 0);
      const gap = fixed !== null ? fixed : (span - total) / (n - 1); let at = pos(first);
      sorted.forEach(o => { put(o, at); at += size(o) + gap; });
    } else {
      const a = key(sorted[0]), z = key(sorted[n - 1]), step = (z - a) / (n - 1);
      sorted.forEach((o, i) => { const want = a + step * i, off = key(o) - pos(o); put(o, want - off); });
    }
    sorted.forEach(o => o.setCoords());
    canvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas })); canvas.renderAll(); App.mod.guides.checkAll();
    App.commit(`${n} objects distributed ${isSpace ? (fixed !== null ? `with a ${fixed}px gap` : 'with equal spacing') : type}`);
  }
  const distAct = t => distribute(t);
  const centerPage = () => edit(o => o.set({ left: EDGE.c - o.getScaledWidth() / 2, top: PAGE.h / 2 - o.getScaledHeight() / 2 }));
  const order = k => edit(o => {
    ({ front: () => canvas.bringToFront(o), forward: () => canvas.bringForward(o), backward: () => canvas.sendBackward(o), back: () => canvas.sendToBack(o) })[k]();
    if (App.grid) App.grid.sendToBack();
  });

  /* ---- paragraph styles: create / edit / apply; editing a style restyles every text box that uses it ---- */
  let editing = null;
  const styleProps = s => ({ fontFamily: s.font, fontSize: s.size, fill: s.color, fontWeight: s.bold ? 'bold' : 'normal', fontStyle: s.italic ? 'italic' : 'normal',
    beforeSpace: s.before || 0, afterSpace: s.after || 0, lineHeight: s.line || 1.3, styleName: s.name, tocLevel: s.level, listStyle: s.list || 'none' });
  const formToStyle = () => ({ name: $('#sName').value.trim(), level: +$('#sLevel').value, font: $('#sFont').value, size: +$('#sSize').value || 18, color: $('#sColor').value,
    bold: $('#sBold').checked, italic: $('#sItalic').checked, before: +$('#sBefore').value || 0, after: +$('#sAfter').value || 0, line: +$('#sLine').value || 1.3, list: $('#sList') ? $('#sList').value : 'none',
    x: $('#sX').value === '' ? null : +$('#sX').value, y: $('#sY').value === '' ? null : +$('#sY').value });
  function styleToForm(s) {
    $('#sName').value = s.name; $('#sLevel').value = s.level; $('#sFont').value = s.font; $('#sSize').value = s.size; $('#sColor').value = s.color;
    $('#sBold').checked = !!s.bold; $('#sItalic').checked = !!s.italic; if ($('#sList')) $('#sList').value = s.list || 'none'; $('#sBefore').value = s.before || 0; $('#sAfter').value = s.after || 0; $('#sLine').value = s.line || 1.3; $('#sX').value = s.x ?? ''; $('#sY').value = s.y ?? '';
  }
  async function createStyle() {
    const st = formToStyle(); if (!st.name) return App.status('Enter a style name');
    if (!editing) { S.styles.push({ id: 's' + Date.now(), ...st }); $('#sName').value = ''; renderStyles(); return App.commit('STYLE CREATED'); }
    const old = S.styles.find(s => s.id === editing), oldName = old.name; let n = 0;
    App.saveCurPage(); Object.assign(old, st);
    S.pages.forEach(p => (p.json.objects || []).forEach(ob => { if (ob.styleName === oldName) { Object.assign(ob, styleProps(old)); n++; } }));
    cancelStyle(); await App.showPage(S.cur); App.commit(`STYLE UPDATED – ${n} text box(es) restyled`);
  }
  function editStyle(id) {
    const s = S.styles.find(x => x.id === id); if (!s) return;
    editing = id; styleToForm(s); $('#sSubmit').textContent = '✔ Update style'; $('#sCancel').hidden = false; renderStyles();
  }
  function cancelStyle() { editing = null; $('#sSubmit').textContent = '+ Create style'; $('#sCancel').hidden = true; $('#sName').value = ''; renderStyles(); }
  let selStyle = null;   // the style chosen in the list; the buttons at the bottom of the Styles tab act on it
  function renderStyles() {
    if (selStyle && !S.styles.some(x => x.id === selStyle)) selStyle = null;
    $('#stylesList').innerHTML = S.styles.map(s => `<div class="box styleItem${s.id === selStyle ? ' sel' : ''}${s.id === editing ? ' editing' : ''}" data-act="chooseStyle" data-arg="${s.id}" style="font-family:${s.font}"><b>${s.name}</b>
      <span class="hint">H${s.level} · ${s.font} ${s.size}pt · ${s.list || 'no list'} · space ${s.before || 0}/${s.after || 0} · line ${s.line || 1.3} · pos ${s.x ?? 'margin'},${s.y ?? 'margin'}</span></div>`).join('');
    const nm = S.styles.find(x => x.id === selStyle); $('#styleSel').textContent = nm ? `Selected: ${nm.name}` : 'Click a style above, then use the buttons';
  }
  const pickStyle = id => { selStyle = selStyle === id ? null : id; renderStyles(); };
  const withSel = fn => () => { if (!selStyle) return App.status('Click a style in the list first'); return fn(selStyle); };
  const applyStyle = id => {
    const s = S.styles.find(x => x.id === id), ob = App.active();
    if (!s || !App.isText(ob)) return App.status('Select a text box first');
    ob.set({ ...styleProps(s), tocText: (ob.text || '').split('\n')[0].substring(0, 70) });
    canvas.renderAll(); App.commit();
  };
  const delStyle = id => { S.styles = S.styles.filter(s => s.id !== id); if (editing === id) cancelStyle(); if (selStyle === id) selStyle = null; renderStyles(); App.store.save(); };

  /* ---- merge shapes into one object (the selected shapes, or every shape on the page) ---- */
  const SHAPE_TYPES = ['rect', 'circle', 'triangle', 'polygon', 'ellipse'];
  function merge() {
    let sel = canvas.getActiveObjects().filter(ob => !ob.isHF);
    if (sel.length < 2) sel = canvas.getObjects().filter(ob => SHAPE_TYPES.includes(ob.type) && !ob.isHF && !ob.isGrid);
    if (sel.length < 2) return App.status('Need at least two shapes to merge');
    canvas.discardActiveObject(); sel.forEach(ob => canvas.remove(ob));
    const g = new fabric.Group(sel); canvas.add(g).setActiveObject(g); canvas.renderAll(); App.commit(`${sel.length} shapes merged into one`);
  }
  function unmerge() {
    const g = App.active(); if (!g || g.type !== 'group') return App.status('Select a merged group first');
    g.toActiveSelection(); canvas.discardActiveObject(); canvas.renderAll(); App.commit('UNMERGED');
  }

  /* ---- heading level: reset position (each style can store an X/Y; blank = top-left of the margin) ---- */
  const stylePos = s => ({ x: s.x ?? App.box().l, y: s.y ?? App.box().t });
  async function resetPos(id) {
    const s = S.styles.find(x => x.id === id); if (!s) return; const p = stylePos(s); let n = 0;
    App.saveCurPage();
    S.pages.forEach(pg => (pg.json.objects || []).forEach(ob => { if (ob.styleName === s.name && !ob.isHF) { ob.left = p.x; ob.top = p.y; n++; } }));
    await App.showPage(S.cur); App.commit(`${n} "${s.name}" object(s) reset to ${p.x}, ${p.y}`);
  }
  function resetHeadings() {
    let n = 0;
    canvas.getObjects().filter(ob => ob.tocLevel > 0 && !ob.isHF).forEach(ob => {
      const s = S.styles.find(x => x.name === ob.styleName); if (!s) return; const p = stylePos(s); ob.set({ left: p.x, top: p.y }); ob.setCoords(); n++;
    });
    canvas.renderAll(); App.mod.guides.checkAll(); App.commit(`${n} heading(s) on this page reset to their style position`);
  }
  const posFromSel = () => { const ob = App.active(); if (!ob) return App.status('Select an object first'); $('#sX').value = Math.round(ob.left); $('#sY').value = Math.round(ob.top); };

  // keep TOC text in sync when a heading is edited
  canvas.on('object:modified', e => { const o = e.target; if (o && App.isText(o) && !o.isHF && (o.scaleX !== 1 || o.scaleY !== 1)) { o.set({ width: Math.max(20, o.width * o.scaleX), scaleX: 1, scaleY: 1 }); o.initDimensions(); o.setCoords(); } if (o && o.tocLevel > 0 && !o.isHF) o.set('tocText', (o.text || '').split('\n')[0].substring(0, 70)); App.commit(); });

  return { listify, makeRaw, distribute: distAct, makeText, addText, addShape, addImage, makeColumns, copy, paste, del, setProp, toggle, align, alignObj, centerPage, order, merge, unmerge, resetPos, resetHeadings, posFromSel, createStyle, editStyle, cancelStyle, renderStyles, applyStyle, delStyle, pickStyle, applySel: withSel(applyStyle), editSel: withSel(editStyle), resetSel: withSel(resetPos), delSel: withSel(delStyle) };
})();
