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

  // Categoria exibida no mapa (cor do pino) — 4 vias, igual ao design
  // original: Pouca indicação / Florações identificadas / Risco de
  // floração / Previsão de floração. A API só devolve risk_level em 3
  // níveis (ALTO/MÉDIO/BAIXO); ver categoryOf() abaixo para a derivação.
  // Mesmas cores oficiais do software (--dash-green/red/yellow/blue em
  // css/dashboard.css) — os pinos do mapa precisam bater com a legenda e
  // o resto do painel, que já usam essas variáveis.
  var CAT_COLOR = { baixa: "#00c05d", identificada: "#ff383c", risco: "#f5c518", previsao: "#0080ff" };
  var CAT_LABEL = {
    baixa: "Pouca indicação",
    identificada: "Florações identificadas",
    risco: "Risco de floração",
    previsao: "Previsão de floração",
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

  function riskKeyOf(level) {
    if (!level) return "baixo";
    var norm = level
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
    if (norm.indexOf("ALT") === 0) return "alto";
    if (norm.indexOf("MED") === 0) return "medio";
    return "baixo";
  }

  // Deriva a categoria de exibição (4 vias) a partir do risk_level (3 vias)
  // que a API realmente devolve, mais uma checagem de data: um registro cujo
  // mês/ano ainda não chegou é uma PREVISÃO do modelo, não uma leitura já
  // observada — não é um dado inventado, só uma leitura do que já existe
  // (point.month/point.year) comparada à data de hoje.
  function categoryOf(point) {
    var now = new Date();
    var isFuture =
      point.year > now.getFullYear() || (point.year === now.getFullYear() && point.month > now.getMonth() + 1);
    if (isFuture) return "previsao";
    var risk = riskKeyOf(point.risk_level);
    if (risk === "alto") return "identificada";
    if (risk === "medio") return "risco";
    return "baixa";
  }

  // Gradiente de INTENSIDADE (legenda "Baixo/Moderado/Alta/Muito Alta"),
  // independente da categoria acima — mesma escala do protótipo original,
  // dirigida por `probability`. Categoria = "o que é"; intensidade = "o
  // quão forte", por isso pino e halo usam cores diferentes.
  function valueToColor(t) {
    var stops = [
      [0.0, [90, 200, 110]],
      [0.35, [235, 215, 70]],
      [0.65, [240, 140, 40]],
      [1.0, [225, 45, 45]],
    ];
    var i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    var a = stops[i],
      b = stops[i + 1];
    var f = (t - a[0]) / (b[0] - a[0] || 1);
    return [
      Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
      Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
      Math.round(a[1][2] + (b[1][2] - a[1][2]) * f),
    ];
  }
  function rgbStr(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";
  }

  function renderPoint(point) {
    if (typeof point.latitude !== "number" || typeof point.longitude !== "number") return;
    var xy = latLonToPixel(point.latitude, point.longitude);
    var cat = categoryOf(point);
    var pinColor = pinColorFn ? pinColorFn(point) : CAT_COLOR[cat];
    var probability = typeof point.probability === "number" ? point.probability : 0.3;
    var blobColor = valueToColor(probability);
    var radiusWorld = 55 + probability * 130;

    var entry = hotspotEls[point.id];
    if (!entry) {
      var root = document.createElement("div");
      root.className = "map-hotspot";
      var blob = document.createElement("div");
      blob.className = "map-hotspot__blob";
      var marker = document.createElement("button");
      marker.type = "button";
      marker.className = "map-hotspot__marker";
      root.appendChild(blob);
      root.appendChild(marker);
      hotspotsLayer.appendChild(root);
      marker.addEventListener("click", function (e) {
        e.stopPropagation();
        if (dragMoved) return; // clique disparado ao soltar um arraste — ignora
        if (onSelectCb) onSelectCb(point.id, e.clientX, e.clientY);
      });
      entry = { root: root, blob: blob, marker: marker };
      hotspotEls[point.id] = entry;
    }
    entry.root.style.left = xy[0] + "px";
    entry.root.style.top = xy[1] + "px";
    entry.blob.style.width = radiusWorld * 2 + "px";
    entry.blob.style.height = radiusWorld * 2 + "px";
    entry.blob.style.background =
      "radial-gradient(circle, " +
      rgbStr(blobColor, 0.72) +
      " 0%, " +
      rgbStr(blobColor, 0.4) +
      " 45%, " +
      rgbStr(blobColor, 0) +
      " 72%)";
    entry.marker.style.background = pinColor;
    entry.marker.title = point.region + " — " + (pinLabelFn ? pinLabelFn(point) : CAT_LABEL[cat]);
    entry.marker.setAttribute("aria-label", "Ver detalhes: " + point.region);
    entry.root.dataset.cat = cat;
    entry.point = point;
  }

  function setPoints(nextPoints) {
    points = nextPoints || [];
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
