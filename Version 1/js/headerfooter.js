'use strict';
/* headerfooter.js – header/footer drawing (works on any canvas, so exports include them), on-canvas editing, lock */
App.mod.hf = (() => {
  const PH = 'Click to edit';
  const loadImg = url => new Promise(r => fabric.Image.fromURL(url, r));

  async function draw(pageNum, cv = canvas, editable = S.hfEdit) {
    const my = cv._hfTok = (cv._hfTok || 0) + 1;   // a newer draw on the same canvas cancels this one (logos load asynchronously)
    cv.getObjects().filter(o => o.isHF).forEach(o => cv.remove(o));
    const { l: L0, r: R0 } = App.box(), C0 = PAGE.w / 2;
    const { hdr, ftr } = S; const hx = +(hdr.x || 0), hy = hdr.y == null ? 2.5 * 37.8 : +hdr.y, fx = +(ftr.x || 0), fy = ftr.y == null ? PAGE.h - 1.5 * 37.8 : +ftr.y;
    const L = L0 + hx, R = R0 + hx, C = C0 + hx, X = { left: L, center: C, right: R };
    const FX = { left: L0 + fx, center: C0 + fx, right: R0 + fx };
    const base = { selectable: editable, evented: editable, isHF: true, lockMovementX: true, lockMovementY: true, hasControls: false, borderColor: '#16a34a' };
    // editable slots: the text lives in S.hdr / S.ftr; in edit mode empty slots show a grey placeholder
    const slot = (key, x, y, size, o = {}) => {
      const [g, k] = key.split('.'), val = S[g][k] || '';
      if (!val && !editable) return;
      cv.add(new fabric.IText(val || PH, { left: x, top: y, fontSize: size, fill: val ? '#222' : '#aaa', ...base, hfKey: key, editable, ...o }));
    };
    const line = y => cv.add(new fabric.Line([L, y, R, y], { stroke: '#999', strokeWidth: 0.8, ...base, selectable: false, evented: false }));
    // logos are fitted to a fixed height so any uploaded picture (or the Adore logo) gets a sensible size
    const logo = async (url, h, place) => {
      const im = await loadImg(url); if (!im || !im.width || cv._hfTok !== my) return;
      im.scaleToHeight(h); const w = im.getScaledWidth(), p = place(w, im.getScaledHeight());
      im.set({ left: p.x, top: p.y, ...base }); cv.add(im);
    };
    const isTocPage = !!(S.pages[pageNum - 1] && S.pages[pageNum - 1].isTOC);
    if (hdr.enabled) {
      if (hdr.line && !isTocPage) line(hy - 10);
      slot('hdr.left', L, hy, 10, { fontWeight: 'bold' }); slot('hdr.center', C, hy, 10, { originX: 'center' }); slot('hdr.right', R, hy, 10, { originX: 'right' });
      if (hdr.logo) {   // top corner, sitting just above the header rule
        const lh = +hdr.logoH || 34;
        await logo(hdr.logo, lh, (w, h) => ({ x: hdr.pos === 'right' ? R - w : hdr.pos === 'center' ? C - w / 2 : L, y: Math.max(8, hy - 10 - h - 6) }));
      }
    }
    if (cv._hfTok !== my) return;
    if (ftr.enabled) {
      if (ftr.line && !isTocPage) line(fy - 8);
      slot('ftr.left', FX.left, fy, 9, { fill: ftr.left ? '#555' : '#aaa' });
      const pn = { right: [FX.right, 'right'], left: [FX.left + 130, 'left'], center: [C0 + fx, 'center'] }[ftr.pagePos];
      if (pn) cv.add(new fabric.Text(String(pageNum), { left: pn[0], top: fy, fontSize: 11, originX: pn[1], fontWeight: 'bold', fill: '#000', ...base }));
      if (ftr.logo) await logo(ftr.logo, 26, (w, h) => ({ x: ftr.pos === 'right' ? FX.right - w : ftr.pos === 'center' ? FX.center - w / 2 : FX.left, y: fy - 4 }));
    }
    cv.renderAll();
  }

  // edits made on the canvas are written back to the settings, so they apply to every page and persist
  canvas.on('text:editing:entered', e => { if (e.target.hfKey && e.target.text === PH) e.target.selectAll(); });
  canvas.on('text:editing:exited', e => {
    const t = e.target; if (!t || !t.hfKey) return;
    const [g, k] = t.hfKey.split('.'); S[g][k] = t.text === PH ? '' : t.text;
    fillForm(); App.store.save(); setTimeout(() => draw(S.cur + 1), 0);
  });

  const FIELDS = { hdr: { enabled: 'enHeader', left: 'hLeft', center: 'hCenter', right: 'hRight', line: 'hLine', pos: 'hLogoPos', x: 'hX', y: 'hY', logoH: 'hLogoH' },
                   ftr: { enabled: 'enFooter', left: 'fLeft', line: 'fLine', pos: 'fLogoPos', pagePos: 'fPagePos', x: 'fX', y: 'fY' } };
  const eachField = fn => Object.entries(FIELDS).forEach(([g, map]) => Object.entries(map).forEach(([k, id]) => fn(S[g], k, $('#' + id), g)));
  function fillForm() {
    eachField((o, k, el, g) => { el.type === 'checkbox' ? el.checked = o[k] !== false : el.value = o[k] ?? (k === 'y' ? (g === 'hdr' ? 94.5 : PAGE.h - 56.7) : k === 'logoH' ? 34 : 0); });
    ['hdr', 'ftr'].forEach(g => { $('#' + g + 'Prev').innerHTML = S[g].logo ? `<img src="${S[g].logo}">` : 'No logo'; });
  }
  async function apply() { eachField((o, k, el) => { o[k] = el.type === 'checkbox' ? el.checked : (['x','y','logoH'].includes(k) ? (+el.value || 0) : el.value); }); await draw(S.cur + 1); App.store.save(); }
  function setLogo(which, url) { S[which].logo = url; if (which === 'hdr') S.hdr.brand = true; fillForm(); apply(); }
  const clearLogo = which => { S[which].logo = null; if (which === 'hdr') S.hdr.brand = true; fillForm(); apply(); App.status('Logo removed'); };
  const useAdoreLogo = which => { setLogo(which, ADORE_LOGO); App.status('Adore logo applied'); };
  // projects saved before the logo existed: put the Adore logo in the top-left corner of every page once
  function migrate() {
    if (S.hdr.brand) return; S.hdr.brand = true;
    if (!S.hdr.logo) { S.hdr.logo = ADORE_LOGO; S.hdr.pos = 'left'; if ((S.hdr.left || '').trim().toUpperCase() === 'ADORE') S.hdr.left = ''; }
    if (!S.hdr.logoH) S.hdr.logoH = 34;
  }

  function setLock(edit) {
    S.hfEdit = edit;
    if (!edit && App.active() && App.active().isHF) canvas.discardActiveObject();
    $('#editBtn').style.opacity = edit ? 1 : 0.5; $('#lockBtn').style.opacity = edit ? 0.5 : 1;
    $('#lockBtn').textContent = edit ? '🔓 Unlocked' : '🔒 Locked';
    $('#lockStatus').textContent = edit ? 'Edit mode: double-click header or footer text on the canvas to edit it. Changes apply to all pages.' : 'Locked: header and footer cannot be selected or edited on the canvas.';
    draw(S.cur + 1); App.status(edit ? 'HEADER/FOOTER EDIT MODE' : 'HEADER/FOOTER LOCKED');
  }
  return { draw, fillForm, apply, setLogo, clearLogo, useAdoreLogo, migrate, setLock };
})();
