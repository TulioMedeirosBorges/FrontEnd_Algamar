var PREVE_REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

function preveClamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

/* progress of an element entering the viewport: 0 before it starts
   entering, 1 once it has travelled `dur` viewport-heights past the
   `ini` trigger line. Mirrors the scroll-linked easing used across
   this page's other scrubbed effects. */
function preveEntrada(el, ini, dur) {
  var r = el.getBoundingClientRect();
  return preveClamp((innerHeight * ini - r.top) / (innerHeight * dur), 0, 1);
}

(function () {
  var rail = document.getElementById("sideRail");
  var fill = document.getElementById("railFill");
  var marker = document.getElementById("railMarker");
  var label = document.getElementById("railLabel");
  var percentEl = document.getElementById("railPercent");
  if (!rail || !fill || !label || !percentEl) return;

  var checkpoints = Array.prototype.slice
    .call(document.querySelectorAll("[data-checkpoint]"))
    .map(function (el) {
      return { el: el, text: el.getAttribute("data-checkpoint-label") };
    });

  var heroInner = document.querySelector(".preve-hero .container");
  var cadeiaSec = document.getElementById("cadeia");
  var connectorFill = document.getElementById("connectorFill");
  var achadoSec = document.getElementById("achado");
  var fraco = document.querySelector(".preve-compare__card--dim");
  var escalasSec = document.getElementById("escalas");
  var escs = Array.prototype.slice.call(document.querySelectorAll(".preve-scale"));

  function updateRailAndSonar() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - innerHeight;
    var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progress = preveClamp(progress, 0, 100);

    fill.style.height = progress + "%";
    if (marker) marker.style.top = progress + "%";
    percentEl.textContent = Math.round(progress) + "%";

    var current = checkpoints[0];
    for (var i = 0; i < checkpoints.length; i++) {
      if (checkpoints[i].el.getBoundingClientRect().top <= 160) current = checkpoints[i];
    }
    if (current) label.textContent = current.text;
  }

  function updateHeroParallax() {
    if (!heroInner || PREVE_REDUCED_MOTION) return;
    var q = preveClamp(scrollY / (innerHeight * 0.9), 0, 1);
    heroInner.style.transform = "translateY(" + (q * 50).toFixed(1) + "px) scale(" + (1 - q * 0.04).toFixed(3) + ")";
    heroInner.style.opacity = (1 - q * 0.9).toFixed(2);
  }

  function updateConnector() {
    if (!cadeiaSec || !connectorFill) return;
    connectorFill.style.width = preveEntrada(cadeiaSec, 0.85, 0.55) * 100 + "%";
  }

  function updateAchado() {
    if (!achadoSec || !fraco || PREVE_REDUCED_MOTION) return;
    var p = preveEntrada(achadoSec, 0.8, 0.7);
    fraco.style.opacity = (1 - p * 0.25).toFixed(2);
    fraco.style.filter = "grayscale(" + (p * 100).toFixed(0) + "%)";
    fraco.style.transform = "scale(" + (1 - p * 0.02).toFixed(3) + ")";
  }

  function updateEscalas() {
    if (!escalasSec || !escs.length || PREVE_REDUCED_MOTION) return;
    var p = preveEntrada(escalasSec, 0.9, 1.05);
    var i = p <= 0.02 ? -1 : Math.min(escs.length - 1, Math.floor(p * (escs.length + 0.1)));
    escs.forEach(function (e, k) {
      e.classList.toggle("is-focus", k === i);
    });
  }

  var throttled = false;
  function onScroll() {
    if (throttled) return;
    throttled = true;
    requestAnimationFrame(function () {
      updateRailAndSonar();
      updateHeroParallax();
      updateConnector();
      updateAchado();
      updateEscalas();
      if (typeof preveUpdateFases === "function") preveUpdateFases();
      throttled = false;
    });
  }

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  updateRailAndSonar();
  updateConnector();
  updateEscalas();
})();

var preveUpdateFases = null;

