// Tela "Dados Ambientais". Os parâmetros vêm da Open-Meteo (js/env-data.js):
// série diária com os últimos N dias medidos + a previsão dos próximos dias.
// A API do Algamar só é consultada para o selo de alertas no topo (previsão
// de algas); nenhum dado ambiental depende dela.
// Salinidade, pH, clorofila e nutrientes não têm fonte aberta sem cadastro,
// por isso não aparecem aqui.
(function () {
  const S = window.DashShell;
  const $ = (id) => document.getElementById(id);

  // `key`: série em EnvData.load().series. `sum`: o selo soma (chuva) em vez
  // de mostrar o valor de hoje.
  const PARAMS = [
    { id: "sst", key: "sst", label: "temperatura da água", kind: "area", unit: "°C", dec: 1, color: "#2f8fe0", fill: "#062a52" },
    { id: "air", key: "air", label: "temperatura do ar", kind: "area", unit: "°C", dec: 1, color: "#ffb03a", fill: "#4a2c05" },
    { id: "radiation", key: "radiation", label: "radiação solar", kind: "area", unit: " MJ/m²", dec: 1, color: "#f5c518", fill: "#4a3d06" },
    { id: "clouds", key: "clouds", label: "nebulosidade", kind: "area", unit: "%", dec: 0, color: "#b8c7cc", fill: "#2c4249", zero: true },
    { id: "waves", key: "waves", label: "altura das ondas", kind: "area", unit: " m", dec: 1, color: "#5fc9be", fill: "#0d4a48", zero: true },
    { id: "wind", key: "wind", label: "vento", kind: "area", unit: " km/h", dec: 0, color: "#0aa050", fill: "#04401f", zero: true },
    { id: "cur", key: "current", label: "corrente", kind: "area", unit: " km/h", dec: 1, color: "#ffffff", fill: "#0a4fa8", zero: true },
    { id: "rain", key: "rain", label: "precipitação", kind: "bar", unit: " mm", dec: 1, color: "#3aa37a", fill: "#3aa37a", sum: true },
  ];

  // Card "Fatores de floração": média (ou soma) dos próximos 7 dias contra
  // limites simples. São critérios do front-end, não do modelo do Algamar —
  // água quente, pouco vento (água parada), muita chuva (nutrientes levados
  // ao mar) e muito sol favorecem floração. Ajuste com a equipe se preciso.
  const FACTORS = [
    { label: "Temperatura da água", key: "sst", unit: "°C", dec: 1,
      judge: (v) => (v < 24 ? "boa" : v < 27 ? "atencao" : "alerta") },
    { label: "Vento", key: "wind", unit: "km/h", dec: 1,
      judge: (v) => (v >= 15 ? "boa" : v >= 8 ? "atencao" : "alerta") },
    { label: "Chuva acumulada", key: "rain", unit: "mm", dec: 0, sum: true,
      judge: (v) => (v < 30 ? "boa" : v < 80 ? "atencao" : "alerta") },
    { label: "Radiação solar", key: "radiation", unit: "MJ/m²", dec: 1,
      judge: (v) => (v < 15 ? "boa" : v < 22 ? "atencao" : "alerta") },
  ];
  const FACTOR_UI = {
    boa: { text: "Desfavorável à floração", icon: "check_circle", color: "var(--dash-green)" },
    atencao: { text: "Atenção", icon: "warning", color: "var(--dash-yellow)" },
    alerta: { text: "Favorável à floração", icon: "warning", color: "var(--dash-red)" },
    sem: { text: "Sem dados", icon: "help", color: "var(--dash-text-muted)" },
  };

  const state = { env: null, region: "", period: 14, error: false };

  const nfmt = (v, d) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  const sum = (list) => list.reduce((a, b) => a + b, 0);

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load() {
    loadAlertBadge();
    try {
      state.env = await window.EnvData.load({ region: state.region, pastDays: state.period, forecastDays: 16 });
      state.error = false;
    } catch (err) {
      state.env = null;
      state.error = true;
    }
    render();
    window.PageLoader.done();
  }

  // Único uso da API do Algamar nesta tela: quantas áreas estão em risco alto.
  async function loadAlertBadge() {
    try {
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", {
        params: { region: state.region || undefined },
      });
      S.hideApiWarning();
      S.setAlertBadge((res.data || []).filter((p) => /^ALT/i.test(String(p.risk_level || ""))).length);
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
    }
  }

  // ------------------------------------------------------------------
  // Gráfico SVG (área ou barras) sem biblioteca. Até `todayIdx` é medido
  // (linha cheia); depois é previsão (tracejado, preenchimento mais fraco).
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

  function chartSvg(param, labels, vals, todayIdx) {
    const W = 320, H = 168, pl = 40, pr = 18, pt = 16, pb = 26;
    const plotW = W - pl - pr, plotH = H - pt - pb;
    const all = vals.filter((v) => v != null);
    const sc = niceScale(Math.min(...all), Math.max(...all), param.kind === "bar" || param.zero);
    const n = labels.length;
    const x =
      param.kind === "bar"
        ? (i) => pl + ((i + 0.5) * plotW) / n
        : (i) => (n === 1 ? pl + plotW / 2 : pl + (i * plotW) / (n - 1));
    const y = (v) => pt + ((sc.hi - v) / (sc.hi - sc.lo)) * plotH;
    const base = y(sc.lo);
    const tip = (i, v) => `<title>${labels[i]}${i > todayIdx ? " (previsão)" : i === todayIdx ? " (hoje)" : ""}: ${nfmt(v, param.dec)}${param.unit}</title>`;

    const grid = sc.ticks
      .map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" stroke="#177a66" stroke-width="1.2"/>
        <text x="${pl - 7}" y="${y(t) + 4}" text-anchor="end" font-size="12" font-weight="600" fill="#fff">${nfmt(t, sc.dec)}</text>`)
      .join("");

    const step = Math.ceil(n / 6);
    const xl = labels
      .map((l, i) => (i % step === 0 ? `<text x="${x(i)}" y="${H - 9}" text-anchor="middle" font-size="9" fill="#fff">${l}</text>` : ""))
      .join("");

    // Faixa da previsão + linha "hoje".
    let today = "";
    if (todayIdx >= 0) {
      const tx = x(todayIdx);
      today = `<rect x="${tx}" y="${pt}" width="${W - pr - tx}" height="${plotH}" fill="#ffffff" fill-opacity="0.04"/>
        <line x1="${tx}" x2="${tx}" y1="${pt - 4}" y2="${base}" stroke="#7fe3d0" stroke-width="1" stroke-dasharray="3 3"/>
        <text x="${tx}" y="${pt - 6}" text-anchor="middle" font-size="9" font-weight="700" fill="#7fe3d0">hoje</text>`;
    }

    const pts = vals.map((v, i) => (v == null ? null : [x(i), y(v), v, i])).filter(Boolean);
    let marks = "";
    if (param.kind === "bar") {
      const bw = Math.min(14, (plotW / n) * 0.62);
      marks = pts
        .map(([px, py, v, i]) => `<rect x="${px - bw / 2}" y="${py}" width="${bw}" height="${base - py}" rx="1.5" fill="${param.fill}" fill-opacity="${i > todayIdx ? 0.45 : 1}">${tip(i, v)}</rect>`)
        .join("");
    } else {
      const past = pts.filter((p) => p[3] <= todayIdx);
      const fut = pts.filter((p) => p[3] >= todayIdx);
      const line = (list) => list.map(([px, py]) => `${px},${py}`).join(" ");
      const area = (list, op) =>
        list.length > 1
          ? `<polygon points="${line(list)} ${list[list.length - 1][0]},${base} ${list[0][0]},${base}" fill="${param.fill}" fill-opacity="${op}"/>`
          : "";
      marks += area(past, 0.95) + area(fut, 0.45);
      if (past.length > 1) marks += `<polyline points="${line(past)}" fill="none" stroke="${param.color}" stroke-width="1.8" stroke-linejoin="round"/>`;
      if (fut.length > 1) marks += `<polyline points="${line(fut)}" fill="none" stroke="${param.color}" stroke-width="1.8" stroke-dasharray="4 3" stroke-linejoin="round"/>`;
      marks += pts
        .map(([px, py, v, i]) => `<circle cx="${px}" cy="${py}" r="${i === todayIdx ? 3.6 : 7}" fill="${i === todayIdx ? param.color : "transparent"}"${i === todayIdx ? ' stroke="#fff" stroke-width="1.2"' : ""}>${tip(i, v)}</circle>`)
        .join("");
    }

    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de ${param.label}">${grid}${today}${marks}${xl}</svg>`;
  }

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render() {
    const env = state.env;
    $("evSub").textContent = env
      ? `Dados diários e previsão · ${env.places} · Open-Meteo`
      : "Dados diários e previsão · Open-Meteo";

    PARAMS.forEach((param) => {
      const card = $(`ev-${param.id}`);
      const avgEl = card.querySelector("[data-avg]");
      const chartEl = card.querySelector("[data-chart]");
      const vals = env ? env.series[param.key] : [];
      if (!env || !vals.some((v) => v != null)) {
        avgEl.textContent = "";
        chartEl.innerHTML = `<p class="ev-empty">${state.error ? "Não foi possível consultar a Open-Meteo." : "Sem dados no período."}</p>`;
        return;
      }
      // Corta os dias finais sem previsão (ex.: correntes só vão até ~6 dias).
      let last = vals.length - 1;
      while (last > 0 && vals[last] == null) last--;
      const labels = env.dates.slice(0, last + 1).map(window.EnvData.dayLabel);
      const shown = vals.slice(0, last + 1);

      const todayVal = shown[env.todayIdx];
      if (param.sum) {
        const next7 = shown.slice(env.todayIdx, env.todayIdx + 7).filter((v) => v != null);
        avgEl.textContent = next7.length ? `próx. 7 dias ${nfmt(sum(next7), param.dec)}${param.unit}` : "";
      } else {
        avgEl.textContent = todayVal != null ? `hoje ${nfmt(todayVal, param.dec)}${param.unit}` : "";
      }
      chartEl.innerHTML = chartSvg(param, labels, shown, env.todayIdx);
    });

    renderFactors();
  }

  function renderFactors() {
    const env = state.env;
    const rows = FACTORS.map((f) => {
      const next = env ? env.series[f.key].slice(env.todayIdx, env.todayIdx + 7).filter((v) => v != null) : [];
      const value = next.length ? (f.sum ? sum(next) : mean(next)) : null;
      const level = value == null ? "sem" : f.judge(value);
      const detail = value == null ? "sem previsão" : `${f.sum ? "" : "média "}${nfmt(value, f.dec)} ${f.unit}`;
      return { name: f.label, level, detail };
    });

    $("evQuality").innerHTML = rows
      .map((r) => {
        const ui = FACTOR_UI[r.level];
        return `
        <li>
          <span class="material-symbols-outlined" style="color:${ui.color}" aria-hidden="true">${ui.icon}</span>
          <span><strong>${S.escapeHtml(r.name)}</strong> · ${S.escapeHtml(r.detail)}<br /><small style="color:${ui.color}">${ui.text}</small></span>
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
      load();
    });
    $("evRefresh").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      btn.classList.add("spin");
      setTimeout(() => btn.classList.remove("spin"), 500);
      load();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(load)) return;
    bindEvents();
    load();
  });
})();
