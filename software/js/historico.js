// Tela "Histórico de Ocorrências". Tudo vem de GET /ml/coastal-risks (data[]).
// Cada registro da API é uma região num mês (month/year) com risk_level e
// probability — não existem, na API, tipo de alga, concentração, status nem
// o dia exato. Por isso:
//  - "ocorrência" = um registro região/mês já ocorrido (mês futuro é previsão
//    e fica de fora);
//  - o gráfico e o donut agrupam por nível de risco (no design, por espécie);
//  - "Ativo" = registro do mês atual com risco alto ou médio; o resto é
//    "Resolvida" (derivado só de month/year + risk_level).
(function () {
  const S = window.DashShell;
  const $ = (id) => document.getElementById(id);

  const PAGE_SIZE = 6;
  // Os 4 níveis do ML (AlgamarRisk, em api-client.js); "medio" = moderado.
  const AR = window.AlgamarRisk;
  const RISKS = {
    muito_alto: { label: AR.LABEL.muito_alto, color: AR.COLOR.muito_alto },
    alto: { label: AR.LABEL.alto, color: AR.COLOR.alto },
    medio: { label: AR.LABEL.moderado, color: AR.COLOR.moderado },
    baixo: { label: AR.LABEL.baixo, color: AR.COLOR.baixo },
  };
  // Ordem do empilhamento (de baixo para cima) e da legenda do donut.
  const RISK_ORDER = ["muito_alto", "alto", "medio", "baixo"];

  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + now.getMonth();

  const state = {
    data: [],
    search: "",
    // Filtros só valem quando o usuário clica em "Buscar" (como no design).
    applied: { period: 12, region: "", status: "" },
    page: 1,
    rows: [], // linhas filtradas, já ordenadas (usadas pela tabela e pelo CSV)
  };

  const periodIndex = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : nowIdx);
  const monthShort = (idx) => S.MONTH_NAMES[idx % 12].slice(0, 3);
  const periodLabel = (p) => `${monthShort(periodIndex(p))}/${Math.floor(periodIndex(p) / 12)}`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const nf = (n) => n.toLocaleString("pt-BR");

  // Nível do ML (risk_level); sem ele, pela probabilidade com as faixas do ML.
  function riskOf(p) {
    const k = AR.of(p);
    return k === "moderado" ? "medio" : k;
  }
  const statusOf = (p) =>
    periodIndex(p) === nowIdx && riskOf(p) !== "baixo" ? "ativo" : "resolvida";

  // ------------------------------------------------------------------
  // Dados
  // ------------------------------------------------------------------
  async function load() {
    try {
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", {
        params: { region: state.applied.region || undefined },
      });
      state.data = (res.data || []).map((p, i) => ({ ...p, _i: i }));
      S.hideApiWarning();
    } catch (err) {
      if (err.status !== 401) S.showApiWarning(err);
      state.data = [];
    }
    S.setAlertBadge(state.data.filter((p) => ["alto", "muito_alto"].includes(riskOf(p))).length);
    state.page = 1;
    render();
    window.PageLoader.done();
  }

  // Janela de meses: termina no último mês com registro (no máximo o mês
  // atual) e volta "período" meses. Meses futuros são previsão, não histórico.
  function compute() {
    const past = state.data.filter((p) => periodIndex(p) <= nowIdx);
    const end = past.length ? past.reduce((m, p) => Math.max(m, periodIndex(p)), 0) : nowIdx;
    const start = end - state.applied.period + 1;
    const term = state.search.toLowerCase();
    const rows = past
      .filter((p) => {
        const idx = periodIndex(p);
        return (
          idx >= start &&
          idx <= end &&
          (!term || (p.region || "").toLowerCase().includes(term)) &&
          (!state.applied.status || statusOf(p) === state.applied.status)
        );
      })
      .sort(
        (a, b) =>
          periodIndex(b) - periodIndex(a) ||
          (b.probability ?? 0) - (a.probability ?? 0) ||
          String(a.region).localeCompare(String(b.region), "pt-BR")
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
    $("hsActive").textContent = nf(rows.filter((p) => statusOf(p) === "ativo").length);

    const top = rows.reduce(
      (best, p) => (typeof p.probability === "number" && (!best || p.probability > best.probability) ? p : best),
      null
    );
    $("hsMax").textContent = top ? pct(top.probability) : "—";
    $("hsMaxHint").textContent = top ? `${top.region} (${periodLabel(top)})` : " ";
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
    for (let idx = start; idx <= end; idx++) slots.push({ idx, muito_alto: 0, alto: 0, medio: 0, baixo: 0, total: 0 });
    rows.forEach((p) => {
      const slot = slots[periodIndex(p) - start];
      slot[riskOf(p)]++;
      slot.total++;
    });

    const step = niceStep(Math.max(...slots.map((s) => s.total)));
    const max = step * 4;
    const ticks = [4, 3, 2, 1, 0].map((i) => `<span>${i * step}</span>`).join("");
    const grid = "<i></i><i></i><i></i><i></i><i></i>";

    const cols = slots
      .map((s) => {
        const tip = `${monthShort(s.idx)}/${Math.floor(s.idx / 12)} — ${RISK_ORDER.map(
          (k) => `${RISKS[k].label}: ${s[k]}`
        ).join(", ")}`;
        const segs = RISK_ORDER.filter((k) => s[k])
          .map((k) => `<span style="flex:${s[k]} 1 0;background:${RISKS[k].color}"></span>`)
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

  function renderDonut(rows) {
    const counts = { muito_alto: 0, alto: 0, medio: 0, baixo: 0 };
    rows.forEach((p) => counts[riskOf(p)]++);
    const total = rows.length;

    const R = 70;
    const C = 2 * Math.PI * R;
    let acc = 0;
    $("hsDonutSegs").innerHTML = total
      ? RISK_ORDER.filter((k) => counts[k])
          .map((k) => {
            const len = (counts[k] / total) * C;
            const seg = `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${RISKS[k].color}"
              stroke-width="44" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}"></circle>`;
            acc += len;
            return seg;
          })
          .join("")
      : `<circle cx="100" cy="100" r="${R}" fill="none" stroke="#115266" stroke-width="44"></circle>`;

    $("hsDonutTotal").textContent = nf(total);
    $("hsDonutLegend").innerHTML = RISK_ORDER.map(
      (k) => `
      <li>
        <span class="hs-legend__dot" style="background:${RISKS[k].color}"></span>
        <span class="hs-legend__name">${RISKS[k].label}</span>
        <span class="hs-legend__pct">${total ? String(Math.round((counts[k] / total) * 100)).padStart(2, "0") : "00"}%</span>
      </li>`
    ).join("");
  }

  function statusHtml(p) {
    if (statusOf(p) === "ativo") {
      return `<span class="hs-status hs-status--ativo"><i class="hs-alga"></i>Ativo</span>`;
    }
    return `<span class="hs-status hs-status--resolvida">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"></circle>
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#0a2c37" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>Resolvida</span>`;
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
        .map((p) => {
          const r = RISKS[riskOf(p)];
          return `
          <tr>
            <td>${S.escapeHtml(periodLabel(p))}</td>
            <td>${S.escapeHtml(p.region)}</td>
            <td>—</td>
            <td>${typeof p.probability === "number" ? pct(p.probability) : "—"}</td>
            <td><span class="fc-risk" style="color:${r.color}"><span class="material-symbols-outlined" aria-hidden="true">warning</span>${r.label}</span></td>
            <td>${statusHtml(p)}</td>
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
    const head = ["Período", "Local", "Tipo de alga", "Probabilidade", "Nível de risco", "Status"];
    const lines = state.rows.map((p) =>
      [
        periodLabel(p),
        p.region,
        "—",
        typeof p.probability === "number" ? pct(p.probability) : "—",
        RISKS[riskOf(p)].label,
        statusOf(p) === "ativo" ? "Ativo" : "Resolvida",
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
    bindEvents();
    load();
  });
})();
