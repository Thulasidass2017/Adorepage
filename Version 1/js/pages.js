'use strict';
/* pages.js – page list, add/delete/reorder, table of contents */
App.mod.pages = (() => {
  const blank = () => ({ json: { version: '5.3.0', objects: [], background: '#fff' }, background: '#ffffff', isTOC: false, orient: App.pageOrient() });

  function renderList() {
    $('#pagesList').innerHTML = S.pages.map((p, i) =>
      `<div class="pageItem${i === S.cur ? ' active' : ''}" draggable="true" data-i="${i}"><span>☰ ${i + 1} ${p.isTOC ? 'TOC' : 'Page'}</span><b data-del="${i}">×</b></div>`).join('');
  }
  async function go(i) { App.saveCurPage(); await App.showPage(i); App.commit(); }

  async function add() {
    App.saveCurPage(); S.pages.splice(S.cur + 1, 0, blank());
    await App.showPage(S.cur + 1);
    const h1 = S.styles.find(s => s.name === 'Heading 1'); canvas.add(App.mod.obj.makeText(`Chapter ${S.cur + 1}`, 'Heading 1', h1?.x ?? App.box().l, h1?.y ?? 170, PAGE.w - 80)); App.commit();
  }
  async function remove(i = S.cur) {
    if (S.pages.length <= 1) return App.status('A document needs at least one page');
    if (!confirm(`Delete page ${i + 1}?`)) return;
    App.saveCurPage(); S.pages.splice(i, 1);
    await App.showPage(Math.min(S.cur, S.pages.length - 1)); App.commit();
  }
  function reorder(from, to) {
    if (from === to || from == null) return;
    App.saveCurPage(); const curPage = S.pages[S.cur];
    S.pages.splice(to, 0, S.pages.splice(from, 1)[0]);
    S.cur = S.pages.indexOf(curPage); renderList(); App.mod.hf.draw(S.cur + 1); App.commit();
  }

  function tocEntries() {
    return S.pages.flatMap((p, i) => p.isTOC ? [] : (p.json.objects || [])
      .filter(o => o.tocLevel > 0 && !o.isHF)
      .map(o => ({ text: (o.tocText || o.text || '').split('\n')[0].trim().substring(0, 55), level: o.tocLevel, page: i + 1 }))
      .filter(e => e.text));
  }
  /* TOC entries are clickable links: clicking a title or its page number jumps to that page */
  const TOC_TITLE = 'Table of Contents';
  const tocHeadingText = () => { for (const p of S.pages) if (p.isTOC) { const h = ((p.json && p.json.objects) || []).find(o => o.tocHeading); if (h && h.text) return h.text; } return TOC_TITLE; };
  function tocObjects(title) {
    const link = { selectable: false, evented: true, hoverCursor: 'pointer', hasControls: false }, b = App.box();
    // the heading is a normal text box (click it to change the wording / font); it is not listed in the TOC itself
    const objs = [new fabric.Textbox(title || tocHeadingText(), { left: b.l, top: b.t, width: b.r - b.l, fontFamily: 'Poppins', fontSize: 28, fontWeight: 'bold', fill: '#00006e', tocHeading: true, tocLevel: 0, styleName: 'TOC heading', lineHeight: 1.2 })];
    tocEntries().forEach((e, i) => {
      const y = b.t + 70 + i * 24, size = e.level === 1 ? 16 : 13;
      objs.push(new fabric.Text(e.text, { left: b.l + (e.level - 1) * 18, top: y, fontSize: size, fontFamily: 'Poppins', fill: '#000', tocPage: e.page, ...link }),
                new fabric.Text(String(e.page), { left: b.r, top: y, fontSize: 13, fontFamily: 'Poppins', originX: 'right', fill: '#000', tocPage: e.page, ...link }));
    });
    return objs;
  }
  async function addToc() {
    App.saveCurPage(); S.pages.splice(S.cur + 1, 0, { ...blank(), isTOC: true });
    await App.showPage(S.cur + 1);
    tocObjects().forEach(o => canvas.add(o)); App.commit('TOC created');
  }
  // rebuild every TOC page from the current headings (use after adding, editing, moving or deleting headings / pages)
  async function refreshToc() {
    const tocs = S.pages.map((p, i) => p.isTOC ? i : -1).filter(i => i >= 0);
    if (!tocs.length) return App.status('There is no TOC page yet – press + TOC first');
    App.saveCurPage();
    const objs = tocObjects().map(o => o.toObject(SERIAL));
    tocs.forEach(i => { S.pages[i].json.objects = JSON.parse(JSON.stringify(objs)); });
    renderList(); await App.showPage(S.cur); App.commit(`TOC refreshed (${tocEntries().length} entries, ${tocs.length} TOC page${tocs.length > 1 ? 's' : ''})`);
  }
  canvas.on('mouse:down', e => { const t = e.target; if (t && t.tocPage && S.pages[t.tocPage - 1]) go(t.tocPage - 1); });

  function bindList() {
    const l = $('#pagesList'); let from = null;
    l.addEventListener('click', e => {
      if (e.target.dataset.del) return remove(+e.target.dataset.del);
      const it = e.target.closest('.pageItem'); if (it && +it.dataset.i !== S.cur) go(+it.dataset.i);
    });
    l.addEventListener('dragstart', e => { from = +e.target.dataset.i; });
    l.addEventListener('dragover', e => { e.preventDefault(); const it = e.target.closest('.pageItem'); if (it) it.classList.add('drag-over'); });
    l.addEventListener('dragleave', e => { const it = e.target.closest('.pageItem'); if (it) it.classList.remove('drag-over'); });
    l.addEventListener('drop', e => { e.preventDefault(); const it = e.target.closest('.pageItem'); if (it) reorder(from, +it.dataset.i); });
  }
  return { renderList, go, add, remove, addToc, refreshToc, tocEntries, tocHeadingText, bindList };
})();
