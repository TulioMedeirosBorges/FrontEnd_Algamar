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
    horizon: 12, // quantos meses entram na linha do tempo
    search: "",
    steps: [], // índices de mês (ano*12 + mês-1), em ordem
    stepIdx: 0,
    activeId: null,
    tableExpanded: false, // tabela mostra só TABLE_ROWS linhas até clicar em "Visualizar mais"
    playing: false,
    timer: null,
  };

  // Faixas da legenda do design: abaixo de 35% / 35–59% / 60% ou mais.
  const TIERS = {
    baixo: { label: "Baixo", color: "#00c05d", icon: "check_circle", rowIcon: "circle" },
    moderado: { label: "Moderado", color: "#f5c518", icon: "warning", rowIcon: "warning" },
    alto: { label: "Alto", color: "#ff383c", icon: "warning", rowIcon: "warning" },
  };
  const TABLE_ROWS = 5;
  const tierOfProbability = (p) => (p >= 0.6 ? "alto" : p >= 0.35 ? "moderado" : "baixo");

  // Sem probabilidade no ponto, cai no risk_level que a API também manda.
  function pointTier(p) {
    if (typeof p.probability === "number") return tierOfProbability(p.probability);
    const norm = String(p.risk_level || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase();
    if (norm.startsWith("ALT")) return "alto";
    if (norm.startsWith("MED")) return "moderado";
    return "baixo";
  }

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
    return {
      ...p,
      id: p.id != null ? String(p.id) : `ponto-${i}-${latitude},${longitude}`,
      latitude: latitude != null && Math.abs(latitude) <= 90 ? latitude : null,
      longitude: longitude != null && Math.abs(longitude) <= 180 ? longitude : null,
    };
  }

  async function load() {
    $("mapLoading").hidden = false;
    $("mapEmpty").hidden = true;
    try {
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", {
        params: { region: state.region || undefined },
      });
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
    S.setAlertBadge(state.data.filter((p) => pointTier(p) === "alto").length);
    buildSteps();
    render({ refit: true });
  }

  // Meses da linha do tempo: os que a API tem dentro da janela [mês atual,
  // mês atual + horizonte). Se faltam meses futuros para completar o
  // horizonte, completa com os meses passados mais recentes (dados reais),
  // para a animação sempre percorrer o período inteiro escolhido.
  function buildSteps() {
    const keep = state.steps[state.stepIdx];
    const all = [...new Set(state.data.map(periodIndex))].sort((a, b) => a - b);
    const future = all.filter((i) => i >= nowIdx && i < nowIdx + state.horizon);
    const past = all.filter((i) => i < nowIdx);
    const need = Math.max(0, state.horizon - future.length);
    const steps = [...past.slice(Math.max(0, past.length - need)), ...future];
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
    track.querySelector(".fc-track__line span").style.width = `${at(state.stepIdx)}%`;
    track.querySelector(".fc-track__thumb").style.left = `${at(state.stepIdx)}%`;
    $("fcTimelineNow").textContent = stepLabel(state.steps[state.stepIdx]);
    $("fcTimelineCount").textContent = `${state.stepIdx + 1} de ${n} ${n === 1 ? "mês" : "meses"}`;
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

  function renderTable(pts) {
    const body = $("fcTableBody");
    const more = $("fcTableMore");
    if (!pts.length) {
      body.innerHTML = `<tr><td colspan="4" class="dash-empty">Sem previsões para esta região e período.</td></tr>`;
      more.hidden = true;
      return;
    }
    const sorted = [...pts].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
    // O ponto selecionado no mapa sempre aparece, mesmo com a tabela recolhida.
    const activeAt = sorted.findIndex((p) => p.id === state.activeId);
    const limit = state.tableExpanded ? sorted.length : Math.max(TABLE_ROWS, activeAt + 1);
    more.hidden = sorted.length <= TABLE_ROWS;
    more.firstChild.textContent = state.tableExpanded
      ? "Visualizar menos "
      : `Visualizar mais (${sorted.length - TABLE_ROWS}) `;
    more.querySelector(".material-symbols-outlined").textContent = state.tableExpanded ? "expand_less" : "expand_more";
    more.setAttribute("aria-expanded", String(state.tableExpanded));
    body.innerHTML = sorted
      .slice(0, limit)
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
      .join("");
  }

  // Só temperatura e salinidade existem na API; o resto fica "—" em vez de
  // um valor inventado.
  function renderEnv(pts) {
    const avgOf = (key) =>
      mean(
        pts
          .map((p) => p.environmental_factors && p.environmental_factors[key])
          .filter((v) => typeof v === "number")
      );
    const temp = avgOf("temperature_celsius");
    const sal = avgOf("salinity_psu");
    $("fcTemp").textContent = temp == null ? "—" : `${fmt1(temp)}°C`;
    $("fcSal").textContent = sal == null ? "—" : `${fmt1(sal)} PSU`;
    ["fcWind", "fcCurrent", "fcPh", "fcPrecip"].forEach((id) => ($(id).textContent = "—"));
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

  function stopPlay() {
    state.playing = false;
    clearInterval(state.timer);
    state.timer = null;
    $("fcPlayIcon").textContent = "play_arrow";
    $("fcPlay").setAttribute("aria-label", "Reproduzir linha do tempo");
  }
  function startPlay() {
    if (state.steps.length < 2) return;
    state.playing = true;
    $("fcPlayIcon").textContent = "pause";
    $("fcPlay").setAttribute("aria-label", "Pausar linha do tempo");
    state.timer = setInterval(() => selectStep((state.stepIdx + 1) % state.steps.length), 1300);
  }

  // ------------------------------------------------------------------
  // Seleção de um ponto (mapa <-> tabela)
  // ------------------------------------------------------------------
  function selectPoint(id, { pan = false } = {}) {
    state.activeId = id;
    window.DashboardMap.setActive(id);
    // Ponto fora das linhas visíveis: redesenha a tabela para ele aparecer.
    if (!document.querySelector(`#fcTableBody tr[data-id="${CSS.escape(id)}"]`)) renderTable(stepPoints());
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
      state.horizon = Number(e.target.value);
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

    $("fcTableMore").addEventListener("click", () => {
      state.tableExpanded = !state.tableExpanded;
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
