'use strict';
/* table.js – editable tables.
   A table is one custom fabric object (type "table"), so it saves with the project, copies, undoes and is drawn by every
   exporter (PDF / PNG / Word / PowerPoint / IDML) exactly like any other object. All its settings live in `tableData`. */
App.mod.table = (() => {
  const DEF = { rows: 4, cols: 3, header: true, alt: true, headerFill: '#00006e', headerColor: '#ffffff', fill: '#ffffff', altFill: '#f1f5f9',
    border: '#94a3b8', bw: 1, font: 'Poppins', size: 12, color: '#111111', pad: 6, rowH: 28 };
  const meas = document.createElement('canvas').getContext('2d');
  const fontOf = (d, bold) => `${bold ? '600' : '400'} ${d.size}px "${d.font}", Arial, sans-serif`;

  function wrapCell(text, maxW, font) {
    meas.font = font; const out = [];
    String(text || '').split('\n').forEach(par => {
      const words = par.split(/\s+/).filter(Boolean); if (!words.length) { out.push(''); return; }
      let line = '';
      words.forEach(w => { const t = line ? line + ' ' + w : w; if (!line || meas.measureText(t).width <= maxW) line = t; else { out.push(line); line = w; } });
      out.push(line);
    });
    return out;
  }
  const normalise = (src = {}) => {
    const d = { ...DEF, ...src }; d.rows = Math.max(1, +d.rows || 1); d.cols = Math.max(1, +d.cols || 1);
    const oc = src.cells || [], ow = src.colW || [];
    d.cells = Array.from({ length: d.rows }, (_, r) => Array.from({ length: d.cols }, (_, c) => String((oc[r] && oc[r][c]) || '')));
    d.colW = Array.from({ length: d.cols }, (_, c) => Math.max(20, +ow[c] || 100));
    return d;
  };

  fabric.Table = fabric.util.createClass(fabric.Object, {
    type: 'table', isTable: true, objectCaching: false, lockRotation: true, originX: 'left', originY: 'top',
    initialize(opts = {}) {
      const data = normalise(opts.tableData); const o = { ...opts }; delete o.tableData;
      this.callSuper('initialize', o); this.tableData = data; this.setControlsVisibility({ mtr: false }); this._layout();
    },
    _layout() {
      const d = this.tableData;
      this._lines = d.cells.map((row, r) => row.map((t, c) => wrapCell(t, Math.max(10, d.colW[c] - 2 * d.pad), fontOf(d, d.header && r === 0))));
      this._rowH = this._lines.map(row => Math.max(d.rowH, Math.max(...row.map(l => l.length)) * d.size * 1.3 + 2 * d.pad));
      this.width = d.colW.reduce((a, b) => a + b, 0); this.height = this._rowH.reduce((a, b) => a + b, 0);
      this.dirty = true; this.setCoords();
    },
    _render(ctx) {
      const d = this.tableData; ctx.save(); ctx.translate(-this.width / 2, -this.height / 2);
      let y = 0;
      d.cells.forEach((row, r) => {
        let x = 0; const rh = this._rowH[r], head = d.header && r === 0, body = r - (d.header ? 1 : 0);
        row.forEach((_, c) => {
          const cw = d.colW[c];
          ctx.fillStyle = head ? d.headerFill : (d.alt && body % 2 === 1 ? d.altFill : d.fill); ctx.fillRect(x, y, cw, rh);
          if (d.bw > 0) { ctx.strokeStyle = d.border; ctx.lineWidth = d.bw; ctx.strokeRect(x, y, cw, rh); }
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, rh); ctx.clip();
          ctx.font = fontOf(d, head); ctx.fillStyle = head ? d.headerColor : d.color; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
          this._lines[r][c].forEach((ln, i) => ctx.fillText(ln, x + d.pad, y + d.pad + i * d.size * 1.3));
          ctx.restore(); x += cw;
        });
        y += rh;
      });
      ctx.restore();
    },
    toObject(props) { return fabric.util.object.extend(this.callSuper('toObject', props), { tableData: JSON.parse(JSON.stringify(this.tableData)) }); },
    /* ---- editing helpers ---- */
    update(patch) { Object.assign(this.tableData, patch); this._layout(); },
    setCell(r, c, text) { this.tableData.cells[r][c] = text; this._layout(); },
    resize(rows, cols) {
      const d = this.tableData, avg = d.colW.reduce((a, b) => a + b, 0) / d.colW.length;
      const colW = Array.from({ length: cols }, (_, c) => d.colW[c] || avg);
      this.tableData = normalise({ ...d, rows, cols, colW }); this._layout();
    },
    cellAt(x, y) {   // local point (px from the table's top-left) -> {r, c}
      const d = this.tableData; let r = 0, acc = 0, c = 0;
      for (; r < this._rowH.length - 1; r++) { if (y < acc + this._rowH[r]) break; acc += this._rowH[r]; }
      acc = 0; for (; c < d.colW.length - 1; c++) { if (x < acc + d.colW[c]) break; acc += d.colW[c]; }
      return { r, c };
    },
    /* geometry of every cell, used by the InDesign exporter */
    cellRects() {
      const d = this.tableData, out = []; let y = 0;
      d.cells.forEach((row, r) => { let x = 0; row.forEach((t, c) => { out.push({ r, c, x, y, w: d.colW[c], h: this._rowH[r], text: t }); x += d.colW[c]; }); y += this._rowH[r]; });
      return out;
    }
  });
  fabric.Table.fromObject = (obj, cb) => { const t = new fabric.Table(obj); if (cb) cb(t); return t; };

  /* ---- insert ---- */
  function insert({ rows = 4, cols = 3, header = true } = {}) {
    const b = App.box(), w = Math.max(60, b.r - b.l), cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => header && r === 0 ? `Column ${c + 1}` : ''));
    const t = new fabric.Table({ left: b.l, top: b.t + 60, tableData: { rows, cols, header, cells, colW: Array(cols).fill(w / cols) } });
    canvas.add(t).setActiveObject(t); canvas.renderAll(); App.mod.guides.checkAll(); App.commit(`Table ${rows} × ${cols} inserted`); App.ui.showProps(t);
  }
  const openDialog = () => { $('#tableDialog').hidden = false; };
  const closeDialog = () => { $('#tableDialog').hidden = true; };
  function applyDialog() {
    const rows = Math.min(40, Math.max(1, Math.round(+$('#tdRows').value || 4))), cols = Math.min(12, Math.max(1, Math.round(+$('#tdCols').value || 3)));
    closeDialog(); insert({ rows, cols, header: $('#tdHeader').checked });
  }

  /* ---- paste a table copied in Word / Excel / PowerPoint (HTML <table>) or tab-separated text ---- */
  function parseClipboard(cd) {
    const html = cd.getData('text/html'), text = cd.getData('text/plain'); let rows = null;
    if (html && /<table/i.test(html)) {
      const tb = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
      if (tb) rows = [...tb.querySelectorAll('tr')].map(tr => [...tr.children].filter(c => /^T[DH]$/.test(c.tagName)).map(c => c.textContent.replace(/\s+/g, ' ').trim()));
    }
    if (!rows && text && /\t/.test(text)) rows = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(r => r.split('\t').map(c => c.trim()));
    rows = rows && rows.filter(r => r.length);
    return rows && rows.length && !(rows.length === 1 && rows[0].length === 1) ? rows : null;
  }
  function insertRows(rows) {
    rows = rows.slice(0, 60); const cols = Math.min(12, Math.max(...rows.map(r => r.length)));
    const cells = rows.map(r => Array.from({ length: cols }, (_, c) => r[c] || '')), b = App.box(), W = Math.max(60, b.r - b.l);
    const weight = Array.from({ length: cols }, (_, c) => Math.min(30, Math.max(5, ...cells.map(r => r[c].length)))), sum = weight.reduce((a, x) => a + x, 0);
    const t = new fabric.Table({ left: b.l, top: b.t + 40, tableData: { rows: rows.length, cols, header: true, cells, colW: weight.map(w => W * w / sum), size: cols > 6 ? 10 : 12 } });
    canvas.add(t).setActiveObject(t); canvas.renderAll(); App.mod.guides.checkAll(); App.commit(`Table ${rows.length} × ${cols} pasted`); App.ui.showProps(t);
  }
  const fromClipboard = cd => { const rows = parseClipboard(cd); if (!rows) return false; insertRows(rows); return true; };
  const openPaste = () => { $('#pasteTableDialog').hidden = false; const b = $('#ptBox'); b.innerHTML = ''; $('#ptMsg').textContent = ''; b.focus(); };
  const closePaste = () => { $('#pasteTableDialog').hidden = true; };

  /* ---- side panel ---- */
  const cur = () => { const o = App.active(); return o && o.type === 'table' ? o : null; };
  function buildCells(t) {
    const d = t.tableData, box = $('#tCells');
    box.style.setProperty('--cols', d.cols);
    box.innerHTML = d.cells.map((row, r) => row.map((v, c) => `<input data-r="${r}" data-c="${c}" value="${String(v).replace(/"/g, '&quot;')}" placeholder="${r + 1},${c + 1}"${d.header && r === 0 ? ' class="th"' : ''}>`).join('')).join('');
  }
  function fillPanel(t) {
    const d = t.tableData;
    $('#tRows').value = d.rows; $('#tCols').value = d.cols; $('#tHeader').checked = d.header; $('#tAlt').checked = d.alt;
    $('#tHeadFill').value = d.headerFill; $('#tHeadColor').value = d.headerColor; $('#tBorder').value = d.border; $('#tColor').value = d.color; $('#tFill').value = d.fill;
    $('#tBw').value = d.bw; $('#tSize').value = d.size; $('#tRowH').value = d.rowH; $('#tWidth').value = Math.round(t.width); $('#tFont').value = d.font;
    buildCells(t);
  }
  function fromForm() {
    const t = cur(); if (!t) return;
    const num = (id, def, min) => Math.max(min, +$(id).value || def);
    t.update({ header: $('#tHeader').checked, alt: $('#tAlt').checked, headerFill: $('#tHeadFill').value, headerColor: $('#tHeadColor').value, border: $('#tBorder').value,
      color: $('#tColor').value, fill: $('#tFill').value, bw: Math.max(0, +$('#tBw').value || 0), size: num('#tSize', 12, 6), rowH: num('#tRowH', 28, 12), font: $('#tFont').value });
    const w = +$('#tWidth').value; if (w >= 60 && Math.abs(w - t.width) > 1) { const k = w / t.width; t.update({ colW: t.tableData.colW.map(x => x * k) }); }
    canvas.requestRenderAll(); App.mod.guides.checkAll();
  }
  function applyGrid() {
    const t = cur(); if (!t) return App.status('Select a table first');
    t.resize(Math.min(40, Math.max(1, Math.round(+$('#tRows').value || 1))), Math.min(12, Math.max(1, Math.round(+$('#tCols').value || 1))));
    fillPanel(t); canvas.requestRenderAll(); App.mod.guides.checkAll(); App.commit('Table rows / columns updated');
  }
  // dragging the handles scales the object; turn that into real column widths / row height so text never stretches
  function bake(t) {
    if (!t || t.type !== 'table' || (t.scaleX === 1 && t.scaleY === 1)) return;   // (must ignore every other object type, or dragging a shape throws)
    const d = t.tableData; d.colW = d.colW.map(w => Math.max(30, w * t.scaleX)); d.rowH = Math.max(16, d.rowH * t.scaleY);
    t.set({ scaleX: 1, scaleY: 1 }); t._layout(); canvas.requestRenderAll(); if (cur() === t) fillPanel(t);
  }

  function bind() {
    $('#ptBox').addEventListener('paste', e => {
      e.preventDefault(); if (fromClipboard(e.clipboardData)) closePaste(); else $('#ptMsg').textContent = 'No table found in the clipboard. Copy the cells (or a table) in Word, Excel or PowerPoint first.';
    });
    const panel = $('#tableBox');
    panel.addEventListener('input', e => {
      if (e.target.dataset.r !== undefined) { const t = cur(); if (t) { t.setCell(+e.target.dataset.r, +e.target.dataset.c, e.target.value); canvas.requestRenderAll(); } return; }
      if (e.target.closest('#tCells')) return; fromForm();
    });
    panel.addEventListener('change', e => { if (e.target.id === 'tHeader') { const t = cur(); if (t) buildCells(t); } if (!e.target.closest('#tCells') || e.target.dataset.r !== undefined) App.commit(); });
    canvas.on('object:modified', e => bake(e.target));
    canvas.on('mouse:dblclick', e => {
      const t = e.target; if (!t || t.type !== 'table') return;
      const p = canvas.getPointer(e.e), loc = t.toLocalPoint(new fabric.Point(p.x, p.y), 'left', 'top'), { r, c } = t.cellAt(loc.x, loc.y);
      const v = prompt(`Cell text (row ${r + 1}, column ${c + 1})`, t.tableData.cells[r][c]); if (v === null) return;
      t.setCell(r, c, v); canvas.requestRenderAll(); fillPanel(t); App.commit('Table cell updated');
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { canvas.getObjects().filter(o => o.type === 'table').forEach(t => t._layout()); canvas.requestRenderAll(); });
  }
  bind();
  Object.assign(App.act, { addTable: openDialog, applyTable: applyDialog, closeTableDialog: closeDialog, tableResize: applyGrid, pasteTableDialog: openPaste, closePasteTable: closePaste });
  return { insert, fillPanel, bake, openDialog, fromClipboard };
})();
