// Tela "Central de alertas". Tudo vem de GET /ml/coastal-risks (data[]).
// A API não tem uma tabela de alertas, então cada REGISTRO região/mês já
// ocorrido vira um alerta:
//  - severidade: o risk_level do ML (baixo, moderado, alto, muito alto), o
//    mesmo de todas as telas (AlgamarRisk, em api-client.js);
//  - "atual": registro do mês mais recente com dados (no máximo o mês atual);
//  - "Ativo": alerta atual com severidade acima de baixo; o resto é
//    "Resolvido". Derivado só de month/year + severidade.
// Tipo de alga, concentração e hora não existem na API e ficam de fora.
(function () {
  const S = window.DashShell;
  const $ = (id) => document.getElementById(id);

  const SEV = {
    muito_alto: { label: "Muito alto", color: "#ff383c", rank: 4 },
    alto: { label: "Alto", color: "#f08c28", rank: 3 },
    moderado: { label: "Moderado", color: "#f5c518", rank: 2 },
    baixo: { label: "Baixo", color: "#00c05d", rank: 1 },
  };
  const SEV_KEYS = ["muito_alto", "alto", "moderado", "baixo"];
  const TITLE = {
    muito_alto: (r) => `Floração identificada em ${r}`,
    alto: (r) => `Risco de floração em ${r}`,
    moderado: (r) => `Condições favoráveis à floração em ${r}`,
    baixo: (r) => `Condições normalizadas em ${r}`,
  };
  const VISIBLE_DEFAULT = 4;
  const NOTES = 5;

  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + now.getMonth();

  const state = {
    data: [],
    tab: "todas",
    sev: null, // filtro por nível (clique nos cards)
    region: "",
    window: 3, // meses considerados (a partir do mais recente)
    showAll: false,
    search: "", // busca do topo (por região)
  };

  const periodIndex = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : nowIdx);
  const periodLabel = (idx) => `${S.MONTH_NAMES[idx % 12].slice(0, 3)}/${Math.floor(idx / 12)}`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const fmt1 = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

  const severityOf = (p) => window.AlgamarRisk.of(p);

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load() {
    try {
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", {
        params: { region: state.region || undefined },
      });
      state.data = (res.data || []).map((p, i) => ({ ...p, _i: i }));
      S.hideApiWarning();
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
      state.data = [];
    }
    render();
    window.PageLoader.done();
  }

  // Todos os alertas da janela + o mês "atual" (o mais recente com dados).
  function compute() {
    const past = state.data.filter((p) => periodIndex(p) <= nowIdx);
    const end = past.length ? past.reduce((m, p) => Math.max(m, periodIndex(p)), 0) : nowIdx;
    const start = end - state.window + 1;
    const alerts = past
      .filter((p) => periodIndex(p) >= start)
      .map((p) => {
        const sev = severityOf(p);
        const idx = periodIndex(p);
        return { p, sev, idx, status: idx === end && sev !== "baixo" ? "ativo" : "resolvido" };
      });
    return { alerts, end };
  }

  const orderKey = (a) => (Number.isFinite(Number(a.p.id)) ? Number(a.p.id) : a.p._i);

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render() {
    const { alerts, end } = compute();

    // Cards: alertas do mês atual por nível (não mudam com aba/filtro de nível).
    SEV_KEYS.forEach((k) => {
      $(`alCount_${k}`).textContent = alerts.filter((a) => a.idx === end && a.sev === k).length;
    });
    document.querySelectorAll(".al-sevcard").forEach((btn) => {
      const on = btn.dataset.sev === state.sev;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    // Abas: contagens já respeitam o filtro de nível.
    const term = state.search.toLowerCase();
    const bySev = alerts.filter(
      (a) =>
        (!state.sev || a.sev === state.sev) &&
        (!term || (a.p.region || "").toLowerCase().includes(term))
    );
    $("alTabTodas").textContent = bySev.length;
    $("alTabAtivo").textContent = bySev.filter((a) => a.status === "ativo").length;
    $("alTabResolvido").textContent = bySev.filter((a) => a.status === "resolvido").length;
    document.querySelectorAll(".al-tab[data-tab]").forEach((btn) => {
      const on = btn.dataset.tab === state.tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    // O sino do topo conta os alertas ativos de nível alto ou muito alto.
    S.setAlertBadge(
      alerts.filter((a) => a.status === "ativo" && SEV[a.sev].rank >= 3).length
    );

    renderList(bySev.filter((a) => state.tab === "todas" || a.status === state.tab));
    renderNotes(alerts);
  }

  function renderList(list) {
    const el = $("alList");
    const sorted = [...list].sort(
      (a, b) => SEV[b.sev].rank - SEV[a.sev].rank || b.idx - a.idx || (b.p.probability ?? 0) - (a.p.probability ?? 0)
    );
    const shown = state.showAll ? sorted : sorted.slice(0, VISIBLE_DEFAULT);

    $("alMore").hidden = sorted.length <= VISIBLE_DEFAULT;
    $("alMore").textContent = state.showAll ? "Ver menos" : "Ver todas";

    if (!shown.length) {
      el.innerHTML = `<li class="dash-empty">Nenhum alerta para os filtros selecionados.</li>`;
      return;
    }
    el.innerHTML = shown
      .map(({ p, sev, status, idx }) => {
        const ef = p.environmental_factors || {};
        const extras = [];
        if (typeof ef.temperature_celsius === "number")
          extras.push(`<span><span class="material-symbols-outlined" aria-hidden="true">thermostat</span>${fmt1(ef.temperature_celsius)}°C</span>`);
        if (typeof ef.chlorophyll_mg_m3 === "number")
          extras.push(`<span><span class="material-symbols-outlined" aria-hidden="true">eco</span>Clorofila ${fmt1(ef.chlorophyll_mg_m3)} mg/m³</span>`);
        return `
        <li>
          <a class="al-item" style="--sev:${SEV[sev].color}" href="mapa-interativo.html?ponto=${encodeURIComponent(p.id ?? "")}">
            <span class="material-symbols-outlined al-item__icon" aria-hidden="true">warning</span>
            <div class="al-item__body">
              <div class="al-item__head">
                <h3>${S.escapeHtml(TITLE[sev](p.region || "ponto monitorado"))}</h3>
                <span class="al-chip al-chip--sev" style="--sev:${SEV[sev].color}">${SEV[sev].label}</span>
                <span class="al-chip al-chip--${status}">${status === "ativo" ? "Ativo" : "Resolvido"}</span>
              </div>
              <p class="al-meta"><span><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${S.escapeHtml(p.region || "—")}</span></p>
              <p class="al-meta">
                <span><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>${S.escapeHtml(periodLabel(idx))}</span>
                ${typeof p.probability === "number" ? `<span><span class="material-symbols-outlined" aria-hidden="true">water_drop</span>Probabilidade ${pct(p.probability)}</span>` : ""}
              </p>
              ${extras.length ? `<p class="al-meta">${extras.join("")}</p>` : ""}
            </div>
            <span class="material-symbols-outlined al-item__chev" aria-hidden="true">chevron_right</span>
          </a>
        </li>`;
      })
      .join("");
  }

  // Últimas notificações: os registros mais recentes (o mês é a menor unidade
  // de tempo da API, então dentro do mesmo mês vale a ordem de cadastro).
  function renderNotes(alerts) {
    const el = $("alNotes");
    const latest = [...alerts].sort((a, b) => b.idx - a.idx || orderKey(b) - orderKey(a)).slice(0, NOTES);
    if (!latest.length) {
      el.innerHTML = `<li class="dash-empty">Sem notificações.</li>`;
      return;
    }
    el.innerHTML = latest
      .map(
        ({ p, sev, idx }) => `
      <li class="al-note" style="--sev:${SEV[sev].color}">
        <span class="material-symbols-outlined al-note__icon" aria-hidden="true">warning</span>
        <div>
          <p class="al-note__title">${S.escapeHtml(TITLE[sev](p.region || "ponto monitorado"))}</p>
          <p class="al-note__sub">${S.escapeHtml(p.region || "—")}${
            typeof p.probability === "number" ? ` · Probabilidade ${pct(p.probability)}` : ""
          }</p>
        </div>
        <time class="al-note__time">${S.escapeHtml(periodLabel(idx))}</time>
      </li>`
      )
      .join("");
  }

  // ------------------------------------------------------------------
  // Eventos / init
  // ------------------------------------------------------------------
  function bindEvents() {
    document.querySelectorAll(".al-tab[data-tab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.tab = btn.dataset.tab;
        state.showAll = false;
        render();
      })
    );
    document.querySelectorAll(".al-sevcard").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.sev = state.sev === btn.dataset.sev ? null : btn.dataset.sev;
        state.showAll = false;
        render();
      })
    );
    $("alMore").addEventListener("click", () => {
      state.showAll = !state.showAll;
      render();
    });

    // Popover "Filtrar" (região vai para a API; período é local)
    const btn = $("alFilterBtn");
    const pop = $("alPop");
    const setOpen = (open) => {
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", () => setOpen(pop.hidden));
    document.addEventListener("click", (e) => {
      if (!pop.hidden && !e.target.closest(".al-filter")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
    function apply(region, win) {
      const regionChanged = region !== state.region;
      state.region = region;
      state.window = win;
      state.showAll = false;
      setOpen(false);
      if (regionChanged) load();
      else render();
    }
    $("alApply").addEventListener("click", () => apply($("alRegion").value, Number($("alWindow").value)));
    $("alClear").addEventListener("click", () => {
      $("alRegion").value = "";
      $("alWindow").value = "3";
      state.sev = null;
      state.tab = "todas";
      apply("", 3);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(load)) return;
    bindEvents();
    $("dashSearch").addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      state.showAll = false;
      render();
    });
    load();
  });
})();
