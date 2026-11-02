'use strict';
/* importer.js – import Word (.docx), PDF, text/HTML/RTF, IDML and project files.
   The file is read and laid out on pages first; then a dialog offers two choices:
     1. New document                  – the imported pages replace the current document
     2. Add pages to current file     – the imported pages are added after the last page
   A Word file gives the same number of pages in the app as it has in Word: page breaks and Word's own "last rendered page break"
   marks (or the page count stored in the file) decide which content goes on which page; a page that is too full is scaled to fit. */
App.mod.imp = (() => {
  const NS = { w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main', wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing' };
  const kids = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
  const kid = (el, n) => kids(el, n)[0];
  const wattr = (el, n) => el ? (el.getAttributeNS(NS.w, n) ?? el.getAttribute('w:' + n)) : null;
  const xml = t => new DOMParser().parseFromString(t, 'application/xml');
  const on = el => { if (!el) return false; const v = wattr(el, 'val'); return v !== '0' && v !== 'false' && v !== 'off'; };

  /* ======================= Word (.docx) → blocks ======================= */
  async function parseDocx(buf) {
    const z = await JSZip.loadAsync(buf), docFile = z.file('word/document.xml');
    if (!docFile) throw new Error('this is not a Word .docx file');
    const doc = xml(await docFile.async('text')), body = doc.getElementsByTagNameNS(NS.w, 'body')[0];
    const styleName = {}, styleNum = {}, styleBase = {}, numFmt = {}, numAbs = {}, rels = {};
    if (z.file('word/styles.xml')) for (const st of xml(await z.file('word/styles.xml').async('text')).getElementsByTagNameNS(NS.w, 'style')) { const id = wattr(st, 'styleId'), n = kid(st, 'name'), np = kid(kid(st, 'pPr'), 'numPr'); styleName[id] = n ? wattr(n, 'val') : ''; styleBase[id] = wattr(kid(st, 'basedOn'), 'val'); if (np && kid(np, 'numId')) styleNum[id] = { numId: wattr(kid(np, 'numId'), 'val'), ilvl: +(wattr(kid(np, 'ilvl'), 'val') || 0) }; }
    if (z.file('word/numbering.xml')) {
      const nd = xml(await z.file('word/numbering.xml').async('text'));
      for (const a of nd.getElementsByTagNameNS(NS.w, 'abstractNum')) { const id = wattr(a, 'abstractNumId'); numFmt[id] = {}; kids(a, 'lvl').forEach(l => { numFmt[id][wattr(l, 'ilvl')] = wattr(kid(l, 'numFmt'), 'val'); }); }
      for (const n of nd.getElementsByTagNameNS(NS.w, 'num')) numAbs[wattr(n, 'numId')] = wattr(kid(n, 'abstractNumId'), 'val');
    }
    if (z.file('word/_rels/document.xml.rels')) for (const r of xml(await z.file('word/_rels/document.xml.rels').async('text')).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    let appPages = 0;
    if (z.file('docProps/app.xml')) { const m = /<Pages>(\d+)<\/Pages>/.exec(await z.file('docProps/app.xml').async('text')); if (m) appPages = +m[1]; }

    const blocks = [], counters = {}; let hardBreaks = 0, softBreaks = 0;
    const imageOf = async dr => {
      const blip = dr.getElementsByTagNameNS(NS.a, 'blip')[0]; if (!blip) return null;
      const target = rels[blip.getAttributeNS(NS.r, 'embed')]; if (!target) return null;
      const f = z.file('word/' + target.replace(/^\//, '').replace(/^word\//, '')) || z.file(target.replace(/^\//, '')); const ext = (target.split('.').pop() || '').toLowerCase();
      if (!f || !/^(png|jpe?g|gif|webp|bmp)$/.test(ext)) return null;
      const ex = dr.getElementsByTagNameNS(NS.wp, 'extent')[0];
      return { kind: 'image', src: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + await f.async('base64'), w: ex ? +ex.getAttribute('cx') / 9525 : 0, h: ex ? +ex.getAttribute('cy') / 9525 : 0 };
    };
    async function para(p) {
      const ppr = kid(p, 'pPr'), sid = wattr(kid(ppr, 'pStyle'), 'val'), sname = styleName[sid] || sid || '';
      let level = 0, m = /heading\s*(\d)/i.exec(sname);
      if (m) level = Math.min(3, +m[1]); else if (/^(title|titre)$/i.test(sname)) level = 1; else { const o = kid(ppr, 'outlineLvl'); if (o && +wattr(o, 'val') < 3) level = +wattr(o, 'val') + 1; }
      const jc = wattr(kid(ppr, 'jc'), 'val'), align = jc === 'both' ? 'justify' : jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : 'left';
      const numPr = kid(ppr, 'numPr'); let numId = numPr ? wattr(kid(numPr, 'numId'), 'val') : null, ilvl = numPr ? +(wattr(kid(numPr, 'ilvl'), 'val') || 0) : 0;
      if (!numId) for (let s2 = sid, g = 0; s2 && g < 8; s2 = styleBase[s2], g++) if (styleNum[s2]) { numId = styleNum[s2].numId; ilvl = styleNum[s2].ilvl; break; }   // numbering defined by the style (List Bullet / List Number …)
      const sect = kid(ppr, 'sectPr'), sectBreak = sect && !(kid(sect, 'type') && wattr(kid(sect, 'type'), 'val') === 'continuous');
      if (kid(ppr, 'pageBreakBefore') && on(kid(ppr, 'pageBreakBefore'))) { blocks.push({ kind: 'break' }); hardBreaks++; }
      let text = '', bold = 0, italic = 0;
      const flush = () => {
        const t = text.replace(/[ \t]+$/, ''); if (!t.trim()) { text = ''; bold = italic = 0; return; }
        let line = t, list = null;
        if (numId && numId !== '0') {
          const fmt = (numFmt[numAbs[numId]] || {})[ilvl], key = numId + ':' + ilvl;
          Object.keys(counters).forEach(k => { if (k.startsWith(numId + ':') && +k.split(':')[1] > ilvl) delete counters[k]; });
          if (fmt === 'bullet' || fmt === 'none') { list = 'bullet'; line = '   '.repeat(ilvl) + '• ' + t; }
          else { counters[key] = (counters[key] || 0) + 1; list = 'number'; line = '   '.repeat(ilvl) + counters[key] + '. ' + t; }
        }
        const last = blocks[blocks.length - 1];
        if (list && last && last.kind === 'text' && last.list === list && last.numId === numId) last.text += '\n' + line;   // consecutive list items stay one editable text box
        else blocks.push({ kind: 'text', text: line, level: list ? 0 : level, align, bold: !list && !level && bold > t.length * 0.6, italic: italic > t.length * 0.6, list, numId });
        text = ''; bold = italic = 0;
      };
      const run = async r => {
        const rpr = kid(r, 'rPr'), b = rpr && on(kid(rpr, 'b')), i = rpr && on(kid(rpr, 'i'));
        for (const c of r.children) {
          if (c.localName === 't') { text += c.textContent; if (b) bold += c.textContent.length; if (i) italic += c.textContent.length; }
          else if (c.localName === 'tab') text += '  ';
          else if (c.localName === 'noBreakHyphen') text += '-';
          else if (c.localName === 'br' || c.localName === 'cr') { if (wattr(c, 'type') === 'page') { flush(); blocks.push({ kind: 'break' }); hardBreaks++; } else text += '\n'; }
          else if (c.localName === 'lastRenderedPageBreak') { flush(); blocks.push({ kind: 'break', soft: true }); softBreaks++; }
          else if (c.localName === 'drawing') { const im = await imageOf(c); if (im) { flush(); blocks.push(im); } }
        }
      };
      const walkInline = async el => { for (const c of el.children) { if (c.localName === 'r') await run(c); else if (['hyperlink', 'ins', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(c.localName)) await walkInline(c); } };
      await walkInline(p); flush();
      if (sectBreak) { blocks.push({ kind: 'break' }); hardBreaks++; }
    }
    function table(t) {
      const rows = kids(t, 'tr').map(tr => kids(tr, 'tc').map(tc => kids(tc, 'p').map(p => [...p.getElementsByTagNameNS(NS.w, 't')].map(x => x.textContent).join('')).join('\n').trim()));
      const cols = Math.max(0, ...rows.map(r => r.length)); if (!rows.length || !cols) return;
      const widths = kids(kid(t, 'tblGrid'), 'gridCol').map(g => +wattr(g, 'w') / 15).filter(x => x > 0);
      blocks.push({ kind: 'table', rows: rows.map(r => Array.from({ length: cols }, (_, c) => r[c] || '')), widths: widths.length === cols ? widths : Array(cols).fill(100) });
    }
    async function walk(parent) {
      for (const el of [...parent.children]) {
        if (el.localName === 'p') await para(el); else if (el.localName === 'tbl') table(el);
        else if (el.localName === 'sdt') { const c = kid(el, 'sdtContent'); if (c) await walk(c); }
      }
    }
    await walk(body);
    return { blocks, appPages, hardBreaks, softBreaks };
  }

  /* ======================= blocks → page objects ======================= */
  const O = () => App.mod.obj;
  function textObj(bl, s, x, w) {
    const o = O().makeRaw(bl.text, bl.level ? 'Heading ' + bl.level : 'Normal', x, 0, w);
    o.set({ fontSize: Math.max(6, o.fontSize * s), beforeSpace: (o.beforeSpace || 0) * s, afterSpace: (o.afterSpace || 0) * s, textAlign: bl.align || 'left' });
    if (bl.bold) o.set('fontWeight', 'bold'); if (bl.italic) o.set('fontStyle', 'italic');
    return o;
  }
  async function imageObj(bl, s, w) {
    const img = await new Promise(res => fabric.Image.fromURL(bl.src, i => res(i)));
    if (!img || !img.width) return null;
    const b = App.box(), maxH = (b.b - b.t) * 0.7, wantW = Math.min(bl.w || img.width, w) * s, k = Math.min(wantW / img.width, maxH * s / img.height);
    img.set({ scaleX: k, scaleY: k, wrapStyle: 'inline', wrapSide: 'both', wrapPad: { t: 10, r: 10, b: 10, l: 10 } }); return img;
  }
  function tableObj(bl, s, w) {
    const cols = bl.rows[0].length, sum = bl.widths.reduce((a, x) => a + x, 0) || cols * 100, k = w / sum;
    return new fabric.Table({ tableData: { rows: bl.rows.length, cols, header: true, cells: bl.rows, colW: bl.widths.map(x => Math.max(24, x * k)), size: Math.max(6, (cols > 6 ? 10 : 12) * s), rowH: Math.max(14, 26 * s), pad: Math.max(2, 6 * s) } });
  }
  const makeObj = async (bl, s, w) => bl.kind === 'text' ? textObj(bl, s, App.box().l, w) : bl.kind === 'image' ? imageObj(bl, s, w) : bl.kind === 'table' ? tableObj(bl, s, w) : null;
  const hOf = o => o.getScaledHeight ? o.getScaledHeight() : o.height;

  async function layoutOne(blocks, s) {                       // everything of one source page on ONE page, at scale s
    const b = App.box(), w = b.r - b.l, objs = []; let y = b.t;
    for (const bl of blocks) { const o = await makeObj(bl, s, w); if (!o) continue; o.set({ left: b.l, top: y }); y += hOf(o) + 6 * s; objs.push(o); }
    return { objs, fits: y - 6 * s <= b.b + 0.5 };
  }
  async function fitOne(blocks) {
    for (let s = 1; s >= 0.5; s *= 0.93) { const r = await layoutOne(blocks, s); if (r.fits) return r.objs; }
    return null;
  }
  async function flow(blocks, s = 1) {                         // natural flow over as many pages as needed (long paragraphs are split)
    const b = App.box(), w = b.r - b.l, pages = []; let cur = [], y = b.t;
    const next = () => { if (cur.length) pages.push(cur); cur = []; y = b.t; };
    const put = (o, h) => { o.set({ left: b.l, top: y }); cur.push(o); y += h + 6 * s; };
    for (const bl of blocks) {
      if (bl.kind === 'text') {
        let rest = bl.text;
        while (rest.trim()) {
          const o = textObj({ ...bl, text: rest }, s, b.l, w), avail = b.b - y;
          if (hOf(o) <= avail) { put(o, hOf(o)); break; }
          const tok = rest.match(/\S+\s*|\n/g) || [rest]; let lo = 0, hi = tok.length;
          while (lo < hi) { const mid = (lo + hi + 1) >> 1; hOf(textObj({ ...bl, text: tok.slice(0, mid).join('') }, s, b.l, w)) <= avail ? lo = mid : hi = mid - 1; }
          if (lo === 0) { if (y > b.t) { next(); continue; } lo = 1; }
          const part = tok.slice(0, lo).join('').replace(/\s+$/, ''), po = textObj({ ...bl, text: part }, s, b.l, w); put(po, hOf(po)); rest = tok.slice(lo).join(''); next();
        }
      } else {
        const o = await makeObj(bl, s, w); if (!o) continue;
        if (y + hOf(o) > b.b && y > b.t) next(); put(o, hOf(o));
      }
    }
    next(); return pages;
  }
  const pageJson = objs => ({ json: { version: '5.3.0', objects: objs.map(o => o.toObject(SERIAL)), background: '#fff' }, background: '#ffffff', isTOC: false, orient: App.pageOrient() });

  // groups = one array of blocks per source page; fit = keep exactly one page per group
  async function buildPages(groups, fit) {
    const out = [];
    if (!fit) { (await flow(groups.flat())).forEach(p => out.push(pageJson(p))); return out; }
    for (const g of groups) {
      const one = await fitOne(g);
      if (one) out.push(pageJson(one)); else (await flow(g, 0.6)).forEach(p => out.push(pageJson(p)));   // far too much for one page: overflow onto extra pages
    }
    return out;
  }
  async function splitEvenly(blocks, n) {                      // no page marks in the file: cut the content into n pages of similar height
    const w = App.box().r - App.box().l, hs = []; for (const bl of blocks) { const o = await makeObj(bl, 1, w); hs.push(o ? hOf(o) + 6 : 0); }
    const total = hs.reduce((a, x) => a + x, 0), groups = [[]]; let acc = 0;
    blocks.forEach((bl, i) => { const g = groups.length; if (g < n && acc >= total * g / n && groups[g - 1].length) groups.push([]); groups[groups.length - 1].push(bl); acc += hs[i]; });
    return groups;
  }

  /* ======================= other formats ======================= */
  const paragraphsToBlocks = text => (text || '').replace(/\r/g, '').split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean).map(t => ({ kind: 'text', text: t, level: 0, align: 'left' }));
  async function parsePdf(buf) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise, groups = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const items = (await (await pdf.getPage(i)).getTextContent()).items.filter(x => x.str && x.str.trim()), lines = [];
      items.forEach(it => { const y = Math.round(it.transform[5]), h = Math.abs(it.transform[3]) || 10, ln = lines.find(l => Math.abs(l.y - y) < h * 0.4); if (ln) { ln.t += (ln.t.endsWith(' ') ? '' : ' ') + it.str; ln.h = Math.max(ln.h, h); } else lines.push({ y, h, t: it.str }); });
      lines.sort((a, b) => b.y - a.y);
      const med = lines.map(l => l.h).sort((a, b) => a - b)[Math.floor(lines.length / 2)] || 10, blocks = []; let prev = null;
      lines.forEach(l => { const head = l.h > med * 1.25 ? (l.h > med * 1.6 ? 1 : 2) : 0;
        if (prev && !head && !prev.level && prev.gapY - l.y < med * 1.7 && Math.abs(prev.gapY - l.y) > 0) { prev.text += ' ' + l.t; prev.gapY = l.y; }
        else { prev = { kind: 'text', text: l.t, level: head, align: 'left', gapY: l.y }; blocks.push(prev); } });
      groups.push(blocks);
    }
    return groups;
  }

  /* ======================= entry point: read → dialog → apply ======================= */
  let pending = null;
  async function analyze(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'idproj' || ext === 'indesign' || ext === 'json') { const text = await file.text(), d = JSON.parse(text); if (!d.pages) throw new Error('this is not a project file'); return { pages: d.pages, text, project: true, info: `Project file – ${d.pages.length} page(s)` }; }
    if (ext === 'indd') throw new Error('INDD is a closed Adobe format that a browser cannot read. In InDesign use File ▸ Export ▸ InDesign Markup (IDML), then import the .idml file.');
    if (ext === 'docx') {
      if (!window.JSZip) throw new Error('the JSZip library did not load – check your internet connection');
      const r = await parseDocx(await file.arrayBuffer()); let groups = [[]];
      r.blocks.forEach(b => { if (b.kind === 'break') { if (groups[groups.length - 1].length) groups.push([]); } else groups[groups.length - 1].push(b); });
      groups = groups.filter(g => g.length); if (!groups.length) throw new Error('No readable content was found in this Word file.');
      let fit = true, note = '';
      if (groups.length > 1) note = `Word page breaks found (${groups.length} pages).`;
      else if (r.appPages > 1) { groups = await splitEvenly(groups[0], r.appPages); note = `Word reports ${r.appPages} pages.`; }
      else if (r.appPages === 1) note = 'Word reports 1 page.';
      else fit = false;
      const pages = await buildPages(groups, fit);
      return { pages, info: `Word file – ${pages.length} page(s). ${note}${fit ? ' Content that does not fit a page is scaled down so the page count stays the same.' : ' Pages are filled in order.'}` };
    }
    if (ext === 'pdf') {
      if (!window.pdfjsLib) throw new Error('the PDF reader library did not load – check your internet connection');
      const groups = (await parsePdf(await file.arrayBuffer())).filter(g => g.length); if (!groups.length) throw new Error('No readable text was found in this PDF (scanned pages need OCR).');
      const pages = await buildPages(groups, true); return { pages, info: `PDF – ${groups.length} page(s) of text` };
    }
    let text = '';
    if (ext === 'idml' && window.JSZip) { const z = await JSZip.loadAsync(await file.arrayBuffer()); for (const [n, e] of Object.entries(z.files)) if (/Stories\/Story_.*\.xml$/i.test(n)) { const x = await e.async('text'); text += [...new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('Content')].map(c => c.textContent).join('') + '\n\n'; } }
    else if (['txt', 'rtf', 'html', 'htm', 'xml'].includes(ext)) {
      text = await file.text();
      if (ext !== 'txt') { if (ext === 'rtf') text = text.replace(/\\par\b/g, '\n').replace(/\\[a-z]+-?\d* ?/gi, ' ').replace(/[{}]/g, ' '); else { const d = new DOMParser().parseFromString(text, 'text/html'); text = d.body ? d.body.innerText || d.body.textContent : text; } }
    } else throw new Error(`Import of .${ext} is not supported. Use DOCX, PDF, IDML, RTF, TXT, HTML or a project file.`);
    const blocks = paragraphsToBlocks(text); if (!blocks.length) throw new Error('No readable text was found in this file.');
    const pages = await buildPages([blocks], false); return { pages, info: `${ext.toUpperCase()} file – ${pages.length} page(s)` };
  }

  async function importFile(file) {
    try {
      App.status(`Reading ${file.name}…`); pending = await analyze(file); pending.name = file.name;
      $('#impTitle').textContent = file.name; $('#impInfo').textContent = pending.info;
      $('#impAddBtn').querySelector('span').textContent = `Add ${pending.pages.length} page${pending.pages.length === 1 ? '' : 's'} to current file`;
      $('#importDialog').hidden = false; App.status(`${file.name}: choose how to import`);
    } catch (e) { pending = null; console.error(e); App.setError(`Import failed: ${e.message || e}`); App.status(`Import failed: ${e.message || 'unsupported or damaged file'}`); }
  }
  const close = () => { $('#importDialog').hidden = true; };
  async function apply(mode) {
    const p = pending; if (!p) return close(); close(); pending = null;
    try {
      if (mode === 'new') {
        if (p.project) { await App.mod.exp.open(p.text); App.status(`${p.name} opened as a new document`); return; }
        App.saveCurPage(); S.pages = p.pages; S.cur = 0; App.mod.pages.renderList(); await App.showPage(0); App.commit(`New document from ${p.name} (${p.pages.length} pages)`);
      } else {
        App.saveCurPage(); const start = S.pages.length; S.pages.push(...p.pages.map(pg => JSON.parse(JSON.stringify(pg))));
        App.mod.pages.renderList(); await App.showPage(start); App.commit(`${p.pages.length} page(s) from ${p.name} added to the current file`);
      }
    } catch (e) { console.error(e); App.setError(`Import failed: ${e.message || e}`); }
  }
  Object.assign(App.act, { importNew: () => apply('new'), importAdd: () => apply('add'), closeImport: close });
  App.mod.exp.importFile = importFile;
  return { importFile, parseDocx };
})();
