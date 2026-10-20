// Gerador de PDF mínimo, sem dependências: A4, fontes padrão Helvetica
// (regular/negrito, codificação WinAnsi — acentos do português funcionam),
// retângulos, texto com quebra de linha, KPIs, tabelas com quebra de página
// e barras horizontais. Serve aos relatórios da tela "Relatórios".
window.PdfLite = (function () {
  const PW = 595.28;
  const PH = 841.89;
  const M = 42; // margem
  const CW = PW - M * 2; // largura útil
  const FOOTER = 34;

  // Larguras Helvetica (AFM) para ASCII 32..126, em milésimos de em.
  const W_REG = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ];
  const W_BOLD = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ];
  const SPECIAL = { "—": [0x97, 1000], "–": [0x96, 556], "•": [0x95, 350], "…": [0x85, 1000], "‘": [0x91, 222], "’": [0x92, 222], "“": [0x93, 333], "”": [0x94, 333] };

  // Texto -> string "latin1" (WinAnsi) segura para o PDF.
  function enc(str) {
    let out = "";
    for (const ch of String(str ?? "")) {
      const code = ch.codePointAt(0);
      if (SPECIAL[ch]) out += String.fromCharCode(SPECIAL[ch][0]);
      else if (code >= 32 && code <= 126) out += ch;
      else if (code >= 160 && code <= 255) out += ch;
      else out += "?";
    }
    return out;
  }
  const esc = (s) => s.replace(/[\\()]/g, (c) => "\\" + c);

  function width(str, size, bold) {
    const table = bold ? W_BOLD : W_REG;
    let w = 0;
    for (const ch of String(str ?? "")) {
      if (SPECIAL[ch]) {
        w += SPECIAL[ch][1];
        continue;
      }
      const base = ch.normalize("NFD")[0];
      const code = base.charCodeAt(0);
      w += code >= 32 && code <= 126 ? table[code - 32] : 556;
    }
    return (w * size) / 1000;
  }

  function fit(str, maxW, size, bold) {
    str = String(str ?? "");
    if (width(str, size, bold) <= maxW) return str;
    while (str.length > 1 && width(str + "…", size, bold) > maxW) str = str.slice(0, -1);
    return str.trimEnd() + "…";
  }

  function wrap(str, maxW, size, bold) {
    const lines = [];
    String(str ?? "")
      .split("\n")
      .forEach((para) => {
        let line = "";
        para.split(/\s+/).filter(Boolean).forEach((word) => {
          const test = line ? line + " " + word : word;
          if (line && width(test, size, bold) > maxW) {
            lines.push(line);
            line = word;
          } else line = test;
        });
        lines.push(line);
      });
    return lines;
  }

  const rgb = (c) => c.map((v) => (v / 255).toFixed(3)).join(" ");
  const num = (n) => n.toFixed(2);

  // Paleta dos relatórios
  const C = {
    ink: [24, 38, 46],
    muted: [104, 118, 126],
    brand: [10, 44, 55],
    mint: [127, 227, 208],
    teal: [21, 114, 100],
    headFill: [226, 240, 237],
    zebra: [244, 249, 248],
    line: [205, 220, 218],
    white: [255, 255, 255],
    red: [214, 40, 48],
    yellow: [200, 150, 10],
    green: [0, 150, 80],
  };

  class Doc {
    constructor(meta) {
      this.meta = meta || {};
      this.pages = [];
      this.y = 0;
      this.addPage();
    }

    addPage() {
      this.ops = [];
      this.pages.push(this.ops);
      this.y = M;
    }
    ensure(h) {
      if (this.y + h > PH - M - FOOTER) this.addPage();
    }

    // ---- primitivas (y = topo da caixa, medido a partir do topo da página)
    text(x, yTop, str, o = {}) {
      const size = o.size || 10;
      const bold = !!o.bold;
      let tx = x;
      if (o.align === "right") tx = x - width(str, size, bold);
      else if (o.align === "center") tx = x - width(str, size, bold) / 2;
      const base = PH - (yTop + size * 0.85);
      this.ops.push(
        `BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${rgb(o.color || C.ink)} rg ${num(tx)} ${num(base)} Td (${esc(enc(str))}) Tj ET`
      );
    }
    rect(x, yTop, w, h, o = {}) {
      const y = PH - yTop - h;
      if (o.fill) this.ops.push(`${rgb(o.fill)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
      if (o.stroke) this.ops.push(`${num(o.lw || 0.6)} w ${rgb(o.stroke)} RG ${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`);
    }
    hline(x1, x2, yTop, color, lw) {
      const y = PH - yTop;
      this.ops.push(`${num(lw || 0.6)} w ${rgb(color || C.line)} RG ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`);
    }

    // ---- blocos de layout
    header(title, subtitle, metaLines) {
      this.rect(0, 0, PW, 92, { fill: C.brand });
      this.text(M, 20, "ALGAMAR", { size: 9, bold: true, color: C.mint });
      this.text(M, 36, title, { size: 21, bold: true, color: C.white });
      if (subtitle) this.text(M, 63, subtitle, { size: 10, color: [190, 215, 215] });
      this.y = 108;
      (metaLines || []).forEach(([k, v]) => {
        this.text(M, this.y, k + ":", { size: 9, bold: true, color: C.muted });
        this.text(M + 78, this.y, v, { size: 9, color: C.ink });
        this.y += 13;
      });
      this.y += 8;
    }

    h2(str) {
      this.ensure(38);
      this.y += 10;
      this.text(M, this.y, str, { size: 13, bold: true, color: C.teal });
      this.y += 19;
      this.hline(M, M + CW, this.y - 3, C.teal, 0.8);
      this.y += 6;
    }

    paragraph(str, o = {}) {
      const size = o.size || 10;
      const lead = size * 1.45;
      wrap(str, CW, size, !!o.bold).forEach((line) => {
        this.ensure(lead);
        this.text(M, this.y, line, { size, color: o.color || C.ink, bold: o.bold });
        this.y += lead;
      });
      this.y += o.after ?? 6;
    }

    kpis(items) {
      const per = Math.min(4, items.length) || 1;
      const gap = 10;
      const bw = (CW - gap * (per - 1)) / per;
      for (let i = 0; i < items.length; i += per) {
        this.ensure(58);
        items.slice(i, i + per).forEach((k, j) => {
          const x = M + j * (bw + gap);
          this.rect(x, this.y, bw, 50, { fill: C.zebra, stroke: C.line });
          this.rect(x, this.y, 3, 50, { fill: k.color || C.teal });
          this.text(x + 12, this.y + 8, fit(k.label, bw - 20, 8, false), { size: 8, color: C.muted });
          // valor longo (ex.: nome de região) encolhe a fonte antes de cortar
          let vs = 15;
          while (vs > 10 && width(k.value, vs, true) > bw - 20) vs -= 0.5;
          this.text(x + 12, this.y + 22 + (15 - vs) / 2, fit(k.value, bw - 20, vs, true), { size: vs, bold: true, color: C.ink });
          if (k.hint) this.text(x + 12, this.y + 39, fit(k.hint, bw - 20, 7.5, false), { size: 7.5, color: C.muted });
        });
        this.y += 60;
      }
    }

    // cols: [{ title, w (fração), align }]; células: string ou { text, color, bold }
    table(cols, rows) {
      const size = 8.5;
      const rowH = 17;
      const total = cols.reduce((a, c) => a + c.w, 0);
      const xs = [];
      let acc = M;
      cols.forEach((c) => {
        xs.push(acc);
        acc += (c.w / total) * CW;
      });
      const cw = cols.map((c) => (c.w / total) * CW);

      const drawHead = () => {
        this.rect(M, this.y, CW, rowH + 1, { fill: C.headFill });
        cols.forEach((c, i) => {
          const tx = c.align === "right" ? xs[i] + cw[i] - 6 : xs[i] + 6;
          this.text(tx, this.y + 4.5, fit(c.title, cw[i] - 12, size, true), { size, bold: true, color: C.brand, align: c.align === "right" ? "right" : "left" });
        });
        this.y += rowH + 1;
      };

      this.ensure(rowH * 3);
      drawHead();
      if (!rows.length) {
        this.text(M + 6, this.y + 4.5, "Sem registros no período.", { size, color: C.muted });
        this.y += rowH + 6;
        return;
      }
      rows.forEach((row, r) => {
        if (this.y + rowH > PH - M - FOOTER) {
          this.addPage();
          drawHead();
        }
        if (r % 2) this.rect(M, this.y, CW, rowH, { fill: C.zebra });
        row.forEach((cell, i) => {
          const c = typeof cell === "object" && cell !== null ? cell : { text: cell };
          const tx = cols[i].align === "right" ? xs[i] + cw[i] - 6 : xs[i] + 6;
          this.text(tx, this.y + 4.5, fit(c.text, cw[i] - 12, size, !!c.bold), {
            size,
            bold: !!c.bold,
            color: c.color || C.ink,
            align: cols[i].align === "right" ? "right" : "left",
          });
        });
        this.y += rowH;
      });
      this.hline(M, M + CW, this.y, C.line);
      this.y += 8;
    }

    // items: [{ label, value (0..max), text, color }]
    bars(items, max) {
      const top = max || Math.max(...items.map((i) => i.value), 1);
      const labelW = 120;
      const valueW = 56;
      const trackW = CW - labelW - valueW - 8;
      items.forEach((it) => {
        this.ensure(20);
        this.text(M, this.y + 2, fit(it.label, labelW - 6, 9, false), { size: 9 });
        this.rect(M + labelW, this.y + 2, trackW, 10, { fill: [232, 240, 239] });
        this.rect(M + labelW, this.y + 2, Math.max(0, (it.value / top) * trackW), 10, { fill: it.color || C.teal });
        this.text(M + labelW + trackW + 8, this.y + 2, it.text ?? String(it.value), { size: 9, bold: true });
        this.y += 19;
      });
      this.y += 4;
    }

    space(n) {
      this.y += n;
    }

    // ---- saída
    output(footerText) {
      const n = this.pages.length;
      this.pages.forEach((ops, i) => {
        this.ops = ops;
        this.hline(M, PW - M, PH - M - 14, C.line);
        this.text(M, PH - M - 8, footerText || "Algamar", { size: 7.5, color: C.muted });
        this.text(PW - M, PH - M - 8, `Página ${i + 1} de ${n}`, { size: 7.5, color: C.muted, align: "right" });
      });

      const objs = [];
      objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
      objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
      objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
      const kids = [];
      this.pages.forEach((ops, i) => {
        const pageId = 5 + i * 2;
        const contentId = pageId + 1;
        kids.push(`${pageId} 0 R`);
        const stream = ops.join("\n");
        objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PW)} ${num(PH)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
        objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      });
      objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>`;
      const infoId = 5 + n * 2;
      const d = new Date();
      const pad = (v) => String(v).padStart(2, "0");
      const stamp = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      objs[infoId] = `<< /Title (${esc(enc(this.meta.title || "Relatório"))}) /Producer (Algamar) /Creator (Algamar) /CreationDate (${stamp}) >>`;

      let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
      const offsets = [];
      for (let id = 1; id <= infoId; id++) {
        offsets[id] = pdf.length;
        pdf += `${id} 0 obj\n${objs[id]}\nendobj\n`;
      }
      const xref = pdf.length;
      pdf += `xref\n0 ${infoId + 1}\n0000000000 65535 f \n`;
      for (let id = 1; id <= infoId; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
      pdf += `trailer\n<< /Size ${infoId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;

      const bytes = new Uint8Array(pdf.length);
      for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
      return new Blob([bytes], { type: "application/pdf" });
    }
  }

  return { Doc, colors: C, width, _widthTables: { W_REG, W_BOLD } };
})();
