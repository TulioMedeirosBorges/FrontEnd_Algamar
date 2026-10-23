// Motor do mapa do dashboard — projeção geográfica real (equiretangular)
// sobre o mosaico de satélite do litoral paulista.
//
// Adaptado do protótipo "Litoral Paulista" (artifact). Lá os pontos vinham
// de um banco compartilhado do artifact (window.claude.use('db')); aqui eles
// vêm de verdade da API (GET /api/ml/coastal-risks), então essa dependência
// foi removida — este módulo só desenha o que `setPoints()` receber.
window.DashboardMap = (function () {
  // minLon, minLat, maxLon, maxLat — mesmo bbox usado para gerar os mosaicos
  // coast-overview.jpg / coast-hillshade.jpg.
  var BBOX = [-48.1, -25.12, -44.75, -23.3];
  // Dimensões naturais das imagens em assets/ (redimensionadas a partir do
  // original 4879x2906 do artifact, mesma proporção).
  var NATURAL = { w: 2600, h: 1549 };

  // Rótulos cartográficos das cidades costeiras — não são dados do backend,
  // são só o mapa-base (equivalente a nomes de rua num mapa comum).
  var TOWNS = [
    ["Cananéia", 134.4, 1459.5],
    ["Iguape", 422.7, 1196.5],
    ["Peruíbe", 854.3, 866.0],
    ["Itanhaém", 1017.5, 748.5],
    ["Praia Grande", 1317.2, 598.0],
    ["Santos", 1370.9, 559.8],
    ["Guarujá", 1430.8, 587.2],
    ["Bertioga", 1521.6, 469.1],
    ["São Sebastião", 2090.9, 389.9],
    ["Ilhabela", 2127.6, 404.7],
    ["Caraguatatuba", 2085.3, 271.2],
    ["Ubatuba", 2340.7, 113.0],
  ];

  // Categoria do ponto (camadas do painel "Camadas de mapa"): Pouca
  // indicação / Florações identificadas / Risco de floração — ver
  // categoryOf(). A COR do pino e do halo não vem daqui: segue o nível do
  // ML (AlgamarRisk em api-client.js), igual à legenda "Intensidade de
  // floração": baixo verde, moderado amarelo, alto laranja, muito alto
  // vermelho.
  var CAT_LABEL = {
    baixa: "Pouca indicação",
    identificada: "Florações identificadas",
    risco: "Risco de floração",
  };

  var stage, canvas, ov, hs, boundarySvg, labelsLayer, hotspotsLayer, scaleBarEl, scaleLabelsEl;
  var scale = 1;
  var points = [];
  var hotspotEls = {};
  var onSelectCb = null;
  // Opcionais (passados no init): permitem a uma tela pintar/rotular os pinos
  // por outro critério que não a categoria padrão (ex.: Previsões usa faixas
  // de probabilidade). Sem eles, tudo continua como antes.
  var pinColorFn = null;
  var pinLabelFn = null;

  // Zoom (roda do mouse / pinça) + arraste (pan). `zoom` multiplica a
  // escala "cover": 1 = o mapa inteiro cobrindo o palco (o mais afastado
  // possível sem aparecer tarja preta), MAX_ZOOM = o mais aproximado.
  var ZOOM = 1.35;
  var MIN_ZOOM = 1,
    MAX_ZOOM = 10;
  var zoom = ZOOM;
  var coverScale = 1;
  var pinchDist = 0;
  var panX = 0,
    panY = 0;
  // Ponto (coords naturais da imagem) que panTo() pediu para manter no centro
  // do palco; fit() o respeita quando o palco muda de tamanho. Arrastar ou
  // dar zoom limpa — daí em diante o usuário manda na vista.
  var focusPt = null;
  var dragging = false,
    dragMoved = false;
  var dragStartX = 0,
    dragStartY = 0,
    panStartX = 0,
    panStartY = 0;


  function stageSize() {
    return { w: stage.clientWidth, h: stage.clientHeight };
  }

  function latLonToPixel(lat, lon) {
    var px = ((lon - BBOX[0]) / (BBOX[2] - BBOX[0])) * NATURAL.w;
    var py = ((BBOX[3] - lat) / (BBOX[3] - BBOX[1])) * NATURAL.h;
    return [px, py];
  }

  // "Cover" (não "contain"): a imagem sempre preenche o palco inteiro, sem
  // nunca sobrar tarja/borda preta nas laterais — e ZOOM aproxima mais um
  // pouco em cima disso. Como agora a imagem fica maior que o palco, ela é
  // navegada arrastando (pan) em vez de encolhida para caber inteira.
  function fit() {
    if (!stage) return;
    var s = stageSize();
    if (!s.w || !s.h) return;
    coverScale = Math.max(s.w / NATURAL.w, s.h / NATURAL.h);
    scale = coverScale * zoom;
    var w = NATURAL.w * scale,
      h = NATURAL.h * scale;
    panX = focusPt ? s.w / 2 - focusPt[0] * scale : (s.w - w) / 2;
    panY = focusPt ? s.h / 2 - focusPt[1] * scale : (s.h - h) / 2;
    clampPan();
    applyTransform();
    updateInverseScale();
    updateScaleBar();
  }

  // Mantém a imagem sempre cobrindo o palco: a borda visível nunca pode
  // passar para dentro do palco, senão apareceria a tarja preta de novo.
  function clampPan() {
    var s = stageSize();
    var w = NATURAL.w * scale,
      h = NATURAL.h * scale;
    var minX = Math.min(0, s.w - w),
      minY = Math.min(0, s.h - h);
    panX = Math.max(minX, Math.min(0, panX));
    panY = Math.max(minY, Math.min(0, panY));
  }

  function applyTransform() {
    canvas.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + scale + ")";
  }

  // Aproxima/afasta mantendo fixo o ponto do mapa que está sob (cx, cy)
  // — coordenadas relativas ao palco.
  function zoomAt(factor, cx, cy) {
    var next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (next === zoom) return;
    focusPt = null;
    var nx = (cx - panX) / scale,
      ny = (cy - panY) / scale;
    zoom = next;
    scale = coverScale * zoom;
    panX = cx - nx * scale;
    panY = cy - ny * scale;
    clampPan();
    applyTransform();
    updateInverseScale();
    updateScaleBar();
  }

  function stagePoint(clientX, clientY) {
    var rect = stage.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }

  function touchDist(t) {
    var dx = t[0].clientX - t[1].clientX,
      dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function dragStart(x, y) {
    dragging = true;
    dragMoved = false;
    dragStartX = x;
    dragStartY = y;
    panStartX = panX;
    panStartY = panY;
    if (stage) stage.classList.add("is-dragging");
  }
  function dragMove(x, y) {
    if (!dragging) return;
    var dx = x - dragStartX,
      dy = y - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragMoved = true;
      focusPt = null;
    }
    panX = panStartX + dx;
    panY = panStartY + dy;
    clampPan();
    applyTransform();
  }
  function dragEnd() {
    dragging = false;
    if (stage) stage.classList.remove("is-dragging");
  }

  // Arraste com o mouse (um botão) ou um dedo no touch; zoom com a roda do
  // mouse ou com dois dedos (pinça). A escala do litoral acompanha o zoom.
  function bindPan() {
    stage.addEventListener("mousedown", function (e) {
      if (e.button !== 0) return;
      dragStart(e.clientX, e.clientY);
      e.preventDefault();
    });
    window.addEventListener("mousemove", function (e) {
      dragMove(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", dragEnd);

    stage.addEventListener(
      "touchstart",
      function (e) {
        if (e.touches.length === 2) {
          dragEnd();
          pinchDist = touchDist(e.touches);
          return;
        }
        if (e.touches.length !== 1) return;
        dragStart(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    stage.addEventListener(
      "touchmove",
      function (e) {
        if (e.touches.length === 2 && pinchDist) {
          var d = touchDist(e.touches);
          var mid = stagePoint(
            (e.touches[0].clientX + e.touches[1].clientX) / 2,
            (e.touches[0].clientY + e.touches[1].clientY) / 2
          );
          zoomAt(d / pinchDist, mid[0], mid[1]);
          pinchDist = d;
          e.preventDefault();
          return;
        }
        if (!dragging || e.touches.length !== 1) return;
        dragMove(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
      },
      { passive: false }
    );
    stage.addEventListener("touchend", function (e) {
      if (e.touches.length < 2) pinchDist = 0;
      dragEnd();
    });
    stage.addEventListener("touchcancel", function () {
      pinchDist = 0;
      dragEnd();
    });

    stage.addEventListener(
      "wheel",
      function (e) {
        e.preventDefault();
        var delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
        var p = stagePoint(e.clientX, e.clientY);
        zoomAt(Math.exp(-delta * 0.0015), p[0], p[1]);
      },
      { passive: false }
    );
  }

  function updateInverseScale() {
    var inv = 1 / scale;
    var i;
    var labelKids = labelsLayer.children;
    for (i = 0; i < labelKids.length; i++) {
      labelKids[i].style.transform = "translateY(-100%) scale(" + inv + ")";
    }
    Object.keys(hotspotEls).forEach(function (id) {
      hotspotEls[id].marker.style.transform = "translate(-50%,-50%) scale(" + inv + ")";
    });
  }

  // Escala baseada na extensão total do litoral paulista (880 km, contando
  // baías, ilhas e recortes). Totalmente afastado (zoom = MIN_ZOOM) a barra
  // representa o litoral inteiro: 0 – 880 km. Ao aproximar, ela mostra só a
  // fração do litoral que cabe na tela: com o dobro de zoom, metade (440 km);
  // com 10× de zoom, um décimo (88 km). A barra tem largura fixa e só os
  // números mudam, divididos em 3 trechos iguais.
  // Obs.: é uma escala proporcional ao litoral, não uma régua em linha reta
  // (em linha reta o mapa inteiro mede ~340 km de largura).
  var COAST_KM = 880;
  var SCALE_BAR_PX = 150;
  function kmText(km) {
    if (km >= 10) return String(Math.round(km));
    return (Math.round(km * 10) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "");
  }
  function updateScaleBar() {
    if (!scaleBarEl) return;
    scaleBarEl.style.width = SCALE_BAR_PX + "px";
    if (!scaleLabelsEl) return;
    var totalKm = COAST_KM * (MIN_ZOOM / zoom);
    var spans = scaleLabelsEl.querySelectorAll("span");
    var parts = spans.length - 1;
    for (var i = 0; i < spans.length; i++) {
      var text = i === 0 ? "0" : kmText((totalKm * i) / parts);
      if (i === parts) text += " km";
      spans[i].textContent = text;
    }
  }

  function buildLabels() {
    TOWNS.forEach(function (t) {
      var el = document.createElement("div");
      el.className = "map-label";
      el.style.left = t[1] + "px";
      el.style.top = t[2] + "px";
      el.innerHTML = '<span class="map-label__dot"></span><span class="map-label__name"></span>';
      el.querySelector(".map-label__name").textContent = t[0];
      labelsLayer.appendChild(el);
    });
  }

  // Linha decorativa ao largo da costa (não é um dado de limite municipal
  // real) — mesma curva do artifact, só para dar contexto visual quando
  // ligada pelo checkbox "Linha ilustrativa".
  function buildBoundary() {
    boundarySvg.setAttribute("width", NATURAL.w);
    boundarySvg.setAttribute("height", NATURAL.h);
    boundarySvg.setAttribute("viewBox", "0 0 " + NATURAL.w + " " + NATURAL.h);
    var offshore = TOWNS.map(function (t) {
      return [t[1] + 112, t[2] + 91];
    });
    var d = "M" + offshore[0][0] + "," + offshore[0][1];
    for (var i = 1; i < offshore.length; i++) {
      var p0 = offshore[i - 1],
        p1 = offshore[i];
      var mx = (p0[0] + p1[0]) / 2,
        my = (p0[1] + p1[1]) / 2;
      d += " Q" + p0[0] + "," + p0[1] + " " + mx + "," + my;
    }
    d += " L" + offshore[offshore.length - 1][0] + "," + offshore[offshore.length - 1][1];
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#5fc9be");
    path.setAttribute("stroke-width", "5");
    path.setAttribute("stroke-dasharray", "22 16");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("opacity", "0.85");
    boundarySvg.appendChild(path);
  }

  function setBoundaryVisible(on) {
    if (boundarySvg) boundarySvg.classList.toggle("on", !!on);
  }

  // Nível do ML (AlgamarRisk, em api-client.js); muito alto entra junto com
  // alto na categoria "identificada".
  function riskKeyOf(level) {
    var k = window.AlgamarRisk.fromLevel(level) || "baixo";
    return k === "muito_alto" ? "alto" : k === "moderado" ? "medio" : k;
  }

  // Deriva a categoria (3 vias) a partir do risk_level (4 níveis) da API.
  function categoryOf(point) {
    var risk = riskKeyOf(point.risk_level);
    if (risk === "alto") return "identificada";
    if (risk === "medio") return "risco";
    return "baixa";
  }

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStr(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  // Atraso estável (por id) para a "respiração" do halo: cada ponto pulsa no
  // seu próprio ritmo em vez de todos juntos, e não muda a cada refresh.
  function phaseOf(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return (Math.abs(h) % 4000) / 1000;
  }

  // Pontos novos entram em cascata (um logo depois do outro); `enterIndex`
  // volta a zero a cada setPoints().
  var enterIndex = 0;

  function renderPoint(point) {
    if (typeof point.latitude !== "number" || typeof point.longitude !== "number") return;
    var xy = latLonToPixel(point.latitude, point.longitude);
    var cat = categoryOf(point);
    var level = window.AlgamarRisk.of(point);
    var pinColor = pinColorFn ? pinColorFn(point) : window.AlgamarRisk.COLOR[level];
    var probability = typeof point.probability === "number" ? point.probability : 0.3;
    var blobColor = hexToRgb(window.AlgamarRisk.COLOR[level]);
    var radiusWorld = 28 + probability * 60;

    var entry = hotspotEls[point.id];
    if (!entry) {
      var root = document.createElement("div");
      root.className = "map-hotspot";
      var blob = document.createElement("div");
      blob.className = "map-hotspot__blob";
      var marker = document.createElement("button");
      marker.type = "button";
      marker.className = "map-hotspot__marker";
      var icon = document.createElement("span");
      icon.className = "map-hotspot__icon";
      icon.setAttribute("aria-hidden", "true");
      marker.appendChild(icon);
      var tag = document.createElement("span");
      tag.className = "map-hotspot__tag";
      marker.appendChild(tag);
      root.style.setProperty("--enter-delay", Math.min(enterIndex++ * 45, 900) + "ms");
      blob.style.setProperty("--phase", "-" + phaseOf(String(point.id)) + "s");
      root.appendChild(blob);
      root.appendChild(marker);
      hotspotsLayer.appendChild(root);
      marker.addEventListener("click", function (e) {
        e.stopPropagation();
        if (dragMoved) return; // clique disparado ao soltar um arraste — ignora
        if (onSelectCb) onSelectCb(point.id, e.clientX, e.clientY);
      });
      entry = { root: root, blob: blob, marker: marker, tag: tag };
      hotspotEls[point.id] = entry;
    }
    entry.root.style.left = xy[0] + "px";
    entry.root.style.top = xy[1] + "px";
    entry.blob.style.width = radiusWorld * 2 + "px";
    entry.blob.style.height = radiusWorld * 2 + "px";
    // Cor do halo numa variável (registrada com @property no CSS): ao trocar
    // o mês na tela de Previsões, a cor desliza em vez de pular.
    entry.blob.style.setProperty("--blob", rgbStr(blobColor, 1));
    entry.marker.style.setProperty("--pin", pinColor);
    entry.marker.title =
      point.region + " — " + (pinLabelFn ? pinLabelFn(point) : "Nível " + window.AlgamarRisk.LABEL[level].toLowerCase());
    entry.tag.textContent = point.region || "Ponto monitorado";
    entry.marker.setAttribute("aria-label", "Ver detalhes: " + point.region);
    entry.root.dataset.cat = cat;
    entry.root.dataset.level = level;
    entry.point = point;
  }

  function setPoints(nextPoints) {
    points = nextPoints || [];
    enterIndex = 0;
    var seen = {};
    points.forEach(function (p) {
      seen[p.id] = true;
      renderPoint(p);
    });
    Object.keys(hotspotEls).forEach(function (id) {
      if (!seen[id]) {
        hotspotEls[id].root.remove();
        delete hotspotEls[id];
      }
    });
    updateInverseScale();
  }

  // predicateFn(point) => boolean. Chamado de novo sempre que o filtro de
  // camadas (risco) ou a busca por região mudam — combina os dois num só
  // critério em vez de duas visibilidades concorrentes.
  function applyFilter(predicateFn) {
    Object.keys(hotspotEls).forEach(function (id) {
      var entry = hotspotEls[id];
      entry.root.style.display = predicateFn(entry.point) ? "" : "none";
    });
  }

  // Centraliza o palco na coordenada (com uma transição curta). Não mexe no
  // zoom; o clampPan garante que nunca apareça tarja fora da imagem.
  function panTo(lat, lon) {
    if (!stage || typeof lat !== "number" || typeof lon !== "number") return;
    var s = stageSize();
    var xy = latLonToPixel(lat, lon);
    focusPt = xy;
    panX = s.w / 2 - xy[0] * scale;
    panY = s.h / 2 - xy[1] * scale;
    clampPan();
    canvas.style.transition = "transform 0.35s ease";
    applyTransform();
    setTimeout(function () {
      canvas.style.transition = "";
    }, 400);
  }

  // Enquadra a vista na caixa que contém todos os pontos com coordenada
  // (com folga). Um ponto só aproxima bastante; nenhum volta à vista padrão.
  // Como o panTo, fica valendo até o usuário arrastar ou dar zoom.
  function fitToPoints(list) {
    if (!stage) return;
    var xs = [],
      ys = [];
    (list || []).forEach(function (p) {
      if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return;
      var xy = latLonToPixel(p.latitude, p.longitude);
      xs.push(xy[0]);
      ys.push(xy[1]);
    });
    if (!xs.length) {
      focusPt = null;
      zoom = ZOOM;
      fit();
      return;
    }
    var minX = Math.min.apply(null, xs),
      maxX = Math.max.apply(null, xs),
      minY = Math.min.apply(null, ys),
      maxY = Math.max.apply(null, ys);
    // Folga em PIXELS DE TELA em volta dos pontos: assim nenhum pino fica
    // embaixo da escala, da legenda ou dos botões que flutuam nas bordas.
    var PAD = 160;
    var s = stageSize();
    if (!s.w || !s.h) return;
    var cover = Math.max(s.w / NATURAL.w, s.h / NATURAL.h);
    var target = Math.min(s.w / (maxX - minX + PAD * 2), s.h / (maxY - minY + PAD * 2));
    zoom = Math.max(MIN_ZOOM, Math.min(6, target / cover));
    focusPt = [(minX + maxX) / 2, (minY + maxY) / 2];
    fit();
  }

  function setActive(id) {
    Object.keys(hotspotEls).forEach(function (key) {
      hotspotEls[key].marker.classList.toggle("map-hotspot__marker--active", key === id);
    });
  }

  function init(opts) {
    stage = document.getElementById(opts.stageId);
    canvas = document.getElementById(opts.canvasId);
    ov = document.getElementById(opts.overviewId);
    hs = document.getElementById(opts.hillshadeId);
    boundarySvg = opts.boundaryId ? document.getElementById(opts.boundaryId) : null;
    labelsLayer = document.getElementById(opts.labelsId);
    hotspotsLayer = document.getElementById(opts.hotspotsId);
    scaleBarEl = opts.scaleBarId ? document.getElementById(opts.scaleBarId) : null;
    scaleLabelsEl = scaleBarEl ? scaleBarEl.parentNode.querySelector(".sb-labels") : null;
    onSelectCb = opts.onSelect || null;
    pinColorFn = opts.pinColor || null;
    pinLabelFn = opts.pinLabel || null;

    ov.style.width = NATURAL.w + "px";
    ov.style.height = NATURAL.h + "px";
    hs.style.width = NATURAL.w + "px";
    hs.style.height = NATURAL.h + "px";
    canvas.style.width = NATURAL.w + "px";
    canvas.style.height = NATURAL.h + "px";

    buildLabels();
    if (boundarySvg) buildBoundary();
    fit();
    bindPan();

    window.addEventListener("resize", fit);
    if (window.ResizeObserver) {
      new ResizeObserver(fit).observe(stage);
    }
  }

  return {
    init: init,
    setPoints: setPoints,
    applyFilter: applyFilter,
    setActive: setActive,
    panTo: panTo,
    fitToPoints: fitToPoints,
    setBoundaryVisible: setBoundaryVisible,
    categoryOf: categoryOf,
    refit: fit,
  };
})();
