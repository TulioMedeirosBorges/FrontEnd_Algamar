// Gerador de PDF mínimo, sem dependências: A4, fontes padrão Helvetica
// (regular/negrito, codificação WinAnsi — acentos do português funcionam),
// retângulos, texto com quebra de linha, KPIs, tabelas com quebra de página
// barras horizontais, gráfico de linhas e uma imagem JPEG (a logo no topo).
// Serve aos relatórios da tela "Relatórios".
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

  // Logo (LogoBranca.png) convertida para JPEG sobre a cor do topo do
  // relatório — o PDF embute JPEG direto (DCTDecode), sem precisar de
  // compressor. O PNG tem margem transparente: recorta antes. Fica em cache;
  // se a imagem falhar (ex.: página aberta via file://), o topo sai só com
  // texto, como antes.
  let logoPromise = null;
  function loadLogo(src) {
    if (logoPromise) return logoPromise;
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          const px = g.getImageData(0, 0, c.width, c.height).data;
          let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++)
              if (px[(y * c.width + x) * 4 + 3] > 16) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
              }
          if (x1 < 0) return resolve(null);
          const w = x1 - x0 + 1, h = y1 - y0 + 1;
          const scale = Math.min(1, 360 / w);
          const out = document.createElement("canvas");
          out.width = Math.round(w * scale);
          out.height = Math.round(h * scale);
          const o = out.getContext("2d");
          o.fillStyle = `rgb(${C.brand.join(",")})`;
          o.fillRect(0, 0, out.width, out.height);
          o.drawImage(img, x0, y0, w, h, 0, 0, out.width, out.height);
          const b64 = out.toDataURL("image/jpeg", 0.92).split(",")[1];
          resolve({ data: atob(b64), w: out.width, h: out.height });
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    return logoPromise;
  }

  class Doc {
    constructor(meta) {
      this.meta = meta || {};
      this.logo = this.meta.logo || null;
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
      let tx = M;
      if (this.logo) {
        const lh = 54;
        const lw = (this.logo.w / this.logo.h) * lh;
        this.ops.push(`q ${num(lw)} 0 0 ${num(lh)} ${num(M)} ${num(PH - 19 - lh)} cm /Im1 Do Q`);
        tx = M + lw + 18;
        this.rect(tx - 9, 22, 0.8, 50, { fill: [60, 100, 110] });
      }
      this.text(tx, 20, "ALGAMAR", { size: 9, bold: true, color: C.mint });
      this.text(tx, 36, title, { size: 21, bold: true, color: C.white });
      if (subtitle) this.text(tx, 63, fit(subtitle, PW - M - tx, 10, false), { size: 10, color: [190, 215, 215] });
      this.y = 108;
      (metaLines || []).forEach(([k, v]) => {
        this.text(M, this.y, k + ":", { size: 9, bold: true, color: C.muted });
        this.text(M + 78, this.y, v, { size: 9, color: C.ink });
        this.y += 13;
      });
      this.y += 8;
    }

    h2(str) {
      this.ensure(80); // título + o começo do conteúdo, para não sobrar órfão no pé da página
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

    // ---- gráficos de linha
    // opts: labels (eixo X); series: [{ name, color, values (null = sem dado),
    // bold }]; splitIdx: dali em diante é previsão (fundo destacado + linha
    // tracejada); yMin/yMax: escala (sem eles, ajusta aos dados; `zero`
    // força começar em 0); yFmt: rótulo do eixo Y; compact: versão pequena.
    drawChart(x, yTop, w, H, opts) {
      const { labels, series, splitIdx, compact } = opts;
      const fs = compact ? 6.5 : 7.5;
      const padL = compact ? 28 : 34, padB = compact ? 16 : 20, padT = compact ? 10 : 12;
      const x0 = x + padL, x1 = x + w - 4;
      const top = yTop + padT, bottom = yTop + H - padB;
      const n = labels.length;
      // Escala "redonda": passo 1/2/2,5/5 × 10^n, ~4 divisões. yMin/yMax
      // fixam as pontas (ex.: probabilidade 0–100%); `zero` começa em 0.
      const vals = series.flatMap((s) => s.values.filter((v) => v != null));
      const dmin = opts.yMin ?? (opts.zero ? Math.min(0, ...vals) : Math.min(...vals));
      const dmax = opts.yMax ?? Math.max(...vals);
      const raw = (dmax - dmin) / 4 || Math.abs(dmax) * 0.05 || 1;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const step = opts.yMin != null && opts.yMax != null ? (dmax - dmin) / 4 : [1, 2, 2.5, 5, 10].find((k) => raw / mag <= k) * mag;
      const lo = opts.yMin ?? Math.floor(dmin / step + 1e-9) * step;
      const hi = Math.max(opts.yMax ?? Math.ceil(dmax / step - 1e-9) * step, lo + step);
      const stepDec = (String(+step.toFixed(6)).split(".")[1] || "").length;
      const yFmt = opts.yFmt || ((v) => v.toLocaleString("pt-BR", { minimumFractionDigits: stepDec, maximumFractionDigits: stepDec }));
      const X = (i) => (n === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1));
      const Y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
      const P = (yy) => num(PH - yy);
      const hasSplit = splitIdx != null && splitIdx >= 0 && splitIdx < n;

      if (hasSplit) {
        const sx = X(splitIdx);
        this.rect(sx, top, x1 - sx, bottom - top, { fill: [236, 245, 250] });
        this.ops.push(`q 0.8 w ${rgb(C.teal)} RG [2 2] 0 d ${num(sx)} ${P(top)} m ${num(sx)} ${P(bottom)} l S Q`);
        this.text(sx + 3, top + 1, compact ? "hoje / previsão" : "previsão", { size: fs, bold: true, color: C.teal });
      }
      for (let v = lo, k = 0; v <= hi + step / 2; v += step, k++) {
        this.hline(x0, x1, Y(v), k === 0 ? C.muted : C.line, k === 0 ? 0.8 : 0.5);
        this.text(x0 - 4, Y(v) - fs / 2, yFmt(+v.toFixed(10)), { size: fs, color: C.muted, align: "right" });
      }
      // Rótulos do eixo X espaçados; o último sempre aparece, então o vizinho
      // que ficaria colado nele é pulado.
      const xStep = Math.ceil(n / (compact ? 5 : 10));
      labels.forEach((l, i) => {
        const show = i === n - 1 || (i % xStep === 0 && n - 1 - i >= xStep * 0.6);
        if (show) this.text(X(i), bottom + 5, l, { size: fs - 0.5, color: C.muted, align: "center" });
      });

      series.forEach((s) => {
        const lw = s.bold ? 2.2 : compact ? 1.5 : 1.3;
        const seg = (from, to, dash) => {
          const pts = [];
          for (let i = from; i <= to; i++) if (s.values[i] != null) pts.push([X(i), Y(s.values[i])]);
          if (pts.length < 2) return;
          this.ops.push(
            `q ${lw} w ${rgb(s.color)} RG 1 J 1 j ${dash ? "[4 2.5] 0 d " : ""}` +
              pts.map(([px, py], j) => `${num(px)} ${P(py)} ${j ? "l" : "m"}`).join(" ") +
              " S Q"
          );
        };
        const split = hasSplit ? splitIdx : n - 1;
        seg(0, split, false);
        seg(split, n - 1, true);
        s.values.forEach((v, i) => {
          if (v == null) return;
          const r = s.bold ? 2 : compact ? 1.2 : 1.5;
          this.rect(X(i) - r, Y(v) - r, r * 2, r * 2, { fill: s.color });
        });
      });
    }

    // Gráfico em largura total, com legenda das séries embaixo.
    lineChart(opts) {
      const H = opts.height || 190;
      const legendRows = Math.ceil(opts.series.length / 3);
      this.ensure(H + 20 + legendRows * 14);
      this.drawChart(M, this.y, CW, H, opts);
      this.y += H;
      const colW = CW / 3;
      opts.series.forEach((s, i) => {
        const lx = M + (i % 3) * colW, ly = this.y + Math.floor(i / 3) * 14;
        this.rect(lx, ly + 3, 14, s.bold ? 2.4 : 1.6, { fill: s.color });
        this.text(lx + 20, ly, fit(s.name, colW - 26, 8.5, !!s.bold), { size: 8.5, bold: !!s.bold });
      });
      this.y += legendRows * 14 + 10;
    }

    // Grade de gráficos pequenos (2 por linha). items: [{ title, badge,
    // chart (opts do drawChart) | empty (texto quando não há dado) }].
    chartGrid(items, cols = 2) {
      const gap = 16;
      const w = (CW - gap * (cols - 1)) / cols;
      const H = 118;
      const rowH = 16 + H + 12;
      for (let i = 0; i < items.length; i += cols) {
        this.ensure(rowH);
        items.slice(i, i + cols).forEach((it, j) => {
          const x = M + j * (w + gap);
          this.rect(x, this.y, w, rowH - 6, { stroke: C.line, lw: 0.5 });
          this.text(x + 8, this.y + 6, fit(it.title, w * 0.6, 9, true), { size: 9, bold: true, color: C.brand });
          if (it.badge) this.text(x + w - 8, this.y + 6.5, fit(it.badge, w * 0.4 - 12, 8, true), { size: 8, bold: true, color: C.teal, align: "right" });
          if (it.chart) this.drawChart(x + 2, this.y + 16, w - 6, H, Object.assign({ compact: true }, it.chart));
          else this.text(x + w / 2, this.y + 16 + H / 2 - 4, it.empty || "Sem dados.", { size: 8.5, color: C.muted, align: "center" });
        });
        this.y += rowH;
      }
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
        const xobj = this.logo ? ` /XObject << /Im1 ${5 + n * 2 + 1} 0 R >>` : "";
        objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PW)} ${num(PH)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${contentId} 0 R >>`;
        objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      });
      objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${n} >>`;
      const infoId = 5 + n * 2;
      const d = new Date();
      const pad = (v) => String(v).padStart(2, "0");
      const stamp = `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      objs[infoId] = `<< /Title (${esc(enc(this.meta.title || "Relatório"))}) /Producer (Algamar) /Creator (Algamar) /CreationDate (${stamp}) >>`;

      // Logo: objeto de imagem depois do Info (já referenciado como Im1 nas
      // páginas). `data` é o JPEG byte a byte numa string "latin1".
      let lastId = infoId;
      if (this.logo) {
        lastId = infoId + 1;
        objs[lastId] =
          `<< /Type /XObject /Subtype /Image /Width ${this.logo.w} /Height ${this.logo.h} /ColorSpace /DeviceRGB ` +
          `/BitsPerComponent 8 /Filter /DCTDecode /Length ${this.logo.data.length} >>\nstream\n${this.logo.data}\nendstream`;
      }

      let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
      const offsets = [];
      for (let id = 1; id <= lastId; id++) {
        offsets[id] = pdf.length;
        pdf += `${id} 0 obj\n${objs[id]}\nendobj\n`;
      }
      const xref = pdf.length;
      pdf += `xref\n0 ${lastId + 1}\n0000000000 65535 f \n`;
      for (let id = 1; id <= lastId; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
      pdf += `trailer\n<< /Size ${lastId + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;

      const bytes = new Uint8Array(pdf.length);
      for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
      return new Blob([bytes], { type: "application/pdf" });
    }
  }

  return { Doc, colors: C, width, loadLogo, _widthTables: { W_REG, W_BOLD } };
})();
