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
    // risco baixo / alto ou muito alto / moderado (ou, no modo "Algas
    // tóxicas", desfavorável / propício / parcial).
    layers: { baixa: true, identificada: true, risco: true },
    onlyInterest: false,
    showAllPredictions: false,
    envTab: "agua",
    colorBy: "risco", // cor dos pinos: "risco" (ML) ou "tox" (condições propícias)
    cond: null, // GET /ml/condicoes-propicias (todas as regiões); null = carregando
    condErro: false,
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

  // Nível que predomina no litoral no mês mostrado: o mais frequente entre
  // os pontos do mapa (empate fica com o mais grave). Não usa o
  // summary.general_status da API, que vale só para o mês-alvo do modelo e
  // não acompanha o filtro de mês. Sem dado nenhum, devolve null.
  function currentRiskKey(points) {
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

  // Só o mês atual e os próximos 3 (o horizonte das condições propícias):
  // meses que já passaram não aparecem em nenhum lugar do dashboard/mapa
  // (mapa, filtro, previsões, alertas).
  const MONTHS_AHEAD = 3;
  const periodIdx = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : null);
  const NOW_IDX = new Date().getFullYear() * 12 + new Date().getMonth();
  const inWindow = (p) => periodIdx(p) == null || (periodIdx(p) >= NOW_IDX && periodIdx(p) <= NOW_IDX + MONTHS_AHEAD);
  const ymOf = (idx) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  const idxOfYm = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  const monthLabel = (idx) => `${MONTH_NAMES[idx % 12]}/${Math.floor(idx / 12)}`;

  // Mês mostrado no mapa/cards: o do filtro ("AAAA-MM") ou o atual.
  const selectedYm = () => state.filters.month || ymOf(NOW_IDX);

  // Filtro "Mês" = "AAAA-MM"; vazio = mês atual (currentPeriod).
  function monthData(list) {
    if (!state.filters.month) return currentPeriod(list);
    const [y, m] = state.filters.month.split("-").map(Number);
    return list.filter((p) => p.year === y && p.month === m);
  }

  async function loadCoastalRisks() {
    $("mapLoading").hidden = false;
    $("mapEmpty").hidden = true;

    try {
      const params = {
        region: state.filters.region || undefined,
        risk_level: state.filters.risk_level || undefined,
      };
      const res = await window.AlgamarAPI.apiFetch("/ml/coastal-risks", { params });

      state.summary = res.summary || null;
      window.AlgamarRisk.setRanges(state.summary && state.summary.niveis);
      state.trends = res.trends || [];
      state.data = (res.data || []).map(normalizePoint).filter(inWindow);
      state.mapData = monthData(state.data);

      state.loadError = false;
      hideApiWarning();
      renderSummary();
      renderMarkers();
      renderPredictions();
      renderEnvTab();
      renderAlerts();
      renderTimeline();
      // Só na primeira carga: enquadra o mapa no ponto selecionado. Nos
      // refreshes seguintes não mexe, para não tirar o usuário de onde está.
      if (!state.focusedOnce && occList.length) {
        state.focusedOnce = true;
        // Vindo da Central de alertas: ?ponto=ID abre aquele ponto no painel.
        // Vindo de Condições Propícias: ?municipio=Nome abre o ponto do município.
        const qs = new URLSearchParams(window.location.search);
        const wanted = qs.get("ponto") || pointIdOfMunicipio(qs.get("municipio"));
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

  // Cards do topo. Todos seguem o MÊS mostrado no mapa (filtro "Mês") e a
  // mesma unidade do mapa (municípios):
  //  - municípios monitorados (e quantos pontos de satélite há por trás);
  //  - alertas de algas tóxicas = Condições Propícias, a mesma conta do sino;
  //  - risco alto de floração e nível predominante = modelo de risco (ML).
  const field = (name) => document.querySelector(`[data-field="${name}"]`);

  function renderSummary() {
    const s = state.summary || {};
    const mes = monthLabel(idxOfYm(selectedYm()));
    const altoCount = state.mapData.filter((p) => ["alto", "muito_alto"].includes(riskKey(p.risk_level))).length;
    const medioCount = state.mapData.filter((p) => riskKey(p.risk_level) === "medio").length;

    const municipios = new Set(state.mapData.map((p) => p.region)).size;
    field("total_identified").textContent = municipios || "—";
    if (field("total_hint"))
      field("total_hint").textContent = s.total_monitored
        ? `${s.total_monitored.toLocaleString("pt-BR")} pontos de satélite no litoral`
        : "municípios do litoral";
    field("risk_areas").textContent = altoCount;
    if (field("risk_hint")) field("risk_hint").textContent = `${medioCount} com risco moderado · ${mes}`;

    const levelKey = currentRiskKey(state.mapData);
    field("general_status").textContent = levelKey ? riskLabel(levelKey) : "—";
    if (field("level_hint")) field("level_hint").textContent = `na maior parte do litoral · ${mes}`;
    const levelIcon = $("riskLevelIcon");
    levelIcon.src = levelKey ? RISK_LEVEL_ICONS[levelKey] : "../assets/Icons/shield.svg";
    levelIcon.alt = levelKey ? `Nível de risco ${riskLabel(levelKey).toLowerCase()}` : "";

    renderCondSummary();
    renderMapStatus(levelKey, altoCount, medioCount);
  }

  // Registro (de uma espécie) de Condições Propícias para o mês "AAAA-MM":
  // o observado (agora) ou um dos previstos (proximos).
  const condDoMes = (m, ym) => [m.agora, ...(m.proximos || [])].find((r) => r && r.mes === ym) || null;
  const condRegiao = (list) => list.filter((m) => !state.filters.region || m.macro_region === state.filters.region);

  function contaCond(regs) {
    const C = window.CondicoesData;
    let prop = 0, parc = 0;
    regs.forEach((r) => {
      const k = r && C.nivelDe(r.nivel).key;
      if (k === "propicio") prop++;
      else if (k === "parcial") parc++;
    });
    return { prop, parc, total: prop + parc };
  }

  // Card "Alertas de algas tóxicas": município × espécie propício ou
  // parcialmente propício no mês mostrado (no mês atual = número do sino).
  // A variação compara com o mês anterior — do histórico, se ele já passou.
  let condSumSeq = 0;
  async function renderCondSummary() {
    const C = window.CondicoesData;
    const valueEl = field("alert_areas");
    const hintEl = field("alert_areas_trend");
    const chip = document.querySelector('[data-trend="alert_areas"]');
    if (!state.cond) {
      valueEl.textContent = "…";
      hintEl.textContent = "carregando condições propícias";
      if (chip) chip.hidden = true;
      return;
    }
    const seq = ++condSumSeq;
    const ym = selectedYm();
    const atual = contaCond(condRegiao(state.cond.data).map((m) => condDoMes(m, ym)));
    valueEl.textContent = atual.total;
    const breakdown = `${atual.prop} ${atual.prop === 1 ? "propício" : "propícios"} · ${atual.parc} ${atual.parc === 1 ? "parcial" : "parciais"}`;
    hintEl.textContent = breakdown;
    if (chip) chip.hidden = true;

    const prevYm = ymOf(idxOfYm(ym) - 1);
    let anterior = null;
    if (idxOfYm(prevYm) >= NOW_IDX) {
      anterior = contaCond(condRegiao(state.cond.data).map((m) => condDoMes(m, prevYm)));
    } else {
      try {
        const hist = await C.historico({ meses: 12 });
        if (seq !== condSumSeq) return;
        const rows = condRegiao(hist.data).filter((r) => r.mes === prevYm);
        if (rows.length) anterior = contaCond(rows);
      } catch (err) {
        return;
      }
    }
    const pct = anterior ? trendPct(atual.total, anterior.total) : null;
    if (pct == null) return;
    // Na página do mapa a variação vira um selo ao lado do número (mais
    // alertas = vermelho, menos = verde); no dashboard fica dentro do texto.
    const seta = pct === 0 ? "= 0%" : `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`;
    if (chip) {
      chip.hidden = false;
      chip.textContent = seta;
      chip.className = `stat-trend${pct ? ` stat-trend--${pct > 0 ? "up" : "down"}` : ""}`;
      chip.title = `${anterior.total} no mês anterior`;
    } else {
      hintEl.textContent = `${breakdown} · ${seta} vs. mês anterior`;
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
    if (altoCount) parts.push(`${altoCount} ${altoCount === 1 ? "município" : "municípios"} com risco alto`);
    if (medioCount) parts.push(`${medioCount} com risco moderado`);
    $("mapStatusMsg").textContent = parts.join(" · ");

    const ref = state.mapData.find((p) => p.year && p.month);
    const now = new Date();
    const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const refIdx = ref ? periodIdx(ref) : NOW_IDX;
    const refTxt = `${MONTH_NAMES[refIdx % 12].toLowerCase()}/${Math.floor(refIdx / 12)}`;
    $("mapStatusMeta").textContent =
      refIdx > NOW_IDX
        ? `Previsão para ${refTxt} · atualizado às ${time}`
        : refIdx < NOW_IDX
          ? `Últimos dados disponíveis: ${refTxt} · atualizado às ${time}`
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

  // Valores "agora" (tempo + mar) de um local, numa consulta só à Open-Meteo.
  // O card "Condições atuais", o painel da ocorrência e o card "Dados
  // ambientais" leem daqui, então vento, chuva e corrente batem nos três.
  // A chuva é sempre a soma do dia de hoje (precipitation_sum).
  const NOW_CACHE_MS = WEATHER_REFRESH_MS;
  const nowCache = new Map(); // "land|sea" -> { at, promise }

  function fetchNow(place) {
    const key = `${place.land.join(",")}|${place.sea.join(",")}`;
    const hit = nowCache.get(key);
    if (hit && Date.now() - hit.at < NOW_CACHE_MS) return hit.promise;

    const common = { timezone: "America/Sao_Paulo" };
    const promise = Promise.allSettled([
      fetchJson(WEATHER_FORECAST_URL, {
        ...common,
        latitude: place.land[0],
        longitude: place.land[1],
        current: "temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m",
        daily: "precipitation_sum",
        forecast_days: 1,
      }),
      fetchJson(WEATHER_MARINE_URL, {
        ...common,
        latitude: place.sea[0],
        longitude: place.sea[1],
        cell_selection: "sea",
        current: "sea_surface_temperature,ocean_current_velocity,ocean_current_direction",
      }),
    ]).then(([forecast, marine]) => {
      const f = forecast.status === "fulfilled" ? forecast.value : {};
      const m = marine.status === "fulfilled" ? marine.value.current || {} : {};
      return {
        okForecast: !!f.current,
        temp: f.current?.temperature_2m,
        weatherCode: f.current?.weather_code,
        isDay: f.current?.is_day,
        windSpeed: f.current?.wind_speed_10m,
        windDir: f.current?.wind_direction_10m,
        rainToday: f.daily?.precipitation_sum?.[0],
        sst: m.sea_surface_temperature,
        currentSpeed: m.ocean_current_velocity,
        currentDir: m.ocean_current_direction,
        ok: !!f.current || marine.status === "fulfilled",
      };
    });
    nowCache.set(key, { at: Date.now(), promise });
    promise.then((d) => !d.ok && nowCache.delete(key));
    return promise;
  }

  // Atualização periódica / botão "Atualizar": descarta o cache e redesenha
  // os três lugares que mostram os valores "agora".
  function refreshNow() {
    nowCache.clear();
    loadWeather();
    if (occList[occIndex]) renderOccEnv(occList[occIndex]);
    renderEnvTab();
  }

  let weatherSeq = 0;
  async function loadWeather() {
    const seq = ++weatherSeq; // ignora respostas de um local anterior
    const place = currentPlace();
    const now = await fetchNow(place);
    if (seq !== weatherSeq) return;

    if (!now.okForecast) {
      renderWeatherUnavailable(place.name);
      return;
    }
    const [skyKey, skyLabel] = skyFromWmo(now.weatherCode);
    const period = now.isDay === 0 || (now.isDay == null && isNightNow()) ? "noite" : "dia";
    $("weatherIcon").src = weatherIconPath(WEATHER_SKY_ICONS[skyKey][period]);
    $("weatherIcon").alt = skyLabel;
    $("weatherTemp").textContent = `${fmtNumber(now.temp, 0)} °C`;
    $("weatherSky").textContent = `${skyLabel} · ${place.name}`;
    setWeatherMini("weatherWind", typeof now.windSpeed === "number" ? `${fmtNumber(now.windSpeed, 0)} km/h` : "—", "Vento agora");
    setWeatherMini("weatherRain", typeof now.rainToday === "number" ? `${fmtNumber(now.rainToday, 1)} mm` : "—", "Chuva hoje");
    setWeatherMini(
      "weatherCurrent",
      typeof now.currentSpeed === "number" ? `${fmtNumber(now.currentSpeed, 1)} km/h` : "—",
      "Corrente marinha agora"
    );
  }

  // ------------------------------------------------------------------
  // Mapa — o motor de renderização (projeção geográfica, imagem de
  // satélite, blobs) mora em dashboard-map.js; aqui só decidimos QUAIS
  // pontos aparecem.
  // ------------------------------------------------------------------
  // "Colorir por" (painel Camadas de mapa): "risco" = modelo de risco de
  // floração (ML); "tox" = Condições Propícias — cada município pinta com o
  // maior nível entre as espécies tóxicas no mês mostrado. As 3 camadas
  // seguem o modo: baixo/desfavorável, moderado/parcial, alto/propício.
  const COLOR_MODES = {
    risco: {
      legend: "Risco de floração (previsão)",
      rows: [["#00c05d", "Baixo"], ["#f5c518", "Moderado"], ["#f08c28", "Alto"], ["#ff383c", "Muito alto"]],
      layers: { baixa: ["Risco baixo", "var(--map-baixa)"], risco: ["Risco moderado", "var(--map-risco)"], identificada: ["Risco alto ou muito alto", "var(--map-identificada)"] },
      onlyInterest: "Mostrar só risco moderado ou maior",
    },
    tox: {
      legend: "Algas tóxicas (condições)",
      rows: [["#00c05d", "Desfavorável"], ["#f5c518", "Parcialmente propício"], ["#f08c28", "Propício"]],
      layers: { baixa: ["Desfavorável", "#00c05d"], risco: ["Parcialmente propício", "#f5c518"], identificada: ["Propício", "#f08c28"] },
      onlyInterest: "Mostrar só parcial ou propício",
    },
  };

  // Condições do município do ponto no mês mostrado: a espécie de maior índice.
  function toxDoPonto(p) {
    const C = window.CondicoesData;
    if (!state.cond || !C) return null;
    const ym = selectedYm();
    let best = null;
    C.doPonto(state.cond.data, p).forEach((m) => {
      const r = condDoMes(m, ym);
      if (r && typeof r.indice === "number" && (!best || r.indice > best.r.indice)) best = { m, r };
    });
    return best;
  }

  // Ponto como o mapa o desenha: no modo "tox", risk_level/probability vêm
  // do nível/índice das condições (o motor do mapa pinta halo e camada por eles).
  function viewPoint(p) {
    if (state.colorBy !== "tox" || p._orig) return p;
    const best = toxDoPonto(p);
    const n = window.CondicoesData.nivelDe(best && best.r.nivel);
    return { ...p, _tox: best, _orig: p, risk_level: n.risk, probability: best ? best.r.indice : 0 };
  }

  function categoryOf(p) {
    return window.DashboardMap.categoryOf(viewPoint(p));
  }

  function pointVisible(p) {
    const cat = categoryOf(p);
    if (!state.layers[cat]) return false;
    if (state.onlyInterest && !(cat === "identificada" || cat === "risco")) return false;
    if (state.searchTerm) {
      return (p.region || "").toLowerCase().includes(state.searchTerm.toLowerCase());
    }
    return true;
  }

  function applyColorMode() {
    const mode = COLOR_MODES[state.colorBy];
    const C = window.CondicoesData;
    window.DashboardMap.setStyle(
      state.colorBy === "tox"
        ? {
            pinColor: (p) => C.nivelDe(p._tox && p._tox.r.nivel).color,
            pinLabel: (p) => (p._tox ? `${C.nivelDe(p._tox.r.nivel).label} para ${p._tox.m.especie}` : "sem dado de condições"),
          }
        : null
    );
    const legend = document.querySelector(".map-panel .legend");
    if (legend) {
      legend.innerHTML =
        `<p class="legend-title">${escapeHtml(mode.legend)}</p>` +
        mode.rows
          .map(([c, l]) => `<div class="legend-row"><span class="dot" style="background:${c}"></span><span class="lbl">${escapeHtml(l)}</span></div>`)
          .join("");
    }
    [["layerBaixa", "baixa"], ["layerRisco", "risco"], ["layerIdentificada", "identificada"]].forEach(([id, key]) => {
      const row = $(id) && $(id).closest(".lp-row");
      if (!row) return;
      row.querySelector(".lp-name").textContent = mode.layers[key][0];
      row.querySelector(".lp-dot").style.background = mode.layers[key][1];
    });
    const oi = document.querySelector(".lp-toggle-label");
    if (oi) oi.textContent = mode.onlyInterest;
    document.querySelectorAll("[data-color-by]").forEach((b) => {
      const on = b.dataset.colorBy === state.colorBy;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  // Cartão de dica ao passar o mouse num pino: risco (ML) + algas tóxicas.
  function pinTooltip(vp) {
    const C = window.CondicoesData;
    const p = vp._orig || vp;
    const best = vp._tox || toxDoPonto(p);
    const regs = state.cond ? C.doPonto(state.cond.data, p) : [];
    const ym = selectedYm();
    const fav = regs.filter((m) => {
      const r = condDoMes(m, ym);
      return r && C.nivelDe(r.nivel).ordem >= 1;
    });
    const tox = best
      ? `<span class="map-tip__chip" style="--c:${C.nivelDe(best.r.nivel).color}">${escapeHtml(C.nivelDe(best.r.nivel).short)}</span>
         ${fav.length ? `${fav.length} de ${regs.length} espécies` : "nenhuma espécie favorecida"}`
      : "—";
    return `
      <p class="map-tip__title">${escapeHtml(p.region || "Ponto monitorado")}</p>
      <p class="map-tip__sub">${escapeHtml(periodLabel(p))}${p.tipo === "previsao" ? " · previsão" : ""}</p>
      <dl>
        <dt>Risco de floração</dt>
        <dd><span class="map-tip__chip" style="--c:${window.AlgamarRisk.COLOR[window.AlgamarRisk.of(p)]}">${escapeHtml(riskLabel(p.risk_level))}</span>
          ${typeof p.probability === "number" ? `${Math.round(p.probability * 100)}%` : ""}</dd>
        <dt>Algas tóxicas</dt>
        <dd>${tox}</dd>
      </dl>
      <p class="map-tip__hint">Clique para detalhes · duplo clique aproxima</p>`;
  }

  function renderMarkers() {
    window.DashboardMap.setPoints(state.mapData.map(viewPoint));
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

  // Os meses mostrados são todos previsão do modelo de risco: nada aqui é
  // floração "identificada" (observada) — por isso os rótulos falam em risco.
  const OCC_BADGE_LABEL = {
    identificada: "Risco alto de floração",
    risco: "Risco moderado de floração",
    previsao: "Previsão de floração",
    baixa: "Risco baixo de floração",
  };
  const OCC_TITLE_PREFIX = {
    identificada: "Risco alto em",
    risco: "Risco moderado em",
    previsao: "Previsão de floração em",
    baixa: "Risco baixo em",
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
    // Troca de mês/camada: o painel continua no mesmo município, se ele
    // ainda estiver visível.
    const antes = occList[occIndex];
    occList = state.mapData
      .filter(pointVisible)
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0));
    const mesmo = antes ? occList.findIndex((p) => p.region === antes.region) : -1;
    if (mesmo >= 0) occIndex = mesmo;
    else if (occIndex >= occList.length) occIndex = 0;
    renderOccPanel();
  }

  // Na página do mapa, as setas do painel também levam o mapa até o ponto.
  function focusActivePoint() {
    if (!document.body.classList.contains("map-page")) return;
    const p = occList[occIndex];
    if (p) window.DashboardMap.panTo(p.latitude, p.longitude);
  }

  function pointIdOfMunicipio(nome) {
    if (!nome || !window.CondicoesData) return null;
    const n = window.CondicoesData.norm(nome);
    const hit = (list) => list.find((p) => window.CondicoesData.norm(p.region) === n);
    const p = hit(occList) || hit(state.mapData) || hit(state.data);
    return p ? p.id : null;
  }

  function showOccByPointId(id) {
    // Ponto de outro mês (ex.: link antigo): o mapa passa a mostrar aquele mês.
    const alvo = state.data.find((p) => p.id === id);
    if (alvo && !state.mapData.includes(alvo)) setMonth(ymOf(periodIdx(alvo)));
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
    if ($("occThumb")) $("occThumb").src = OCC_THUMB[riskK] || OCC_THUMB.baixo;

    $("occLocation").textContent = p.region ? `${p.region} - SP` : "Localização não informada";
    $("occCoords").textContent =
      p.latitude != null && p.longitude != null ? `${p.latitude}, ${p.longitude}` : "—";
    $("occDate").textContent = periodLabel(p);

    // Concentração não existe na API ainda — "—" em vez de inventar um número
    // que pareceria um dado real de segurança. As espécies vêm de Condições Propícias.
    $("occConcentration").textContent = "—";

    renderOccCond(p);
    renderOccEnv(p);
    renderOccHistory(p);
  }

  // ------------------------------------------------------------------
  // Condições propícias do município do ponto (mesmos dados da tela
  // "Condições Propícias"): que espécies tóxicas o mar está favorecendo
  // agora e no mês seguinte. É índice da literatura, não probabilidade.
  // ------------------------------------------------------------------
  async function loadCondicoes() {
    try {
      state.cond = await window.CondicoesData.load("");
      state.condErro = false;
    } catch (err) {
      state.cond = { data: [], especies: [] };
      state.condErro = true;
    }
    renderOccCond(occList[occIndex]);
    renderCondSummary();
    renderAlerts();
    if (state.colorBy === "tox") renderMarkers();
  }

  function condChip(r) {
    const n = window.CondicoesData.nivelDe(r && r.nivel);
    const idx = r && typeof r.indice === "number" ? ` · índice ${fmtNumber(r.indice, 2)}` : "";
    return `<span class="cp-chip" style="--cp:${n.color}" title="${escapeHtml(n.label + idx)}">${escapeHtml(n.short)}</span>`;
  }

  function renderOccCond(p) {
    const C = window.CondicoesData;
    const sub = $("occCondSub");
    const list = $("occCondList");
    const link = $("occCondLink");
    if (!p || !window.CondicoesData) return;
    if (!state.cond) {
      $("occSpecies").textContent = "…";
      if (sub) sub.textContent = "Carregando condições...";
      if (list) list.innerHTML = "";
      return;
    }
    const regs = C.doPonto(state.cond.data, p);
    // A tela do Mapa Interativo reaproveita este arquivo sem o bloco da lista.
    if (link) link.href = C.url(regs[0] && regs[0].municipio, regs[0] && regs[0].especie);
    if (!regs.length) {
      $("occSpecies").textContent = "—";
      $("occTox").textContent = "";
      if (sub)
        sub.textContent = state.condErro
          ? "Não foi possível carregar as condições propícias."
          : "Sem dados de condições propícias para este local.";
      if (list) list.innerHTML = "";
      return;
    }

    const favorecidas = regs.filter((m) => C.nivelDe(m.agora.nivel).ordem >= 1);
    $("occSpecies").textContent = favorecidas.length
      ? favorecidas.map((m) => `${m.especie} (${C.nivelDe(m.agora.nivel).short.toLowerCase()})`).join(", ")
      : "nenhuma no momento";
    const toxinas = [...new Set(favorecidas.map((m) => C.siglaToxina(m.toxina)).filter(Boolean))];
    $("occTox").textContent = toxinas.join(" · ");

    if (!list) return;
    const m0 = regs[0];
    const prox = m0.proximos[0];
    sub.textContent = `${m0.municipio} · ${C.mesLabel(m0.agora.mes)} (observado)${prox ? ` → ${C.mesLabel(prox.mes, true)} (previsto)` : ""}`;
    list.innerHTML = regs
      .map((m) => {
        const tox = C.siglaToxina(m.toxina);
        const r1 = m.proximos[0];
        return `
          <li>
            <a href="${escapeHtml(C.url(m.municipio, m.especie))}">
              <span class="occ-cond__esp">${escapeHtml(m.especie)}${tox ? ` <small>${escapeHtml(tox)}</small>` : ""}</span>
              ${condChip(m.agora)}
              ${r1 ? `<span class="occ-cond__seta" aria-hidden="true">→</span>${condChip(r1)}` : ""}
            </a>
          </li>`;
      })
      .join("");
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
  let envSeq = 0;

  const COMPASS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  function compass(deg) {
    return typeof deg === "number" ? COMPASS[Math.round(deg / 45) % 8] : "";
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
    const env = await fetchNow(placeFromPoint(p));
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
      typeof env.rainToday === "number" ? `${fmtNumber(env.rainToday, 1)} mm` : "—",
      `Soma do dia de hoje · ${src}`);
  }

  // Só os últimos HISTORY_MONTHS meses cabem no painel; a série inteira
  // fica na tela "Histórico de Ocorrências" (link "ver histórico completo").
  const HISTORY_MONTHS = 12;

  // Histórico das condições propícias do município do ponto: em cada mês,
  // o maior índice entre as espécies tóxicas (altura da barra) e o nível dele.
  const HIST_TIER = { propicio: "alto", parcial: "medio", desfavoravel: "baixo", sem: "baixo" };
  let histSeq = 0;
  let histMunicipio = "";

  async function renderOccHistory(p) {
    const el = $("occHistoryChart");
    const C = window.CondicoesData;
    const seq = ++histSeq;
    let rows = [];
    try {
      const [cond, hist] = await Promise.all([C.load(""), C.historico({ meses: HISTORY_MONTHS })]);
      if (seq !== histSeq) return;
      const lista = C.doPonto(cond.data, p);
      histMunicipio = lista.length ? lista[0].municipio : "";
      rows = hist.data.filter((r) => r.municipio === histMunicipio);
    } catch (err) {
      if (seq !== histSeq) return;
      histMunicipio = "";
    }
    if (!rows.length) {
      el.innerHTML = `<p class="dash-empty">Sem histórico de condições para este local.</p>`;
      return;
    }
    const byMonth = new Map();
    rows.forEach((r) => {
      const cur = byMonth.get(r.mes);
      if (!cur || r.indice > cur.indice) byMonth.set(r.mes, r);
    });
    const sorted = [...byMonth.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-HISTORY_MONTHS);
    const bars = sorted
      .map((r) => {
        const n = C.nivelDe(r.nivel);
        const h = Math.max(6, r.indice * 100);
        const label = `${C.mesLabel(r.mes, true)}: ${n.label} para ${r.especie} (índice ${fmtNumber(r.indice, 2)})`;
        return `<span class="occ-bar occ-bar--${HIST_TIER[n.key]}" style="height:${h}%" title="${escapeHtml(label)}"></span>`;
      })
      .join("");
    // Até 4 rótulos de data espalhados sob as barras (primeiro e último sempre).
    const n = sorted.length;
    const labelCount = Math.min(n, 4);
    const labels = Array.from({ length: labelCount }, (_, i) => {
      const r = sorted[labelCount === 1 ? 0 : Math.round((i * (n - 1)) / (labelCount - 1))];
      return `<span>${r.mes.slice(5)}/${r.mes.slice(2, 4)}</span>`;
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
    // Só os próximos meses (previsão): nada do mês atual nem de meses passados.
    // Ordem: mês mais próximo primeiro; dentro do mês, maior probabilidade.
    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth();
    const idx = (p) => (p.year && p.month ? p.year * 12 + (p.month - 1) : null);
    const sorted = state.data
      .filter((p) => idx(p) != null && idx(p) > nowIdx)
      .sort((a, b) => idx(a) - idx(b) || (b.probability ?? 0) - (a.probability ?? 0));
    const rows = state.showAllPredictions ? sorted : sorted.slice(0, 5);
    $("togglePredictions").hidden = sorted.length <= 5;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="dash-empty">Sem previsões para os próximos meses.</td></tr>`;
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
        <td>${escapeHtml(`${MONTH_NAMES[p.month - 1].slice(0, 3)}/${String(p.year).slice(-2)}`)}</td>
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
      { key: "current", now: "currentSpeed", label: "Corrente", color: "var(--dash-mint)", unit: " km/h", dec: 1 },
      { key: "waves", label: "Ondas (máx.)", color: "#5fc9be", unit: " m", dec: 1 },
    ],
    ar: [
      { key: "air", label: "Temp. do ar", color: "#ffb03a", unit: "°C", dec: 1 },
      { key: "radiation", label: "Radiação solar", color: "var(--dash-yellow)", unit: " MJ/m²", dec: 1 },
      { key: "clouds", label: "Nebulosidade", color: "#b8c7cc", unit: "%", dec: 0 },
    ],
    ventos: [
      { key: "wind", now: "windSpeed", label: "Vento (média diária)", color: "var(--dash-green)", unit: " km/h", dec: 0 },
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
    const place = currentPlace();
    let env, now;
    try {
      [env, now] = await Promise.all([
        window.EnvData.load({
          place,
          pastDays: ENV_PAST_DAYS,
          forecastDays: ENV_NEXT_DAYS + 1,
        }),
        fetchNow(place),
      ]);
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
        // Vento e corrente: o mesmo valor "agora" do card do topo (o gráfico
        // continua sendo a média de cada dia).
        const nowVal = s.now ? now[s.now] : null;
        const head = s.bars
          ? `próx. ${next.length} dias: ${fmtNumber(next.reduce((a, b) => a + b, 0), s.dec)}${s.unit}`
          : typeof nowVal === "number"
            ? `agora ${fmtNumber(nowVal, s.dec)}${s.unit}`
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
  // Alertas — de Condições Propícias (mesma fonte do sino e da Central de
  // alertas): município × espécie tóxica propício ou parcialmente propício
  // no mês mostrado, do maior índice para o menor. Respeita a região.
  // ------------------------------------------------------------------
  function renderAlerts() {
    const list = $("alertsList");
    if (!list) return; // página do mapa não tem a lista
    const C = window.CondicoesData;
    if (!state.cond) {
      list.innerHTML = `<li class="dash-empty">Carregando...</li>`;
      return;
    }
    const ym = selectedYm();
    const rows = condRegiao(state.cond.data)
      .map((m) => ({ m, r: condDoMes(m, ym) }))
      .filter(({ r }) => r && C.nivelDe(r.nivel).ordem >= 1)
      .sort((a, b) => C.nivelDe(b.r.nivel).ordem - C.nivelDe(a.r.nivel).ordem || b.r.indice - a.r.indice)
      .slice(0, 5);

    if (!rows.length) {
      list.innerHTML = `<li class="dash-empty">${state.condErro ? "Não foi possível carregar as condições propícias." : `Sem alertas para ${C.mesLabel(ym)}.`}</li>`;
      return;
    }

    list.innerHTML = rows
      .map(({ m, r }) => {
        const n = C.nivelDe(r.nivel);
        const tox = C.siglaToxina(m.toxina);
        return `
        <li class="alert-item">
          <span class="alert-item__icon alert-item__icon--${n.key}">
            <span class="material-symbols-outlined" aria-hidden="true">warning</span>
          </span>
          <div>
            <p class="alert-item__text"><a href="${escapeHtml(C.url(m.municipio, m.especie))}">${escapeHtml(`${m.municipio} — ${m.especie}${tox ? ` (${tox})` : ""}`)}</a></p>
            <p class="alert-item__date">${escapeHtml(`${n.label} · ${C.mesLabel(r.mes, true)}${r.tipo === "previsto" ? " (previsto)" : ""} · índice ${fmtNumber(r.indice, 2)}`)}</p>
          </div>
        </li>`;
      })
      .join("");
  }

  // ------------------------------------------------------------------
  // Filtros / mês
  // ------------------------------------------------------------------
  // Mês atual (opção vazia) + os MONTHS_AHEAD seguintes.
  function populateMonthFilter() {
    const select = $("filterMonth");
    select.innerHTML = "";
    for (let i = 0; i <= MONTHS_AHEAD; i++) {
      const idx = NOW_IDX + i;
      const opt = document.createElement("option");
      opt.value = i === 0 ? "" : ymOf(idx);
      opt.textContent = i === 0 ? `${monthLabel(idx)} (atual)` : monthLabel(idx);
      select.appendChild(opt);
    }
  }

  // Troca o mês mostrado sem consultar a API de novo (o mês é filtrado
  // aqui): mapa, cards, alertas e painel acompanham. "" = mês atual.
  function setMonth(ym) {
    const value = !ym || idxOfYm(ym) === NOW_IDX ? "" : ym;
    state.filters.month = value;
    $("filterMonth").value = value;
    state.mapData = monthData(state.data);
    renderSummary();
    renderMarkers();
    renderAlerts();
    renderTimeline();
  }

  // Linha do tempo sobre o mapa (só na página do mapa): um botão por mês
  // e um "play" que percorre os meses sozinho.
  let playTimer = null;
  const PLAY_MS = 1800;

  function renderTimeline() {
    const el = $("mapTimeline");
    if (!el) return;
    const sel = idxOfYm(selectedYm());
    el.querySelectorAll("[data-ym]").forEach((b) => {
      const on = idxOfYm(b.dataset.ym) === sel;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  function buildTimeline() {
    const el = $("mapTimeline");
    if (!el) return;
    const meses = Array.from({ length: MONTHS_AHEAD + 1 }, (_, i) => NOW_IDX + i);
    el.innerHTML =
      `<button type="button" class="mt-play" id="mapPlay" aria-label="Animar os meses" title="Animar os meses">
        <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
      </button>` +
      meses
        .map(
          (idx, i) => `<button type="button" class="mt-mes" data-ym="${ymOf(idx)}" aria-pressed="false">
            <strong>${MONTH_NAMES[idx % 12].slice(0, 3)}/${String(Math.floor(idx / 12)).slice(-2)}</strong>
            <small>${i === 0 ? "agora" : `+${i} ${i === 1 ? "mês" : "meses"}`}</small>
          </button>`
        )
        .join("");
    el.querySelectorAll("[data-ym]").forEach((b) =>
      b.addEventListener("click", () => {
        stopPlay();
        setMonth(b.dataset.ym);
      })
    );
    $("mapPlay").addEventListener("click", () => (playTimer ? stopPlay() : startPlay()));
    renderTimeline();
  }

  function startPlay() {
    const step = () => {
      const next = idxOfYm(selectedYm()) + 1;
      setMonth(ymOf(next > NOW_IDX + MONTHS_AHEAD ? NOW_IDX : next));
    };
    step();
    playTimer = setInterval(step, PLAY_MS);
    $("mapPlay").classList.add("is-playing");
    $("mapPlay").querySelector(".material-symbols-outlined").textContent = "pause";
    $("mapPlay").setAttribute("aria-label", "Pausar");
  }
  function stopPlay() {
    if (!playTimer) return;
    clearInterval(playTimer);
    playTimer = null;
    $("mapPlay").classList.remove("is-playing");
    $("mapPlay").querySelector(".material-symbols-outlined").textContent = "play_arrow";
    $("mapPlay").setAttribute("aria-label", "Animar os meses");
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
      refreshNow();
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

    // "Colorir por": risco de floração (ML) × algas tóxicas (condições)
    document.querySelectorAll("[data-color-by]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (state.colorBy === btn.dataset.colorBy) return;
        state.colorBy = btn.dataset.colorBy;
        applyColorMode();
        renderMarkers();
      })
    );

    // Zoom (só na página do mapa)
    $("mapZoomIn")?.addEventListener("click", () => window.DashboardMap.zoomBy(1.6));
    $("mapZoomOut")?.addEventListener("click", () => window.DashboardMap.zoomBy(1 / 1.6));
    $("mapZoomReset")?.addEventListener("click", () => window.DashboardMap.resetView());

    // Teclado na página do mapa: ← → percorrem os pontos, + − dão zoom,
    // 0 volta ao litoral inteiro. Ignora quando o foco está num campo.
    if (document.body.classList.contains("map-page")) {
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest("input, select, textarea")) return;
        const acoes = {
          ArrowLeft: () => $("occPrev").click(),
          ArrowRight: () => $("occNext").click(),
          "+": () => window.DashboardMap.zoomBy(1.6),
          "=": () => window.DashboardMap.zoomBy(1.6),
          "-": () => window.DashboardMap.zoomBy(1 / 1.6),
          0: () => window.DashboardMap.resetView(),
        };
        if (!acoes[e.key]) return;
        e.preventDefault();
        acoes[e.key]();
      });
    }

    // "Ver detalhes completos": as condições propícias do município do ponto.
    $("occDetailsBtn")?.addEventListener("click", () => {
      const p = occList[occIndex];
      const C = window.CondicoesData;
      const regs = p && state.cond ? C.doPonto(state.cond.data, p) : [];
      window.location.href = C.url(regs[0] ? regs[0].municipio : p && p.region);
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
      window.location.href = histMunicipio
        ? `historico-ocorrencias.html?municipio=${encodeURIComponent(histMunicipio)}`
        : "historico-ocorrencias.html";
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
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    if (!guardSession()) return;

    renderUser();
    populateMonthFilter();
    loadWeather();
    setInterval(refreshNow, WEATHER_REFRESH_MS);
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
      onSelect: (id) => {
        showOccByPointId(id);
        focusActivePoint();
      },
      tooltip: pinTooltip,
    });
    applyColorMode();
    buildTimeline();

    loadHealth();
    loadCoastalRisks();
    loadCondicoes();
  });
})();
