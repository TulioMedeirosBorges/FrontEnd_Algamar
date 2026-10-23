// Tela "Relatórios": monta o relatório escolhido com os dados de
// GET /ml/coastal-risks e entrega em PDF ou CSV (baixar) ou pelo
// compartilhamento do sistema (compartilhar).
//
// Limites dos dados: a API traz registros região/mês (month/year) com
// risk_level, probability e environmental_factors (temperatura, salinidade,
// clorofila). Não há tipo de alga, concentração, dia exato nem pH/vento/etc.
// Por isso "Últimos 30 dias" = o mês mais recente com dados, e os relatórios
// avisam o que a API não informa.
(function () {
  const S = window.DashShell;
  const P = window.PdfLite;
  const $ = (id) => document.getElementById(id);

  const now = new Date();
  const nowIdx = now.getFullYear() * 12 + now.getMonth();
  const periodIndex = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : nowIdx);
  const monthLabel = (idx) => `${S.MONTH_NAMES[idx % 12].slice(0, 3)}/${Math.floor(idx / 12)}`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const num1 = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
  const stamp = () =>
    `${window.UserPrefs ? window.UserPrefs.formatDate(now) : now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;

  // Os 4 níveis do ML (AlgamarRisk, em api-client.js); "medio" = moderado.
  const AR = window.AlgamarRisk;
  const LEVELS = {
    muito_alto: { label: AR.LABEL.muito_alto, color: P.colors.red },
    alto: { label: AR.LABEL.alto, color: [220, 110, 20] },
    medio: { label: AR.LABEL.moderado, color: P.colors.yellow },
    baixo: { label: AR.LABEL.baixo, color: P.colors.green },
  };
  const LEVEL_KEYS = ["muito_alto", "alto", "medio", "baixo"];
  const telaKey = (k) => (k === "moderado" ? "medio" : k);
  const zeros = () => ({ muito_alto: 0, alto: 0, medio: 0, baixo: 0 });
  const isHigh = (lv) => lv === "alto" || lv === "muito_alto";
  // Nível de um registro: risk_level do ML; sem ele, pela probabilidade (faixas do ML).
  const levelOf = (p) => telaKey(AR.of(p));
  // Nível de uma média (ex.: de uma região), com as faixas do ML.
  const tierOfProbability = (v) => telaKey(AR.fromProbability(v) || "baixo");

  // ------------------------------------------------------------------
  // Preparação dos dados conforme os filtros
  // ------------------------------------------------------------------
  function prepare(data, months, search) {
    const term = (search || "").toLowerCase();
    const all = data.filter((p) => !term || (p.region || "").toLowerCase().includes(term));
    const past = all.filter((p) => periodIndex(p) <= nowIdx);
    const end = past.length ? past.reduce((m, p) => Math.max(m, periodIndex(p)), 0) : nowIdx;
    const start = end - months + 1;
    const inWin = past.filter((p) => periodIndex(p) >= start);
    const future = all.filter((p) => periodIndex(p) > nowIdx);
    const isActive = (p) => periodIndex(p) === end && levelOf(p) !== "baixo";
    return { inWin, future, start, end, isActive };
  }

  function groupBy(list, keyFn) {
    const map = new Map();
    list.forEach((p) => {
      const k = keyFn(p);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(p);
    });
    return map;
  }
  const probs = (list) => list.map((p) => p.probability).filter((v) => typeof v === "number");
  const envAvg = (list, field) =>
    mean(list.map((p) => p.environmental_factors && p.environmental_factors[field]).filter((v) => typeof v === "number"));

  function regionRanking(list) {
    return [...groupBy(list, (p) => p.region || "—")]
      .map(([region, recs]) => {
        const ps = probs(recs);
        return { region, n: recs.length, avg: mean(ps), max: ps.length ? Math.max(...ps) : null };
      })
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }

  const sortedRecords = (list) =>
    [...list].sort(
      (a, b) =>
        periodIndex(b) - periodIndex(a) ||
        (b.probability ?? 0) - (a.probability ?? 0) ||
        String(a.region).localeCompare(String(b.region), "pt-BR")
    );

  const levelCell = (lv) => ({ text: LEVELS[lv].label, color: LEVELS[lv].color, bold: true });

  // ------------------------------------------------------------------
  // Modelos de relatório (o mesmo modelo vira PDF, CSV ou texto)
  // ------------------------------------------------------------------
  const NOTE_NO_ALGA =
    "Tipo de alga e concentração (cel/L) ainda não são informados pela API e por isso não constam neste relatório.";

  function metaLines(f, prep) {
    const span =
      prep.start === prep.end ? monthLabel(prep.end) : `${monthLabel(prep.start)} a ${monthLabel(prep.end)}`;
    return [
      ["Período", `${f.periodLabel} (${span})`],
      ["Região", f.regionLabel],
      ["Tipo de alga", "Todas (não informado pela API)"],
      ["Gerado em", stamp()],
      ["Fonte", "API Algamar — GET /ml/coastal-risks"],
    ];
  }

  function buildOcorrencia(f, prep) {
    const rows = sortedRecords(prep.inWin);
    const counts = zeros();
    rows.forEach((p) => counts[levelOf(p)]++);
    const active = rows.filter(prep.isActive).length;
    const top = rows.reduce((b, p) => (typeof p.probability === "number" && (!b || p.probability > b.probability) ? p : b), null);

    const byMonth = [];
    for (let idx = prep.end; idx >= prep.start; idx--) {
      const c = zeros();
      rows.filter((p) => periodIndex(p) === idx).forEach((p) => c[levelOf(p)]++);
      byMonth.push([monthLabel(idx), ...LEVEL_KEYS.map((k) => String(c[k])),
        { text: String(LEVEL_KEYS.reduce((t, k) => t + c[k], 0)), bold: true }]);
    }

    return {
      title: "Relatório de Ocorrência",
      subtitle: "Ocorrências de floração de algas registradas no período selecionado",
      meta: metaLines(f, prep),
      kpis: [
        { label: "Total de ocorrências", value: String(rows.length), hint: "no período" },
        { label: "Ocorrências ativas", value: String(active), hint: "mês recente, risco alto/médio", color: P.colors.red },
        { label: "Nível alto ou muito alto", value: String(counts.alto + counts.muito_alto), hint: `${counts.muito_alto} muito alto · ${counts.medio} moderado · ${counts.baixo} baixo`, color: P.colors.red },
        { label: "Maior probabilidade", value: top ? pct(top.probability) : "—", hint: top ? `${top.region} (${periodLabelOf(top)})` : "" },
      ],
      sections: [
        {
          title: "Resumo por mês",
          table: {
            cols: [
              { title: "Mês", w: 2 },
              { title: "Muito alto", w: 1, align: "right" },
              { title: "Alto", w: 1, align: "right" },
              { title: "Moderado", w: 1, align: "right" },
              { title: "Baixo", w: 1, align: "right" },
              { title: "Total", w: 1, align: "right" },
            ],
            rows: byMonth,
          },
        },
        {
          title: "Lista de ocorrências",
          table: {
            cols: [
              { title: "Período", w: 1.4 },
              { title: "Local", w: 2.6 },
              { title: "Probabilidade", w: 1.4, align: "right" },
              { title: "Nível de risco", w: 1.6 },
              { title: "Status", w: 1.4 },
            ],
            rows: rows.map((p) => [
              periodLabelOf(p),
              p.region || "—",
              typeof p.probability === "number" ? pct(p.probability) : "—",
              levelCell(levelOf(p)),
              prep.isActive(p) ? { text: "Ativo", color: P.colors.red, bold: true } : { text: "Resolvida", color: P.colors.green, bold: true },
            ]),
          },
        },
      ],
      note: NOTE_NO_ALGA,
      summary: `${rows.length} ocorrência(s), ${active} ativa(s); maior probabilidade ${top ? pct(top.probability) + " em " + top.region : "—"}.`,
    };
  }

  function periodLabelOf(p) {
    return monthLabel(periodIndex(p));
  }

  function buildAmbiental(f, prep) {
    const list = prep.inWin;
    const T = "temperature_celsius", SAL = "salinity_psu", CH = "chlorophyll_mg_m3";

    const monthly = [];
    for (let idx = prep.end; idx >= prep.start; idx--) {
      const rec = list.filter((p) => periodIndex(p) === idx);
      monthly.push([monthLabel(idx), num1(envAvg(rec, T)), num1(envAvg(rec, SAL)), num1(envAvg(rec, CH)), String(rec.length)]);
    }
    const perRegion = [...groupBy(list, (p) => p.region || "—")]
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "pt-BR"))
      .map(([region, rec]) => [region, num1(envAvg(rec, T)), num1(envAvg(rec, SAL)), num1(envAvg(rec, CH)), String(rec.length)]);
    const cols = (first) => [
      { title: first, w: 2.2 },
      { title: "Temp. da água (°C)", w: 1.6, align: "right" },
      { title: "Salinidade (PSU)", w: 1.6, align: "right" },
      { title: "Clorofila-a (µg/L)", w: 1.6, align: "right" },
      { title: "Registros", w: 1, align: "right" },
    ];
    const t = envAvg(list, T), s = envAvg(list, SAL), c = envAvg(list, CH);

    return {
      title: "Relatório Ambiental",
      subtitle: "Condições ambientais e parâmetros da água no período selecionado",
      meta: metaLines(f, prep),
      kpis: [
        { label: "Temperatura da água (média)", value: t == null ? "—" : `${num1(t)} °C` },
        { label: "Salinidade (média)", value: s == null ? "—" : `${num1(s)} PSU` },
        { label: "Clorofila-a (média)", value: c == null ? "—" : `${num1(c)} µg/L` },
        { label: "Registros analisados", value: String(list.length), hint: "região × mês" },
      ],
      sections: [
        { title: "Médias por mês", table: { cols: cols("Mês"), rows: monthly } },
        { title: "Médias por local", table: { cols: cols("Local"), rows: perRegion } },
      ],
      note: "Apenas temperatura, salinidade e clorofila-a são fornecidas pela API. pH, nutrientes, vento, correntes e precipitação ainda não constam neste relatório.",
      summary: `Temperatura ${t == null ? "—" : num1(t) + " °C"}, salinidade ${s == null ? "—" : num1(s) + " PSU"}, clorofila-a ${c == null ? "—" : num1(c) + " µg/L"} (médias do período).`,
    };
  }

  function futureByMonth(prep) {
    return [...groupBy(prep.future, periodIndex)]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, rec]) => {
        const ps = probs(rec);
        const avg = mean(ps);
        return { idx, avg, high: ps.filter((v) => v >= 0.6).length, n: rec.length };
      });
  }

  function buildRisco(f, prep) {
    const rank = regionRanking(prep.inWin);
    const all = probs(prep.inWin);
    const avgAll = mean(all);
    const top = rank[0];
    const highAreas = rank.filter((r) => r.avg != null && isHigh(tierOfProbability(r.avg))).length;
    const fut = futureByMonth(prep);

    const sections = [
      {
        title: "Áreas com maior probabilidade de floração",
        bars: rank.slice(0, 8).map((r) => ({
          label: r.region,
          value: r.avg ?? 0,
          text: r.avg == null ? "—" : pct(r.avg),
          color: LEVELS[tierOfProbability(r.avg)].color,
        })),
        barMax: 1,
      },
      {
        title: "Ranking completo",
        table: {
          cols: [
            { title: "Pos.", w: 0.7 },
            { title: "Local", w: 2.6 },
            { title: "Prob. média", w: 1.4, align: "right" },
            { title: "Prob. máxima", w: 1.4, align: "right" },
            { title: "Nível (prob. média)", w: 1.7 },
            { title: "Registros", w: 1, align: "right" },
          ],
          rows: rank.map((r, i) => [
            String(i + 1),
            r.region,
            r.avg == null ? "—" : pct(r.avg),
            r.max == null ? "—" : pct(r.max),
            levelCell(tierOfProbability(r.avg)),
            String(r.n),
          ]),
        },
      },
    ];
    if (fut.length) {
      sections.push({
        title: "Previsão dos próximos meses",
        table: {
          cols: [
            { title: "Mês", w: 2 },
            { title: "Prob. média", w: 1.5, align: "right" },
            { title: "Áreas com prob. de 60%+", w: 2, align: "right" },
            { title: "Registros", w: 1, align: "right" },
          ],
          rows: fut.map((m) => [monthLabel(m.idx), m.avg == null ? "—" : pct(m.avg), String(m.high), String(m.n)]),
        },
      });
    } else {
      sections.push({ title: "Previsão dos próximos meses", paragraph: "A API não retornou previsões para meses futuros neste filtro." });
    }

    return {
      title: "Relatório de Risco",
      subtitle: "Áreas com maior probabilidade de floração de algas",
      meta: metaLines(f, prep),
      kpis: [
        { label: "Área de maior risco", value: top ? top.region : "—", hint: top && top.avg != null ? `prob. média ${pct(top.avg)}` : "", color: P.colors.red },
        { label: "Maior probabilidade", value: all.length ? pct(Math.max(...all)) : "—", hint: "registro isolado" },
        { label: "Probabilidade média", value: avgAll == null ? "—" : pct(avgAll), hint: avgAll == null ? "" : `nível ${LEVELS[tierOfProbability(avgAll)].label.toLowerCase()}` },
        { label: "Áreas em nível alto", value: String(highAreas), hint: `prob. média de ${Math.round(AR.CORTES.alto * 100)}% ou mais`, color: P.colors.red },
      ],
      sections,
      note: "Faixas de probabilidade: baixo abaixo de 35%, moderado de 35% a 59%, alto a partir de 60%.",
      summary: top ? `Maior risco: ${top.region} (${top.avg == null ? "—" : pct(top.avg)} de prob. média); ${highAreas} área(s) em nível alto.` : "Sem registros no período.",
    };
  }

  function buildExecutivo(f, prep) {
    const list = prep.inWin;
    const counts = zeros();
    list.forEach((p) => counts[levelOf(p)]++);
    const active = list.filter(prep.isActive).length;
    const rank = regionRanking(list);
    const top = rank[0];
    const avgAll = mean(probs(list));
    const t = envAvg(list, "temperature_celsius"), s = envAvg(list, "salinity_psu"), c = envAvg(list, "chlorophyll_mg_m3");
    const fut = futureByMonth(prep);
    const span = prep.start === prep.end ? monthLabel(prep.end) : `${monthLabel(prep.start)} a ${monthLabel(prep.end)}`;

    const overview = list.length
      ? `No período (${span}) foram registradas ${list.length} ocorrências em ${rank.length} área(s) monitorada(s); ${active} estão ativas no mês mais recente. ` +
        `${counts.muito_alto} registro(s) em nível muito alto, ${counts.alto} alto(s), ${counts.medio} moderado(s) e ${counts.baixo} baixo(s). ` +
        (top && top.avg != null ? `A área de maior probabilidade média é ${top.region} (${pct(top.avg)}).` : "")
      : "Não há registros para os filtros selecionados.";
    const outlook = fut.length
      ? `Para os próximos meses, a probabilidade média prevista é: ${fut.map((m) => `${monthLabel(m.idx)} ${m.avg == null ? "—" : pct(m.avg)}`).join("; ")}.`
      : "A API não retornou previsões para meses futuros neste filtro.";

    return {
      title: "Relatório Executivo",
      subtitle: "Visão geral para gestão e tomada de decisão",
      meta: metaLines(f, prep),
      kpis: [
        { label: "Ocorrências no período", value: String(list.length) },
        { label: "Ocorrências ativas", value: String(active), color: P.colors.red },
        { label: "Área de maior risco", value: top ? top.region : "—", hint: top && top.avg != null ? `prob. média ${pct(top.avg)}` : "", color: P.colors.red },
        { label: "Probabilidade média", value: avgAll == null ? "—" : pct(avgAll), hint: avgAll == null ? "" : `nível ${LEVELS[tierOfProbability(avgAll)].label.toLowerCase()}` },
      ],
      sections: [
        { title: "Situação geral", paragraph: overview },
        {
          title: "Distribuição por nível de risco",
          bars: LEVEL_KEYS.map((k) => ({ label: LEVELS[k].label, value: counts[k], text: String(counts[k]), color: LEVELS[k].color })),
        },
        {
          title: "Áreas prioritárias",
          table: {
            cols: [
              { title: "Pos.", w: 0.7 },
              { title: "Local", w: 2.6 },
              { title: "Prob. média", w: 1.4, align: "right" },
              { title: "Nível (prob. média)", w: 1.7 },
            ],
            rows: rank.slice(0, 5).map((r, i) => [String(i + 1), r.region, r.avg == null ? "—" : pct(r.avg), levelCell(tierOfProbability(r.avg))]),
          },
        },
        {
          title: "Condições ambientais",
          paragraph: `Médias do período: temperatura da água ${t == null ? "—" : num1(t) + " °C"}, salinidade ${s == null ? "—" : num1(s) + " PSU"}, clorofila-a ${c == null ? "—" : num1(c) + " µg/L"}.`,
        },
        { title: "Perspectiva", paragraph: outlook },
      ],
      note: NOTE_NO_ALGA,
      summary: `${list.length} ocorrência(s), ${active} ativa(s)${top ? "; maior risco em " + top.region : ""}.`,
    };
  }

  // ------------------------------------------------------------------
  // Relatório de gráficos (botão próprio, sempre PDF). Cada gráfico mostra o
  // que já foi medido e a previsão, com a faixa "previsão" destacada:
  //  - floração: prob. média por mês de cada região, do início do período
  //    até o último mês previsto pela API ("Média geral" em destaque + as 6
  //    regiões de maior probabilidade — mais que isso embola no A4);
  //  - parâmetros da água da API do Algamar (mensal): temperatura,
  //    salinidade e clorofila-a;
  //  - condições diárias da Open-Meteo (js/env-data.js): últimos 14 dias +
  //    previsão de até 16 dias.
  // pH e nutrientes não têm fonte (nem na API nem em fonte aberta).
  // ------------------------------------------------------------------
  const CHART_REGIONS = 6;
  const CHART_COLORS = [
    [0, 128, 255],
    [214, 40, 48],
    [200, 150, 10],
    [0, 150, 80],
    [127, 90, 200],
    [230, 110, 30],
  ];

  function predictionChart(prep) {
    const recs = [...prep.inWin, ...prep.future];
    if (!recs.length) {
      return { title: "Previsões de floração por região", paragraph: "Sem registros para montar o gráfico neste filtro." };
    }
    const last = recs.reduce((m, p) => Math.max(m, periodIndex(p)), prep.end);
    const idxs = [];
    for (let i = prep.start; i <= last; i++) idxs.push(i);
    const avgAt = (list, idx) => mean(probs(list.filter((p) => periodIndex(p) === idx)));

    const regions = regionRanking(recs).slice(0, CHART_REGIONS);
    const byRegion = groupBy(recs, (p) => p.region || "—");
    const series = [
      { name: "Média geral", color: P.colors.brand, bold: true, values: idxs.map((i) => avgAt(recs, i)) },
      ...regions.map((r, k) => ({
        name: r.region,
        color: CHART_COLORS[k % CHART_COLORS.length],
        values: idxs.map((i) => avgAt(byRegion.get(r.region), i)),
      })),
    ];
    const hasFuture = last > prep.end;
    const labels = idxs.map(monthLabel);

    return {
      title: "Previsões de floração por região",
      chart: {
        labels,
        series,
        splitIdx: hasFuture ? prep.end - prep.start : null,
        yMin: 0,
        yMax: 1,
        yFmt: (v) => pct(v),
      },
      // CSV não desenha gráfico: vai a tabela por trás dele.
      csvTable: {
        cols: [{ title: "Mês" }, ...series.map((s) => ({ title: s.name }))],
        rows: idxs.map((idx, i) => [
          labels[i] + (idx > nowIdx ? " (previsão)" : ""),
          ...series.map((s) => (s.values[i] == null ? "—" : pct(s.values[i]))),
        ]),
      },
      paragraph: hasFuture
        ? "Linha cheia: meses já ocorridos. Linha tracejada, na faixa destacada: previsão do modelo do Algamar."
        : "A API não retornou meses futuros neste filtro; o gráfico mostra só o período escolhido.",
      paragraphAfter: true,
    };
  }

  const CHART_MIN_MONTHS = 6; // com menos que isso a linha mensal vira 1 ponto
  const DAILY_PAST = 14;
  const DAILY_NEXT = 16;

  const API_PARAMS = [
    { field: "temperature_celsius", title: "Temperatura da água (°C)", unit: " °C", dec: 1, color: [0, 128, 255] },
    { field: "salinity_psu", title: "Salinidade (PSU)", unit: " PSU", dec: 1, color: [21, 114, 100] },
    { field: "chlorophyll_mg_m3", title: "Clorofila-a (µg/L)", unit: " µg/L", dec: 1, color: [0, 150, 80] },
  ];
  const DAILY_PARAMS = [
    { key: "sst", title: "Temperatura da água (°C)", unit: " °C", dec: 1, color: [0, 128, 255] },
    { key: "air", title: "Temperatura do ar (°C)", unit: " °C", dec: 1, color: [230, 140, 20] },
    { key: "wind", title: "Vento médio (km/h)", unit: " km/h", dec: 0, color: [0, 150, 80], zero: true },
    { key: "current", title: "Corrente marinha (km/h)", unit: " km/h", dec: 1, color: [10, 79, 168], zero: true },
    { key: "rain", title: "Chuva (mm/dia)", unit: " mm", dec: 1, color: [21, 114, 100], zero: true },
    { key: "radiation", title: "Radiação solar (MJ/m²)", unit: " MJ/m²", dec: 1, color: [200, 150, 10], zero: true },
    { key: "waves", title: "Altura das ondas (m)", unit: " m", dec: 1, color: [60, 160, 170], zero: true },
    { key: "clouds", title: "Nebulosidade (%)", unit: "%", dec: 0, color: [120, 135, 140], yMin: 0, yMax: 100 },
  ];
  const fmtN = (v, d) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

  // Série mensal (média dos registros) de um campo de environmental_factors.
  function apiParamItem(param, prep) {
    const recs = [...prep.inWin, ...prep.future];
    const withVal = recs.filter((p) => typeof (p.environmental_factors || {})[param.field] === "number");
    if (!withVal.length) return { title: param.title, empty: "A API do Algamar não informou este parâmetro." };
    const last = withVal.reduce((m, p) => Math.max(m, periodIndex(p)), prep.end);
    const idxs = [];
    for (let i = prep.start; i <= last; i++) idxs.push(i);
    const values = idxs.map((i) => envAvg(withVal.filter((p) => periodIndex(p) === i), param.field));
    const nowVal = values[prep.end - prep.start];
    return {
      title: param.title,
      badge: nowVal != null ? `${monthLabel(prep.end)}: ${fmtN(nowVal, param.dec)}${param.unit}` : "",
      chart: {
        labels: idxs.map(monthLabel),
        series: [{ name: param.title, color: param.color, values }],
        splitIdx: last > prep.end ? prep.end - prep.start : null,
      },
    };
  }

  // Série diária da Open-Meteo, cortada no último dia com previsão.
  function dailyItem(param, env) {
    if (!env) return { title: param.title, empty: "Open-Meteo indisponível." };
    let vals = env.series[param.key];
    let last = vals.length - 1;
    while (last > 0 && vals[last] == null) last--;
    vals = vals.slice(0, last + 1);
    if (!vals.some((v) => v != null)) return { title: param.title, empty: "Sem dados da Open-Meteo." };
    const today = vals[env.todayIdx];
    return {
      title: param.title,
      badge: today != null ? `hoje ${fmtN(today, param.dec)}${param.unit}` : "",
      chart: {
        labels: env.dates.slice(0, last + 1).map(window.EnvData.dayLabel),
        series: [{ name: param.title, color: param.color, values: vals }],
        splitIdx: env.todayIdx,
        zero: param.zero,
        yMin: param.yMin,
        yMax: param.yMax,
      },
    };
  }

  function buildGraficos(f, prep, env) {
    const recs = [...prep.inWin, ...prep.future];
    const probNow = mean(probs(recs.filter((p) => periodIndex(p) === prep.end)));
    const sst = env ? env.series.sst[env.todayIdx] : null;
    const rain7 = env ? env.series.rain.slice(env.todayIdx, env.todayIdx + 7).filter((v) => v != null) : [];
    const sal = envAvg(prep.inWin.filter((p) => periodIndex(p) === prep.end), "salinity_psu");
    const tier = probNow == null ? null : tierOfProbability(probNow);

    return {
      title: "Relatório de Gráficos",
      subtitle: "Floração e parâmetros ambientais: medido até hoje e previsão",
      meta: [
        ["Período", `${monthLabel(prep.start)} a ${monthLabel(prep.end)} (mensal) · últimos ${DAILY_PAST} dias + previsão (diário)`],
        ["Região", f.regionLabel + (env ? ` · tempo e mar: ${env.places}` : "")],
        ["Gerado em", stamp()],
        ["Fontes", "API Algamar (floração e água, mensal) · Open-Meteo (tempo e mar, diário)"],
      ],
      kpis: [
        { label: `Floração (${monthLabel(prep.end)})`, value: probNow == null ? "—" : pct(probNow),
          hint: tier ? `nível ${LEVELS[tier].label.toLowerCase()}` : "", color: tier ? LEVELS[tier].color : null },
        { label: "Temperatura da água hoje", value: sst == null ? "—" : `${fmtN(sst, 1)} °C`, hint: "superfície do mar" },
        { label: `Salinidade (${monthLabel(prep.end)})`, value: sal == null ? "—" : `${fmtN(sal, 1)} PSU`, hint: "API Algamar" },
        { label: "Chuva nos próximos 7 dias", value: rain7.length ? `${fmtN(rain7.reduce((a, b) => a + b, 0), 0)} mm` : "—", hint: "previsão acumulada" },
      ],
      sections: [
        predictionChart(prep),
        { title: "Parâmetros da água — mensal (API Algamar)", grid: API_PARAMS.map((p) => apiParamItem(p, prep)) },
        { title: "Tempo e mar — diário, hoje e previsão (Open-Meteo)", grid: DAILY_PARAMS.map((p) => dailyItem(p, env)) },
      ],
      note:
        "Faixa destacada e linha tracejada = previsão. Floração e parâmetros mensais: modelo do Algamar. " +
        "Tempo e mar: previsão da Open-Meteo (até ~16 dias; temperatura da água ~9 dias e correntes ~6 dias). " +
        "pH e nutrientes ainda não têm fonte de dados e não constam neste relatório.",
      summary: `Floração ${probNow == null ? "—" : pct(probNow)} (${monthLabel(prep.end)}); água ${sst == null ? "—" : fmtN(sst, 1) + " °C"} hoje.`,
    };
  }

  const BUILDERS = {
    ocorrencia: { build: buildOcorrencia, file: "ocorrencia" },
    ambiental: { build: buildAmbiental, file: "ambiental" },
    risco: { build: buildRisco, file: "risco" },
    executivo: { build: buildExecutivo, file: "executivo" },
  };

  // ------------------------------------------------------------------
  // Saídas: PDF, CSV e texto
  // ------------------------------------------------------------------
  function toPdf(m, logo) {
    const doc = new P.Doc({ title: m.title, logo });
    doc.header(m.title, m.subtitle, m.meta);
    doc.kpis(m.kpis);
    m.sections.forEach((s) => {
      doc.h2(s.title);
      if (s.paragraph && !s.paragraphAfter) doc.paragraph(s.paragraph);
      if (s.chart) doc.lineChart(s.chart);
      if (s.grid) doc.chartGrid(s.grid);
      if (s.bars) doc.bars(s.bars, s.barMax);
      if (s.table) doc.table(s.table.cols, s.table.rows);
      if (s.paragraph && s.paragraphAfter) doc.paragraph(s.paragraph, { size: 8.5, color: P.colors.muted });
    });
    if (m.note) {
      doc.space(6);
      doc.paragraph("Observação: " + m.note, { size: 8.5, color: P.colors.muted });
    }
    return doc.output(`Algamar — ${m.title} · gerado em ${stamp()}`);
  }

  const cellText = (c) => (c && typeof c === "object" ? c.text : c);
  function csvCell(v) {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita fórmula ao abrir no Excel
    return `"${s.replace(/"/g, '""')}"`;
  }
  function toCsv(m) {
    const line = (cells) => cells.map((c) => csvCell(cellText(c))).join(";");
    const out = [line([m.title]), line([m.subtitle]), ""];
    m.meta.forEach(([k, v]) => out.push(line([k, v])));
    out.push("", line(["Indicador", "Valor"]));
    m.kpis.forEach((k) => out.push(line([k.label, k.value])));
    m.sections.forEach((s) => {
      out.push("", line([s.title]));
      if (s.paragraph) out.push(line([s.paragraph]));
      if (s.bars) {
        out.push(line(["Item", "Valor"]));
        s.bars.forEach((b) => out.push(line([b.label, b.text])));
      }
      const table = s.table || s.csvTable;
      if (table) {
        out.push(line(table.cols.map((c) => c.title)));
        table.rows.forEach((r) => out.push(line(r)));
      }
    });
    if (m.note) out.push("", line(["Observação: " + m.note]));
    return new Blob(["﻿" + out.join("\r\n")], { type: "text/csv;charset=utf-8" });
  }

  function toText(m) {
    return [m.title, ...m.meta.slice(0, 2).map(([k, v]) => `${k}: ${v}`), m.summary, "— Algamar"].join("\n");
  }

  // ------------------------------------------------------------------
  // Fluxo: ler filtros -> buscar dados -> montar -> baixar/compartilhar
  // ------------------------------------------------------------------
  const state = { busy: false, search: "" };

  function filters() {
    const sel = (id) => $(id).options[$(id).selectedIndex].text;
    return {
      model: document.querySelector('input[name="rpModel"]:checked').value,
      months: Number($("rpPeriod").value),
      periodLabel: sel("rpPeriod"),
      region: $("rpRegion").value,
      regionLabel: sel("rpRegion"),
      format: $("rpFormat").value,
    };
  }

  const LOGO_SRC = "../../shared/assets/LogoBranca.png";

  async function fetchData(region) {
    const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", { params: { region: region || undefined } });
    return res.data || [];
  }

  async function generate() {
    const f = filters();
    const data = await fetchData(f.region);
    const prep = prepare(data, f.months, state.search);
    const model = BUILDERS[f.model].build(f, prep);
    const ext = f.format === "csv" ? "csv" : "pdf";
    const blob = ext === "csv" ? toCsv(model) : toPdf(model, await P.loadLogo(LOGO_SRC));
    const name = `algamar-relatorio-${BUILDERS[f.model].file}-${now.toISOString().slice(0, 10)}.${ext}`;
    return { model, blob, name, ext };
  }

  async function generateCharts() {
    const f = filters();
    const [data, env] = await Promise.all([
      fetchData(f.region),
      window.EnvData.load({ region: f.region, pastDays: DAILY_PAST, forecastDays: DAILY_NEXT }).catch(() => null),
    ]);
    const prep = prepare(data, Math.max(f.months, CHART_MIN_MONTHS), state.search);
    const model = buildGraficos(f, prep, env);
    const blob = toPdf(model, await P.loadLogo(LOGO_SRC));
    return { blob, name: `algamar-relatorio-graficos-${now.toISOString().slice(0, 10)}.pdf` };
  }

  function toast(msg, isError) {
    const el = $("rpToast");
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.hidden = true), 4500);
  }

  function setBusy(on, btn, label) {
    state.busy = on;
    ["rpDownload", "rpShare", "rpCharts"].forEach((id) => ($(id).disabled = on));
    if (btn) btn.classList.toggle("is-busy", on);
    if (on) toast(label);
  }

  function errorMessage(err) {
    if (err && err.status === 401) return "Sessão expirada.";
    if (err && err.status === 0) return "Sem conexão com a API — não foi possível gerar o relatório.";
    return (err && err.message) || "Não foi possível gerar o relatório.";
  }

  async function onCharts() {
    if (state.busy) return;
    setBusy(true, $("rpCharts"), "Gerando relatório de gráficos…");
    try {
      const { blob, name } = await generateCharts();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`Relatório pronto: ${name}`);
    } catch (err) {
      toast(errorMessage(err), true);
    } finally {
      setBusy(false, $("rpCharts"));
    }
  }

  async function onDownload() {
    if (state.busy) return;
    setBusy(true, $("rpDownload"), "Gerando relatório…");
    try {
      const { blob, name } = await generate();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`Relatório pronto: ${name}`);
    } catch (err) {
      toast(errorMessage(err), true);
    } finally {
      setBusy(false, $("rpDownload"));
    }
  }

  async function onShare() {
    if (state.busy) return;
    setBusy(true, $("rpShare"), "Preparando relatório…");
    try {
      const { model, blob, name, ext } = await generate();
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: model.title, text: model.summary });
        toast("Relatório compartilhado.");
      } else {
        // Sem compartilhamento de arquivos (comum no desktop): copia o resumo.
        let copied = false;
        try {
          await navigator.clipboard.writeText(toText(model));
          copied = true;
        } catch (e) {
          /* área de transferência bloqueada */
        }
        toast(
          copied
            ? `Este navegador não compartilha arquivos: o resumo foi copiado. Use "Baixar" para obter o ${ext.toUpperCase()}.`
            : 'Este navegador não permite compartilhar arquivos. Use "Baixar".',
          !copied
        );
      }
    } catch (err) {
      if (err && err.name === "AbortError") toast("Compartilhamento cancelado.");
      else toast(errorMessage(err), true);
    } finally {
      setBusy(false, $("rpShare"));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(() => {})) return;
    $("rpDownload").addEventListener("click", onDownload);
    $("rpShare").addEventListener("click", onShare);
    $("rpCharts").addEventListener("click", onCharts);
    $("dashSearch").addEventListener("input", (e) => (state.search = e.target.value.trim()));
    P.loadLogo(LOGO_SRC); // já deixa a logo pronta para o primeiro PDF

    // Só para o sino do topo (áreas em nível alto), como nas outras telas.
    fetchData("")
      .then((data) => S.setAlertBadge(data.filter((p) => isHigh(levelOf(p))).length))
      .catch(() => {});
  });
})();
