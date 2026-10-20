// Tela "Dados Ambientais". Tudo vem de GET /ml/coastal-risks (data[]).
// Cada registro da API é uma região num mês com environmental_factors:
// só existem temperatura (°C), salinidade (PSU) e clorofila-a (mg/m³, que é
// numericamente igual a µg/L). pH, nutrientes, vento, corrente e precipitação
// NÃO existem na API: esses cards ficam no lugar com estado vazio, e passam a
// desenhar sozinhos quando ganharem um `field` em PARAMS (ver abaixo).
// O eixo X é mensal (a API não tem dados diários): cada ponto do gráfico é a
// média dos registros da região naquele mês.
(function () {
  const S = window.DashShell;
  const $ = (id) => document.getElementById(id);

  // `field`: chave dentro de environmental_factors (null = a API não tem).
  const PARAMS = [
    { id: "temp", label: "temperatura da água", kind: "area", unit: "°C", stat: "média", dec: 1,
      series: [{ field: "temperature_celsius", color: "#2f8fe0", fill: "#062a52" }] },
    { id: "sal", label: "salinidade", kind: "area", unit: "", stat: "média", dec: 1,
      series: [{ field: "salinity_psu", color: "#3f8f86", fill: "#4aa79d" }] },
    { id: "ph", label: "pH", kind: "area", unit: "", stat: "média", dec: 1,
      series: [{ field: null, color: "#a98f1f", fill: "#c9ab2a" }] },
    { id: "chl", label: "clorofila-a", kind: "area", unit: "", stat: "média", dec: 1,
      series: [{ field: "chlorophyll_mg_m3", color: "#7a3bb5", fill: "#2a0a45" }] },
    { id: "nut", label: "nutrientes", kind: "line", unit: "", stat: "média", dec: 1,
      series: [{ field: null, color: "#1e7bff" }, { field: null, color: "#ff9a1f" }] },
    { id: "wind", label: "vento", kind: "area", unit: "", stat: "média", dec: 0,
      series: [{ field: null, color: "#0aa050", fill: "#049a4a" }] },
    { id: "cur", label: "corrente", kind: "area", unit: "", stat: "média", dec: 1,
      series: [{ field: null, color: "#ffffff", fill: "#0a4fa8" }] },
    { id: "rain", label: "precipitação", kind: "bar", unit: " mm", stat: "Total", dec: 1, sum: true,
      series: [{ field: null, color: "#3aa37a", fill: "#3aa37a" }] },
  ];

  // Limites de referência do card "Qualidade da água". São critérios do
  // front-end (não vêm da API) — ajuste com a equipe de dados se preciso.
  const QUALITY = [
    { label: "Clorofila-a", field: "chlorophyll_mg_m3", unit: "µg/L",
      judge: (v) => (v <= 5 ? "boa" : v <= 10 ? "atencao" : "alerta") },
    { label: "Temperatura da água", field: "temperature_celsius", unit: "°C",
      judge: (v) => (v <= 27 ? "boa" : v <= 29 ? "atencao" : "alerta") },
    { label: "Salinidade", field: "salinity_psu", unit: "PSU",
      judge: (v) => (v >= 32 && v <= 37 ? "boa" : v >= 30 && v <= 38 ? "atencao" : "alerta") },
  ];
  const QUALITY_UI = {
    boa: { text: "Boa", color: "var(--dash-green)" },
    atencao: { text: "Atenção", color: "var(--dash-yellow)" },
    alerta: { text: "Alerta", color: "var(--dash-red)" },
    sem: { text: "Sem dados", color: "var(--dash-text-muted)" },
  };

  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const state = { data: [], region: "", period: 6, search: "" };

  const periodIndex = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : nowIdx);
  const slotLabel = (idx) => `${String((idx % 12) + 1).padStart(2, "0")}/${String(Math.floor(idx / 12)).slice(-2)}`;
  const nfmt = (v, d) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load() {
    try {
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", {
        params: { region: state.region || undefined },
      });
      state.data = res.data || [];
      S.hideApiWarning();
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
      state.data = [];
    }
    S.setAlertBadge(state.data.filter((p) => /^ALT/i.test(String(p.risk_level || ""))).length);
    render();
  }

  // Meses da janela (termina no último mês já ocorrido com registro) e, por
  // mês, a média de cada parâmetro entre os registros da região.
  function slotsFor(fields) {
    const term = state.search.toLowerCase();
    const past = state.data.filter(
      (p) => periodIndex(p) <= nowIdx && (!term || (p.region || "").toLowerCase().includes(term))
    );
    const end = past.length ? past.reduce((m, p) => Math.max(m, periodIndex(p)), 0) : nowIdx;
    const start = end - state.period + 1;
    const labels = [];
    for (let idx = start; idx <= end; idx++) labels.push(slotLabel(idx));
    const values = {};
    fields.forEach((field) => {
      const buckets = labels.map(() => []);
      past.forEach((p) => {
        const v = p.environmental_factors && p.environmental_factors[field];
        const i = periodIndex(p) - start;
        if (typeof v === "number" && i >= 0 && i < buckets.length) buckets[i].push(v);
      });
      values[field] = buckets.map((b) => (b.length ? mean(b) : null));
    });
    return { labels, values };
  }

  // ------------------------------------------------------------------
  // Gráfico SVG (linha, área ou barras) sem biblioteca
  // ------------------------------------------------------------------
  function niceScale(min, max, zero) {
    if (zero) min = Math.min(0, min);
    if (min === max) {
      const pad = Math.abs(min) * 0.05 || 1;
      min -= pad;
      max += pad;
    }
    const raw = (max - min) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const stepN = [1, 2, 2.5, 5, 10].find((s) => raw / mag <= s);
    const step = stepN * mag;
    const lo = zero ? 0 : Math.floor(min / step + 1e-9) * step;
    const hi = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
    const dec = (String(+step.toFixed(6)).split(".")[1] || "").length;
    return { lo, hi, ticks, dec };
  }

  function chartSvg(param, labels, seriesValues) {
    const W = 320, H = 168, pl = 40, pr = 18, pt = 14, pb = 26;
    const plotW = W - pl - pr, plotH = H - pt - pb;
    const all = seriesValues.flat().filter((v) => v != null);
    const sc = niceScale(Math.min(...all), Math.max(...all), param.kind === "bar");
    const n = labels.length;
    // Linha/área: pontos de ponta a ponta; barras: no centro de cada mês.
    const x =
      param.kind === "bar"
        ? (i) => pl + ((i + 0.5) * plotW) / n
        : (i) => (n === 1 ? pl + plotW / 2 : pl + (i * plotW) / (n - 1));
    const y = (v) => pt + ((sc.hi - v) / (sc.hi - sc.lo)) * plotH;
    const base = y(sc.lo);

    const grid = sc.ticks
      .map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="#177a66" stroke-width="1.2"/>
        <text x="${pl - 7}" y="${y(t) + 4}" text-anchor="end" font-size="12" font-weight="600" fill="#fff">${nfmt(t, sc.dec)}</text>`)
      .join("");

    const step = Math.ceil(n / 7);
    const xl = labels
      .map((l, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-size="9" fill="#fff">${l}</text>` : ""))
      .join("");

    let marks = "";
    param.series.forEach((s, si) => {
      const vals = seriesValues[si];
      const pts = vals.map((v, i) => (v == null ? null : [x(i), y(v), v, i])).filter(Boolean);
      if (!pts.length) return;
      if (param.kind === "bar") {
        const bw = Math.min(30, (plotW / n) * 0.62);
        marks += pts
          .map(([px, py, v, i]) => `<rect x="${px - bw / 2}" y="${py}" width="${bw}" height="${base - py}" fill="${s.fill}"><title>${labels[i]}: ${nfmt(v, param.dec)}${param.unit}</title></rect>`)
          .join("");
        return;
      }
      if (param.kind === "area" && pts.length > 1) {
        const poly = pts.map(([px, py]) => `${px},${py}`).join(" ");
        marks += `<polygon points="${poly} ${pts[pts.length - 1][0]},${base} ${pts[0][0]},${base}" fill="${s.fill}" fill-opacity="${param.id === "temp" ? 1 : 0.92}"/>`;
      }
      marks += `<polyline points="${pts.map(([px, py]) => `${px},${py}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="1.6" stroke-linejoin="round"/>`;
      marks += pts
        .map(([px, py, v, i]) => `<circle cx="${px}" cy="${py}" r="2.6" fill="${s.color}"><title>${labels[i]}: ${nfmt(v, param.dec)}${param.unit}</title></circle>`)
        .join("");
    });

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de ${param.label}">${grid}${marks}${xl}</svg>`;
  }

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render() {
    const fields = [...new Set(PARAMS.flatMap((p) => p.series.map((s) => s.field)).filter(Boolean))];
    const { labels, values } = slotsFor(fields);

    PARAMS.forEach((param) => {
      const card = $(`ev-${param.id}`);
      const seriesValues = param.series.map((s) => (s.field ? values[s.field] : labels.map(() => null)));
      const flat = seriesValues.flat().filter((v) => v != null);
      const avgEl = card.querySelector("[data-avg]");
      const chartEl = card.querySelector("[data-chart]");

      if (!flat.length) {
        avgEl.textContent = `${param.stat.toLowerCase() === "total" ? "Total" : "média"} —`;
        chartEl.innerHTML = param.series.every((s) => !s.field)
          ? `<p class="ev-empty">Sem dados de ${param.label} na API ainda.</p>`
          : `<p class="ev-empty">Sem dados no período.</p>`;
        return;
      }
      const stat = param.sum ? flat.reduce((a, b) => a + b, 0) : mean(flat);
      avgEl.textContent = `${param.stat} ${nfmt(stat, param.dec)}${param.unit}`;
      chartEl.innerHTML = chartSvg(param, labels, seriesValues);
    });

    renderQuality(values, fields);
  }

  function renderQuality(values) {
    const rows = QUALITY.map((q) => {
      const series = (values[q.field] || []).filter((v) => v != null);
      const latest = series.length ? series[series.length - 1] : null;
      const level = latest == null ? "sem" : q.judge(latest);
      const tip = latest == null ? "Sem dados no período" : `${nfmt(latest, 1)} ${q.unit} (mês mais recente)`;
      return { name: q.label, level, tip };
    });
    // pH e nutrientes (o design os usa aqui) não existem na API.
    rows.push({ name: "pH e nutrientes", level: "sem", tip: "A API ainda não informa pH nem nutrientes" });

    $("evQuality").innerHTML = rows
      .map((r) => {
        const ui = QUALITY_UI[r.level];
        return `
        <li title="${S.escapeHtml(r.tip)}">
          <span class="material-symbols-outlined" style="color:${ui.color}" aria-hidden="true">warning</span>
          <span><strong>${ui.text}</strong> (${S.escapeHtml(r.name)})</span>
        </li>`;
      })
      .join("");
  }

  // ------------------------------------------------------------------
  // Eventos / init
  // ------------------------------------------------------------------
  function bindEvents() {
    $("evRegion").addEventListener("change", (e) => {
      state.region = e.target.value;
      load();
    });
    $("evPeriod").addEventListener("change", (e) => {
      state.period = Number(e.target.value);
      render();
    });
    $("evRefresh").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      btn.classList.add("spin");
      setTimeout(() => btn.classList.remove("spin"), 500);
      load();
    });
    $("dashSearch").addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      render();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(load)) return;
    bindEvents();
    load();
  });
})();
