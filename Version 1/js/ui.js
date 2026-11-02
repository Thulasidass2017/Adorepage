'use strict';
/* ui.js – toolbar, property panels, action registry, event delegation, boot */
App.ui = (() => {
  const { obj, pages, hf, wrap, exp, guides, table } = App.mod;
  // screen mode: 'dark' = black screen (default), 'light' = white screen; the page itself is always white
  function setTheme(m) {
    m = m === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = m; try { localStorage.setItem('adore_theme', m); } catch (e) { /* private mode */ }
    const l = $('#themeLbl'); if (l) l.textContent = m === 'light' ? 'White' : 'Black'; App.status(m === 'light' ? 'WHITE SCREEN' : 'BLACK SCREEN');
  }
  try { setTheme(localStorage.getItem('adore_theme') || 'dark'); } catch (e) { setTheme('dark'); }
  const FONTS = ['Poppins', 'Inter', 'Montserrat', 'Playfair Display', 'Roboto', 'Open Sans', 'Lato', 'Merriweather', 'Oswald', 'Raleway', 'Times New Roman', 'Georgia', 'Arial'];
  const TOOLS = [['shapes', 'INSERT', 'flyout', '', 'Insert: text box, rectangle, circle, triangle, diamond'], ['image', 'IMAGE', 'pickFile', 'image', 'Place an image'], ['table', 'TABLE', 'addTable', '', 'Insert a table (rows × columns)'],
    ['settings-2', 'WRAP', 'openDialog', '', 'Picture layout: text wrap and space around the image'], ['wrap-text', 'IN-BOX', 'wrapInside', '', 'Wrap a text box inside a shape'],
    ['group', 'ALL IN', 'containAll', '', 'Fit all selected objects inside one shape'], ['combine', 'MERGE', 'merge', '', 'Merge the selected shapes (or all shapes on the page) into one object'],
    ['trash-2', 'DEL', 'deleteSel', '', 'Delete the selected object']];
  const INSERTS = [['type', 'Text box', 'addText'], ['rectangle-horizontal', 'Rectangle', 'addShape', 'rect'], ['circle', 'Circle', 'addShape', 'circle'], ['triangle', 'Triangle', 'addShape', 'triangle'], ['diamond', 'Diamond', 'addShape', 'diamond'], ['table', 'Table', 'addTable']];
  const NAMES = { textbox: 'Text box', image: 'Image', rect: 'Rectangle', circle: 'Circle', triangle: 'Triangle', polygon: 'Diamond', ellipse: 'Ellipse', table: 'Table', group: 'Merged shapes', text: 'Text' };
  const PANELS = ['imageBox', 'textBoxProps', 'paraBox', 'shapeBox', 'tableBox'];
  const kind = o => !o ? null : App.isText(o) ? 'text' : o.type === 'image' ? 'image' : o.type === 'table' ? 'table' : ['rect', 'circle', 'triangle', 'polygon'].includes(o.type) ? 'shape' : null;

  function showProps(o) {
    PANELS.forEach(id => { $('#' + id).hidden = true; });
    const k = kind(o); $('#selInfo').textContent = o ? `${o.type} ${o.styleName || ''}` : 'Nothing selected';
    if (o) { $('#objX').value = Math.round(o.left || 0); $('#objY').value = Math.round(o.top || 0); $('#objW').value = Math.round(o.getScaledWidth()); $('#objH').value = Math.round(o.getScaledHeight()); $('#objLockRatio').dataset.ratio = (o.getScaledWidth()/Math.max(1,o.getScaledHeight())).toString(); $('#noTextWrap').checked = o.noTextWrap === true; $('#objectProps').hidden = false; } else $('#objectProps').hidden = false;
    if (k === 'text') {
      $('#textBoxProps').hidden = $('#paraBox').hidden = false; $('#fFamily').value = o.fontFamily; $('#fSize').value = o.fontSize; $('#sizeVal').textContent = o.fontSize;
      [['bSpace', 'beforeSpace', 'bVal', 0], ['aSpace', 'afterSpace', 'aVal', 0], ['lSpace', 'lineHeight', 'lVal', 1.3]].forEach(([id, key, out, d]) => { $('#' + id).value = o[key] || d; $('#' + out).textContent = o[key] || d; });
    }
    if (k === 'image') { $('#imageBox').hidden = false; $('#borderW').value = o.strokeWidth || 0; $('#borderWVal').textContent = o.strokeWidth || 0; if (o.stroke) $('#borderColor').value = o.stroke;
      const p = { t: 10, r: 10, b: 10, l: 10, ...(o.wrapPad || {}) }; ['t', 'r', 'b', 'l'].forEach(s => { $('#pad' + s.toUpperCase()).value = p[s]; }); }
    if (k === 'table') { $('#tableBox').hidden = false; table.fillPanel(o); }
    if (k === 'shape') { $('#shapeBox').hidden = false; $('#shFill').value = o.fill; $('#shStroke').value = o.stroke || '#2563eb'; $('#shStrokeW').value = o.strokeWidth || 2; $('#shapeWidth').value = Math.round(o.getScaledWidth()); $('#shapeHeight').value = Math.round(o.getScaledHeight()); $('#lockRatio').dataset.ratio = (o.getScaledWidth() / Math.max(1,o.getScaledHeight())).toString(); }
  }

  async function toggleScroll() {
    const on = $('#scrollView').style.display !== 'flex';
    $('#singleView').style.display = on ? 'none' : 'flex'; $('#scrollView').style.display = on ? 'flex' : 'none';
    $('#scrollBtn').textContent = on ? 'Single page' : 'Scroll view';
    if (!on) return;
    App.saveCurPage(); $('#scrollView').innerHTML = '';
    for (let i = 0; i < S.pages.length; i++) {
      const card = document.createElement('div'); card.dataset.i = i; card.innerHTML = `PAGE ${i + 1}<img alt="Page ${i + 1}">`;
      $('#scrollView').append(card); card.querySelector('img').src = await exp.render(i);
    }
  }
  function zoomFit() { const a = $('#singleView'); App.setZoom(Math.min((a.clientWidth - 60) / PAGE.w, (a.clientHeight - 60) / PAGE.h, 0.8)); }

  /* every data-act in index.html maps to exactly one entry here */
  Object.assign(App.act, {
    undo: () => App.hist.go(-1), redo: () => App.hist.go(1),
    zoomIn: () => App.setZoom(S.zoom + 0.15), zoomOut: () => App.setZoom(S.zoom - 0.15), zoomFit, toggleScroll,
    copy: obj.copy, paste: obj.paste, deleteSel: obj.del, saveProject: exp.project, exportPng: exp.png, exportPdf: exp.pdf, exportDocx: exp.docx, exportPptx: exp.pptx, exportIdml: exp.idml, exportPdfExact: exp.pdfExact,
    tab: n => $$('.tab,.pane').forEach(e => e.classList.toggle('active', e.dataset.arg === n || e.id === 'pane-' + n)),
    pickFile: k => $(`[data-file="${k}"]`).click(),
    resetLayout: resetDefaultPositions, resetGuides: () => { guides.set('m',113.4); guides.set('bleed',4.72); S.guides.same = true; guides.setLeft(113.4, $('#moveContent').checked); App.status('All margins 3 cm; bleed 0.125 cm'); },
    leftPreset: v => S.guides.same ? guides.set('m', +v) : guides.setLeft(+v, $('#moveContent').checked), focusLeft: () => { App.act.tab('pages'); const i = $('#leftSpace'); i.scrollIntoView({ block: 'center' }); i.focus(); i.select(); },
    distribute: obj.distribute, useAdoreLogo: w => hf.useAdoreLogo(w), clearLogo: w => hf.clearLogo(w),
    applyShapeSize: applyShapeSize, applyObjectProps: applyObjectProps, cropImage: cropImage, help: () => alert(`Import: DOCX (text extraction), PDF (text extraction), IDML (story text), RTF, TXT, HTML/XML, JSON and this app's .indesign project file. INDD, legacy DOC and ODT are not directly supported. Export an INDD file as IDML in Adobe InDesign first. Open project accepts .indesign, .idproj or JSON project files. PowerPoint export creates one slide per page. Export ▸ InDesign (.idml) opens in Adobe InDesign (File ▸ Open); a native .indd cannot be written by a browser.`),
    theme: m => setTheme(m), toggleTheme: () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'),
    addText: obj.addText, addShape: obj.addShape, makeColumns: obj.makeColumns, listBullet: () => obj.listify('bullet'), listNumber: () => obj.listify('number'), columns: n => { S.cols = +n; App.status(`COLUMNS: ${n}`); },
    toggle: obj.toggle, align: obj.align, alignObj: obj.alignObj, centerPage: obj.centerPage, order: obj.order,
    createStyle: obj.createStyle, editStyle: obj.editStyle, cancelStyle: obj.cancelStyle, applyStyle: obj.applyStyle, delStyle: obj.delStyle, chooseStyle: obj.pickStyle, applySel: obj.applySel, editSel: obj.editSel, resetSel: obj.resetSel, delSel: obj.delSel, refreshToc: pages.refreshToc,
    addPage: pages.add, addToc: pages.addToc, deletePage: () => pages.remove(),
    hfEdit: () => hf.setLock(true), hfLock: () => hf.setLock(false),
    borderPreset: wrap.borderPreset, wrapStyle: s => wrap.apply(s), wrapInside: wrap.inside, containAll: wrap.contain, merge: obj.merge, unmerge: obj.unmerge, resetHeadings: obj.resetHeadings, resetPos: obj.resetPos, stylePosFromSel: obj.posFromSel, orient: o => App.setPaper(null, o), unwrapInside: wrap.resetInside,
    openDialog: wrap.openDialog, closeDialog: wrap.closeDialog, applyDialog: wrap.applyDialog, pickStyle: wrap.pickStyle
  });

  function resetDefaultPositions() {
    const b = App.box(), cm = 37.8; let count = 0;
    canvas.getObjects().filter(o => App.isText(o) && !o.isHF).forEach(o => {
      const name = (o.styleName || '').toLowerCase(), level = +o.tocLevel || 0;
      let y = 6.5 * cm;
      if (/heading 1|heading1|first heading/.test(name) || level === 1) y = 4.5 * cm;
      else if (/heading 2|heading2|second heading/.test(name) || level === 2) y = 5.5 * cm;
      else if (/normal/.test(name) || level === 0) y = 6.5 * cm;
      o.set({ left: Math.max(b.l, b.l + 4), top: y, scaleX: 1 }); o.setCoords(); count++;
    });
    App.mod.guides.refresh(); App.commit(`${count} text box(es) reset to default positions`);
  }
  function applyShapeSize() {
    const o = App.active(); if (!o || !['rect','circle','ellipse','triangle','polygon'].includes(o.type)) return App.status('Select a shape first');
    let w = Math.max(1, +$('#shapeWidth').value || o.getScaledWidth()), h = Math.max(1, +$('#shapeHeight').value || o.getScaledHeight());
    const ratio = +(($('#lockRatio').dataset.ratio) || (o.getScaledWidth()/Math.max(1,o.getScaledHeight())));
    if ($('#lockRatio').checked) h = w / ratio;
    o.set({ scaleX: w / Math.max(1,o.width), scaleY: h / Math.max(1,o.height) }); o.setCoords(); canvas.requestRenderAll(); App.commit('Shape size updated'); showProps(o);
  }
  function applyObjectProps() {
    const o = App.active(); if (!o) return App.status('Select an object first');
    const x = Number($('#objX').value), y = Number($('#objY').value);
    let w = Math.max(1, Number($('#objW').value) || o.getScaledWidth()), h = Math.max(1, Number($('#objH').value) || o.getScaledHeight());
    if ($('#objLockRatio').checked) h = w / (+(($('#objLockRatio').dataset.ratio) || (o.getScaledWidth()/Math.max(1,o.getScaledHeight()))));
    o.set({ left: Number.isFinite(x) ? x : o.left, top: Number.isFinite(y) ? y : o.top, scaleX: w / Math.max(1,o.width), scaleY: h / Math.max(1,o.height), noTextWrap: $('#noTextWrap').checked });
    if (o.type === 'image' && $('#noTextWrap').checked) o.set('wrapStyle', 'inline');
    if (o.type === 'table') table.bake(o);
    o.setCoords(); canvas.requestRenderAll(); App.mod.guides.checkAll(); App.commit('Object properties updated'); showProps(o);
  }
  function cropImage() {
    const o = App.active(); if (!o || o.type !== 'image') return App.status('Select an image first');
    const x = Math.max(0, Number(prompt('Crop from left (source pixels)', o.cropX || 0)) || 0);
    const y = Math.max(0, Number(prompt('Crop from top (source pixels)', o.cropY || 0)) || 0);
    const w = Math.max(1, Number(prompt('Crop width (source pixels)', o.width)) || o.width);
    const h = Math.max(1, Number(prompt('Crop height (source pixels)', o.height)) || o.height);
    o.set({ cropX: Math.min(x, o._originalElement.naturalWidth - 1), cropY: Math.min(y, o._originalElement.naturalHeight - 1), width: Math.min(w, o._originalElement.naturalWidth - x), height: Math.min(h, o._originalElement.naturalHeight - y) });
    o.setCoords(); canvas.requestRenderAll(); App.commit('Image crop updated'); showProps(o);
  }

  function bind() {
    document.addEventListener('click', e => {
      if (!e.target.closest('[data-act="flyout"],#flyout')) $('#flyout').hidden = true;
      if (!e.target.closest('details.dd')) $$('details.dd').forEach(d => { d.open = false; });
      const el = e.target.closest('[data-act]'); if (!el) return;
      if (el.closest('#scrollView')) return;
      const f = App.act[el.dataset.act]; if (f) f(el.dataset.arg, el);
      if (el.closest('#flyout')) $('#flyout').hidden = true;
      $$('details.dd').forEach(d => { d.open = false; });
    });
    $('#scrollView').addEventListener('click', e => { const c = e.target.closest('[data-i]'); if (c) { toggleScroll().then(() => pages.go(+c.dataset.i)); } });
    document.addEventListener('input', e => {
      const t = e.target, d = t.dataset;
      if (d.out) $('#' + d.out).textContent = t.value;
      if (d.prop) obj.setProp(d.prop, t.type === 'range' || t.type === 'number' ? parseFloat(t.value) : t.value, true);
      if ('hf' in d) hf.apply();
      if ('border' in d) wrap.borderFromForm();
      if ('pad' in d) wrap.setPad(d.pad, t.value, true);
      if ('paper' in d) App.setPaper(t.value);
      if ('pagefill' in d) { const pg = S.pages[S.cur]; if (pg) { pg.background = t.value; canvas.setBackgroundColor(t.value, canvas.renderAll.bind(canvas)); App.commit('Current page fill updated'); } }
      if ('guide' in d) guides.set(d.guide, t.checked);
      if ('gnum' in d && d.gnum !== 'mL' && !(d.gnum === 'm' && S.guides.same)) guides.set(d.gnum, Math.max(0, parseFloat(t.value) || 0));
      if ('grid' in d) { S.gridOn = t.checked; $$('[data-grid]').forEach(c => { c.checked = t.checked; }); App.drawGrid(); App.status(t.checked ? 'GRID ON' : 'GRID OFF'); }
    });
    document.addEventListener('change', e => {
      if ('prop' in e.target.dataset || 'pad' in e.target.dataset) App.commit();   // slider released
      if (e.target.dataset.gnum === 'mL') guides.setLeft(e.target.value, $('#moveContent').checked);
      if (e.target.dataset.gnum === 'm' && S.guides.same) guides.set('m', Math.max(0, parseFloat(e.target.value) || 0));
      if (e.target.id === 'sameMargin') { S.guides.same = e.target.checked; $('#leftSpace').disabled = e.target.checked; if (e.target.checked) guides.setLeft(S.guides.m, $('#moveContent').checked); else App.store.save(); }
      const k = e.target.dataset.file, f = e.target.files && e.target.files[0]; if (!k || !f) return;
      if (k === 'import') { exp.importFile(f); e.target.value = ''; return; } const r = new FileReader(); r.onload = () => k === 'image' ? obj.addImage(r.result) : k === 'project' ? exp.open(r.result) : hf.setLogo(k, r.result); k === 'project' ? r.readAsText(f) : r.readAsDataURL(f); e.target.value = '';
    });
    document.addEventListener('keydown', e => {
      if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || (App.active() && App.active().isEditing)) return;
      const m = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (m && k === 'z') { e.preventDefault(); App.hist.go(e.shiftKey ? 1 : -1); }
      else if (m && k === 'y') App.hist.go(1);
      else if (m && k === 'c') obj.copy();   // Ctrl+V is handled by the 'paste' event below (external tables / images first, then the internal clipboard)
      else if (['arrowleft','arrowright','arrowup','arrowdown'].includes(k) && App.active()) { e.preventDefault(); const o = App.active(), step = e.shiftKey ? 10 : 1; o.set({ left: o.left + (k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0), top: o.top + (k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0) }); o.setCoords(); canvas.requestRenderAll(); App.mod.guides.checkAll(); App.commit('Object moved'); showProps(o); }
      else if (k === 'delete') obj.del();
    });
    document.addEventListener('paste', e => {
      if ((e.target.closest && e.target.closest('#ptBox')) || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || (App.active() && App.active().isEditing)) return;
      const cd = e.clipboardData; if (!cd) return;
      if (table.fromClipboard(cd)) { e.preventDefault(); return; }                 // a table copied from Word / Excel / PowerPoint
      for (const it of cd.items || []) if (it.type && it.type.startsWith('image/')) { const f = it.getAsFile(), r = new FileReader(); r.onload = () => obj.addImage(r.result); r.readAsDataURL(f); e.preventDefault(); return; }
      e.preventDefault(); obj.paste();                                              // objects copied inside the app
    });
    canvas.on('selection:created', e => showProps(e.selected[0]));
    canvas.on('selection:updated', e => showProps(e.selected[0]));
    canvas.on('selection:cleared', () => showProps(null));
  }

  /* hover tooltip for every canvas object + the INSERT flyout */
  function describe(o) {
    if (o.isHF) return 'Header / footer' + (S.hfEdit ? ' – double-click to edit' : ' – locked');
    let s = `${NAMES[o.type] || o.type}${o.styleName ? ' · ' + o.styleName : ''} · ${Math.round(o.getScaledWidth())}×${Math.round(o.getScaledHeight())}px · x ${Math.round(o.left)}, y ${Math.round(o.top)}`;
    if (o.overMargin) s += '\n⚠ over the margin line'; if (o.overBleed) s += '\n⚠ over the bleed line';
    return s;
  }
  function bindExtras() {
    const tip = $('#tip'), place = ev => { tip.style.left = ev.clientX + 14 + 'px'; tip.style.top = ev.clientY + 14 + 'px'; };
    $('#flyout').innerHTML = INSERTS.map(([i, l, a, arg]) => `<div class="t" title="Insert ${l}" data-act="${a}"${arg ? ` data-arg="${arg}"` : ''}><i data-lucide="${i}"></i>${l.toUpperCase()}</div>`).join('');
    canvas.on('mouse:over', e => { if (!e.target || e.target.isGrid) return; tip.textContent = describe(e.target); tip.hidden = false; place(e.e); });
    canvas.on('mouse:move', e => { if (!tip.hidden) place(e.e); });
    canvas.on('mouse:out', () => { tip.hidden = true; });
    App.act.flyout = (_, el) => { const f = $('#flyout'), r = el.getBoundingClientRect(); f.style.top = r.top + 'px'; f.style.left = r.right + 6 + 'px'; f.hidden = !f.hidden; };
  }

  async function init() {
    $('#toolbar').innerHTML = TOOLS.map(([i, l, a, arg, tip]) => `<div class="t" title="${tip}" data-act="${a}"${arg ? ` data-arg="${arg}"` : ''}><i data-lucide="${i}"></i>${l}</div>`).join('');
    $$('[data-fonts]').forEach(s => { s.innerHTML = FONTS.map(f => `<option>${f}</option>`).join(''); });
    wrap.buildUI(); pages.bindList(); bind(); bindExtras(); App.zoomFit = zoomFit;
    $('#paperSize').innerHTML = Object.keys(PAPERS).map(k => `<option>${k}</option>`).join('');
    const hadSavedProject = App.store.load();
    if (S.pages && S.pages.length) S.pages.forEach(pg => { if (!pg.orient) pg.orient = S.paper.orient || 'portrait'; });
    if (hadSavedProject && S.guides && S.guides.m === 40 && S.guides.bleed === 11) { S.guides.m = 113.4; S.guides.bleed = 4.72; }
    if (hadSavedProject) {   // older projects: add the left space on every page, the Adore logo, and move default style positions inside the margins
      guides.ensureLeft(); hf.migrate();
      S.styles.forEach(st => { if (st.x != null && st.x < S.guides.mL) st.x = null; });
    }
    if (!hadSavedProject) {
      const b = App.box(), bw = b.r - b.l;
      canvas.add(obj.makeText('Welcome to Adore Page', 'Heading 1', b.l, 170, bw),
        obj.makeText('Insert shapes, tables, text and images from the left toolbar. Use Wrap to flow text around a picture, Distribute to space objects evenly, and the HF tab to edit the header and footer.\n\nExport to Word, PowerPoint, PDF or InDesign (.idml) from the Export menu.', 'Normal', b.l, 246, bw));
      S.pages = [{ json: App.snapshot(), isTOC: false, orient: S.paper.orient }];
    }
    App.applyPaper();
    await App.showPage(Math.min(S.cur, S.pages.length - 1));
    obj.renderStyles(); App.syncPaperUI(); guides.syncUI(); hf.fillForm(); hf.setLock(false); zoomFit(); App.hist.push();
    if (window.lucide) lucide.createIcons();
  }
  return { init, showProps };
})();
App.ui.init();
