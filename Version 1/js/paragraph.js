'use strict';
/* paragraph.js – extends every fabric Textbox with
   (1) paragraph space before / after, and
   (2) real text wrap: lines flow around images (square / tight / top-and-bottom) and never run underneath them */
(() => {
  const P = fabric.Textbox.prototype, lineH = fabric.Text.prototype.getHeightOfLine;
  const origWrap = P._wrapText, origEnlarge = P.enlargeSpaces, origLeft = P._getLineLeftOffset;
  const PUSH = ['square', 'tight', 'topbottom'], MIN_SEG = 40;
  P.beforeSpace = 0; P.afterSpace = 0;
  P._dimensionAffectingProps = P._dimensionAffectingProps.concat(['beforeSpace', 'afterSpace']);

  const starts = (t, i) => i > 0 && t.isEndOfWrapping(i - 1);
  const ends = (t, i) => i < t._textLines.length - 1 && t.isEndOfWrapping(i);
  // a row split by an image is several fabric "lines" sharing one y: every piece but the last has adv = false
  const shared = (t, i) => !!(t._rowFlags && t._rowFlags[i] && !t._rowFlags[i].adv);

  P.getHeightOfLine = function (i) {
    if (shared(this, i)) return 0;
    return lineH.call(this, i) + (starts(this, i) ? this.beforeSpace || 0 : 0) + (ends(this, i) ? this.afterSpace || 0 : 0);
  };
  P._renderTextCommon = function (ctx, method) {
    ctx.save();
    const left = this._getLeftOffset(), top = this._getTopOffset(); let y = 0;
    for (let i = 0; i < this._textLines.length; i++) {
      const h = lineH.call(this, i);
      if (starts(this, i)) y += this.beforeSpace || 0;
      this._renderTextLine(method, ctx, this._textLines[i], left + this._getLineLeftOffset(i), top + y + h / this.lineHeight, i);
      if (!shared(this, i)) y += h + (ends(this, i) ? this.afterSpace || 0 : 0);
    }
    ctx.restore();
  };
  P._getLineLeftOffset = function (i) {
    const f = this._rowFlags && this._rowFlags[i]; if (!f) return origLeft.call(this, i);
    const d = f.w - this.getLineWidth(i), a = this.textAlign;
    return f.x + (a === 'center' ? d / 2 : a === 'right' ? d : 0);
  };
  P.enlargeSpaces = function () { if (!this._rowFlags) return origEnlarge.call(this); };   // justify is left-aligned next to an image

  /* rectangles (relative to this text box) that text must avoid */
  P._exclusions = function () {
    const c = this.canvas; if (!c) return [];
    return c.getObjects().filter(o => o !== this && o.type === 'image' && !o.noTextWrap && !this.noTextWrap && PUSH.includes(o.wrapStyle)).map(o => {
      const p = { t: 10, r: 10, b: 10, l: 10, ...(o.wrapPad || {}) }, full = o.wrapStyle === 'topbottom';
      return { l: full ? -1e5 : o.left - p.l - this.left, r: full ? 1e5 : o.left + o.getScaledWidth() + p.r - this.left,
               t: o.top - p.t - this.top, b: o.top + o.getScaledHeight() + p.b - this.top, side: o.wrapSide || 'both' };
    }).filter(e => e.r > 0 && e.l < this.width);
  };
  /* free horizontal slots of one text row */
  P._segments = function (y, h, ex, W) {
    const hit = ex.filter(e => y < e.b && y + h > e.t); let segs = [[0, W]];
    hit.forEach(e => { segs = segs.flatMap(([a, b]) => (e.l >= b || e.r <= a) ? [[a, b]] : [[a, Math.min(b, e.l)], [Math.max(a, e.r), b]].filter(s => s[1] - s[0] > 0)); });
    segs = segs.filter(s => s[1] - s[0] >= MIN_SEG);
    const side = (hit.find(e => e.side !== 'both') || {}).side;
    if (segs.length > 1 && side) segs = side === 'left' ? [segs[0]] : side === 'right' ? [segs[segs.length - 1]] : [segs.reduce((m, s) => s[1] - s[0] > m[1] - m[0] ? s : m)];
    return segs;
  };

  P._wrapText = function (lines, desiredWidth) {
    const ex = this._exclusions();
    if (!ex.length) { this._rowFlags = null; return origWrap.call(this, lines, desiredWidth); }
    const out = [], flags = [], gs = fabric.util.string.graphemeSplit, lh = this.fontSize * this.lineHeight * this._fontSizeMult, full = { x: 0, w: desiredWidth, adv: true };
    let y = 0; this.isWrapping = true;
    try {
      lines.forEach((ln, li) => {
        if (li > 0) y += this.beforeSpace || 0;
        if (!ln.length) { out.push([]); flags.push(full); y += lh; }
        else {
          const words = ln.split(this._wordJoiners), sp = this._measureWord([' '], li, 0); let wi = 0, off = 0;
          while (wi < words.length) {
            const segs = this._segments(y, lh, ex, desiredWidth), row = [];
            segs.forEach(([a, b]) => {
              const W = b - a; let line = [], width = 0;
              while (wi < words.length) {
                const word = gs(words[wi]), ww = this._measureWord(word, li, off), add = line.length ? sp + ww : ww;
                if (line.length ? width + add > W : ww > W) break;
                if (line.length) line.push(' ');
                line = line.concat(word); width += add; wi++; off += word.length + 1;
              }
              if (line.length) row.push({ line, a, W });
            });
            if (!row.length) {
              if (segs.some(s => s[1] - s[0] >= desiredWidth - 1)) { const word = gs(words[wi]); row.push({ line: word, a: 0, W: desiredWidth }); wi++; off += word.length + 1; }   // word wider than the box: never loop forever
              else { out.push([]); flags.push(full); y += lh; continue; }                                                                                                   // row blocked by an image: skip it
            }
            row.forEach((p, k) => { out.push(p.line); flags.push({ x: p.a, w: p.W, adv: k === row.length - 1 }); });
            y += lh;
          }
        }
        if (li < lines.length - 1) y += this.afterSpace || 0;
      });
    } finally { this.isWrapping = false; }
    this._rowFlags = flags; return out;
  };
})();
