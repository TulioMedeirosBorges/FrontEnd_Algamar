// Tela "Condições Propícias": o mar está do jeito que cada espécie tóxica gosta?
// Dados de GET /ml/condicoes-propicias (índice de condições da literatura, NÃO é
// probabilidade de floração). Cada município traz, por espécie, o mês mais recente
// com dados ("agora", observado) e os 3 meses seguintes ("proximos", previstos).
(function () {
  const S = window.DashShell;
  const $ = (id) => document.getElementById(id);

  // Vindo do dashboard: ?municipio=Ubatuba&especie=Dinophysis
  const params = new URLSearchParams(window.location.search);

  const state = {
    data: [],
    especies: [],
    especie: params.get("especie") || "Dinophysis",
    municipio: params.get("municipio") || "",
    region: "",
    search: "",
    passo: 0, // 0 = agora, 1..3 = meses à frente
    activeId: null,
  };

  const C = window.CondicoesData;
  const nivelDe = C.nivelDe;
  const mesLabel = C.mesLabel;

  const fmt = (v, d = 1) =>
    typeof v === "number" ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
  const sinal = (v, d = 1) => (typeof v === "number" ? (v > 0 ? "+" : "") + fmt(v, d) : "—");

  // Registro do passo escolhido (agora ou um dos próximos meses).
  const registro = (m, passo = state.passo) => (passo === 0 ? m.agora : m.proximos[passo - 1]);

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load() {
    $("mapLoading").hidden = false;
    $("mapEmpty").hidden = true;
    try {
      const res = await C.load(state.region, { force: true });
      state.data = res.data;
      state.especies = res.especies;
      if (res.aviso) $("cpAvisoText").textContent = res.aviso;
      if (!state.especies.includes(state.especie)) state.especie = state.especies[0] || state.especie;
      if (state.municipio) {
        const alvo = state.data.find((m) => m.especie === state.especie && C.norm(m.municipio) === C.norm(state.municipio));
        if (alvo) state.activeId = alvo.id;
        state.municipio = "";
      }
      S.hideApiWarning();
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
      state.data = [];
    } finally {
      $("mapLoading").hidden = true;
    }
    renderEspecies();
    render({ refit: true });
    if (state.activeId) {
      const m = state.data.find((x) => x.id === state.activeId);
      if (m) window.DashboardMap.panTo(m.latitude, m.longitude);
    }
    window.PageLoader.done();
  }

  function linhas() {
    const term = state.search.toLowerCase();
    return state.data.filter(
      (m) => m.especie === state.especie && (!term || m.municipio.toLowerCase().includes(term))
    );
  }

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render({ refit = false } = {}) {
    const ls = linhas();
    renderMeses(ls);
    renderMap(ls, refit);
    renderTabela(ls);
    if (!ls.some((m) => m.id === state.activeId)) state.activeId = null;
    renderDetalhe(ls);
  }

  function renderEspecies() {
    const sel = $("cpEspecie");
    // "diarreica (DSP)" -> "DSP"
    const toxina = (e) => C.siglaToxina((state.data.find((m) => m.especie === e) || {}).toxina);
    sel.innerHTML = state.especies
      .map((e) => `<option value="${S.escapeHtml(e)}"${e === state.especie ? " selected" : ""}>${S.escapeHtml(e)}${
        toxina(e) ? ` (${S.escapeHtml(toxina(e))})` : ""}</option>`)
      .join("");
  }

  function renderMeses(ls) {
    const m0 = ls[0];
    const box = $("cpMeses");
    if (!m0) {
      box.innerHTML = "";
      return;
    }
    const passos = [m0.agora, ...m0.proximos];
    box.innerHTML = passos
      .map((r, i) => `
        <button type="button" class="cp-mes${i === state.passo ? " is-active" : ""}" data-passo="${i}" aria-pressed="${i === state.passo}">
          <strong>${S.escapeHtml(mesLabel(r.mes, true))}</strong>
          <small>${i === 0 ? "agora" : `+${i} ${i === 1 ? "mês" : "meses"}`}</small>
        </button>`)
      .join("");
  }

  function renderMap(ls, refit) {
    const pts = ls.map((m) => {
      const r = registro(m);
      return {
        id: m.id,
        region: m.municipio,
        latitude: m.latitude,
        longitude: m.longitude,
        probability: r && typeof r.indice === "number" ? r.indice : 0,
        risk_level: nivelDe(r && r.nivel).risk,
        nivel: r && r.nivel,
        indice: r && r.indice,
      };
    });
    window.DashboardMap.setPoints(pts);
    if (refit) window.DashboardMap.fitToPoints(pts);
    window.DashboardMap.setActive(state.activeId);
    $("mapEmpty").hidden = pts.length > 0 || !$("mapLoading").hidden;
  }

  function chip(r) {
    const n = nivelDe(r && r.nivel);
    return `<span class="cp-chip" style="--cp:${n.color}" title="${S.escapeHtml(n.label)}">${S.escapeHtml(n.short)}</span>`;
  }

  function renderTabela(ls) {
    const m0 = ls[0];
    $("cpTabelaTitulo").textContent = `Municípios · ${state.especie}`;
    if (!m0) {
      $("cpTableHead").innerHTML = "";
      $("cpTableBody").innerHTML = `<tr><td class="dash-empty">Sem dados para esta espécie e região.</td></tr>`;
      return;
    }
    const passos = [m0.agora, ...m0.proximos];
    $("cpTableHead").innerHTML = `<tr><th>Município</th>${passos
      .map((r, i) => `<th class="${i === state.passo ? "is-active" : ""}">${S.escapeHtml(mesLabel(r.mes, true))}${
        i === 0 ? " (agora)" : ""}</th>`)
      .join("")}</tr>`;
    $("cpTableBody").innerHTML = ls
      .map((m) => `
        <tr data-id="${S.escapeHtml(m.id)}"${m.id === state.activeId ? ' class="is-active"' : ""}>
          <td>${S.escapeHtml(m.municipio)}</td>
          ${[m.agora, ...m.proximos]
            .map((r, i) => `<td class="${i === state.passo ? "is-active" : ""}" title="índice ${fmt(r.indice, 2)}">${chip(r)}</td>`)
            .join("")}
        </tr>`)
      .join("");
  }

  // Card da direita: município escolhido (ou o de índice mais alto no mês).
  function renderDetalhe(ls) {
    let m = state.activeId && ls.find((x) => x.id === state.activeId);
    if (!m) m = [...ls].sort((a, b) => (registro(b).indice ?? 0) - (registro(a).indice ?? 0))[0];
    $("cpVerDash").hidden = !m;
    if (!m) {
      $("cpLocal").textContent = "—";
      $("cpConds").innerHTML = "";
      renderAmbiente(null);
      return;
    }
    const r = registro(m);
    const n = nivelDe(r.nivel);
    $("cpLocal").textContent = m.municipio + (state.activeId ? "" : " · maior índice do mês");
    $("cpVerDash").href = `dashboard.html?municipio=${encodeURIComponent(m.municipio)}`;
    $("cpMesInfo").textContent = `${mesLabel(r.mes)} · ${r.tipo === "observado" ? "observado (dados do mês)" : "previsto"}`;
    const nivel = $("cpNivel");
    nivel.textContent = n.label;
    nivel.style.setProperty("--cp", n.color);
    $("cpIndice").textContent = `índice ${fmt(r.indice, 2)}`;
    $("cpConf").textContent = r.tipo === "observado" ? "" : `Confiança: ${r.confianca}`;
    $("cpConf").hidden = r.tipo === "observado";

    if (r.tipo === "observado") {
      $("cpCondTitulo").textContent = "Condições da espécie neste mês";
      $("cpConds").innerHTML = Object.entries(r.condicoes || {})
        .map(([nome, ok]) => {
          const cls = ok === true ? "is-ok" : ok === false ? "is-no" : "is-na";
          const ic = ok === true ? "check_circle" : ok === false ? "cancel" : "help";
          return `<li class="${cls}"><span class="material-symbols-outlined" aria-hidden="true">${ic}</span>${S.escapeHtml(nome)}</li>`;
        })
        .join("");
    } else {
      $("cpCondTitulo").textContent = "Chance de cada condição acontecer";
      $("cpConds").innerHTML = Object.entries(r.prob_condicoes || {})
        .map(([nome, p]) => `
          <li class="is-prob"><span class="cp-prob">${Math.round(p * 100)}%</span>${S.escapeHtml(nome)}
            <span class="cp-bar"><span style="width:${Math.round(p * 100)}%"></span></span></li>`)
        .join("");
    }
    renderAmbiente(m);
  }

  function renderAmbiente(m) {
    const a = m && m.ambiente_agora;
    $("cpAmbSub").textContent = a ? `${m.municipio} · ${mesLabel(a.mes)} · Copernicus (anomalia = diferença do normal do mês)` : "—";
    $("cpTemp").textContent = a ? `${fmt(a.temperatura_c)}°C (${sinal(a.anomalia_temperatura_c)})` : "—";
    $("cpSal").textContent = a ? `${fmt(a.salinidade_psu)} PSU (${sinal(a.anomalia_salinidade_psu)})` : "—";
    $("cpMld").textContent = a ? `${fmt(a.camada_mistura_m, 0)} m` : "—";
    $("cpVento").textContent =
      a && typeof a.vento_norte_m_s === "number"
        ? `${fmt(Math.abs(a.vento_norte_m_s))} m/s ${a.vento_norte_m_s > 0 ? "de sul" : "de norte"}`
        : "—";
  }

  // ------------------------------------------------------------------
  // Eventos / init
  // ------------------------------------------------------------------
  function selecionar(id, { pan = false } = {}) {
    state.activeId = id;
    window.DashboardMap.setActive(id);
    document.querySelectorAll("#cpTableBody tr[data-id]").forEach((tr) => tr.classList.toggle("is-active", tr.dataset.id === id));
    renderDetalhe(linhas());
    const m = state.data.find((x) => x.id === id);
    if (pan && m) window.DashboardMap.panTo(m.latitude, m.longitude);
  }

  function bindEvents() {
    $("cpEspecie").addEventListener("change", (e) => {
      state.especie = e.target.value;
      state.activeId = null;
      render({ refit: true });
    });
    $("cpRegion").addEventListener("change", (e) => {
      state.region = e.target.value;
      state.activeId = null;
      load();
    });
    $("cpMeses").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-passo]");
      if (!b) return;
      state.passo = Number(b.dataset.passo);
      render();
    });
    $("cpRefresh").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      btn.classList.add("spin");
      setTimeout(() => btn.classList.remove("spin"), 500);
      load();
    });
    $("dashSearch").addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      render({ refit: true });
    });
    $("cpTableBody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr) selecionar(tr.dataset.id, { pan: true });
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
      onSelect: (id) => selecionar(id),
      pinColor: (p) => nivelDe(p.nivel).color,
      pinLabel: (p) => `${nivelDe(p.nivel).label}${typeof p.indice === "number" ? ` (índice ${fmt(p.indice, 2)})` : ""}`,
    });
    window.DashboardMap.setBoundaryVisible(true);

    bindEvents();
    load();
  });
})();