(function () {
  var root = document.getElementById("preveStepper");
  var fasesScroll = document.getElementById("fases");
  if (!root) return;

  var digit = document.getElementById("stepperDigit");
  var railFill = document.getElementById("stepperRailFill");
  var content = document.getElementById("stepperContent");
  var alertEl = document.getElementById("stepperAlert");
  var title = document.getElementById("stepperTitle");
  var gatilhos = document.getElementById("stepperGatilhos");
  var acoes = document.getElementById("stepperAcoes");
  var ticks = Array.prototype.slice.call(root.querySelectorAll(".preve-stepper__tick"));
  var swapTimer = null;

  var stages = {
    1: {
      alert: "Alerta 1",
      title: "Suspeita",
      fill: 17,
      gatilhos:
        "Manchas atípicas ou espuma abundante na água. Mortandade anormal de peixes ou invertebrados. " +
        "Notificação no SUS de diarreia ou parestesia após consumo recente de moluscos. Floração ativa " +
        "reportada no Paraná ou em Santa Catarina.",
      acoes:
        "Notificação preventiva a maricultores e extratores, ordem de amostragem de água direcionada e aviso " +
        "à Vigilância Sanitária e Epidemiológica para intensificar o rastreio hospitalar.",
    },
    2: {
      alert: "Alerta 2",
      title: "Confirmação na água",
      fill: 54,
      gatilhos:
        "Laudo laboratorial com densidade de microalgas potencialmente tóxicas igual ou acima do limite " +
        "regulatório de segurança.",
      acoes:
        "Sugestão de suspensão imediata da despesca, bloqueio da emissão de guias de transporte animal no " +
        "sistema de defesa agropecuária, notas técnicas a banhistas e comerciantes e ordem urgente de coleta " +
        "de bivalves para análise de biotoxina.",
    },
    3: {
      alert: "Alerta 3",
      title: "Confirmação na carne",
      fill: 100,
      gatilhos:
        "Laudo confirmatório por HPLC ou LC-MS/MS indicando contaminação dos tecidos do molusco acima do " +
        "tolerável.",
      acoes:
        "Interdição sanitária obrigatória dos estoques da área afetada, alerta público à imprensa " +
        "recomendando cessar o consumo de mariscos da região e monitoramento laboratorial contínuo da " +
        "detoxificação natural.",
    },
  };

  var currentStage = "1";

  function applyText(data) {
    alertEl.textContent = data.alert;
    title.textContent = data.title;
    gatilhos.textContent = data.gatilhos;
    acoes.textContent = data.acoes;
  }

  function setStage(stage, continuousFill) {
    var data = stages[stage];
    if (!data) return;
    var stageStr = String(stage);
    var changed = stageStr !== currentStage;
    currentStage = stageStr;

    digit.textContent = stage;
    railFill.style.height = (typeof continuousFill === "number" ? continuousFill : data.fill) + "%";
    ticks.forEach(function (tick) {
      tick.classList.toggle("is-active", tick.getAttribute("data-stage") === stageStr);
    });

    if (!changed) return;

    if (!content || PREVE_REDUCED_MOTION) {
      applyText(data);
      return;
    }

    clearTimeout(swapTimer);
    content.classList.add("is-swapping");
    swapTimer = setTimeout(function () {
      applyText(data);
      content.classList.remove("is-swapping");
    }, 280);
  }

  function isPinned() {
    return !PREVE_REDUCED_MOTION && innerWidth > 1024 && fasesScroll;
  }

  preveUpdateFases = function () {
    if (!isPinned()) return;
    var alt = fasesScroll.offsetHeight - innerHeight;
    if (alt <= 0) return;
    var p = preveClamp(-fasesScroll.getBoundingClientRect().top / alt, 0, 1);
    var stage = p < 0.34 ? "1" : p < 0.68 ? "2" : "3";
    if (stage !== currentStage || Math.abs(p * 100 - parseFloat(railFill.style.height)) > 0.3) {
      setStage(stage, p * 100);
    }
  };

  /* A click sets the stage directly. It intentionally does NOT also
     scroll the page there: while pinned, a smooth-scroll's transit
     passes through the other stages' scroll ranges on the way, and
     preveUpdateFases would immediately re-derive (and fight) the
     stage from that in-flight position. Scroll stays the single
     source of truth while pinned; a click is a direct preview that
     the next scroll tick will naturally reconcile. */
  ticks.forEach(function (tick) {
    tick.addEventListener("click", function () {
      setStage(tick.getAttribute("data-stage"));
    });
  });
})();
