// Tela "Histórico de Ocorrências". Tudo vem do histórico de Condições
// Propícias (GET /ml/condicoes-propicias/historico): o índice de condições da
// literatura, mês a mês, por município e espécie tóxica. Por isso:
//  - "ocorrência" = um município/espécie/mês em que o mar esteve propício ou
//    parcialmente propício para a espécie (meses desfavoráveis ficam de fora);
//  - o gráfico empilha por nível e o donut divide por espécie;
//  - "Ativo" = ocorrência do mês mais recente com dado; o resto "Encerrada".
// É índice de condições, NÃO floração confirmada nem probabilidade.
(function () {
  const S = window.DashShell;
  const C = window.CondicoesData;
  const $ = (id) => document.getElementById(id);

  const PAGE_SIZE = 6;
  // Níveis que contam como ocorrência (cores de js/condicoes-data.js).
  const NIVEIS = {
    propicio: C.NIVEIS["propício"],
    parcial: C.NIVEIS["parcialmente propício"],
  };
  const NIVEL_ORDER = ["propicio", "parcial"];
  const ESPECIE_CORES = ["#4da3ff", "#5fc9be", "#ff383c", "#b38cff", "#f5c518", "#00c05d"];
  const MAX_MESES = 12;

  const now = new Date();
  // Vindo do painel do mapa: ?municipio=Ubatuba já filtra a busca.
  const params = new URLSearchParams(window.location.search);

  const state = {
    data: [],
    especies: [],
    search: params.get("municipio") || "",
    // Filtros só valem quando o usuário clica em "Buscar" (como no design).
    applied: { period: 12, region: "", especie: "", status: "" },
    page: 1,
    rows: [], // linhas filtradas, já ordenadas (usadas pela tabela e pelo CSV)
    lastMes: "",
  };

  const mesIdx = (ym) => {
    const [a, m] = ym.split("-").map(Number);
    return a * 12 + (m - 1);
  };
  const monthShort = (idx) => S.MONTH_NAMES[idx % 12].slice(0, 3);
  const periodLabel = (r) => C.mesLabel(r.mes, true);
  const fmtIdx = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nf = (n) => n.toLocaleString("pt-BR");
  const nivelOf = (r) => C.nivelDe(r.nivel).key; // "propicio" | "parcial" | "desfavoravel"
  const statusOf = (r) => (r.mes === state.lastMes ? "ativo" : "resolvida");
  const especieLabel = (r) => `${r.especie}${r.toxina ? ` (${C.siglaToxina(r.toxina)})` : ""}`;

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load() {
    try {
      const res = await C.historico({ region: state.applied.region, meses: MAX_MESES, force: true });
      state.data = res.data.filter((r) => NIVEIS[nivelOf(r)]).map((r, i) => ({ ...r, _i: i }));
      state.especies = res.especies;
      state.lastMes = res.meses.length ? res.meses[res.meses.length - 1] : "";
      S.hideApiWarning();
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
      state.data = [];
    }
    renderEspecies();
    state.page = 1;
    render();
    window.PageLoader.done();
  }

  function renderEspecies() {
    const sel = $("hsAlga");
    sel.disabled = !state.especies.length;
    sel.title = "";
    sel.innerHTML =
      `<option value="">Todas</option>` +
      state.especies
        .map((e) => `<option value="${S.escapeHtml(e)}"${e === state.applied.especie ? " selected" : ""}>${S.escapeHtml(e)}</option>`)
        .join("");
  }

  // Janela de meses: termina no último mês com dado e volta "período" meses.
  function compute() {
    const end = state.lastMes ? mesIdx(state.lastMes) : now.getFullYear() * 12 + now.getMonth();
    const start = end - state.applied.period + 1;
    const term = C.norm(state.search);
    const rows = state.data
      .filter((r) => {
        const idx = mesIdx(r.mes);
        return (
          idx >= start &&
          idx <= end &&
          (!term || C.norm(r.municipio).includes(term) || C.norm(r.especie).includes(term)) &&
          (!state.applied.especie || r.especie === state.applied.especie) &&
          (!state.applied.status || statusOf(r) === state.applied.status)
        );
      })
      .sort(
        (a, b) =>
          b.mes.localeCompare(a.mes) ||
          b.indice - a.indice ||
          a.municipio.localeCompare(b.municipio, "pt-BR")
      );
    return { rows, start, end };
  }

  // ------------------------------------------------------------------
  // Renderização
  // ------------------------------------------------------------------
  function render() {
    const { rows, start, end } = compute();
    state.rows = rows;
    renderKpis(rows);
    renderBars(rows, start, end);
    renderDonut(rows);
    renderTable();
  }

  function renderKpis(rows) {
    $("hsTotal").textContent = nf(rows.length);
    $("hsActive").textContent = nf(rows.filter((r) => statusOf(r) === "ativo").length);

    const top = rows.reduce((best, r) => (!best || r.indice > best.indice ? r : best), null);
    $("hsMax").textContent = top ? fmtIdx(top.indice) : "—";
    $("hsMaxHint").textContent = top ? `${top.municipio} · ${top.especie} (${periodLabel(top)})` : " ";
  }

  // Passo "redondo" para o eixo Y: 4 divisões de 1, 2, 4, 5, 8, 10, 16, 20...
  function niceStep(max) {
    const steps = [1, 2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 100, 200, 250, 400, 500, 1000];
    const need = Math.max(max, 1) / 4;
    return steps.find((s) => s >= need) || Math.ceil(need / 1000) * 1000;
  }

  function renderBars(rows, start, end) {
    const el = $("hsBars");
    if (!rows.length) {
      el.innerHTML = `<p class="dash-empty">Sem ocorrências no período.</p>`;
      return;
    }
    const slots = [];
    for (let idx = start; idx <= end; idx++) slots.push({ idx, propicio: 0, parcial: 0, total: 0 });
    rows.forEach((r) => {
      const slot = slots[mesIdx(r.mes) - start];
      slot[nivelOf(r)]++;
      slot.total++;
    });

    const step = niceStep(Math.max(...slots.map((s) => s.total)));
    const max = step * 4;
    const ticks = [4, 3, 2, 1, 0].map((i) => `<span>${i * step}</span>`).join("");
    const grid = "<i></i><i></i><i></i><i></i><i></i>";

    const cols = slots
      .map((s) => {
        const tip = `${monthShort(s.idx)}/${Math.floor(s.idx / 12)} — ${NIVEL_ORDER.map(
          (k) => `${NIVEIS[k].label}: ${s[k]}`
        ).join(", ")}`;
        const segs = NIVEL_ORDER.filter((k) => s[k])
          .map((k) => `<span style="flex:${s[k]} 1 0;background:${NIVEIS[k].color}"></span>`)
          .join("");
        return `<div class="hs-col" title="${S.escapeHtml(tip)}"><div class="hs-col__stack" style="height:${
          (s.total / max) * 100
        }%">${segs}</div></div>`;
      })
      .join("");
    const labels = slots.map((s) => `<span>${monthShort(s.idx).toLowerCase()}</span>`).join("");

    el.innerHTML = `
      <div class="hs-chart__y">${ticks}</div>
      <div class="hs-chart__area">
        <div class="hs-chart__grid">${grid}</div>
        <div class="hs-chart__cols">${cols}</div>
      </div>
      <div class="hs-chart__x">${labels}</div>`;
  }

  // Donut por espécie tóxica.
  function renderDonut(rows) {
    const especies = state.especies.length ? state.especies : [...new Set(rows.map((r) => r.especie))];
    const color = (e) => ESPECIE_CORES[especies.indexOf(e) % ESPECIE_CORES.length];
    const counts = Object.fromEntries(especies.map((e) => [e, 0]));
    rows.forEach((r) => (counts[r.especie] = (counts[r.especie] || 0) + 1));
    const total = rows.length;

    const R = 70;
    const CIRC = 2 * Math.PI * R;
    let acc = 0;
    $("hsDonutSegs").innerHTML = total
      ? especies
          .filter((e) => counts[e])
          .map((e) => {
            const len = (counts[e] / total) * CIRC;
            const seg = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${color(e)}"
              stroke-width="44" stroke-dasharray="${len} ${CIRC - len}" stroke-dashoffset="${-acc}"></circle>`;
            acc += len;
            return seg;
          })
          .join("")
      : `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#115266" stroke-width="44"></circle>`;

    $("hsDonutTotal").textContent = nf(total);
    $("hsDonutLegend").innerHTML = especies
      .map(
        (e) => `
      <li>
        <span class="hs-legend__dot" style="background:${color(e)}"></span>
        <span class="hs-legend__name">${S.escapeHtml(e)}</span>
        <span class="hs-legend__pct">${total ? String(Math.round(((counts[e] || 0) / total) * 100)).padStart(2, "0") : "00"}%</span>
      </li>`
      )
      .join("");
  }

  function statusHtml(p) {
    if (statusOf(p) === "ativo") {
      return `<span class="hs-status hs-status--ativo"><i class="hs-alga"></i>Ativo</span>`;
    }
    return `<span class="hs-status hs-status--resolvida">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"></circle>
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#0a2c37" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>Encerrada</span>`;
  }

  function renderTable() {
    const body = $("hsTableBody");
    const pages = Math.max(1, Math.ceil(state.rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);

    if (!state.rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="dash-empty">Nenhuma ocorrência para os filtros selecionados.</td></tr>`;
    } else {
      body.innerHTML = state.rows
        .slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE)
        .map((r) => {
          const n = NIVEIS[nivelOf(r)];
          return `
          <tr>
            <td>${S.escapeHtml(periodLabel(r))}</td>
            <td>${S.escapeHtml(r.municipio)}</td>
            <td>${S.escapeHtml(especieLabel(r))}</td>
            <td>${fmtIdx(r.indice)}</td>
            <td><span class="fc-risk" style="color:${n.color}"><span class="material-symbols-outlined" aria-hidden="true">warning</span>${n.label}</span></td>
            <td>${statusHtml(r)}</td>
          </tr>`;
        })
        .join("");
    }
    renderPager(pages);
  }

  function renderPager(pages) {
    const el = $("hsPager");
    if (pages < 2) {
      el.innerHTML = "";
      return;
    }
    const first = Math.min(Math.max(1, state.page - 2), Math.max(1, pages - 4));
    const last = Math.min(pages, first + 4);
    let html = `<button type="button" data-page="${state.page - 1}" aria-label="Página anterior" ${
      state.page === 1 ? "disabled" : ""
    }><span class="material-symbols-outlined" aria-hidden="true">chevron_left</span></button>`;
    for (let n = first; n <= last; n++) {
      html += `<button type="button" data-page="${n}"${
        n === state.page ? ' class="is-active" aria-current="page"' : ""
      }>${n}</button>`;
    }
    html += `<button type="button" data-page="${state.page + 1}" aria-label="Próxima página" ${
      state.page === pages ? "disabled" : ""
    }><span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></button>`;
    el.innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Exportar (CSV com todas as linhas filtradas, não só a página atual)
  // ------------------------------------------------------------------
  function csvCell(v) {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita fórmula ao abrir no Excel
    return `"${s.replace(/"/g, '""')}"`;
  }
  function exportCsv() {
    const head = ["Período", "Local", "Tipo de alga", "Índice de condições", "Nível", "Status"];
    const lines = state.rows.map((r) =>
      [
        periodLabel(r),
        r.municipio,
        especieLabel(r),
        fmtIdx(r.indice),
        NIVEIS[nivelOf(r)].label,
        statusOf(r) === "ativo" ? "Ativo" : "Encerrada",
      ]
        .map(csvCell)
        .join(";")
    );
    const blob = new Blob(["﻿" + [head.map(csvCell).join(";"), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ocorrencias-${now.toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------------------------
  // Eventos / init
  // ------------------------------------------------------------------
  function bindEvents() {
    $("hsSearch").addEventListener("click", () => {
      const regionChanged = $("hsRegion").value !== state.applied.region;
      state.applied = {
        period: Number($("hsPeriod").value),
        region: $("hsRegion").value,
        especie: $("hsAlga").value,
        status: $("hsStatus").value,
      };
      state.page = 1;
      if (regionChanged) load();
      else render();
    });
    $("dashSearch").addEventListener("input", (e) => {
      state.search = e.target.value.trim();
      state.page = 1;
      render();
    });
    $("hsPager").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-page]");
      if (!btn || btn.disabled) return;
      state.page = Number(btn.dataset.page);
      renderTable();
    });
    $("hsExport").addEventListener("click", exportCsv);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(load)) return;
    if (state.search) $("dashSearch").value = state.search;
    bindEvents();
    load();
  });
})();
