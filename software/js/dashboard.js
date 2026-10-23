(function () {
  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const state = {
    data: [],
    mapData: [],
    trends: [],
    summary: null,
    filters: { region: "", risk_level: "", month: "" },
    searchTerm: "",
    // 3 categorias exibidas no mapa (ver categoryOf em dashboard-map.js):
    // pouca indicação / florações identificadas / risco.
    layers: { baixa: true, identificada: true, risco: true },
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

  // Nível vem do ML (AlgamarRisk, em api-client.js). Aqui a chave "medio"
  // continua sendo o "moderado", porque é o nome usado nas classes CSS.
  const KEY_DA_TELA = { baixo: "baixo", moderado: "medio", alto: "alto", muito_alto: "muito_alto" };
  function riskKey(level) {
    return KEY_DA_TELA[window.AlgamarRisk.fromLevel(level) || "baixo"];
  }
  function riskTierFromProbability(prob) {
    return KEY_DA_TELA[window.AlgamarRisk.fromProbability(prob) || "baixo"];
  }
  function riskLabel(level) {
    return { muito_alto: "Muito alto", alto: "Alto", medio: "Moderado", baixo: "Baixo" }[riskKey(level)];
  }
  // Ícone do card "Nível de risco atual" (assets/Icons), um por nível.
  const RISK_LEVEL_ICONS = {
    muito_alto: "../assets/Icons/NivelDeRiscoAlto.svg",
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
      if (/^(MUIT|ALT|MED|MOD|BAIX)/.test(norm)) return riskKey(status);
    }
    if (!points.length) return null;
    const counts = { muito_alto: 0, alto: 0, medio: 0, baixo: 0 };
    points.forEach((p) => counts[riskKey(p.risk_level)]++);
    return ["muito_alto", "alto", "medio", "baixo"].reduce((best, k) => (counts[k] > counts[best] ? k : best), "muito_alto");
  }

  function riskIcon(level) {
    return { muito_alto: "warning", alto: "warning", medio: "warning", baixo: "check_circle" }[riskKey(level)];
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

  // A API manda vários meses por local (histórico + previsão). O mapa, o
  // painel de ocorrência e os cards do topo mostram UM mês só, para não
  // empilhar marcadores no mesmo lugar: o mês atual, se a API o trouxer;
  // senão o mais recente que já passou; senão o primeiro que vier.
  // Previsões, dados ambientais e alertas continuam usando state.data inteiro.
  function currentPeriod(list) {
    const idx = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : null);
    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth();
    const all = [...new Set(list.map(idx).filter((i) => i != null))];
    if (!all.length) return list;
    const past = all.filter((i) => i <= nowIdx);
    const pick = all.includes(nowIdx) ? nowIdx : past.length ? Math.max(...past) : Math.min(...all);
    return list.filter((p) => idx(p) == null || idx(p) === pick);
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
      window.AlgamarRisk.setRanges(state.summary && state.summary.niveis);
      state.trends = res.trends || [];
      state.data = (res.data || []).map(normalizePoint);
      state.mapData = currentPeriod(state.data);

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
      state.mapData = [];
      state.trends = [];
      renderMapStatus(null, 0, 0);
      renderMarkers();
      renderPredictions();
      renderEnvTab();
      renderAlerts();
    } finally {
      $("mapLoading").hidden = true;
      window.PageLoader.done();
    }
  }

  function trendPct(curr, prev) {
    if (curr == null || prev == null || prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  }

  function renderSummary() {
    const s = state.summary || {};
    // "em alerta" = alto ou muito alto
    const altoCount = state.mapData.filter((p) => ["alto", "muito_alto"].includes(riskKey(p.risk_level))).length;
    const medioCount = state.mapData.filter((p) => riskKey(p.risk_level) === "medio").length;

    document.querySelector('[data-field="total_identified"]').textContent = s.total_monitored ?? "—";
    document.querySelector('[data-field="alert_areas"]').textContent = s.high_risk_count ?? altoCount;
    document.querySelector('[data-field="risk_areas"]').textContent = medioCount;
    const levelKey = currentRiskKey(s, state.mapData);
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

    renderMapStatus(levelKey, altoCount, medioCount);

    const badge = $("alertBadge");
    const wantsBadge = !window.UserPrefs || window.UserPrefs.get("notifRisk");
    if (altoCount > 0 && wantsBadge) {
      badge.textContent = altoCount > 99 ? "99+" : String(altoCount);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  // ------------------------------------------------------------------
  // Aviso sobre o mapa (só no dashboard): o dia de hoje + uma frase com o
  // estado atual do litoral. Se a API não trouxer o mês corrente, o mapa
  // mostra o último mês disponível (ver currentPeriod) — e o aviso diz isso,
  // para não parecer que um dado antigo é de hoje.
  // ------------------------------------------------------------------
  const STATUS_MSG = {
    muito_alto: "Risco muito alto de floração na maior parte do litoral",
    alto: "Risco alto de floração na maior parte do litoral",
    medio: "Risco moderado de floração na maior parte do litoral",
    baixo: "Litoral tranquilo: pouca indicação de floração",
  };

  function todayLabel() {
    const txt = new Date().toLocaleDateString("pt-BR", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function renderMapStatus(levelKey, altoCount, medioCount) {
    if (!$("mapStatus")) return; // página do mapa não tem o aviso
    $("mapStatusDay").textContent = `Hoje · ${todayLabel()}`;
    $("mapStatus").className = `map-status map-status--${levelKey || "vazio"}`;

    if (state.loadError || !levelKey) {
      $("mapStatusMsg").textContent = state.loadError
        ? "Não foi possível obter o estado do litoral agora."
        : "Sem leituras do litoral para os filtros atuais.";
      $("mapStatusMeta").hidden = true;
      return;
    }

    const parts = [STATUS_MSG[levelKey]];
    if (altoCount) parts.push(`${altoCount} ${altoCount === 1 ? "área" : "áreas"} em alerta`);
    if (medioCount) parts.push(`${medioCount} com risco`);
    $("mapStatusMsg").textContent = parts.join(" · ");

    const ref = state.mapData.find((p) => p.year && p.month);
    const now = new Date();
    const isCurrent = ref && ref.year === now.getFullYear() && ref.month === now.getMonth() + 1;
    const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    $("mapStatusMeta").textContent = ref && !isCurrent
      ? `Últimos dados disponíveis: ${MONTH_NAMES[ref.month - 1].toLowerCase()}/${ref.year} · atualizado às ${time}`
      : `Atualizado às ${time}`;
    $("mapStatusMeta").hidden = false;
  }

  // ------------------------------------------------------------------
  // Clima — card "Condições atuais". Único lugar do software que usa uma
  // API de tempo: Open-Meteo (gratuita, sem chave). A API do Algamar não
  // tem clima, então isto é chamado direto do navegador.
  //  - forecast: temperatura, condição do céu (código WMO), dia/noite,
  //    vento e chuva acumulada no dia;
  //  - marine: velocidade da corrente marinha num ponto no mar.
  // O local é o ponto de floração selecionado no mapa (selectedPlace); sem
  // ponto selecionado, segue o filtro de região ("Todas" = Santos).
  // ------------------------------------------------------------------
  const WEATHER_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const WEATHER_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
  const WEATHER_REFRESH_MS = 15 * 60 * 1000; // o Open-Meteo atualiza a cada 15 min
  const WEATHER_TIMEOUT_MS = 10000;

  // `land` = cidade de referência; `sea` = ponto no mar em frente a ela
  // (a API marinha só tem dado sobre a água).
  const WEATHER_PLACES = {
    "Litoral Norte": { name: "Ubatuba", land: [-23.43, -45.08], sea: [-23.5, -45.0] },
    "Baixada Santista": { name: "Santos", land: [-23.96, -46.33], sea: [-24.04, -46.29] },
    "Litoral Sul": { name: "Cananéia", land: [-25.01, -47.93], sea: [-25.1, -47.8] },
  };
  const WEATHER_DEFAULT_REGION = "Baixada Santista";

  // Ícone principal (#weatherIcon): o único que usa assets/IconsTemp e muda
  // conforme o tempo. Os mini-ícones de vento, chuva e corrente são fixos.
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

  // Código WMO (weather_code do Open-Meteo) -> ícone + texto.
  function skyFromWmo(code) {
    if (code === 0) return ["ceu_limpo", "Céu limpo"];
    if (code === 1) return ["parcialmente_nublado", "Predomínio de sol"];
    if (code === 2) return ["nublado_com_aberturas", "Parcialmente nublado"];
    if (code === 3) return ["nublado", "Nublado"];
    if (code === 45 || code === 48) return ["neblina", "Neblina"];
    if (code >= 51 && code <= 57) return ["chuva_fraca", "Garoa"];
    if (code === 61 || code === 80) return ["chuva_fraca", "Chuva fraca"];
    if (code === 63 || code === 66 || code === 81) return ["chuva_moderada", "Chuva moderada"];
    if (code === 65 || code === 67 || code === 82) return ["chuva_forte", "Chuva forte"];
    if (code === 95) return ["trovoada", "Trovoada"];
    if (code === 96 || code === 99) return ["tempestade", "Tempestade com granizo"];
    return ["nublado", "Nublado"]; // neve (71–86) não ocorre no litoral paulista
  }

  function weatherIconPath(file) {
    return `../assets/IconsTemp/${file}`;
  }
  function isNightNow() {
    const h = new Date().getHours();
    return h < 6 || h >= 18;
  }
  function fmtNumber(v, digits) {
    return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  async function fetchJson(base, params) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WEATHER_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}?${new URLSearchParams(params)}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function setWeatherMini(id, text, title) {
    const el = $(id);
    el.textContent = text;
    el.parentElement.title = title;
  }

  function renderWeatherUnavailable(placeName) {
    $("weatherTemp").textContent = "—";
    $("weatherSky").textContent = `Clima indisponível · ${placeName}`;
    setWeatherMini("weatherWind", "—", "Vento");
    setWeatherMini("weatherRain", "—", "Chuva hoje");
    setWeatherMini("weatherCurrent", "—", "Corrente marinha");
    $("weatherIcon").src = weatherIconPath(WEATHER_SKY_ICONS.nublado.dia);
  }

  // ------------------------------------------------------------------
  // Local selecionado: quando o usuário clica numa floração (ou passa pelas
  // setas do painel), o card "Condições atuais" e o card "Dados ambientais"
  // passam a mostrar a coordenada daquele ponto. Para a API marinha usamos
  // cell_selection=sea, que pega a célula de mar mais próxima — muitos
  // pontos ficam bem na linha da costa.
  // ------------------------------------------------------------------
  let selectedPlace = null;

  function placeFromPoint(p) {
    if (!p || p.latitude == null || p.longitude == null) return null;
    const c = [p.latitude, p.longitude];
    return { name: p.region || "ponto selecionado", land: c, sea: c };
  }

  function currentPlace() {
    return selectedPlace || WEATHER_PLACES[state.filters.region] || WEATHER_PLACES[WEATHER_DEFAULT_REGION];
  }

  // Chamado sempre que o painel mostra um ponto; só recarrega o tempo e os
  // dados ambientais se o local mudou de fato.
  function selectPlace(p) {
    const next = placeFromPoint(p);
    const key = (pl) => (pl ? `${pl.name}|${pl.land.join(",")}` : "");
    if (key(next) === key(selectedPlace)) return;
    selectedPlace = next;
    loadWeather();
    renderEnvTab();
  }

  let weatherSeq = 0;
  async function loadWeather() {
    const seq = ++weatherSeq; // ignora respostas de um local anterior
    const place = currentPlace();
    const common = { timezone: "America/Sao_Paulo" };

    const [forecast, marine] = await Promise.allSettled([
      fetchJson(WEATHER_FORECAST_URL, {
        ...common,
        latitude: place.land[0],
        longitude: place.land[1],
        current: "temperature_2m,weather_code,is_day,wind_speed_10m",
        daily: "precipitation_sum",
        forecast_days: 1,
      }),
      fetchJson(WEATHER_MARINE_URL, {
        ...common,
        latitude: place.sea[0],
        longitude: place.sea[1],
        cell_selection: "sea",
        current: "ocean_current_velocity",
      }),
    ]);
    if (seq !== weatherSeq) return;

    if (forecast.status !== "fulfilled" || !forecast.value.current) {
      renderWeatherUnavailable(place.name);
      return;
    }
    const cur = forecast.value.current;
    const [skyKey, skyLabel] = skyFromWmo(cur.weather_code);
    const period = cur.is_day === 0 || (cur.is_day == null && isNightNow()) ? "noite" : "dia";
    $("weatherIcon").src = weatherIconPath(WEATHER_SKY_ICONS[skyKey][period]);
    $("weatherIcon").alt = skyLabel;
    $("weatherTemp").textContent = `${fmtNumber(cur.temperature_2m, 0)} °C`;
    $("weatherSky").textContent = `${skyLabel} · ${place.name}`;
    setWeatherMini("weatherWind", `${fmtNumber(cur.wind_speed_10m, 0)} km/h`, "Vento");

    const rain = forecast.value.daily?.precipitation_sum?.[0];
    setWeatherMini("weatherRain", typeof rain === "number" ? `${fmtNumber(rain, 1)} mm` : "—", "Chuva hoje");

    const current = marine.status === "fulfilled" ? marine.value.current?.ocean_current_velocity : null;
    setWeatherMini(
      "weatherCurrent",
      typeof current === "number" ? `${fmtNumber(current, 1)} km/h` : "—",
      "Corrente marinha"
    );
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
    window.DashboardMap.setPoints(state.mapData);
    window.DashboardMap.applyFilter(pointVisible);
    $("mapEmpty").hidden = state.mapData.length > 0 || state.loadError;
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
  const OCC_SEVERITY_LABEL = { muito_alto: "Muito alta", alto: "Alta", medio: "Moderada", baixo: "Baixa" };
  // Ilustração por nível de risco (assets/NivelDeFloração) — troca junto com
  // occSeverity, então a imagem sempre corresponde ao risco real do ponto
  // selecionado. Nome do arquivo do nível médio tem um typo de origem
  // ("Floraçãp"), mantido igual ao que está em disco.
  const OCC_THUMB = {
    muito_alto: "../assets/NivelDeFloração/NivelAltoFloração.png",
    alto: "../assets/NivelDeFloração/NivelAltoFloração.png",
    medio: "../assets/NivelDeFloração/NivelMedioFloraçãp.png",
    baixo: "../assets/NivelDeFloração/NivelBaixoFloração.png",
  };

  function refreshOccList() {
    occList = state.mapData
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
    // Ponto de outro mês (ex.: alerta antigo): o mapa passa a mostrar aquele mês.
    const alvo = state.data.find((p) => p.id === id);
    if (alvo && !state.mapData.includes(alvo)) {
      state.mapData = state.data.filter((p) => p.year === alvo.year && p.month === alvo.month);
      window.DashboardMap.setPoints(state.mapData);
      window.DashboardMap.applyFilter(pointVisible);
      occList = state.mapData.filter(pointVisible).sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
    }
    const idx = occList.findIndex((p) => p.id === id);
    if (idx === -1) return;
    occIndex = idx;
    renderOccPanel();
  }

  function renderOccPanel() {
    window.DashboardMap.setActive(occList[occIndex]?.id ?? null);
    selectPlace(occList[occIndex]);

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

    renderOccEnv(p);
    renderOccHistory();
  }

  // ------------------------------------------------------------------
  // Condições ambientais do ponto selecionado — ao vivo, da Open-Meteo
  // (mesma API gratuita do card de clima), na coordenada do próprio ponto:
  //  - marine: temperatura da superfície do mar e corrente (velocidade e
  //    direção). cell_selection=sea pega a célula de mar mais próxima, já
  //    que muitos pontos ficam bem na linha da costa;
  //  - forecast: vento agora e chuva somada nas últimas 24 h.
  // Salinidade e pH não existem em API aberta sem cadastro: vêm da API do
  // Algamar (environmental_factors) quando ela mandar, senão "—". Se a
  // Open-Meteo falhar, a temperatura cai para o valor da API do Algamar.
  // ------------------------------------------------------------------
  const ENV_CACHE_MS = 15 * 60 * 1000;
  const envCache = new Map(); // "lat,lon" -> { at, data }
  let envSeq = 0;

  const COMPASS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  function compass(deg) {
    return typeof deg === "number" ? COMPASS[Math.round(deg / 45) % 8] : "";
  }

  async function fetchPointEnv(lat, lon) {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const hit = envCache.get(key);
    if (hit && Date.now() - hit.at < ENV_CACHE_MS) return hit.data;

    const common = { latitude: lat, longitude: lon, timezone: "America/Sao_Paulo" };
    const [marine, forecast] = await Promise.allSettled([
      fetchJson(WEATHER_MARINE_URL, {
        ...common,
        cell_selection: "sea",
        current: "sea_surface_temperature,ocean_current_velocity,ocean_current_direction",
      }),
      fetchJson(WEATHER_FORECAST_URL, {
        ...common,
        current: "wind_speed_10m,wind_direction_10m",
        hourly: "precipitation",
        past_hours: 24,
        forecast_hours: 0,
      }),
    ]);
    const m = marine.status === "fulfilled" ? marine.value.current || {} : {};
    const f = forecast.status === "fulfilled" ? forecast.value : {};
    const rain = f.hourly?.precipitation?.filter((v) => typeof v === "number");
    const data = {
      sst: m.sea_surface_temperature,
      currentSpeed: m.ocean_current_velocity,
      currentDir: m.ocean_current_direction,
      windSpeed: f.current?.wind_speed_10m,
      windDir: f.current?.wind_direction_10m,
      rain24h: rain && rain.length ? rain.reduce((a, b) => a + b, 0) : undefined,
      ok: marine.status === "fulfilled" || forecast.status === "fulfilled",
    };
    if (data.ok) envCache.set(key, { at: Date.now(), data });
    return data;
  }

  function setEnv(id, text, title) {
    $(id).textContent = text;
    $(id).title = title || "";
  }

  async function renderOccEnv(p) {
    const seq = ++envSeq; // ignora a resposta se o usuário já trocou de ponto
    const ef = p.environmental_factors || {};
    const apiTemp = ef.temperature_celsius != null ? `${ef.temperature_celsius}°C` : "—";
    setEnv("occSal", ef.salinity_psu != null ? `${ef.salinity_psu} PSU` : "—",
      ef.salinity_psu != null ? "API do Algamar" : "Sem fonte pública aberta para salinidade");
    setEnv("occPh", ef.ph != null ? fmtNumber(ef.ph, 2) : "—",
      ef.ph != null ? "API do Algamar" : "Sem fonte pública aberta para pH");

    if (p.latitude == null || p.longitude == null) {
      setEnv("occTemp", apiTemp, "API do Algamar");
      ["occWind", "occCurrent", "occPrecip"].forEach((id) => setEnv(id, "—", "Ponto sem coordenada"));
      return;
    }

    ["occTemp", "occWind", "occCurrent", "occPrecip"].forEach((id) => setEnv(id, "…", "Carregando"));
    const env = await fetchPointEnv(p.latitude, p.longitude);
    if (seq !== envSeq) return;

    const src = "Open-Meteo · agora";
    setEnv("occTemp",
      typeof env.sst === "number" ? `${fmtNumber(env.sst, 1)}°C` : apiTemp,
      typeof env.sst === "number" ? `Superfície do mar · ${src}` : "API do Algamar");
    setEnv("occWind",
      typeof env.windSpeed === "number" ? `${fmtNumber(env.windSpeed, 0)} km/h ${compass(env.windDir)}`.trim() : "—",
      env.windDir != null ? `Vindo de ${Math.round(env.windDir)}° · ${src}` : src);
    setEnv("occCurrent",
      typeof env.currentSpeed === "number" ? `${fmtNumber(env.currentSpeed, 1)} km/h ${compass(env.currentDir)}`.trim() : "—",
      env.currentDir != null ? `Indo para ${Math.round(env.currentDir)}° · ${src}` : src);
    setEnv("occPrecip",
      typeof env.rain24h === "number" ? `${fmtNumber(env.rain24h, 1)} mm` : "—",
      `Soma das últimas 24 h · ${src}`);
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
  // Card "Dados ambientais" — últimos 7 dias + previsão dos próximos 7, da
  // Open-Meteo (js/env-data.js), na região do filtro ("Todas" = média das 3).
  // Linha cheia = medido, tracejada = previsão; a marca vertical é hoje.
  // A tela "Dados Ambientais" mostra a mesma coisa em tamanho grande.
  // ------------------------------------------------------------------
  const ENV_TABS = {
    agua: [
      { key: "sst", label: "Temp. da água", color: "var(--dash-blue)", unit: "°C", dec: 1 },
      { key: "current", label: "Corrente", color: "var(--dash-mint)", unit: " km/h", dec: 1 },
      { key: "waves", label: "Ondas (máx.)", color: "#5fc9be", unit: " m", dec: 1 },
    ],
    ar: [
      { key: "air", label: "Temp. do ar", color: "#ffb03a", unit: "°C", dec: 1 },
      { key: "radiation", label: "Radiação solar", color: "var(--dash-yellow)", unit: " MJ/m²", dec: 1 },
      { key: "clouds", label: "Nebulosidade", color: "#b8c7cc", unit: "%", dec: 0 },
    ],
    ventos: [
      { key: "wind", label: "Vento médio", color: "var(--dash-green)", unit: " km/h", dec: 0 },
      { key: "windMax", label: "Rajada máx.", color: "var(--dash-yellow)", unit: " km/h", dec: 0 },
    ],
    precipitacao: [
      { key: "rain", label: "Chuva diária", color: "var(--dash-blue)", unit: " mm", dec: 1, bars: true },
    ],
  };
  const ENV_PAST_DAYS = 7;
  const ENV_NEXT_DAYS = 7;

  function envMiniChart(vals, todayIdx, bars) {
    const w = 100, h = 36, pad = 3;
    const ok = vals.filter((v) => v != null);
    const lo = bars ? 0 : Math.min(...ok);
    const hi = Math.max(...ok);
    const range = hi - lo || 1;
    const x = (i) => pad + (i / (vals.length - 1 || 1)) * (w - pad * 2);
    const y = (v) => h - pad - ((v - lo) / range) * (h - pad * 2);
    const tx = x(todayIdx);
    let marks = `<rect x="${tx}" y="0" width="${w - tx}" height="${h}" fill="currentColor" fill-opacity="0.06"/>
      <line x1="${tx}" x2="${tx}" y1="0" y2="${h}" stroke="var(--dash-mint)" stroke-width="1" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>`;
    if (bars) {
      const bw = (w - pad * 2) / vals.length * 0.6;
      marks += vals
        .map((v, i) => (v == null ? "" : `<rect x="${x(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${h - pad - y(v)}" fill="currentColor" fill-opacity="${i > todayIdx ? 0.4 : 1}"/>`))
        .join("");
    } else {
      const pts = vals.map((v, i) => (v == null ? null : [i, `${x(i).toFixed(1)},${y(v).toFixed(1)}`])).filter(Boolean);
      const past = pts.filter(([i]) => i <= todayIdx).map((p) => p[1]).join(" ");
      const fut = pts.filter(([i]) => i >= todayIdx).map((p) => p[1]).join(" ");
      const line = (points, dash) =>
        points.includes(" ")
          ? `<polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"${dash ? ' stroke-dasharray="4 3"' : ""}/>`
          : "";
      marks += line(past, false) + line(fut, true);
    }
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${marks}</svg>`;
  }

  let envTabSeq = 0;
  async function renderEnvTab() {
    const el = $("trendCharts");
    if (!el) return; // página do mapa não tem o card
    document.querySelectorAll(".env-tab").forEach((btn) => {
      const active = btn.dataset.tab === state.envTab;
      btn.classList.toggle("env-tab--active", active);
      btn.setAttribute("aria-selected", String(active));
    });

    const seq = ++envTabSeq;
    let env;
    try {
      env = await window.EnvData.load({
        region: state.filters.region,
        place: selectedPlace,
        pastDays: ENV_PAST_DAYS,
        forecastDays: ENV_NEXT_DAYS + 1,
      });
    } catch (err) {
      if (seq === envTabSeq) el.innerHTML = `<p class="dash-empty">Não foi possível consultar a Open-Meteo.</p>`;
      return;
    }
    if (seq !== envTabSeq) return;
    if ($("envPlace")) $("envPlace").textContent = env.places;

    const html = ENV_TABS[state.envTab]
      .map((s) => {
        let vals = env.series[s.key];
        let last = vals.length - 1;
        while (last > 0 && vals[last] == null) last--;
        vals = vals.slice(0, last + 1);
        if (!vals.some((v) => v != null) || env.todayIdx < 0 || env.todayIdx > last) return "";
        const today = vals[env.todayIdx];
        const next = vals.slice(env.todayIdx + 1).filter((v) => v != null);
        const head = s.bars
          ? `próx. ${next.length} dias: ${fmtNumber(next.reduce((a, b) => a + b, 0), s.dec)}${s.unit}`
          : `hoje ${today != null ? fmtNumber(today, s.dec) + s.unit : "—"}`;
        return `
        <div class="trend-chart">
          <div class="trend-chart__head">
            <span>${escapeHtml(s.label)}</span>
            <strong>${escapeHtml(head)}</strong>
          </div>
          <div style="color:${s.color}">${envMiniChart(vals, env.todayIdx, s.bars)}</div>
          <div class="trend-chart__head" style="position:relative">
            <span>${window.EnvData.dayLabel(env.dates[0])}</span>
            <span style="position:absolute;left:${(3 + (env.todayIdx / (last || 1)) * 94).toFixed(1)}%;transform:translateX(-50%)">hoje</span>
            <span>${window.EnvData.dayLabel(env.dates[last])}</span>
          </div>
        </div>`;
      })
      .join("");
    el.innerHTML = html || `<p class="dash-empty">Sem dados para esta região.</p>`;
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

    const icon = { muito_alto: "warning", alto: "warning", medio: "warning", baixo: "eco" };
    const text = {
      muito_alto: (p) => `Risco muito alto — ${p.region}`,
      alto: (p) => `Risco alto — ${p.region}`,
      medio: (p) => `Risco moderado — ${p.region}`,
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
      loadWeather();
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
      loadWeather();
    });
    $("clearFilters").addEventListener("click", () => {
      $("filterRegion").value = "";
      $("filterRisk").value = "";
      $("filterMonth").value = "";
      state.filters = { region: "", risk_level: "", month: "" };
      loadCoastalRisks();
      loadWeather();
    });

    [
      ["layerBaixa", "baixa"],
      ["layerIdentificada", "identificada"],
      ["layerRisco", "risco"],
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
    loadWeather();
    setInterval(loadWeather, WEATHER_REFRESH_MS);
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
