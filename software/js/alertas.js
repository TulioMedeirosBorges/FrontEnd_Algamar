// Tela "Central de alertas". Tudo vem de Condições Propícias
// (GET /ml/condicoes-propicias, via js/condicoes-data.js) — a mesma regra do
// sino do topo (js/notifications.js), então os números batem:
//  - "Ativo": município × espécie tóxica com o mar propício ou parcialmente
//    propício no mês ATUAL;
//  - "Previsto": um dos próximos meses previsto como propício;
//  - só mês atual em diante (o passado fica no Histórico de Ocorrências).
// É índice de condições da literatura, NÃO floração confirmada.
(function () {
  const S = window.DashShell;
  const C = window.CondicoesData;
  const $ = (id) => document.getElementById(id);

  const SEV = {
    propicio: { label: "Propício", color: C.NIVEIS["propício"].color, rank: 2 },
    parcial: { label: "Parcialmente propício", color: C.NIVEIS["parcialmente propício"].color, rank: 1 },
  };
  const TITLE = {
    propicio: (a) => `Condições propícias para ${a.m.especie} em ${a.m.municipio}`,
    parcial: (a) => `Condições parcialmente propícias para ${a.m.especie} em ${a.m.municipio}`,
  };
  const PAGE_SIZE = 6;
  const NOTES = 5;

  const now = new Date();
  const nowYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mesIdx = (ym) => {
    const [a, m] = ym.split("-").map(Number);
    return a * 12 + (m - 1);
  };

  const state = {
    data: [],
    tab: "todas",
    sev: null, // filtro por nível (clique nos cards)
    region: "",
    horizon: 3, // meses à frente considerados (0 = só o atual)
    especie: "", // tipo de alga (filtro local)
    page: 1,
    search: "", // busca do topo (município ou espécie)
  };

  const fmtIdx = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load(force) {
    try {
      const res = await C.load(state.region, { force: !!force });
      state.data = res.data;
      fillEspecies(res.especies);
      S.hideApiWarning();
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
      state.data = [];
    }
    render();
    window.PageLoader.done();
  }

  function fillEspecies(list) {
    const sel = $("alEspecie");
    const especies = (list && list.length ? list : [...new Set(state.data.map((m) => m.especie))]).sort();
    sel.innerHTML =
      `<option value="">Todas</option>` +
      especies.map((e) => `<option value="${S.escapeHtml(e)}">${S.escapeHtml(e)}</option>`).join("");
    if (!especies.includes(state.especie)) state.especie = "";
    sel.value = state.especie;
  }

  // Um alerta por município × espécie × mês (mesma regra do sino).
  function compute() {
    const alerts = [];
    let desfavoraveis = 0;
    state.data.forEach((m) => {
      if (state.especie && m.especie !== state.especie) return;
      if (m.agora && m.agora.mes === nowYm && C.nivelDe(m.agora.nivel).key === "desfavoravel") desfavoraveis++;
      [m.agora, ...(m.proximos || [])].forEach((r, i) => {
        if (!r || !r.mes || r.mes < nowYm) return;
        if (mesIdx(r.mes) - mesIdx(nowYm) > state.horizon) return;
        const sev = C.nivelDe(r.nivel).key;
        if (!SEV[sev] || (i > 0 && sev !== "propicio")) return;
        alerts.push({ m, r, sev, status: i === 0 ? "ativo" : "previsto" });
      });
    });
    return { alerts, desfavoraveis };
  }

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render() {
    const { alerts, desfavoraveis } = compute();
    const term = C.norm(state.search);
    const bySearch = alerts.filter(
      (a) => !term || C.norm(a.m.municipio).includes(term) || C.norm(a.m.especie).includes(term)
    );

    // Cards: situação do mês atual (não mudam com aba/filtro de nível).
    $("alCount_propicio").textContent = bySearch.filter((a) => a.status === "ativo" && a.sev === "propicio").length;
    $("alCount_parcial").textContent = bySearch.filter((a) => a.status === "ativo" && a.sev === "parcial").length;
    $("alCount_previsto").textContent = bySearch.filter((a) => a.status === "previsto").length;
    $("alCount_desfavoravel").textContent = desfavoraveis;
    document.querySelectorAll(".al-sevcard[data-sev]").forEach((btn) => {
      const on = btn.dataset.sev === state.sev;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    // Abas: contagens já respeitam o filtro de nível.
    const bySev = bySearch.filter((a) => !state.sev || a.sev === state.sev);
    $("alTabTodas").textContent = bySev.length;
    $("alTabAtivo").textContent = bySev.filter((a) => a.status === "ativo").length;
    $("alTabPrevisto").textContent = bySev.filter((a) => a.status === "previsto").length;
    document.querySelectorAll(".al-tab[data-tab]").forEach((btn) => {
      const on = btn.dataset.tab === state.tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    renderList(bySev.filter((a) => state.tab === "todas" || a.status === state.tab));
    renderNotes(bySearch);
  }

  function statusChip(a) {
    return a.status === "ativo"
      ? `<span class="al-chip al-chip--ativo">Agora</span>`
      : `<span class="al-chip al-chip--resolvido">Previsão</span>`;
  }

  function renderList(list) {
    const el = $("alList");
    const sorted = [...list].sort(
      (a, b) => a.r.mes.localeCompare(b.r.mes) || SEV[b.sev].rank - SEV[a.sev].rank || b.r.indice - a.r.indice
    );
    const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PAGE_SIZE;
    const shown = sorted.slice(start, start + PAGE_SIZE);

    $("alRange").textContent = sorted.length
      ? `${start + 1}–${start + shown.length} de ${sorted.length}`
      : "";
    renderPager(pages);

    if (!shown.length) {
      el.innerHTML = `<li class="dash-empty">Nenhum alerta para os filtros selecionados.</li>`;
      return;
    }
    el.innerHTML = shown
      .map((a) => {
        const tox = C.siglaToxina(a.m.toxina);
        const conf = a.r.confianca ? a.r.confianca.split(":")[0] : "";
        return `
        <li>
          <a class="al-item" style="--sev:${SEV[a.sev].color}" href="${S.escapeHtml(C.url(a.m.municipio, a.m.especie))}">
            <span class="material-symbols-outlined al-item__icon" aria-hidden="true">warning</span>
            <div class="al-item__body">
              <div class="al-item__head">
                <h3>${S.escapeHtml(`${a.m.especie} em ${a.m.municipio}`)}</h3>
                <span class="al-chip al-chip--sev" style="--sev:${SEV[a.sev].color}">${SEV[a.sev].label}</span>
                ${statusChip(a)}
              </div>
              <p class="al-meta">
                <span><span class="material-symbols-outlined" aria-hidden="true">location_on</span>${S.escapeHtml(`${a.m.municipio} · ${a.m.macro_region || "—"}`)}</span>
                ${tox ? `<span><span class="material-symbols-outlined" aria-hidden="true">science</span>${S.escapeHtml(tox)}</span>` : ""}
                <span><span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>${S.escapeHtml(C.mesLabel(a.r.mes))}${a.status === "ativo" ? " (observado)" : " (previsto)"}</span>
                <span><span class="material-symbols-outlined" aria-hidden="true">speed</span>Índice ${fmtIdx(a.r.indice)}</span>
                ${conf ? `<span><span class="material-symbols-outlined" aria-hidden="true">info</span>Confiança ${S.escapeHtml(conf)}</span>` : ""}
              </p>
            </div>
            <span class="material-symbols-outlined al-item__chev" aria-hidden="true">chevron_right</span>
          </a>
        </li>`;
      })
      .join("");
  }

  // Paginação numerada: ‹ 1 2 3 … 9 ›
  function renderPager(pages) {
    const nav = $("alPager");
    nav.hidden = pages <= 1;
    if (pages <= 1) {
      nav.innerHTML = "";
      return;
    }
    const cur = state.page;
    // janela de 5 números em volta da atual, sempre com a primeira e a última
    const lo = Math.max(1, Math.min(cur - 2, pages - 4));
    const hi = Math.min(pages, lo + 4);
    const nums = [];
    if (lo > 1) nums.push(1);
    if (lo > 2) nums.push("…");
    for (let i = lo; i <= hi; i++) nums.push(i);
    if (hi < pages - 1) nums.push("…");
    if (hi < pages) nums.push(pages);
    const btn = (page, label, extra = "") =>
      `<button type="button" class="al-pager__btn${extra}" data-page="${page}"${
        page === cur && !extra ? ' aria-current="page"' : ""
      }${page < 1 || page > pages ? " disabled" : ""}>${label}</button>`;
    nav.innerHTML =
      btn(cur - 1, `<span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>`, " al-pager__btn--nav") +
      nums.map((n) => (n === "…" ? `<span class="al-pager__gap">…</span>` : btn(n, n))).join("") +
      btn(cur + 1, `<span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>`, " al-pager__btn--nav");
  }

  // Últimas notificações: as de agora com maior índice (as mesmas do sino).
  function renderNotes(alerts) {
    const el = $("alNotes");
    const latest = alerts
      .filter((a) => a.status === "ativo")
      .sort((a, b) => SEV[b.sev].rank - SEV[a.sev].rank || b.r.indice - a.r.indice)
      .slice(0, NOTES);
    if (!latest.length) {
      el.innerHTML = `<li class="dash-empty">Sem notificações.</li>`;
      return;
    }
    el.innerHTML = latest
      .map(
        (a) => `
      <li class="al-note" style="--sev:${SEV[a.sev].color}">
        <span class="material-symbols-outlined al-note__icon" aria-hidden="true">warning</span>
        <div>
          <p class="al-note__title">${S.escapeHtml(TITLE[a.sev](a))}</p>
          <p class="al-note__sub">${S.escapeHtml(`${a.m.macro_region || "—"} · Índice ${fmtIdx(a.r.indice)}`)}${
            a.m.toxina ? ` · ${S.escapeHtml(C.siglaToxina(a.m.toxina))}` : ""
          }</p>
        </div>
        <time class="al-note__time">${S.escapeHtml(C.mesLabel(a.r.mes, true))}</time>
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
        state.page = 1;
        render();
      })
    );
    document.querySelectorAll(".al-sevcard[data-sev]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const sev = btn.dataset.sev;
        // "Previsões" é um atalho para a aba; os outros filtram por nível.
        if (sev === "previsto") {
          state.sev = null;
          state.tab = state.tab === "previsto" ? "todas" : "previsto";
        } else {
          state.sev = state.sev === sev ? null : sev;
        }
        state.page = 1;
        render();
      })
    );
    $("alPager").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-page]");
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.page);
      render();
      $("alList").closest(".al-col").scrollIntoView({ block: "nearest", behavior: "smooth" });
    });

    // Popover "Filtrar" (região vai para a API; horizonte é local)
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
    function apply(region, horizon, especie) {
      const regionChanged = region !== state.region;
      state.region = region;
      state.horizon = horizon;
      state.especie = especie;
      state.page = 1;
      setOpen(false);
      if (regionChanged) load();
      else render();
    }
    $("alApply").addEventListener("click", () => apply($("alRegion").value, Number($("alWindow").value), $("alEspecie").value));
    $("alClear").addEventListener("click", () => {
      $("alRegion").value = "";
      $("alWindow").value = "3";
      $("alEspecie").value = "";
      state.sev = null;
      state.tab = "todas";
      apply("", 3, "");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(() => load(true))) return;
    bindEvents();
    $("dashSearch").addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      state.page = 1;
      render();
    });
    load();
  });
})();
