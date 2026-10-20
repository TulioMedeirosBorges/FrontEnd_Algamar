(function () {
  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const state = {
    data: [],
    trends: [],
    summary: null,
    filters: { region: "", risk_level: "", month: "" },
    searchTerm: "",
    // 4 categorias exibidas no mapa (ver categoryOf em dashboard-map.js):
    // pouca indicação / florações identificadas / risco / previsão.
    layers: { baixa: true, identificada: true, risco: true, previsao: true },
    onlyInterest: false,
    showAllPredictions: false,
    showAllAlerts: false,
    envTab: "agua",
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function riskKey(level) {
    if (!level) return "baixo";
    const norm = level.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
    if (norm.startsWith("ALT")) return "alto";
    if (norm.startsWith("MED")) return "medio";
    return "baixo";
  }
  function riskLabel(level) {
    return { alto: "Alto", medio: "Médio", baixo: "Baixo" }[riskKey(level)];
  }
  // Ícone do card "Nível de risco atual" (assets/Icons), um por nível.
  const RISK_LEVEL_ICONS = {
    alto: "../assets/Icons/NivelDeRiscoAlto.svg",
    medio: "../assets/Icons/NivelDeRiscoMedio.svg",
    baixo: "../assets/Icons/NivelDeRiscoBaixo.svg",
  };

  // Nível que predomina no litoral: usa summary.general_status quando a API
  // manda um nível reconhecível (alto/médio/baixo); se não, pega o nível
  // mais frequente entre os pontos (empate fica com o mais grave). Sem
  // dado nenhum, devolve null.
  function currentRiskKey(summary, points) {
    const status = summary && summary.general_status;
    if (typeof status === "string") {
      const norm = status.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
      if (/^(ALT|MED|BAIX)/.test(norm)) return riskKey(status);
    }
    if (!points.length) return null;
    const counts = { alto: 0, medio: 0, baixo: 0 };
    points.forEach((p) => counts[riskKey(p.risk_level)]++);
    return ["alto", "medio", "baixo"].reduce((best, k) => (counts[k] > counts[best] ? k : best), "alto");
  }

  function riskIcon(level) {
    return { alto: "warning", medio: "warning", baixo: "check_circle" }[riskKey(level)];
  }
  function periodLabel(point) {
    const full = MONTH_NAMES[(point.month || 1) - 1];
    const monthName = full ? full.slice(0, 3) : point.month;
    return point.year ? `${monthName}/${point.year}` : `${monthName}`;
  }

  // ------------------------------------------------------------------
  // Sessão / usuário
  // ------------------------------------------------------------------
  function renderUser() {
    const user = window.AlgamarAPI.getUser();
    const name = user?.fullName || "Usuário";
    const email = user?.email || "";
    $("userName").textContent = name;
    $("userEmail").textContent = email;
    $("userAvatar").textContent = name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
    if (window.UserPrefs) window.UserPrefs.applyAvatar($("userAvatar"));
  }

  function guardSession() {
    if (!window.AlgamarAPI.getToken()) {
      window.AlgamarAPI.goToLogin();
      return false;
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Health check
  // ------------------------------------------------------------------
  async function loadHealth() {
    try {
      await window.AlgamarAPI.apiFetch("/health");
      hideApiWarning();
    } catch (err) {
      if (err.status !== 401) showApiWarning(err);
    }
  }

  // Aviso pequeno na barra lateral (embaixo, perto da versão), não mais um
  // banner de largura total abaixo do topo.
  function showApiWarning(err) {
    const banner = $("dashApiWarning");
    const text = $("dashApiWarningText");
    text.textContent =
      err?.status === 0
        ? "Sem conexão com a API."
        : err?.message || "Erro ao consultar a API.";
    banner.hidden = false;
  }
  function hideApiWarning() {
    $("dashApiWarning").hidden = true;
  }

  // ------------------------------------------------------------------
  // Riscos costeiros
  // ------------------------------------------------------------------

  // Cada ponto da API já vem com a posição real (latitude/longitude, em
  // graus decimais — sul e oeste negativos, ex.: Santos ≈ -23.96, -46.33).
  // O mapa (dashboard-map.js) projeta essas coordenadas direto na imagem de
  // satélite, então o ponto aparece no lugar certo sem nenhum ajuste manual.
  // Aqui só padronizamos: aceita número ou texto ("-23,96" ou "-23.96") e
  // os nomes lat/lng/lon como alternativa; sem coordenada válida, o ponto
  // continua na tabela/alertas mas não vai para o mapa.
  function toCoord(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.trim().replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    return null;
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

  async function loadCoastalRisks() {
    $("mapLoading").hidden = false;
    $("mapEmpty").hidden = true;

    try {
      const params = {
        region: state.filters.region || undefined,
        risk_level: state.filters.risk_level || undefined,
        month: state.filters.month || undefined,
      };
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", { params });

      state.summary = res.summary || null;
      state.trends = res.trends || [];
      state.data = (res.data || []).map(normalizePoint);

      state.loadError = false;
      hideApiWarning();
      renderSummary();
      renderMarkers();
      renderPredictions();
      renderEnvTab();
      renderAlerts();
      // Só na primeira carga: enquadra o mapa no ponto selecionado. Nos
      // refreshes seguintes não mexe, para não tirar o usuário de onde está.
      if (!state.focusedOnce && occList.length) {
        state.focusedOnce = true;
        // Vindo da Central de alertas: ?ponto=ID abre aquele ponto no painel.
        const wanted = new URLSearchParams(window.location.search).get("ponto");
        if (wanted) showOccByPointId(wanted);
        focusActivePoint();
      }
    } catch (err) {
      state.loadError = true;
      if (err.status !== 401) showApiWarning(err);
      state.data = [];
      state.trends = [];
      renderMarkers();
      renderPredictions();
      renderEnvTab();
      renderAlerts();
    } finally {
      $("mapLoading").hidden = true;
    }
  }

  function trendPct(curr, prev) {
    if (curr == null || prev == null || prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  }

  function renderSummary() {
    const s = state.summary || {};
    const altoCount = state.data.filter((p) => riskKey(p.risk_level) === "alto").length;
    const medioCount = state.data.filter((p) => riskKey(p.risk_level) === "medio").length;

    document.querySelector('[data-field="total_identified"]').textContent = s.total_monitored ?? "—";
    document.querySelector('[data-field="alert_areas"]').textContent = s.high_risk_count ?? altoCount;
    document.querySelector('[data-field="risk_areas"]').textContent = medioCount;
    const levelKey = currentRiskKey(s, state.data);
    document.querySelector('[data-field="general_status"]').textContent =
      s.general_status ?? (levelKey ? riskLabel(levelKey) : "—");
    const levelIcon = $("riskLevelIcon");
    levelIcon.src = levelKey ? RISK_LEVEL_ICONS[levelKey] : "../assets/Icons/shield.svg";
    levelIcon.alt = levelKey ? `Nível de risco ${riskLabel(levelKey).toLowerCase()}` : "";

    // Único indicador com histórico mensal real disponível (trends[].high_risk_points)
    // — por isso é o único card com uma % de variação; os outros mostram texto
    // descritivo em vez de inventar uma porcentagem sem dado por trás.
    const sortedTrends = [...state.trends].sort((a, b) => a.year - b.year || a.month - b.month);
    const last = sortedTrends[sortedTrends.length - 1];
    const prev = sortedTrends[sortedTrends.length - 2];
    const pct = last && prev ? trendPct(last.high_risk_points, prev.high_risk_points) : null;
    const trendEl = document.querySelector('[data-field="alert_areas_trend"]');
    // Na página do mapa a variação vira um selo ao lado do número (mais
    // alertas = vermelho, menos = verde); no dashboard continua dentro do texto.
    const trendChip = document.querySelector('[data-trend="alert_areas"]');
    if (trendChip) {
      trendChip.hidden = pct == null;
      if (pct != null) {
        trendChip.textContent = `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%`;
        trendChip.className = `stat-trend stat-trend--${pct >= 0 ? "up" : "down"}`;
      }
      trendEl.textContent = pct == null ? "sem histórico suficiente" : "em relação ao mês anterior";
    } else {
      trendEl.textContent =
        pct == null
          ? "sem histórico suficiente"
          : `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}% em relação ao mês anterior`;
    }

    const badge = $("alertBadge");
    const wantsBadge = !window.UserPrefs || window.UserPrefs.get("notifRisk");
    if (altoCount > 0 && wantsBadge) {
      badge.textContent = altoCount > 99 ? "99+" : String(altoCount);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  // Ícone principal do clima (#weatherIcon) — o ÚNICO que usa
  // assets/IconsTemp e muda conforme o tempo. Os mini-ícones de vento,
  // chuva e corrente são fixos (assets/Icons) e não mudam. Pronto para
  // quando existir uma fonte de dados real. Cada condição tem uma versão de dia e de noite;
  // weatherIconPath() escolhe pela hora local. Ainda não é chamada por
  // nenhum dado ao vivo (ver renderWeatherPlaceholder abaixo).
  const WEATHER_SKY_ICONS = {
    ceu_limpo: { dia: "Ceu_Limpo_Dia.svg", noite: "Ceu_Limpo_Noite.svg" },
    parcialmente_nublado: { dia: "ParcialmenteNublado_Dia.svg", noite: "ParcialmeteNublado_Noite.svg" },
    nublado_com_aberturas: { dia: "NubaldoComAberturas_Dia.svg", noite: "NubladoComAberturas_Noite.svg" },
    nublado: { dia: "Nublado.svg", noite: "Nublado.svg" },
    neblina: { dia: "Neblina.svg", noite: "Neblina.svg" },
    chuva_fraca: { dia: "ChuvaFraca_Dia.svg", noite: "ChuvaFraca_Noite.svg" },
    chuva_moderada: { dia: "ChuvaModerada_Dia.svg", noite: "ChuvaModerada_Noite.svg" },
    chuva_forte: { dia: "ChuvaForte_Dia.svg", noite: "ChuvaForte_Noite.svg" },
    tempestade: { dia: "Tempestade_Dia.svg", noite: "Tempestade_Noite.svg" },
    trovoada: { dia: "Trovoada_Dia.svg", noite: "Trovoada_Noite.svg" },
    ciclone: { dia: "Ciclone.svg", noite: "Ciclone.svg" },
  };

  function weatherIconPath(file) {
    return `../assets/IconsTemp/${file}`;
  }
  function isNightNow() {
    const h = new Date().getHours();
    return h < 6 || h >= 18;
  }

  // Sem fonte de dados de clima integrada ainda — mostra traços em vez de
  // inventar temperatura/vento/chuva/estado do mar. O ícone principal fica
  // em "céu limpo" (um estado neutro, não uma condição real) só até
  // existir um endpoint de clima; troque a chamada
  // abaixo por algo como weatherIconPath(WEATHER_SKY_ICONS.chuva_forte[...])
  // assim que houver dado de verdade. Roda uma vez só, não depende do refresh.
  function renderWeatherPlaceholder() {
    $("weatherTemp").textContent = "—";
    $("weatherSky").textContent = "Sem integração de clima ainda";
    $("weatherWind").textContent = "—";
    $("weatherRain").textContent = "—";
    $("weatherCurrent").textContent = "—";

    const period = isNightNow() ? "noite" : "dia";
    $("weatherIcon").src = weatherIconPath(WEATHER_SKY_ICONS.ceu_limpo[period]);
  }

  // ------------------------------------------------------------------
  // Mapa — o motor de renderização (projeção geográfica, imagem de
  // satélite, blobs) mora em dashboard-map.js; aqui só decidimos QUAIS
  // pontos aparecem.
  // ------------------------------------------------------------------
  function pointVisible(p) {
    const cat = window.DashboardMap.categoryOf(p);
    if (!state.layers[cat]) return false;
    if (state.onlyInterest && !(cat === "identificada" || cat === "risco")) return false;
    if (state.searchTerm) {
      return (p.region || "").toLowerCase().includes(state.searchTerm.toLowerCase());
    }
    return true;
  }

  function renderMarkers() {
    window.DashboardMap.setPoints(state.data);
    window.DashboardMap.applyFilter(pointVisible);
    $("mapEmpty").hidden = state.data.length > 0 || state.loadError;
    $("mapEmpty").textContent = "Nenhum ponto retornado pela API para os filtros atuais.";
    refreshOccList();
  }

  // ------------------------------------------------------------------
  // Painel de ocorrência (ao lado do mapa) — sempre visível, mostra o ponto
  // selecionado com setas para percorrer os pontos atualmente visíveis no
  // mapa (respeitando camadas/busca), do maior para o menor risco. Campos
  // sem fonte real na API (espécie, toxicidade, concentração, vento,
  // correntes, pH, chuva) mostram "—" em vez de valor inventado.
  // ------------------------------------------------------------------
  let occList = [];
  let occIndex = 0;

  const OCC_BADGE_LABEL = {
    identificada: "Floração identificada",
    risco: "Risco de floração",
    previsao: "Previsão de floração",
    baixa: "Pouca indicação",
  };
  const OCC_TITLE_PREFIX = {
    identificada: "Floração em",
    risco: "Risco de floração em",
    previsao: "Previsão de floração em",
    baixa: "Pouca indicação em",
  };
  // Glifo do círculo grande ao lado do selo (só existe na página do mapa).
  const OCC_ICON_GLYPH = { identificada: "warning", risco: "warning", previsao: "schedule", baixa: "check_circle" };
  const OCC_SEVERITY_LABEL = { alto: "Alta", medio: "Moderada", baixo: "Baixa" };
  // Ilustração por nível de risco (assets/NivelDeFloração) — troca junto com
  // occSeverity, então a imagem sempre corresponde ao risco real do ponto
  // selecionado. Nome do arquivo do nível médio tem um typo de origem
  // ("Floraçãp"), mantido igual ao que está em disco.
  const OCC_THUMB = {
    alto: "../assets/NivelDeFloração/NivelAltoFloração.png",
    medio: "../assets/NivelDeFloração/NivelMedioFloraçãp.png",
    baixo: "../assets/NivelDeFloração/NivelBaixoFloração.png",
  };

  function refreshOccList() {
    occList = state.data
      .filter(pointVisible)
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
    if (occIndex >= occList.length) occIndex = 0;
    renderOccPanel();
  }

  // Na página do mapa, as setas do painel também levam o mapa até o ponto.
  function focusActivePoint() {
    if (!document.body.classList.contains("map-page")) return;
    const p = occList[occIndex];
    if (p) window.DashboardMap.panTo(p.latitude, p.longitude);
  }

  function showOccByPointId(id) {
    const idx = occList.findIndex((p) => p.id === id);
    if (idx === -1) return;
    occIndex = idx;
    renderOccPanel();
  }

  function renderOccPanel() {
    window.DashboardMap.setActive(occList[occIndex]?.id ?? null);

    const empty = $("occEmpty");
    const body = $("occBody");
    if (!occList.length) {
      empty.hidden = false;
      body.hidden = true;
      return;
    }
    empty.hidden = true;
    body.hidden = false;

    const p = occList[occIndex];
    const cat = window.DashboardMap.categoryOf(p);
    const riskK = riskKey(p.risk_level);

    $("occBadgeText").textContent = OCC_BADGE_LABEL[cat];
    $("occBadge").className = `occ-badge occ-badge--${cat}`;
    // Ícone de alerta só nas categorias que já tratamos como "área de
    // interesse" (identificada = vermelho, risco = amarelo) — as cores dos
    // dois avisos que existem em assets/Icons batem exatamente com essas
    // duas categorias, então não force um ícone sem a cor certa nas outras.
    const badgeIcon = $("occBadgeIcon");
    if (badgeIcon) {
      if (cat === "identificada") {
        badgeIcon.src = "../assets/Icons/warning.svg";
        badgeIcon.hidden = false;
      } else if (cat === "risco") {
        badgeIcon.src = "../assets/Icons/warningMedium.png";
        badgeIcon.hidden = false;
      } else {
        badgeIcon.hidden = true;
      }
    }
    const bigIcon = $("occBigIcon");
    if (bigIcon) {
      bigIcon.className = `occ-bigicon occ-bigicon--${cat}`;
      $("occBigIconGlyph").textContent = OCC_ICON_GLYPH[cat];
    }
    $("occPagerLabel").textContent = `${occIndex + 1} de ${occList.length}`;
    $("occPrev").disabled = occList.length < 2;
    $("occNext").disabled = occList.length < 2;

    $("occTitle").textContent = `${OCC_TITLE_PREFIX[cat]} ${p.region || "ponto monitorado"}`;
    $("occSeverity").textContent = OCC_SEVERITY_LABEL[riskK] || "—";
    $("occSeverity").className = `occ-severity occ-severity--${riskK}`;
    $("occThumb").src = OCC_THUMB[riskK] || OCC_THUMB.baixo;

    $("occLocation").textContent = p.region ? `${p.region} - SP` : "Localização não informada";
    $("occCoords").textContent =
      p.latitude != null && p.longitude != null ? `${p.latitude}, ${p.longitude}` : "—";
    $("occDate").textContent = periodLabel(p);

    // Espécie/toxicidade/concentração não existem na API ainda — "—" em vez
    // de inventar um número que pareceria um dado real de segurança.
    $("occSpecies").textContent = "—";
    $("occTox").textContent = "";
    $("occConcentration").textContent = "—";

    const ef = p.environmental_factors || {};
    $("occTemp").textContent = ef.temperature_celsius != null ? `${ef.temperature_celsius}°C` : "—";
    $("occSal").textContent = ef.salinity_psu != null ? `${ef.salinity_psu} PSU` : "—";
    $("occWind").textContent = "—";
    $("occCurrent").textContent = "—";
    $("occPh").textContent = "—";
    $("occPrecip").textContent = "—";

    renderOccHistory();
  }

  function riskTierFromProbability(prob) {
    if (prob == null) return "baixo";
    if (prob >= 0.66) return "alto";
    if (prob >= 0.33) return "medio";
    return "baixo";
  }

  // Só os últimos HISTORY_MONTHS meses cabem no painel; a série inteira
  // fica na tela "Histórico de Ocorrências" (link "ver histórico completo").
  const HISTORY_MONTHS = 12;

  function renderOccHistory() {
    const el = $("occHistoryChart");
    const sorted = [...state.trends]
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .slice(-HISTORY_MONTHS);
    if (!sorted.length) {
      el.innerHTML = `<p class="dash-empty">Sem histórico suficiente ainda.</p>`;
      return;
    }
    const max = Math.max(...sorted.map((t) => t.high_risk_points || 0), 1);
    const bars = sorted
      .map((t) => {
        const h = Math.max(6, ((t.high_risk_points || 0) / max) * 100);
        const tier = riskTierFromProbability(t.avg_probability);
        const label = `${String(t.month).padStart(2, "0")}/${t.year}: ${t.high_risk_points ?? 0} área(s) de alto risco`;
        return `<span class="occ-bar occ-bar--${tier}" style="height:${h}%" title="${escapeHtml(label)}"></span>`;
      })
      .join("");
    // Até 4 rótulos de data espalhados sob as barras (primeiro e último sempre).
    const n = sorted.length;
    const labelCount = Math.min(n, 4);
    const labels = Array.from({ length: labelCount }, (_, i) => {
      const t = sorted[labelCount === 1 ? 0 : Math.round((i * (n - 1)) / (labelCount - 1))];
      return `<span>${String(t.month).padStart(2, "0")}/${String(t.year).slice(-2)}</span>`;
    }).join("");
    el.innerHTML = `
      <div class="occ-bars">${bars}</div>
      <div class="occ-bars-labels">${labels}</div>`;
  }

  // ------------------------------------------------------------------
  // Previsões (tabela)
  // ------------------------------------------------------------------
  function renderPredictions() {
    const tbody = $("predictionsBody");
    if (!tbody) return; // página do mapa não tem a tabela
    const sorted = [...state.data].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
    const rows = state.showAllPredictions ? sorted : sorted.slice(0, 5);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="dash-empty">Sem dados.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.region)}</td>
        <td>${p.probability != null ? (p.probability * 100).toFixed(0) + "%" : "—"}</td>
        <td>
          <span class="predictions-table__risk predictions-table__risk--${riskKey(p.risk_level)}">
            <span class="material-symbols-outlined" aria-hidden="true">${riskIcon(p.risk_level)}</span>
            ${riskLabel(p.risk_level)}
          </span>
        </td>
        <td>${escapeHtml(periodLabel(p))}</td>
      </tr>`
      )
      .join("");

    $("togglePredictions").textContent = state.showAllPredictions ? "Ver menos" : "Ver todas";
  }

  // ------------------------------------------------------------------
  // Tendências (mensal) — a partir de trends[]
  // ------------------------------------------------------------------
  function sparkline(values) {
    if (!values.length) return "";
    const w = 100, h = 36, pad = 3;
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const range = hi - lo || 1;
    const pts = values.map((v, i) => {
      const x = pad + (i / (values.length - 1 || 1)) * (w - pad * 2);
      const y = h - pad - ((v - lo) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline points="${pts.join(" ")}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`;
  }

  function renderTrends() {
    const el = $("trendCharts");
    if (!state.trends.length) {
      el.innerHTML = `<p class="dash-empty">Sem tendências.</p>`;
      return;
    }
    const sorted = [...state.trends].sort((a, b) => a.year - b.year || a.month - b.month);
    const labelOf = (t) => `${String(t.month).padStart(2, "0")}/${String(t.year).slice(-2)}`;

    const series = [
      { key: "avg_probability", label: "Prob. média", color: "var(--dash-mint)", fmt: (v) => `${(v * 100).toFixed(0)}%` },
      { key: "avg_temperature", label: "Temp. da água", color: "var(--dash-yellow)", fmt: (v) => `${v.toFixed(1)}°C` },
      { key: "high_risk_points", label: "Alto risco", color: "var(--dash-red)", fmt: (v) => `${v}` },
    ];

    el.innerHTML = series
      .map((s) => {
        const values = sorted.map((t) => t[s.key]).filter((v) => v != null);
        if (!values.length) return "";
        const last = values[values.length - 1];
        return `
        <div class="trend-chart">
          <div class="trend-chart__head">
            <span>${s.label}</span>
            <strong>${s.fmt(last)}</strong>
          </div>
          <div style="color:${s.color}">${sparkline(values)}</div>
          <div class="trend-chart__head">
            <span>${escapeHtml(labelOf(sorted[0]))}</span>
            <span>${escapeHtml(labelOf(sorted[sorted.length - 1]))}</span>
          </div>
        </div>`;
      })
      .join("");
  }

  // As abas "Ar / Ventos / Precipitação" do design ainda não têm uma fonte
  // de dados por trás (a API só devolve temperatura/clorofila/salinidade da
  // água) — mostram um estado vazio honesto em vez de números inventados.
  // "Água" continua mostrando os 3 indicadores reais que já existiam.
  function renderEnvTab() {
    if (!$("trendCharts")) return; // página do mapa não tem o card
    document.querySelectorAll(".env-tab").forEach((btn) => {
      const active = btn.dataset.tab === state.envTab;
      btn.classList.toggle("env-tab--active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    if (state.envTab === "agua") {
      renderTrends();
      return;
    }
    const labels = { ar: "Ar", ventos: "Ventos", precipitacao: "Precipitação" };
    $("trendCharts").innerHTML = `<p class="dash-empty">Sem dados de ${labels[state.envTab]}.</p>`;
  }

  // ------------------------------------------------------------------
  // Alertas — derivados dos pontos de maior probabilidade/risco
  // ------------------------------------------------------------------
  function renderAlerts() {
    const list = $("alertsList");
    if (!list) return; // página do mapa não tem a lista
    const sorted = [...state.data].sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
    const rows = state.showAllAlerts ? sorted : sorted.slice(0, 5);

    if (!rows.length) {
      list.innerHTML = `<li class="dash-empty">Sem alertas.</li>`;
      $("toggleAlerts").textContent = "Ver todos";
      return;
    }

    const icon = { alto: "warning", medio: "warning", baixo: "eco" };
    const text = {
      alto: (p) => `Risco alto — ${p.region}`,
      medio: (p) => `Risco médio — ${p.region}`,
      baixo: (p) => `Risco baixo — ${p.region}`,
    };

    list.innerHTML = rows
      .map((p) => {
        const key = riskKey(p.risk_level);
        return `
        <li class="alert-item">
          <span class="alert-item__icon alert-item__icon--${key}">
            <span class="material-symbols-outlined" aria-hidden="true">${icon[key]}</span>
          </span>
          <div>
            <p class="alert-item__text">${escapeHtml(text[key](p))}</p>
            <p class="alert-item__date">${escapeHtml(periodLabel(p))}</p>
          </div>
        </li>`;
      })
      .join("");

    $("toggleAlerts").textContent = state.showAllAlerts ? "Ver menos" : "Ver todos";
  }

  // ------------------------------------------------------------------
  // Filtros / mês
  // ------------------------------------------------------------------
  function populateMonthFilter() {
    const select = $("filterMonth");
    MONTH_NAMES.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = String(i + 1);
      opt.textContent = name;
      select.appendChild(opt);
    });
  }

  // ------------------------------------------------------------------
  // Eventos
  // ------------------------------------------------------------------
  function bindEvents() {
    $("logoutBtn").addEventListener("click", () => {
      window.AlgamarAPI.clearSession();
      window.AlgamarAPI.goToLogin();
    });

    // Menu hambúrguer (gaveta lateral em telas de celular)
    const sidebar = $("sidebar");
    const overlay = $("sidebarOverlay");
    const menuToggle = $("menuToggle");
    function closeSidebar() {
      sidebar.classList.remove("is-open");
      overlay.hidden = true;
      menuToggle.setAttribute("aria-expanded", "false");
    }
    function openSidebar() {
      sidebar.classList.add("is-open");
      overlay.hidden = false;
      menuToggle.setAttribute("aria-expanded", "true");
    }
    menuToggle.addEventListener("click", () => {
      sidebar.classList.contains("is-open") ? closeSidebar() : openSidebar();
    });
    overlay.addEventListener("click", closeSidebar);

    // Painel "Camadas de mapa / Filtros": fechar e reabrir
    const layersPanel = $("layersPanel");
    const lpReopen = $("lpReopen");
    $("lpClose").addEventListener("click", () => {
      layersPanel.classList.add("hidden-panel");
      lpReopen.classList.add("show");
    });
    lpReopen.addEventListener("click", () => {
      layersPanel.classList.remove("hidden-panel");
      lpReopen.classList.remove("show");
    });

    $("cbBoundary").addEventListener("change", (e) => {
      window.DashboardMap.setBoundaryVisible(e.target.checked);
    });

    window.NotifMenu.init(() => {
      loadHealth();
      loadCoastalRisks();
    });
    $("mapRefresh").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      btn.classList.add("spin");
      setTimeout(() => btn.classList.remove("spin"), 500);
      loadCoastalRisks();
    });

    $("applyFilters").addEventListener("click", () => {
      state.filters.region = $("filterRegion").value;
      state.filters.risk_level = $("filterRisk").value;
      state.filters.month = $("filterMonth").value;
      loadCoastalRisks();
    });
    $("clearFilters").addEventListener("click", () => {
      $("filterRegion").value = "";
      $("filterRisk").value = "";
      $("filterMonth").value = "";
      state.filters = { region: "", risk_level: "", month: "" };
      loadCoastalRisks();
    });

    [
      ["layerBaixa", "baixa"],
      ["layerIdentificada", "identificada"],
      ["layerRisco", "risco"],
      ["layerPrevisao", "previsao"],
    ].forEach(([id, key]) => {
      $(id).addEventListener("change", (e) => {
        state.layers[key] = e.target.checked;
        window.DashboardMap.applyFilter(pointVisible);
        refreshOccList();
      });
    });
    $("onlyInterest").addEventListener("change", (e) => {
      state.onlyInterest = e.target.checked;
      window.DashboardMap.applyFilter(pointVisible);
      refreshOccList();
    });

    $("dashSearch").addEventListener("input", (e) => {
      state.searchTerm = e.target.value.trim();
      window.DashboardMap.applyFilter(pointVisible);
      refreshOccList();
    });

    $("occHistoryLink").addEventListener("click", () => {
      window.location.href = "historico-ocorrencias.html";
    });

    // Painel de ocorrência: setas para percorrer os pontos visíveis
    $("occPrev").addEventListener("click", () => {
      if (!occList.length) return;
      occIndex = (occIndex - 1 + occList.length) % occList.length;
      renderOccPanel();
      focusActivePoint();
    });
    $("occNext").addEventListener("click", () => {
      if (!occList.length) return;
      occIndex = (occIndex + 1) % occList.length;
      renderOccPanel();
      focusActivePoint();
    });

    // Abas "Água / Ar / Ventos / Precipitação" do card "Dados ambientais"
    document.querySelectorAll(".env-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.envTab = btn.dataset.tab;
        renderEnvTab();
      });
    });

    $("togglePredictions")?.addEventListener("click", () => {
      state.showAllPredictions = !state.showAllPredictions;
      renderPredictions();
    });
    $("toggleAlerts")?.addEventListener("click", () => {
      state.showAllAlerts = !state.showAllAlerts;
      renderAlerts();
    });
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    if (!guardSession()) return;

    renderUser();
    populateMonthFilter();
    renderWeatherPlaceholder();
    bindEvents();

    window.DashboardMap.init({
      stageId: "mapStage",
      canvasId: "mapCanvas",
      overviewId: "mapOverview",
      hillshadeId: "mapHillshade",
      boundaryId: "mapBoundary",
      labelsId: "mapLabels",
      hotspotsId: "mapHotspots",
      scaleBarId: "mapScaleBar",
      onSelect: (id) => showOccByPointId(id),
    });

    loadHealth();
    loadCoastalRisks();
  });
})();
