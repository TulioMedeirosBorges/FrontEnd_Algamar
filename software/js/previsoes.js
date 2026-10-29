// Tela "Previsões": mapa de probabilidade + linha do tempo + cards da região.
// Todos os números vêm de GET /ml/coastal-risks (summary, trends, data[]).
// A API entrega previsões MENSAIS (cada ponto tem month/year), então a
// linha do tempo percorre os meses disponíveis, não dias.
(function () {
  const S = window.DashShell;
  const $ = (id) => document.getElementById(id);

  const state = {
    data: [],
    trends: [],
    region: "", // "" = todas as regiões
    periodo: "historico", // historico = últimos 9 meses medidos + próximos 3; proximos; atual
    search: "",
    steps: [], // índices de mês (ano*12 + mês-1), em ordem
    stepIdx: 0,
    activeId: null,
    tablePage: 0, // página da tabela (TABLE_ROWS linhas por página)
    playing: false,
    raf: null,
    stepStart: 0,
  };

  // Os 4 níveis do ML (AlgamarRisk, em api-client.js): mesmas cores e faixas de todas as telas.
  const R = window.AlgamarRisk;
  const TIERS = {
    baixo: { label: R.LABEL.baixo, color: R.COLOR.baixo, icon: "check_circle", rowIcon: "circle" },
    moderado: { label: R.LABEL.moderado, color: R.COLOR.moderado, icon: "warning", rowIcon: "warning" },
    alto: { label: R.LABEL.alto, color: R.COLOR.alto, icon: "warning", rowIcon: "warning" },
    muito_alto: { label: R.LABEL.muito_alto, color: R.COLOR.muito_alto, icon: "warning", rowIcon: "warning" },
  };
  const TABLE_ROWS = 5;
  // Médias (de uma região, de um mês) usam as faixas do ML.
  const tierOfProbability = (p) => R.fromProbability(p) || "baixo";
  // Nível do ponto: o risk_level que o ML manda.
  const pointTier = (p) => R.of(p);

  const pct = (v) => `${Math.round(v * 100)}%`;
  const fmt1 = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const periodIndex = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : nowIdx);
  function periodLabel(p) {
    const name = S.MONTH_NAMES[(p.month || now.getMonth() + 1) - 1].slice(0, 3);
    return `${name}/${p.year || now.getFullYear()}`;
  }
  function stepLabel(idx) {
    if (idx === nowIdx) return "Hoje";
    return `${S.MONTH_NAMES[idx % 12].slice(0, 3)}/${String(Math.floor(idx / 12)).slice(-2)}`;
  }

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  function toCoord(v) {
    const n = typeof v === "string" ? Number(v.trim().replace(",", ".")) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  function normalizePoint(p, i) {
    const latitude = toCoord(p.latitude ?? p.lat);
    const longitude = toCoord(p.longitude ?? p.lng ?? p.lon);
    // id = LOCAL (região + coordenada), igual em todos os meses: ao passar
    // a linha do tempo o mapa reaproveita o mesmo pino e só anima a cor e o
    // tamanho, em vez de apagar e recriar tudo a cada mês.
    return {
      ...p,
      recordId: p.id,
      id: `${p.region || "ponto"}|${latitude},${longitude}` + (latitude == null ? `|${i}` : ""),
      latitude: latitude != null && Math.abs(latitude) <= 90 ? latitude : null,
      longitude: longitude != null && Math.abs(longitude) <= 180 ? longitude : null,
    };
  }

  async function load() {
    $("mapLoading").hidden = false;
    $("mapEmpty").hidden = true;
    try {
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", {
        params: { region: state.region || undefined, meses: FORECAST_MONTHS },
      });
      R.setRanges(res.summary && res.summary.niveis);
      state.data = (res.data || []).map(normalizePoint);
      state.trends = res.trends || [];
      S.hideApiWarning();
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
      state.data = [];
      state.trends = [];
    } finally {
      $("mapLoading").hidden = true;
    }
    S.setAlertBadge(state.data.filter((p) => ["alto", "muito_alto"].includes(pointTier(p))).length);
    buildSteps();
    render({ refit: true });
    window.PageLoader.done();
  }

  // Meses da linha do tempo. A previsão do ML vai de hoje até daqui 3 meses
  // (a API manda só esses meses: o mês atual entra inteiro, então são até 4
  // marcadores); antes deles vêm os últimos PAST_MONTHS meses já medidos.
  const PAST_MONTHS = 9;
  const FORECAST_MONTHS = 3;
  function buildSteps() {
    const keep = state.steps[state.stepIdx];
    const all = [...new Set(state.data.map(periodIndex))].sort((a, b) => a - b);
    const future = all.filter((i) => i >= nowIdx);
    const past = all.filter((i) => i < nowIdx);
    const steps =
      state.periodo === "atual" ? future.slice(0, 1)
      : state.periodo === "proximos" ? future
      : [...past.slice(-PAST_MONTHS), ...future];
    state.steps = steps;
    const at = steps.indexOf(keep);
    state.stepIdx = at === -1 ? 0 : at;
    if (steps.length < 2) stopPlay();
  }

  function stepPoints() {
    const idx = state.steps[state.stepIdx];
    const term = state.search.toLowerCase();
    return state.data.filter(
      (p) => periodIndex(p) === idx && (!term || (p.region || "").toLowerCase().includes(term))
    );
  }

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render({ refit = false } = {}) {
    const pts = stepPoints();
    renderMap(pts, refit);
    renderTimeline();
    renderSide(pts);
    renderTable(pts);
    renderEnv(pts);
    renderHistory();
  }

  function renderMap(pts, refit) {
    window.DashboardMap.setPoints(pts);
    if (refit) window.DashboardMap.fitToPoints(pts);
    if (!pts.some((p) => p.id === state.activeId)) state.activeId = null;
    window.DashboardMap.setActive(state.activeId);
    $("mapEmpty").hidden = pts.length > 0 || !$("mapLoading").hidden;
  }

  // A trilha só é recriada quando os meses (ou a largura) mudam; ao avançar
  // um passo, os mesmos elementos são atualizados para a barra e o marcador
  // deslizarem com transição em vez de pularem.
  function renderTimeline() {
    const track = $("fcTrack");
    const n = state.steps.length;
    if (!n) {
      track.innerHTML = "";
      track.dataset.key = "";
      $("fcPlay").disabled = true;
      $("fcTimelineNow").textContent = "—";
      $("fcTimelineCount").textContent = "";
      return;
    }
    $("fcPlay").disabled = n < 2;
    const at = (i) => (n === 1 ? 0 : (i / (n - 1)) * 100);
    // Com muitos meses os rótulos se atropelam: cada mês ganha um marcador
    // clicável, mas só parte deles mostra o texto (o ativo e "Hoje" sempre).
    const maxLabels = Math.max(2, Math.floor(track.clientWidth / 64) || 12);
    const every = Math.ceil(n / maxLabels);

    const key = `${state.steps.join(",")}|${every}`;
    if (track.dataset.key !== key) {
      track.dataset.key = key;
      track.innerHTML = `
      <div class="fc-track__line"><span style="width:${at(state.stepIdx)}%"></span></div>${state.steps
        .map(
          (idx, i) => `
      <button type="button" class="fc-step${idx < nowIdx ? " is-past" : ""}" style="left:${at(i)}%" data-i="${i}"
        aria-label="${S.escapeHtml(stepLabel(idx))}" title="${S.escapeHtml(stepLabel(idx))}">
        <span class="fc-step__tick"></span><span class="fc-step__label">${S.escapeHtml(stepLabel(idx))}</span>
      </button>`
        )
        .join("")}
      <span class="fc-track__thumb" style="left:${at(state.stepIdx)}%"></span>`;
    }

    track.querySelectorAll(".fc-step").forEach((btn, i) => {
      const active = i === state.stepIdx;
      const labeled = active || state.steps[i] === nowIdx || i % every === 0 || i === n - 1;
      btn.classList.toggle("is-active", active);
      btn.classList.toggle("is-done", i < state.stepIdx);
      btn.classList.toggle("is-unlabeled", !labeled);
      btn.setAttribute("aria-pressed", String(active));
    });
    if (!state.playing) {
      setProgress(state.stepIdx);
      setPlayButton(n > 1 && state.stepIdx === n - 1 ? "replay" : "play");
    }
    const label = $("fcTimelineNow");
    const text = stepLabel(state.steps[state.stepIdx]);
    if (label.textContent !== text) {
      label.textContent = text;
      // reinicia a animação de entrada do rótulo do mês
      label.classList.remove("is-changing");
      void label.offsetWidth;
      label.classList.add("is-changing");
    }
    const idx = state.steps[state.stepIdx];
    label.classList.toggle("is-forecast", idx > nowIdx);
    $("fcTimelineCount").textContent =
      `${state.stepIdx + 1} de ${n} ${n === 1 ? "mês" : "meses"}` + (idx > nowIdx ? " · previsão" : idx < nowIdx ? " · já ocorrido" : "");
  }

  // Posição contínua na trilha (ex.: 2,4 = 40% do caminho entre o 3º e o 4º
  // mês). Durante a reprodução é chamada a cada quadro, então barra e
  // marcador deslizam sem degraus.
  function setProgress(pos) {
    const track = $("fcTrack");
    const n = state.steps.length;
    if (!n || !track.querySelector(".fc-track__thumb")) return;
    const pctPos = n === 1 ? 0 : (pos / (n - 1)) * 100;
    track.querySelector(".fc-track__line span").style.width = `${pctPos}%`;
    track.querySelector(".fc-track__thumb").style.left = `${pctPos}%`;
  }

  function setDonut(prob, tier) {
    const C = 2 * Math.PI * 27;
    const arc = $("fcDonutArc");
    arc.style.strokeDasharray = prob == null ? `0 ${C}` : `${prob * C} ${C}`;
    arc.style.stroke = tier ? TIERS[tier].color : "transparent";
    $("fcDonutText").textContent = prob == null ? "—" : pct(prob);
  }

  function joinNames(names) {
    if (names.length < 2) return names[0] || "—";
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  }

  function renderSide(pts) {
    const probs = pts.map((p) => p.probability).filter((v) => typeof v === "number");
    const avg = mean(probs);
    const tier = avg == null ? (pts.length ? pointTier(pts[0]) : null) : tierOfProbability(avg);

    setDonut(avg, avg == null ? null : tier);
    $("fcProb").textContent = avg == null ? "—" : pct(avg);

    const icon = $("fcRiskIcon");
    icon.dataset.tier = tier || "";
    icon.style.color = tier ? TIERS[tier].color : "";
    $("fcRiskGlyph").textContent = tier ? TIERS[tier].icon : "warning";
    $("fcRisk").textContent = tier ? TIERS[tier].label : "—";

    // Maiores probabilidades do período, sem repetir a região.
    const names = [];
    [...pts]
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
      .forEach((p) => {
        if (p.region && !names.includes(p.region) && names.length < 3) names.push(p.region);
      });
    $("fcAreas").textContent = joinNames(names);
  }

  // Tabela em páginas de TABLE_ROWS linhas (‹ 1 2 3 ›): a altura do card não
  // muda, então os cards vizinhos não crescem junto.
  function sortedRows(pts) {
    return [...pts].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
  }

  function renderPager(pages) {
    const nav = $("fcTablePager");
    nav.hidden = pages < 2;
    if (pages < 2) {
      nav.innerHTML = "";
      return;
    }
    const cur = state.tablePage;
    // Muitas páginas: mostra a 1ª, a última e as vizinhas da atual, com "…".
    const nums = [];
    for (let i = 0; i < pages; i++) {
      if (i === 0 || i === pages - 1 || Math.abs(i - cur) <= 1) nums.push(i);
      else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    nav.innerHTML =
      `<button type="button" data-page="${cur - 1}" aria-label="Página anterior"${cur === 0 ? " disabled" : ""}>
        <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>` +
      nums
        .map((i) =>
          i === "…"
            ? `<span class="fc-pager__gap">…</span>`
            : `<button type="button" data-page="${i}"${i === cur ? ' class="is-active" aria-current="page"' : ""}>${i + 1}</button>`
        )
        .join("") +
      `<button type="button" data-page="${cur + 1}" aria-label="Próxima página"${cur === pages - 1 ? " disabled" : ""}>
        <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>`;
  }

  function renderTable(pts) {
    const body = $("fcTableBody");
    if (!pts.length) {
      body.innerHTML = `<tr><td colspan="4" class="dash-empty">Sem previsões para esta região e período.</td></tr>`;
      renderPager(0);
      return;
    }
    const sorted = sortedRows(pts);
    const pages = Math.ceil(sorted.length / TABLE_ROWS);
    state.tablePage = Math.min(state.tablePage, pages - 1);
    renderPager(pages);
    const pageRows = sorted.slice(state.tablePage * TABLE_ROWS, (state.tablePage + 1) * TABLE_ROWS);
    // Linhas vazias completam a última página: a tabela mantém a altura.
    const pad = pages > 1 ? TABLE_ROWS - pageRows.length : 0;
    body.innerHTML = pageRows
      .map((p) => {
        const t = TIERS[pointTier(p)];
        return `
        <tr data-id="${S.escapeHtml(p.id)}"${p.id === state.activeId ? ' class="is-active"' : ""}>
          <td><span class="fc-dot" style="background:${t.color}"></span>${S.escapeHtml(p.region)}</td>
          <td>${typeof p.probability === "number" ? pct(p.probability) : "—"}</td>
          <td>
            <span class="fc-risk" style="color:${t.color}">
              ${
                t.rowIcon === "circle"
                  ? `<span class="fc-risk__dot" style="background:${t.color}"></span>`
                  : `<span class="material-symbols-outlined" aria-hidden="true">${t.rowIcon}</span>`
              }${t.label}
            </span>
          </td>
          <td>${S.escapeHtml(periodLabel(p))}</td>
        </tr>`;
      })
      .join("") + `<tr class="fc-row-pad" aria-hidden="true"><td colspan="4">&nbsp;</td></tr>`.repeat(pad);
  }

  // ------------------------------------------------------------------
  // Condições ambientais do MÊS da linha do tempo (acompanha a animação).
  // Cada variável vem da melhor fonte que cobre o mês:
  //  1. série diária da Open-Meteo (até ~3 meses para trás e 16 dias para
  //     frente): temperatura do mar, vento, corrente e chuva — hoje, ou a
  //     média dos dias daquele mês;
  //  2. mês fora desse alcance: valores MENSAIS medidos — GET
  //     /ml/condicoes-ambientais (temperatura, salinidade, clorofila, pH,
  //     corrente) e o histórico diário da Open-Meteo (vento e chuva);
  //  3. mês que ainda não aconteceu: o normal histórico daquele mês, marcado
  //     com "≈" (não é previsão).
  // Salinidade, clorofila e pH vêm sempre do ML (a Open-Meteo não tem).
  // O local é o ponto selecionado no mapa/tabela, ou a região do filtro.
  // ------------------------------------------------------------------
  const ENV_PAST_DAYS = 92; // máximo que a Open-Meteo aceita
  const ENV_NEXT_DAYS = 16;
  const DIRS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  let envSeq = 0;

  function envPlace() {
    const p = state.activeId && state.data.find((x) => x.id === state.activeId);
    if (!p || p.latitude == null) return null;
    const c = [p.latitude, p.longitude];
    return { name: p.region || "ponto selecionado", land: c, sea: c };
  }

  function setEnvValue(id, text) {
    const el = $(id);
    if (el.textContent === text) return;
    el.textContent = text;
    el.classList.remove("is-changing");
    void el.offsetWidth;
    el.classList.add("is-changing");
  }

  // Condições mensais do ML por região/município (uma chamada por local).
  const mlEnvCache = {};
  function loadMlEnv(region) {
    const key = region || "";
    if (!mlEnvCache[key]) {
      mlEnvCache[key] = window.AlgamarAPI.apiFetch("/ml/condicoes-ambientais", {
        params: { region: region || undefined, meses: FORECAST_MONTHS },
      })
        .then((r) => r.meses || [])
        .catch(() => {
          delete mlEnvCache[key]; // tenta de novo na próxima vez
          return [];
        });
    }
    return mlEnvCache[key];
  }

  const fmt2 = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function renderEnv(pts) {
    const seq = ++envSeq;
    const idx = state.steps[state.stepIdx];
    const avgOf = (key) =>
      mean(pts.map((p) => p.environmental_factors && p.environmental_factors[key]).filter((v) => typeof v === "number"));
    const place = envPlace();

    const [env, mensal, ml] = await Promise.all([
      window.EnvData.load({ region: state.region, place, pastDays: ENV_PAST_DAYS, forecastDays: ENV_NEXT_DAYS }).catch(() => null),
      window.EnvData.monthly({ region: state.region, place }).catch(() => null),
      loadMlEnv(place ? place.name : state.region),
    ]);
    if (seq !== envSeq) return; // a linha do tempo já foi para outro mês

    const monthName = idx == null ? "—" : `${S.MONTH_NAMES[idx % 12]}/${Math.floor(idx / 12)}`;
    const ym = idx == null ? "" : `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
    const days = env ? env.dates.map((d, i) => (d.startsWith(ym) ? i : -1)).filter((i) => i >= 0) : [];
    const isNow = idx === nowIdx && env && env.todayIdx >= 0;
    const pick = (key) => {
      if (!env) return null;
      if (isNow) return env.series[key][env.todayIdx];
      return mean(days.map((i) => env.series[key][i]).filter((v) => typeof v === "number"));
    };
    const where = place ? place.name : state.region || "litoral de SP";
    const daily = isNow || days.length > 0;
    const sst = daily ? pick("sst") : null;
    const wind = daily ? pick("wind") : null;
    const cur = daily ? pick("current") : null;
    const rain = daily ? pick("rain") : null;

    // valores mensais (ML e histórico da Open-Meteo) para o mês da linha do tempo
    const row = ml.find((m) => m.mes === ym);
    const mv = (k) => (row && row.variaveis[k] && row.variaveis[k].valor != null ? row.variaveis[k] : null);
    const mo = mensal ? mensal.month(ym) : null;
    let estimado = false;
    // "≈" = normal histórico (ou último valor do pH): o mês ainda não tem medição
    const show = (id, value, fonte, text) => {
      if (value == null) return setEnvValue(id, "—");
      const approx = fonte === "normal" || fonte === "ultimo";
      if (approx) estimado = true;
      setEnvValue(id, (approx ? "≈ " : "") + text);
    };

    const temp = mv("temperatura_c");
    if (sst != null) show("fcTemp", sst, "medido", `${fmt1(sst)}°C`);
    else if (temp) show("fcTemp", temp.valor, temp.fonte, `${fmt1(temp.valor)}°C`);
    else show("fcTemp", avgOf("temperature_celsius"), "medido", `${fmt1(avgOf("temperature_celsius") || 0)}°C`);

    const sal = mv("salinidade_psu");
    if (sal) show("fcSal", sal.valor, sal.fonte, `${fmt1(sal.valor)} PSU`);
    else show("fcSal", avgOf("salinity_psu"), "medido", `${fmt1(avgOf("salinity_psu") || 0)} PSU`);

    const ph = mv("ph") || (avgOf("ph") != null ? { valor: avgOf("ph"), fonte: "medido" } : null);
    show("fcPh", ph && ph.valor, ph && ph.fonte, ph ? ph.valor.toFixed(2).replace(".", ",") : "");

    const chl = mv("clorofila_mg_m3"), chlMax = mv("clorofila_max_mg_m3");
    show("fcChl", chl && chl.valor, chl && chl.fonte, chl ? `${fmt2(chl.valor)} mg/m³` : "");
    show("fcChlMax", chlMax && chlMax.valor, chlMax && chlMax.fonte, chlMax ? `${fmt2(chlMax.valor)} mg/m³` : "");

    if (wind != null) show("fcWind", wind, "medido", `${Math.round(wind)} km/h`);
    else show("fcWind", mo && mo.wind, mo && mo.fonte, mo ? `${Math.round(mo.wind)} km/h${mo.windDir ? " de " + mo.windDir : ""}` : "");

    const corr = mv("corrente_kmh");
    if (cur != null) show("fcCurrent", cur, "medido", `${fmt1(cur)} km/h`);
    else show("fcCurrent", corr && corr.valor, corr && corr.fonte, corr ? `${fmt2(corr.valor)} km/h${corr.direcao ? " → " + corr.direcao : ""}` : "");

    if (rain != null) show("fcPrecip", rain, "medido", `${fmt1(rain)} mm`);
    else show("fcPrecip", mo && mo.rain, mo && mo.fonte, mo ? `${fmt1(mo.rain)} mm` : "");
    $("fcPrecipLabel").textContent = isNow ? "Precipitação (hoje)" : "Precipitação (média/dia)";

    let sub;
    if (isNow) sub = `Hoje · ${where} · Open-Meteo + modelo Algamar`;
    else if (days.length) {
      const first = window.EnvData.dayLabel(env.dates[days[0]]);
      const last = window.EnvData.dayLabel(env.dates[days[days.length - 1]]);
      const kind = idx > nowIdx ? "previstos" : "medidos";
      sub = `${monthName} · média de ${days.length} ${days.length === 1 ? "dia" : "dias"} ${kind} (${first}–${last}) · ${where}`;
    } else if (idx >= nowIdx) {
      sub = `${monthName} · mês que ainda não aconteceu: valores típicos do mês · ${where}`;
    } else {
      sub = `${monthName} · média do mês medida (satélite, GLORYS e Open-Meteo) · ${where}`;
    }
    $("fcEnvSub").textContent = sub;
    $("fcEnvNote").hidden = !estimado;
    $("fcEnv").classList.toggle("is-forecast", idx > nowIdx);
  }

  // Histórico mensal (trends[]) — é o único histórico que a API devolve, e
  // vale para o litoral todo, não só para a região escolhida.
  function renderHistory() {
    // Só os últimos 12 meses cabem no card; a série completa fica na tela de histórico.
    const sorted = [...state.trends].sort((a, b) => a.year - b.year || a.month - b.month).slice(-12);
    const last = sorted[sorted.length - 1];
    $("fcHistorySub").textContent = sorted.length
      ? `Últimos ${sorted.length} ${sorted.length === 1 ? "mês" : "meses"}`
      : "Sem histórico ainda";
    $("fcKpiRisk").textContent = last && last.high_risk_points != null ? last.high_risk_points : "—";
    $("fcKpiProb").textContent = last && last.avg_probability != null ? pct(last.avg_probability) : "—";

    const el = $("fcHistory");
    if (!sorted.length) {
      el.innerHTML = "";
      return;
    }
    const bars = sorted
      .map((t) => {
        const v = typeof t.avg_probability === "number" ? t.avg_probability : 0;
        const label = `${String(t.month).padStart(2, "0")}/${t.year}: probabilidade média ${pct(v)}`;
        return `<span class="fc-bar" style="height:${Math.max(8, v * 100)}%;background:${
          TIERS[tierOfProbability(v)].color
        }" title="${S.escapeHtml(label)}"></span>`;
      })
      .join("");
    const n = sorted.length;
    const count = Math.min(n, 4);
    const labels = Array.from({ length: count }, (_, i) => {
      const t = sorted[count === 1 ? 0 : Math.round((i * (n - 1)) / (count - 1))];
      return `<span>${String(t.month).padStart(2, "0")}/${String(t.year).slice(-2)}</span>`;
    }).join("");
    el.innerHTML = `<div class="fc-bars">${bars}</div><div class="fc-bars-labels">${labels}</div>`;
  }

  // ------------------------------------------------------------------
  // Linha do tempo: seleção e reprodução
  // ------------------------------------------------------------------
  function selectStep(i) {
    state.stepIdx = i;
    render();
  }

  // Reprodução: cada mês fica STEP_MS na tela e a barra avança de forma
  // contínua (requestAnimationFrame) até o próximo. Chegando ao último mês,
  // para lá e o botão vira "repetir".
  const STEP_MS = 1800;

  function setPlayButton(mode) {
    const icon = { play: "play_arrow", pause: "pause", replay: "replay" }[mode];
    const label = { play: "Reproduzir linha do tempo", pause: "Pausar linha do tempo", replay: "Reproduzir de novo" }[mode];
    $("fcPlayIcon").textContent = icon;
    $("fcPlay").setAttribute("aria-label", label);
    $("fcPlay").classList.toggle("is-playing", mode === "pause");
  }

  function stopPlay() {
    state.playing = false;
    cancelAnimationFrame(state.raf);
    state.raf = null;
    $("fcTrack").classList.remove("is-playing");
    setPlayButton(state.steps.length > 1 && state.stepIdx === state.steps.length - 1 ? "replay" : "play");
    setProgress(state.stepIdx);
  }

  function tick(t) {
    if (!state.playing) return;
    const f = (t - state.stepStart) / STEP_MS;
    if (f >= 1) {
      if (state.stepIdx >= state.steps.length - 1) {
        stopPlay();
        return;
      }
      state.stepStart = t;
      selectStep(state.stepIdx + 1);
      setProgress(state.stepIdx);
    } else if (state.stepIdx < state.steps.length - 1) {
      // desacelera perto do próximo mês: a barra "pousa" em cada marcador
      const ease = f < 0.75 ? 0 : (f - 0.75) / 0.25;
      setProgress(state.stepIdx + ease * ease * (3 - 2 * ease));
    }
    state.raf = requestAnimationFrame(tick);
  }

  function startPlay() {
    if (state.steps.length < 2) return;
    if (state.stepIdx >= state.steps.length - 1) selectStep(0); // recomeça do início
    state.playing = true;
    $("fcTrack").classList.add("is-playing");
    setPlayButton("pause");
    state.stepStart = performance.now();
    state.raf = requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------
  // Seleção de um ponto (mapa <-> tabela)
  // ------------------------------------------------------------------
  function selectPoint(id, { pan = false } = {}) {
    state.activeId = id;
    window.DashboardMap.setActive(id);
    // Ponto em outra página da tabela: vai para a página dele.
    const at = sortedRows(stepPoints()).findIndex((p) => p.id === id);
    if (at !== -1 && Math.floor(at / TABLE_ROWS) !== state.tablePage) {
      state.tablePage = Math.floor(at / TABLE_ROWS);
      renderTable(stepPoints());
    }
    renderEnv(stepPoints()); // condições passam a ser as do ponto escolhido
    document.querySelectorAll("#fcTableBody tr[data-id]").forEach((tr) => {
      const on = tr.dataset.id === id;
      tr.classList.toggle("is-active", on);
      if (on) tr.scrollIntoView({ block: "nearest" });
    });
    const p = state.data.find((x) => x.id === id);
    if (pan && p) window.DashboardMap.panTo(p.latitude, p.longitude);
  }

  // ------------------------------------------------------------------
  // Eventos / init
  // ------------------------------------------------------------------
  function bindEvents() {
    $("fcRegion").addEventListener("change", (e) => {
      state.region = e.target.value;
      load();
    });
    $("fcHorizon").addEventListener("change", (e) => {
      state.periodo = e.target.value;
      buildSteps();
      render({ refit: true });
    });
    $("fcRefresh").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      btn.classList.add("spin");
      setTimeout(() => btn.classList.remove("spin"), 500);
      load();
    });
    // Rótulos da linha do tempo dependem da largura.
    window.addEventListener("resize", () => renderTimeline());
    $("dashSearch").addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      render({ refit: true });
    });

    $("fcTrack").addEventListener("click", (e) => {
      const btn = e.target.closest(".fc-step");
      if (!btn) return;
      stopPlay();
      selectStep(Number(btn.dataset.i));
    });
    $("fcPlay").addEventListener("click", () => (state.playing ? stopPlay() : startPlay()));

    $("fcTablePager").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-page]");
      if (!btn || btn.disabled) return;
      state.tablePage = Number(btn.dataset.page);
      renderTable(stepPoints());
    });

    $("fcHistoryLink").addEventListener("click", () => {
      window.location.href = "historico-ocorrencias.html";
    });

    $("fcTableBody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr) selectPoint(tr.dataset.id, { pan: true });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(load)) return;

    window.DashboardMap.init({
      stageId: "mapStage",
      canvasId: "mapCanvas",
      overviewId: "mapOverview",
      hillshadeId: "mapHillshade",
      boundaryId: "mapBoundary",
      labelsId: "mapLabels",
      hotspotsId: "mapHotspots",
      onSelect: (id) => selectPoint(id),
      pinColor: (p) => TIERS[pointTier(p)].color,
      pinLabel: (p) =>
        `${TIERS[pointTier(p)].label}${typeof p.probability === "number" ? ` (${pct(p.probability)})` : ""}`,
    });
    window.DashboardMap.setBoundaryVisible(true);

    bindEvents();
    load();
  });
})();
