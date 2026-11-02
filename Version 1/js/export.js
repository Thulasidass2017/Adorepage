'use strict';
/* export.js – PNG (zip) · PDF (text + exact) · Word (editable) · PowerPoint · InDesign (IDML) · native project file */
App.mod.exp = (() => {
  const mm = v => v * 25.4 / 96, hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c.slice(1) : '000000';
  const need = (lib, name) => { if (window[lib]) return true; App.status(`${name} library did not load – check your internet connection`); return false; };
  function saveBlob(blob, name) { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 30000); }   // (the link must be in the page for Firefox / Safari)

  const dimsOf = i => { const [pw, ph] = PAPERS[S.paper.size] || PAPERS['Default (700 × 900)']; return ((S.pages[i] && S.pages[i].orient) || S.paper.orient || 'portrait') === 'landscape' ? [ph, pw] : [pw, ph]; };
  const bgOf = i => (S.pages[i] && (S.pages[i].background || (S.pages[i].json && S.pages[i].json.background))) || '#ffffff';

  /* Load page i (plus its header/footer) onto an off-screen canvas of the right size, run fn(canvas), then clean up. */
  async function withPage(i, fn) {
    const old = [PAGE.w, PAGE.h]; [PAGE.w, PAGE.h] = dimsOf(i);
    let cv = null;
    try {
      cv = new fabric.StaticCanvas(document.createElement('canvas'), { width: PAGE.w, height: PAGE.h, backgroundColor: bgOf(i) });
      await new Promise(r => cv.loadFromJSON(S.pages[i].json, r));
      App.mod.wrap.relayout(true, cv);
      await App.mod.hf.draw(i + 1, cv, false);
      return await fn(cv);
    } finally { if (cv) cv.dispose(); [PAGE.w, PAGE.h] = old; }
  }
  async function render(i, format = 'png', multiplier = 2) {   // each page is rendered with its own orientation
    return withPage(i, cv => {
      try { return cv.toDataURL({ format, quality: 0.92, multiplier }); }
      catch (e) { if (multiplier > 1) return cv.toDataURL({ format, quality: 0.92, multiplier: 1 }); throw e; }   // very large pages: retry at normal resolution
    });
  }
  // every exporter runs through here: a failure is shown in the red error bar (and the console) instead of being swallowed
  const safe = (label, fn) => async (...a) => {
    try { await fn(...a); }
    catch (err) { console.error(`${label} export failed:`, err); const m = `${label} export failed: ${err && err.message ? err.message : err}`; App.setError(m); App.status(m); }
  };

  /* flatten a page's saved JSON into simple items (groups included) for the Word / PowerPoint / RTF writers */
  function items(i) {
    const out = [];
    const walk = (o, dx, dy, sx, sy) => {
      if (o.isHF || o.isGrid || o.visible === false) return;
      const x = dx + o.left * sx, y = dy + o.top * sy, gx = o.scaleX || 1, gy = o.scaleY || 1, w = (o.width || 0) * gx * sx, h = (o.height || 0) * gy * sy;
      if (o.type === 'group') return (o.objects || []).forEach(c => walk(c, x + w / 2, y + h / 2, gx * sx, gy * sy));
      if (/^(textbox|i-text|text)$/.test(o.type) && !o.tocPage) out.push({ k: 'text', x, y, w, h, text: o.text || '', font: o.fontFamily || 'Arial', size: o.fontSize, color: o.fill, bold: o.fontWeight === 'bold' || +o.fontWeight >= 600,
        italic: o.fontStyle === 'italic', align: o.textAlign || 'left', level: o.tocLevel || 0, before: o.beforeSpace || 0, after: o.afterSpace || 0, line: o.lineHeight || 1.3 });
      else if (o.type === 'table') out.push({ k: 'table', x, y, w, h, td: o.tableData });
      else if (o.type === 'image') out.push({ k: 'image', x, y, w, h, src: o.src });
      else if (['rect', 'circle', 'ellipse', 'triangle', 'polygon'].includes(o.type))
        out.push({ k: 'shape', shape: { circle: 'ellipse', polygon: 'diamond' }[o.type] || o.type, x, y, w, h, fill: o.fill, stroke: o.stroke, sw: o.strokeWidth || 0 });
    };
    (S.pages[i].json.objects || []).forEach(o => walk(o, 0, 0, 1, 1));
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  const png64 = src => new Promise(r => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); r(c.toDataURL('image/png').split(',')[1]); }; im.onerror = () => r(null); im.src = src; });

  /* ---- PNG (all pages, one zip) and PDF ---- */
  async function png() {
    if (!need('JSZip', 'JSZip')) return; App.saveCurPage(); const zip = new JSZip();
    for (let i = 0; i < S.pages.length; i++) { App.status(`Rendering PNG ${i + 1}/${S.pages.length}…`); zip.file(`Page-${i + 1}.png`, (await render(i)).split(',')[1], { base64: true }); }
    saveBlob(await zip.generateAsync({ type: 'blob' }), 'Pages-PNG.zip'); App.status(`Exported ${S.pages.length} PNG pages`);
  }
  async function pdfExact() {
    if (!window.jspdf) throw new Error('the PDF library did not load – check your internet connection');
    App.saveCurPage(); let doc = null;
    for (let i = 0; i < S.pages.length; i++) {
      App.status(`Exporting PDF ${i + 1}/${S.pages.length}…`);
      const [px, py] = dimsOf(i);
      const W = mm(px), H = mm(py), img = await render(i, 'jpeg');
      if (!doc) doc = new jspdf.jsPDF({ orientation: W > H ? 'l' : 'p', unit: 'mm', format: [W, H] });
      else doc.addPage([W, H], W > H ? 'l' : 'p');
      doc.addImage(img, 'JPEG', 0, 0, W, H);
    }
    if (doc) doc.save('Export-exact-layout.pdf'); App.status('PDF exported: every page exactly as designed (picture)');
  }

  /* ---- "flow" model shared by the Word and the text-PDF writers: each page becomes a list of blocks
     (text paragraphs, images, tables, or a table of contents) in reading order ---- */
  const MARGIN_PX = 20 / 25.4 * 96;          // 2 cm on every side
  const imgSize = src => new Promise(r => { const im = new Image(); im.onload = () => r({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => r(null); im.src = src; });
  function flow() {
    App.saveCurPage(); const tocs = App.mod.pages.tocEntries();
    return S.pages.map((p, i) => ({ i, dims: dimsOf(i), blocks: p.isTOC ? [{ k: 'toc', entries: tocs, title: App.mod.pages.tocHeadingText() }] : items(i).filter(it => it.k !== 'shape') }));
  }

  /* ---- PDF with real, selectable text and tables; 2 cm margins on every side; header / footer / logo; clickable TOC ---- */
  async function pdf() {
    if (!window.jspdf) throw new Error('the PDF library did not load – check your internet connection');
    if (!S.pages.length) throw new Error('there are no pages to export');
    const pages = flow(), logo = S.hdr.enabled !== false && S.hdr.logo ? { src: S.hdr.logo, sz: await imgSize(S.hdr.logo) } : null;
    for (const pg of pages) for (const b of pg.blocks) if (b.k === 'image') b.sz = await imgSize(b.src);
    const M = 20, fam = f => /mono|courier/i.test(f) ? 'courier' : /times|georgia|serif|garamond|cambria|palatino/i.test(f) && !/sans/i.test(f) ? 'times' : 'helvetica';
    const rgb = c => { const h = hex(typeof c === 'string' ? c : ''); return [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)); };
    const PT = 25.4 / 72;                                  // 1 pt in mm
    const build = starts => {
      let doc = null; const first = [], links = []; let pageNo = 0;
      const [W0, H0] = pages[0].dims.map(mm);
      const footer = () => {
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), F = S.ftr, Hd = S.hdr;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
        if (Hd.enabled !== false) {
          const hy = 12; let lx = M;
          if (logo && logo.sz) { const h = Math.min(mm(+Hd.logoH || 34), 10), w = h * logo.sz.w / logo.sz.h, x = Hd.pos === 'right' ? W - M - w : Hd.pos === 'center' ? (W - w) / 2 : M; doc.addImage(logo.src, 'PNG', x, 5, w, h); }
          if (Hd.left) doc.text(String(Hd.left), M, hy, { baseline: 'bottom' }); if (Hd.center) doc.text(String(Hd.center), W / 2, hy, { align: 'center', baseline: 'bottom' }); if (Hd.right) doc.text(String(Hd.right), W - M, hy, { align: 'right', baseline: 'bottom' });
          if (Hd.line !== false) { doc.setDrawColor(190); doc.setLineWidth(0.2); doc.line(M, 16, W - M, 16); }
        }
        if (F.enabled !== false) {
          const fy = H - 9; if (F.line !== false) { doc.setDrawColor(190); doc.line(M, H - 14, W - M, H - 14); }
          if (F.left) doc.text(String(F.left), M, fy);
          if (F.pagePos !== 'no') doc.text(String(pageNo), F.pagePos === 'left' ? M : F.pagePos === 'center' ? W / 2 : W - M, fy, { align: F.pagePos === 'left' ? 'left' : F.pagePos === 'center' ? 'center' : 'right' });
        }
      };
      const newPage = (dims, srcIdx) => {
        const W = mm(dims[0]), H = mm(dims[1]);
        if (!doc) doc = new jspdf.jsPDF({ orientation: W > H ? 'l' : 'p', unit: 'mm', format: [W, H] }); else doc.addPage([W, H], W > H ? 'l' : 'p');
        pageNo = doc.getNumberOfPages(); if (first[srcIdx] === undefined) first[srcIdx] = pageNo; footer(); return M;
      };
      for (const pg of pages) {
        const W = mm(pg.dims[0]), H = mm(pg.dims[1]), UW = W - 2 * M, bottom = H - M;
        let y = newPage(pg.dims, pg.i);
        for (const b of pg.blocks) {
          if (b.k === 'text') {
            const size = (b.size || 16) * 0.75, lh = size * PT * (b.line || 1.3), x = b.align === 'center' ? W / 2 : b.align === 'right' ? W - M : M;
            doc.setFont(fam(b.font), b.bold && b.italic ? 'bolditalic' : b.bold ? 'bold' : b.italic ? 'italic' : 'normal'); doc.setFontSize(size); doc.setTextColor(...rgb(b.color));
            const lines = String(b.text).split('\n').flatMap(par => doc.splitTextToSize(par || ' ', UW)); y += mm(b.before || 0);
            for (const ln of lines) { if (y + lh > bottom) { y = newPage(pg.dims, pg.i); doc.setFont(fam(b.font), b.bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...rgb(b.color)); } doc.text(ln, x, y + size * PT * 0.85, { align: b.align === 'center' ? 'center' : b.align === 'right' ? 'right' : 'left' }); y += lh; }
            y += mm(b.after || 0) + 1;
          } else if (b.k === 'image' && b.sz) {
            let w = Math.min(mm(b.w || b.sz.w), UW), h = w * b.sz.h / b.sz.w; const maxH = bottom - M; if (h > maxH) { h = maxH; w = h * b.sz.w / b.sz.h; }
            if (y + h > bottom) y = newPage(pg.dims, pg.i); doc.addImage(b.src, /^data:image\/jpe?g/i.test(b.src) ? 'JPEG' : 'PNG', M, y, w, h); y += h + 3;
          } else if (b.k === 'table' && b.td) {
            const d = b.td, tot = d.colW.reduce((a, x) => a + x, 0), k = Math.min(1, UW / mm(tot)), cw = d.colW.map(x => mm(x) * k), fs = d.size * 0.75 * Math.min(1, k * 1.0), pad = 1.6, lh = fs * PT * 1.25;
            doc.setFont(fam(d.font), 'normal'); doc.setFontSize(fs);
            const rowsL = d.cells.map((row, r) => row.map((t, c) => { doc.setFont(fam(d.font), d.header && r === 0 ? 'bold' : 'normal'); return doc.splitTextToSize(String(t || ' '), Math.max(4, cw[c] - 2 * pad)); }));
            const rowH = rowsL.map(row => Math.max(mm(d.rowH) * k, Math.max(...row.map(l => l.length)) * lh + 2 * pad));
            const drawRow = r => {
              let x = M; const head = d.header && r === 0, body = r - (d.header ? 1 : 0);
              rowsL[r].forEach((lines, c) => {
                doc.setFillColor(...rgb(head ? d.headerFill : d.alt && body % 2 === 1 ? d.altFill : d.fill)); doc.setDrawColor(...rgb(d.border)); doc.setLineWidth(Math.max(0.05, mm(d.bw)));
                doc.rect(x, y, cw[c], rowH[r], d.bw > 0 ? 'FD' : 'F'); doc.setFont(fam(d.font), head ? 'bold' : 'normal'); doc.setFontSize(fs); doc.setTextColor(...rgb(head ? d.headerColor : d.color));
                lines.forEach((ln, i) => doc.text(ln, x + pad, y + pad + fs * PT * 0.85 + i * lh)); x += cw[c];
              }); y += rowH[r];
            };
            d.cells.forEach((_, r) => { if (y + rowH[r] > bottom) { y = newPage(pg.dims, pg.i); if (d.header && r > 0) drawRow(0); } drawRow(r); }); y += 4;
          } else if (b.k === 'toc') {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(21); doc.setTextColor(0, 0, 110); doc.text(String(b.title || 'Table of Contents'), M, y + 8); y += 20;
            for (const e of b.entries) {
              const size = e.level === 1 ? 12 : 10, lh = size * PT * 1.9; if (y + lh > bottom) y = newPage(pg.dims, pg.i);
              doc.setFont('helvetica', e.level === 1 ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(0, 0, 110);
              const x = M + (e.level - 1) * 5, ty = y + size * PT * 1.1, target = starts ? starts[e.page - 1] : 1;
              doc.text(doc.splitTextToSize(e.text, UW - 20 - (x - M))[0], x, ty); doc.text(String(target || ''), W - M, ty, { align: 'right' });
              links.push({ page: doc.getNumberOfPages(), x: M, y: y, w: UW, h: lh, to: e.page }); y += lh;
            }
          }
        }
      }
      links.forEach(l => { doc.setPage(l.page); if (starts && starts[l.to - 1]) doc.link(l.l ?? M, l.y, l.w, l.h, { pageNumber: starts[l.to - 1] }); });
      return { doc, first };
    };
    App.status('Building PDF…');
    const hasToc = pages.some(p => p.blocks.some(b => b.k === 'toc')), pass1 = build(null);
    const out = hasToc ? build(pass1.first) : pass1;               // second pass knows the real PDF page of every source page
    out.doc.save('Export.pdf');
    App.status(`PDF exported with real text: ${out.doc.getNumberOfPages()} page(s), 2 cm margins${hasToc ? ', clickable TOC' : ''} (shapes are not included – use the exact-layout PDF for those)`);
  }

  /* ---- PowerPoint: every page becomes one slide holding a full-resolution picture of the page ----
     (PowerPoint has a single slide size, so the slide is as big as the largest page and smaller pages are centred) */
  async function pptx() {
    const Pptx = window.PptxGenJS || window.pptxgen;
    if (!Pptx) throw new Error('the PowerPoint library did not load – check your internet connection and reload the page');
    if (!S.pages.length) throw new Error('there are no pages to export');
    App.saveCurPage();
    const dims = S.pages.map((_, i) => dimsOf(i)), maxW = Math.max(...dims.map(d => d[0])), maxH = Math.max(...dims.map(d => d[1]));
    const sw = maxW / 96, sh = maxH / 96, P = new Pptx();
    P.defineLayout({ name: 'ADORE_PAGE', width: sw, height: sh }); P.layout = 'ADORE_PAGE';
    P.author = 'Adore'; P.company = 'Adore'; P.title = 'Document'; P.subject = 'InDesign Pro page export';
    for (let i = 0; i < S.pages.length; i++) {
      App.status(`Exporting PowerPoint page ${i + 1}/${S.pages.length}…`);
      const data = await render(i, 'png');
      if (!data || !data.startsWith('data:image/')) throw new Error(`page ${i + 1} could not be drawn`);
      const [pw, ph] = dims[i], k = Math.min(maxW / pw, maxH / ph), w = pw * k / 96, h = ph * k / 96;
      const sl = P.addSlide(); sl.background = { color: bgOf(i).replace('#', '').slice(0, 6).toUpperCase() || 'FFFFFF' };
      sl.addImage({ data, x: (sw - w) / 2, y: (sh - h) / 2, w, h });
    }
    // pptxgenjs' own writeFile() download can be blocked by some browsers: build the file in memory and save it ourselves
    let out = await P.write({ outputType: 'blob' });
    if (!(out instanceof Blob)) out = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    if (!out.size) throw new Error('PowerPoint file came out empty');
    saveBlob(out, 'Document.pptx');
    App.status(`PowerPoint exported: ${S.pages.length} slide(s), one per page (Document.pptx)`);
  }

  /* ---- Word: real, editable text (paragraphs, headings, tables, pictures) with 2 cm margins on every side.
     Each page of the design becomes one Word section of the same size, with the header (logo + texts) and footer (text + page number).
     The TOC page becomes clickable links with page-number fields. (Shapes are not text, so they are left out.) ---- */
  async function docx() {
    if (!need('JSZip', 'JSZip')) throw new Error('the JSZip library did not load – check your internet connection');
    if (!S.pages.length) throw new Error('there are no pages to export');
    const pages = flow(), zip = new JSZip(), X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const esc = v => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const tw = px => Math.round(px * 15), emu = px => Math.round(px * 9525), M = 1134;   // twips: 1 px = 15, 2 cm = 1134
    const col = c => hex(typeof c === 'string' ? c : '').toUpperCase();
    let relsDoc = '', ct = '', imgN = 0, docPr = 0; const media = {};
    const addMedia = async src => {                                  // one PNG file per distinct picture
      if (media[src]) return media[src]; const b64 = await png64(src); if (!b64) return null;
      const n = ++imgN; zip.file(`word/media/img${n}.png`, b64, { base64: true }); const sz = await imgSize(src);
      return (media[src] = { n, rid: `rIdImg${n}`, w: sz ? sz.w : 100, h: sz ? sz.h : 100 });
    };
    const drawing = (m, wPx, hPx) => { const id = ++docPr; return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu(wPx)}" cy="${emu(hPx)}"/><wp:docPr id="${id}" name="Picture ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="img${m.n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${m.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(wPx)}" cy="${emu(hPx)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`; };
    const rpr = (font, px, bold, italic, color) => `<w:rPr><w:rFonts w:ascii="${esc(font || 'Arial')}" w:hAnsi="${esc(font || 'Arial')}" w:cs="${esc(font || 'Arial')}"/>${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}<w:color w:val="${col(color)}"/><w:sz w:val="${Math.max(2, Math.round(px * 1.5))}"/><w:szCs w:val="${Math.max(2, Math.round(px * 1.5))}"/></w:rPr>`;
    const runs = (text, rp) => String(text).split('\n').map((ln, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${rp}<w:t xml:space="preserve">${esc(ln)}</w:t></w:r>`).join('');
    const field = (instr, shown, rp) => `<w:fldSimple w:instr="${instr}"><w:r>${rp}<w:t>${shown}</w:t></w:r></w:fldSimple>`;
    const tiny = (inner = '') => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${inner}</w:pPr></w:p>`;

    const logo = S.hdr.enabled !== false && S.hdr.logo ? await addMedia(S.hdr.logo) : null;
    let body = '', bm = 0;
    for (let n = 0; n < pages.length; n++) {
      const pg = pages[n], [pw, ph] = pg.dims, availPx = pw - 2 * MARGIN_PX, availTw = tw(pw) - 2 * M, availHpx = ph - 2 * MARGIN_PX;
      App.status(`Exporting Word page ${n + 1}/${pages.length}…`);
      // header / footer for this page size
      const slots = (l, c, r) => `<w:tabs><w:tab w:val="center" w:pos="${Math.round(availTw / 2)}"/><w:tab w:val="right" w:pos="${availTw}"/></w:tabs>`;
      const small = rpr('Arial', 11, false, false, '#6b7280');
      const pn = S.ftr.pagePos || 'right', pf = field(' PAGE ', n + 1, small);
      const hdrP = S.hdr.enabled !== false ? `${logo ? `<w:p><w:pPr><w:spacing w:before="0" w:after="240"/><w:jc w:val="${S.hdr.pos === 'right' ? 'right' : S.hdr.pos === 'center' ? 'center' : 'left'}"/></w:pPr>${drawing(logo, (+S.hdr.logoH || 34) * logo.w / logo.h, +S.hdr.logoH || 34)}</w:p>` : ''}${(S.hdr.left || S.hdr.center || S.hdr.right) ? `<w:p><w:pPr>${S.hdr.line !== false ? '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="BBBBBB"/></w:pBdr>' : ''}${slots()}<w:spacing w:before="0" w:after="0"/></w:pPr>${runs(S.hdr.left || '', small)}<w:r><w:tab/></w:r>${runs(S.hdr.center || '', small)}<w:r><w:tab/></w:r>${runs(S.hdr.right || '', small)}</w:p>` : (S.hdr.line !== false ? '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="BBBBBB"/></w:pBdr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>' : '')}` : '';
      const ftrP = S.ftr.enabled !== false ? `<w:p><w:pPr>${S.ftr.line !== false ? '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="BBBBBB"/></w:pBdr>' : ''}${slots()}</w:pPr>${runs(S.ftr.left || '', small)}${pn === 'left' ? pf : ''}<w:r><w:tab/></w:r>${pn === 'center' ? pf : ''}<w:r><w:tab/></w:r>${pn === 'right' ? pf : ''}</w:p>` : '';
      zip.file(`word/header${n + 1}.xml`, `${X}<w:hdr ${NS}>${hdrP || tiny()}</w:hdr>`); zip.file(`word/footer${n + 1}.xml`, `${X}<w:ftr ${NS}>${ftrP || tiny()}</w:ftr>`);
      if (logo) zip.file(`word/_rels/header${n + 1}.xml.rels`, `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="${logo.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${logo.n}.png"/></Relationships>`);
      relsDoc += `<Relationship Id="rIdH${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header${n + 1}.xml"/><Relationship Id="rIdF${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer${n + 1}.xml"/>`;
      ct += `<Override PartName="/word/header${n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer${n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`;
      const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rIdH${n + 1}"/><w:footerReference w:type="default" r:id="rIdF${n + 1}"/><w:pgSz w:w="${tw(pw)}" w:h="${tw(ph)}"${pw > ph ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${M}" w:right="${M}" w:bottom="${M}" w:left="${M}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;

      body += `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:bookmarkStart w:id="${++bm}" w:name="page_${n + 1}"/><w:bookmarkEnd w:id="${bm}"/></w:p>`;   // jump target for TOC links
      for (const b of pg.blocks) {
        if (b.k === 'text') {
          const lvl = b.level > 0 ? `<w:outlineLvl w:val="${Math.min(8, b.level - 1)}"/>` : '', jc = { center: 'center', right: 'right', justify: 'both' }[b.align] || 'left';
          body += `<w:p><w:pPr>${b.level > 0 ? '<w:keepNext/>' : ''}<w:spacing w:before="${tw(b.before || 0)}" w:after="${tw(b.after || 0)}" w:line="${Math.round((b.line || 1.3) * 240)}" w:lineRule="auto"/><w:jc w:val="${jc}"/>${lvl}</w:pPr>${runs(b.text, rpr(b.font, b.size || 16, b.bold, b.italic, b.color))}</w:p>`;
        } else if (b.k === 'image') {
          const m = await addMedia(b.src); if (!m) continue; let w = Math.min(b.w || m.w, availPx), h = w * m.h / m.w; if (h > availHpx) { h = availHpx; w = h * m.w / m.h; }
          body += `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>${drawing(m, w, h)}</w:p>`;
        } else if (b.k === 'table' && b.td) {
          const d = b.td, tot = d.colW.reduce((a, x) => a + x, 0), k = Math.min(1, availPx / tot), cw = d.colW.map(x => tw(x * k)), bd = d.bw > 0 ? `w:val="single" w:sz="${Math.max(2, Math.round(d.bw * 6))}" w:space="0" w:color="${col(d.border)}"` : 'w:val="nil"';
          body += `<w:tbl><w:tblPr><w:tblW w:w="${cw.reduce((a, x) => a + x, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(e => `<w:${e} ${bd}/>`).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="${tw(d.pad / 2)}" w:type="dxa"/><w:left w:w="${tw(d.pad)}" w:type="dxa"/><w:bottom w:w="${tw(d.pad / 2)}" w:type="dxa"/><w:right w:w="${tw(d.pad)}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cw.map(x => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>`;
          d.cells.forEach((row, r) => {
            const head = d.header && r === 0, bodyI = r - (d.header ? 1 : 0), fill = head ? d.headerFill : d.alt && bodyI % 2 === 1 ? d.altFill : d.fill;
            body += `<w:tr>${head ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}` + row.map((t, c) => `<w:tc><w:tcPr><w:tcW w:w="${cw[c]}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${col(fill)}"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${runs(t, rpr(d.font, d.size, head, false, head ? d.headerColor : d.color))}</w:p></w:tc>`).join('') + '</w:tr>';
          });
          body += '</w:tbl>' + tiny();
        } else if (b.k === 'toc') {
          body += `<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="280"/><w:outlineLvl w:val="9"/></w:pPr>${runs(b.title || 'Table of Contents', rpr('Poppins', 28, true, false, '#00006E'))}</w:p>`;
          b.entries.forEach((e, i) => {
            const rp = rpr('Arial', e.level === 1 ? 16 : 13, e.level === 1, false, '#00006E');
            body += `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${availTw}"/></w:tabs><w:spacing w:before="40" w:after="40"/><w:ind w:left="${(e.level - 1) * 280}"/></w:pPr><w:hyperlink w:anchor="page_${e.page}" w:history="1">${runs(e.text, rp)}<w:r>${rp}<w:tab/></w:r>${field(` PAGEREF page_${e.page} \\h `, e.page, rp)}</w:hyperlink></w:p>`;
          });
        }
      }
      body += n < pages.length - 1 ? tiny(sect) : '';
      if (n === pages.length - 1) body += sect;
    }
    Object.values(media).forEach(m => { relsDoc += `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img${m.n}.png"/>`; });
    zip.file('[Content_Types].xml', `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${ct}</Types>`);
    zip.file('_rels/.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels', `${X}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsDoc}</Relationships>`);
    zip.file('word/document.xml', `${X}<w:document ${NS}><w:body>${body}</w:body></w:document>`);
    saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'Document.docx');
    App.status(`Word exported with editable text: ${pages.length} section(s), 2 cm margins (Document.docx). Shapes are not included.`);
  }

  /* ---- InDesign: IDML (InDesign Markup Language) ----
     A real .indd file is a closed binary format that no browser can write. IDML is Adobe's open exchange format: InDesign opens it
     with File ▸ Open (then File ▸ Save As gives an .indd). Pages, text frames, shapes, images, tables (as cell frames), the header/footer,
     paragraph styles, margins and bleed are all written as native InDesign objects. */
  async function idml() {
    if (!need('JSZip', 'JSZip')) throw new Error('the JSZip library did not load – check your internet connection');
    if (!S.pages.length) throw new Error('there are no pages to export');
    App.saveCurPage();
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', PK = 'xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging"', V = 'DOMVersion="8.0"';
    const esc = v => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const pt = v => +(v * 0.75).toFixed(3), num = v => +(+v).toFixed(3);
    let uid = 0; const id = () => 'u' + (++uid).toString(36);
    const colors = new Map(), LAYER = 'uLayer1', MASTER = 'uMaster1';
    const colorRef = c => {
      if (!c || c === 'transparent' || typeof c !== 'string') return 'Swatch/None';
      let h = null, m;
      if ((m = /^#([0-9a-f]{3})$/i.exec(c))) h = m[1].split('').map(x => x + x).join('');
      else if ((m = /^#([0-9a-f]{6})/i.exec(c))) h = m[1];
      else if ((m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(c))) h = [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
      if (!h) return 'Color/Black';
      h = h.toUpperCase(); colors.set(h, `Color/c${h}`); return `Color/c${h}`;
    };
    const path = (pts, open = false) => `<Properties><PathGeometry><GeometryPathType PathOpen="${open}"><PathPointArray>${pts.map(p => `<PathPointType Anchor="${num(p[0])} ${num(p[1])}" LeftDirection="${num(p[2] ?? p[0])} ${num(p[3] ?? p[1])}" RightDirection="${num(p[4] ?? p[0])} ${num(p[5] ?? p[1])}"/>`).join('')}</PathPointArray></GeometryPathType></PathGeometry></Properties>`;
    const rectPts = (w, h) => [[0, 0], [0, h], [w, h], [w, 0]];
    const ovalPts = (w, h) => { const cx = w / 2, cy = h / 2, kx = cx * 0.5523, ky = cy * 0.5523; return [[cx, 0, cx - kx, 0, cx + kx, 0], [w, cy, w, cy - ky, w, cy + ky], [cx, h, cx + kx, h, cx - kx, h], [0, cy, 0, cy + ky, 0, cy - ky]]; };
    const geo = (r, extra = {}) => `Self="${id()}" ItemLayer="${LAYER}" ItemTransform="1 0 0 1 ${num(pt(r.l) - extra.px)} ${num(pt(r.t) - extra.py)}"`;

    // ---- text ----
    const paraXml = (o, text, colorHex, bold, italic, size, lead, align, before, after, font) => {
      const lines = String(text).replace(/\r/g, '').split('\n');
      return lines.map((ln, i) => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle" Justification="${{ center: 'CenterAlign', right: 'RightAlign', justify: 'LeftJustified' }[align] || 'LeftAlign'}" SpaceBefore="${pt(before)}" SpaceAfter="${pt(after)}"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" FillColor="${colorRef(colorHex)}" PointSize="${num(pt(size))}" Leading="${num(pt(lead))}" FontStyle="${bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular'}"><Properties><AppliedFont type="string">${esc(font || 'Arial')}</AppliedFont></Properties><Content>${esc(ln)}</Content>${i < lines.length - 1 ? '<Br/>' : ''}</CharacterStyleRange></ParagraphStyleRange>`).join('');
    };
    const stories = [];
    const textFrame = (r, px, py, storyBody, fill, stroke, sw, inset) => {
      const sid = id(); stories.push({ sid, body: storyBody });
      const w = pt(r.w), h = pt(r.h);
      return `<TextFrame ${geo(r, { px, py })} ParentStory="${sid}" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" FillColor="${fill || 'Swatch/None'}" StrokeColor="${stroke || 'Swatch/None'}" StrokeWeight="${num(sw || 0)}">${path(rectPts(w, h))}<TextFramePreference TextColumnCount="1" TextColumnGutter="0">${inset ? `<Properties><InsetSpacing type="list">${[1, 2, 3, 4].map(() => `<ListItem type="unit">${inset}</ListItem>`).join('')}</InsetSpacing></Properties>` : ''}</TextFramePreference></TextFrame>`;
    };

    // ---- one page ----
    const pageXml = async (i) => withPage(i, async cv => {
      const [pw, ph] = dimsOf(i), PW = pt(pw), PH = pt(ph), px = PW / 2, py = PH / 2, out = [];
      const list = [];
      const flat = o => { if (o.isGrid || o.visible === false) return; if (o.type === 'group') { try { o._restoreObjectsState(); } catch (e) { /* keep group box */ } (o._objects || []).forEach(flat); } else list.push(o); };
      cv.getObjects().forEach(flat);
      if (!/^#?f{3,6}$/i.test(bgOf(i).replace('#', ''))) out.push(`<Rectangle ${geo({ l: 0, t: 0 }, { px, py })} ContentType="GraphicType" FillColor="${colorRef(bgOf(i))}" StrokeColor="Swatch/None" StrokeWeight="0">${path(rectPts(PW, PH))}</Rectangle>`);
      for (const o of list) {
        const bb = o.getBoundingRect(true, true), r = { l: bb.left, t: bb.top, w: Math.max(1, bb.width), h: Math.max(1, bb.height) }, w = pt(r.w), h = pt(r.h);
        const stroke = o.stroke ? colorRef(o.stroke) : 'Swatch/None', sw = o.stroke ? pt((o.strokeWidth || 0) * (o.scaleX || 1)) : 0, fill = colorRef(o.fill);
        if (/^(textbox|i-text|text)$/.test(o.type)) {
          const size = (o.fontSize || 16) * (o.scaleY || 1), lh = size * (o.lineHeight || 1.2) * 1.13;
          out.push(textFrame(r, px, py, paraXml(o, o.text || '', o.fill, o.fontWeight === 'bold' || +o.fontWeight >= 600, o.fontStyle === 'italic', size, lh, o.textAlign || 'left', o.beforeSpace || 0, o.afterSpace || 0, o.fontFamily), null, null, 0));
        } else if (o.type === 'table') {
          const d = o.tableData, k = (o.scaleX || 1);
          o.cellRects().forEach(c => {
            const head = d.header && c.r === 0, body = c.r - (d.header ? 1 : 0), cr = { l: r.l + c.x * k, t: r.t + c.y * (o.scaleY || 1), w: c.w * k, h: c.h * (o.scaleY || 1) };
            out.push(textFrame(cr, px, py, paraXml(o, c.text, head ? d.headerColor : d.color, head, false, d.size, d.size * 1.3, 'left', 0, 0, d.font), colorRef(head ? d.headerFill : (d.alt && body % 2 === 1 ? d.altFill : d.fill)), d.bw > 0 ? colorRef(d.border) : 'Swatch/None', pt(d.bw), pt(d.pad)));
          });
        } else if (o.type === 'image' && /^data:image\//.test(o.getSrc ? o.getSrc() : o.src || '')) {
          const src = o.getSrc ? o.getSrc() : o.src, nw = o.width || 1, nh = o.height || 1, sx = w / nw, sy = h / nh;
          out.push(`<Rectangle ${geo(r, { px, py })} ContentType="GraphicType" FillColor="Swatch/None" StrokeColor="${stroke}" StrokeWeight="${num(sw)}">${path(rectPts(w, h))}<Image Self="${id()}" ItemTransform="${num(sx)} 0 0 ${num(sy)} 0 0" ImageRenderingIntent="UseColorSettings"><Properties><Profile type="string">$ID/Embedded</Profile><GraphicBounds Left="0" Top="0" Right="${nw}" Bottom="${nh}"/><Contents><![CDATA[${src.split(',')[1]}]]></Contents></Properties><Link Self="${id()}" LinkResourceURI="file:image-${uid}.png" StoredState="Embedded"/></Image></Rectangle>`);
        } else if (o.type === 'circle' || o.type === 'ellipse') {
          out.push(`<Oval ${geo(r, { px, py })} ContentType="GraphicType" FillColor="${fill}" StrokeColor="${stroke}" StrokeWeight="${num(sw)}">${path(ovalPts(w, h))}</Oval>`);
        } else if (o.type === 'triangle') {
          out.push(`<Polygon ${geo(r, { px, py })} ContentType="GraphicType" FillColor="${fill}" StrokeColor="${stroke}" StrokeWeight="${num(sw)}">${path([[w / 2, 0], [w, h], [0, h]])}</Polygon>`);
        } else if (o.type === 'polygon' && o.points) {
          const xs = o.points.map(p => p.x), ys = o.points.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), sx = w / Math.max(1e-6, Math.max(...xs) - x0), sy = h / Math.max(1e-6, Math.max(...ys) - y0);
          out.push(`<Polygon ${geo(r, { px, py })} ContentType="GraphicType" FillColor="${fill}" StrokeColor="${stroke}" StrokeWeight="${num(sw)}">${path(o.points.map(p => [(p.x - x0) * sx, (p.y - y0) * sy]))}</Polygon>`);
        } else if (o.type === 'line') {
          const down = (o.y2 - o.y1) * (o.x2 - o.x1) >= 0;
          out.push(`<GraphicLine ${geo(r, { px, py })} ContentType="GraphicType" FillColor="Swatch/None" StrokeColor="${stroke}" StrokeWeight="${num(sw || 0.5)}">${path(down ? [[0, 0], [w, h]] : [[0, h], [w, 0]], true)}</GraphicLine>`);
        } else if (o.type === 'rect') {
          out.push(`<Rectangle ${geo(r, { px, py })} ContentType="GraphicType" FillColor="${fill}" StrokeColor="${stroke}" StrokeWeight="${num(sw)}">${path(rectPts(w, h))}</Rectangle>`);
        }
      }
      const spreadId = id(), pageId = id();
      const G = S.guides, mt = pt(G.m), ml = pt(G.mL ?? G.m);
      return `${X}<idPkg:Spread ${PK} ${V}><Spread Self="${spreadId}" PageCount="1" BindingLocation="0" AllowPageShuffle="true" ShowMasterItems="true" FlattenerOverride="Default" ItemTransform="1 0 0 1 0 0" AppliedMaster="${MASTER}"><Page Self="${pageId}" Name="${i + 1}" AppliedMaster="${MASTER}" GeometricBounds="0 0 ${PH} ${PW}" ItemTransform="1 0 0 1 ${-px} ${-py}" MasterPageTransform="1 0 0 1 0 0" OverrideList="" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true"><MarginPreference ColumnCount="1" ColumnGutter="12" Top="${mt}" Bottom="${mt}" Left="${ml}" Right="${mt}" ColumnDirection="Horizontal"/></Page>${out.join('')}</Spread></idPkg:Spread>`;
    });

    const n = S.pages.length, spreads = [];
    for (let i = 0; i < n; i++) { App.status(`Building InDesign page ${i + 1}/${n}…`); spreads.push(await pageXml(i)); }
    const [w0, h0] = dimsOf(0), bleed = pt(S.guides.bleed || 0);
    const zip = new JSZip(), put = (n, c, o = {}) => zip.file(n, c, { createFolders: false, ...o });   // no empty folder entries in an IDML package
    put('mimetype', 'application/vnd.adobe.indesign-idml-package', { compression: 'STORE' });
    put('META-INF/container.xml', `${X}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles></container>`);
    // styles: the app's paragraph styles become InDesign paragraph styles
    const pstyles = S.styles.map(st => `<ParagraphStyle Self="ParagraphStyle/${encodeURIComponent(st.name)}" Name="${esc(st.name)}" FillColor="${colorRef(st.color)}" PointSize="${num(pt(st.size))}" FontStyle="${st.bold ? 'Bold' : st.italic ? 'Italic' : 'Regular'}" SpaceBefore="${pt(st.before || 0)}" SpaceAfter="${pt(st.after || 0)}"><Properties><AppliedFont type="string">${esc(st.font)}</AppliedFont></Properties></ParagraphStyle>`).join('');
    put('Resources/Styles.xml', `${X}<idPkg:Styles ${PK} ${V}><RootCharacterStyleGroup Self="uRCSG"><CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]"/></RootCharacterStyleGroup><RootParagraphStyleGroup Self="uRPSG"><ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" Imported="false"/><ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" Imported="false"/>${pstyles}</RootParagraphStyleGroup><RootCellStyleGroup Self="uRCeSG"><CellStyle Self="CellStyle/$ID/[None]" Name="$ID/[None]"/></RootCellStyleGroup><RootTableStyleGroup Self="uRTSG"><TableStyle Self="TableStyle/$ID/[No table style]" Name="$ID/[No table style]"/></RootTableStyleGroup><RootObjectStyleGroup Self="uROSG"><ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]"/></RootObjectStyleGroup></idPkg:Styles>`);
    put('Resources/Graphic.xml', `${X}<idPkg:Graphic ${PK} ${V}><Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/><Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper"/>${[...colors].map(([h, ref]) => `<Color Self="${ref}" Model="Process" Space="RGB" ColorValue="${[0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)).join(' ')}" Name="${h}"/>`).join('')}<Swatch Self="Swatch/None" Name="None" ColorEditable="false" ColorRemovable="false"/></idPkg:Graphic>`);
    put('Resources/Fonts.xml', `${X}<idPkg:Fonts ${PK} ${V}/>`);
    put('Resources/Preferences.xml', `${X}<idPkg:Preferences ${PK} ${V}><DocumentPreference PageHeight="${pt(h0)}" PageWidth="${pt(w0)}" PagesPerDocument="${n}" FacingPages="false" DocumentBleedTopOffset="${bleed}" DocumentBleedBottomOffset="${bleed}" DocumentBleedInsideOrLeftOffset="${bleed}" DocumentBleedOutsideOrRightOffset="${bleed}" DocumentBleedUniformSize="true"/><MarginPreference ColumnCount="1" ColumnGutter="12" Top="${pt(S.guides.m)}" Bottom="${pt(S.guides.m)}" Left="${pt(S.guides.mL ?? S.guides.m)}" Right="${pt(S.guides.m)}"/></idPkg:Preferences>`);
    put('XML/Tags.xml', `${X}<idPkg:Tags ${PK} ${V}><XMLTag Self="XMLTag/Root" Name="Root"><Properties><TagColor type="enumeration">LightBlue</TagColor></Properties></XMLTag></idPkg:Tags>`);
    put('XML/BackingStory.xml', `${X}<idPkg:BackingStory ${PK} ${V}><XmlStory Self="uBackingStory" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n"><XMLElement Self="uRootEl" MarkupTag="XMLTag/Root" XMLContent="uBackingStory"/></XmlStory></idPkg:BackingStory>`);
    put(`MasterSpreads/MasterSpread_${MASTER}.xml`, `${X}<idPkg:MasterSpread ${PK} ${V}><MasterSpread Self="${MASTER}" Name="A-Master" NamePrefix="A" BaseName="Master" ShowMasterItems="true" PageCount="1" ItemTransform="1 0 0 1 0 0"><Page Self="uMasterPage1" Name="A" AppliedMaster="n" GeometricBounds="0 0 ${pt(h0)} ${pt(w0)}" ItemTransform="1 0 0 1 ${-pt(w0) / 2} ${-pt(h0) / 2}" OverrideList="" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true"/></MasterSpread></idPkg:MasterSpread>`);
    const spreadIds = [];
    spreads.forEach((xml, i) => { const m = /<Spread Self="([^"]+)"/.exec(xml)[1]; spreadIds.push(m); put(`Spreads/Spread_${m}.xml`, xml); });
    stories.forEach(st => put(`Stories/Story_${st.sid}.xml`, `${X}<idPkg:Story ${PK} ${V}><Story Self="${st.sid}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n"><StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/><InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false"/>${st.body}</Story></idPkg:Story>`));
    put('designmap.xml', `${X}<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="8.0(370)" ?><Document ${PK} ${V} Self="d" StoryList="${stories.map(s => s.sid).join(' ')}" Name="Document" ZeroPoint="0 0" ActiveLayer="${LAYER}" CMYKProfile="U.S. Web Coated (SWOP) v2" RGBProfile="sRGB IEC61966-2.1"><idPkg:Graphic src="Resources/Graphic.xml"/><idPkg:Fonts src="Resources/Fonts.xml"/><idPkg:Styles src="Resources/Styles.xml"/><idPkg:Preferences src="Resources/Preferences.xml"/><idPkg:Tags src="XML/Tags.xml"/><Layer Self="${LAYER}" Name="Layer 1" Visible="true" Locked="false" IgnoreWrap="false" ShowGuides="true" LockGuides="false" UI="true" Expendable="true" Printable="true"><Properties><LayerColor type="enumeration">LightBlue</LayerColor></Properties></Layer><idPkg:MasterSpread src="MasterSpreads/MasterSpread_${MASTER}.xml"/>${spreadIds.map(m => `<idPkg:Spread src="Spreads/Spread_${m}.xml"/>`).join('')}<idPkg:BackingStory src="XML/BackingStory.xml"/>${stories.map(s => `<idPkg:Story src="Stories/Story_${s.sid}.xml"/>`).join('')}</Document>`);
    saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.adobe.indesign-idml-package' }), 'Document.idml');
    App.status(`InDesign file exported: ${n} page(s), ${stories.length} text frame(s) (Document.idml – open it with File ▸ Open in InDesign)`);
  }

  /* ---- native project file ---- */
  function project() {
    App.commit();
    const { pages, styles, hdr, ftr, guides, paper } = S;
    saveBlob(new Blob([JSON.stringify({ pages, styles, hdr, ftr, guides, paper, version: '6.0' })], { type: 'application/json' }), `Project-${new Date().toISOString().slice(0, 10)}.idproj`);
  }
  async function open(txt) {
    try {
      const d = JSON.parse(txt); if (!d.pages || !d.pages.length) throw 0;
      Object.assign(S, d); S.cur = 0; App.mod.guides.ensureLeft(); App.mod.hf.migrate(); App.applyPaper(); await App.showPage(0);
      App.mod.obj.renderStyles(); App.mod.guides.syncUI(); App.mod.hf.fillForm(); App.syncPaperUI(); App.zoomFit(); App.commit('PROJECT OPENED');
    } catch (e) { App.status('Not a valid InDesign Pro project (.idproj/.json). This is not an Adobe .indd file.'); }
  }
  async function importFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const addImportedText = async text => {
      const lines = (text || '').replace(/\r/g, '').split(/\n+/).map(x => x.trim()).filter(Boolean);
      if (!lines.length) throw new Error('No readable text was found in this file.');
      const b = App.box(); let y = b.t + 20;
      for (const line of lines) {
        if (y > b.b - 50) { S.pages.push({ json: { version: '5.3.0', objects: [] }, isTOC: false }); await App.showPage(S.pages.length - 1); y = App.box().t + 20; }
        canvas.add(App.mod.obj.makeText(line, 'Normal', b.l + 10, y, Math.max(120, b.r - b.l - 20))); y += 38;
      }
      canvas.renderAll(); App.commit(`Imported text from ${file.name}`);
    };
    try {
      if (ext === 'idproj' || ext === 'indesign' || ext === 'json') { open(await file.text()); return; }
      if (ext === 'docx' && window.mammoth) { const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() }); await addImportedText(r.value); return; }
      if (ext === 'pdf' && window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; let all = '';
        for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i), c = await page.getTextContent(); all += c.items.map(x => x.str).join(' ') + '\n'; }
        await addImportedText(all); return;
      }
      if (ext === 'idml' && window.JSZip) {
        const z = await JSZip.loadAsync(await file.arrayBuffer()); let all = '';
        for (const [name, entry] of Object.entries(z.files)) if (/Stories\/Story_.*\.xml$/i.test(name)) { const xml = await entry.async('text'); all += ' ' + [...new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('Content')].map(n => n.textContent).join(' ') + '\n'; }
        await addImportedText(all); App.status('IDML text imported. Layout styling may need rebuilding.'); return;
      }
      if (ext === 'rtf' || ext === 'txt' || ext === 'html' || ext === 'htm' || ext === 'xml') {
        let t = await file.text(); if (ext !== 'txt') { const d = new DOMParser().parseFromString(t, 'text/html'); t = d.body ? d.body.textContent : t; }
        t = t.replace(/\\par\b/g, '\n').replace(/\\[a-z]+-?\d* ?/gi, ' ').replace(/[{}]/g, ' '); await addImportedText(t); return;
      }
      if (ext === 'indd') { App.status('INDD is a proprietary binary format and cannot be parsed in-browser. Export it from InDesign as IDML, then import the .idml file.'); return; }
      App.status(`Import of .${ext} is not supported. Try DOCX, PDF, IDML, RTF, TXT, or project JSON.`);
    } catch (e) { App.status(`Import failed: ${e.message || 'Unsupported or damaged file'}`); }
  }
  return { render, png: safe('PNG', png), pdf: safe('PDF', pdf), pdfExact: safe('PDF', pdfExact), pptx: safe('PowerPoint', pptx), docx: safe('Word', docx), idml: safe('InDesign', idml), project, open, importFile };
})();
