// Menu do sino do topo: prévia das notificações mais recentes.
// Usa a mesma regra da Central de alertas (js/alertas.js): cada registro
// região/mês já ocorrido de GET /ml/coastal-risks vira uma notificação,
// com a severidade tirada da probabilidade (ou do risk_level).
window.NotifMenu = (function () {
  var MAX = 5;
  var MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  var SEV = {
    muito_alto: { color: "#ff383c", title: "Floração identificada em " },
    alto: { color: "#f08c28", title: "Risco de floração em " },
    moderado: { color: "#f5c518", title: "Condições favoráveis à floração em " },
    baixo: { color: "#00c05d", title: "Condições normalizadas em " },
  };
  var RANK = { muito_alto: 4, alto: 3, moderado: 2, baixo: 1 };

  var now = new Date();
  var nowIdx = now.getFullYear() * 12 + now.getMonth();

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function periodIndex(p) {
    return p.year && p.month ? p.year * 12 + (p.month - 1) : nowIdx;
  }

  function severityOf(p) {
    if (typeof p.probability === "number") {
      return p.probability >= 0.85 ? "muito_alto" : p.probability >= 0.6 ? "alto" : p.probability >= 0.35 ? "moderado" : "baixo";
    }
    var norm = String(p.risk_level || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase();
    if (norm.indexOf("ALT") === 0) return "alto";
    if (norm.indexOf("MED") === 0) return "moderado";
    return "baixo";
  }

  var btn, panel, list, onRefresh;

  function build() {
    var host = btn.parentElement;
    host.classList.add("notif-host");
    panel = document.createElement("div");
    panel.className = "notif-menu";
    panel.id = "notifMenu";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Notificações");
    panel.innerHTML =
      '<header class="notif-menu__head">' +
      '<p class="notif-menu__title">Notificações</p>' +
      '<button type="button" class="notif-menu__refresh" id="notifRefresh" title="Atualizar dados" aria-label="Atualizar dados">' +
      '<span class="material-symbols-outlined" aria-hidden="true">refresh</span></button>' +
      "</header>" +
      '<ul class="notif-menu__list" id="notifList"></ul>' +
      '<a class="notif-menu__all" href="alertas.html">Ver todas as notificações' +
      '<span class="material-symbols-outlined" aria-hidden="true">chevron_right</span></a>';
    host.appendChild(panel);
    list = panel.querySelector("#notifList");

    panel.querySelector("#notifRefresh").addEventListener("click", function (e) {
      var r = e.currentTarget;
      r.classList.add("spin");
      setTimeout(function () {
        r.classList.remove("spin");
      }, 500);
      if (onRefresh) onRefresh();
      load();
    });
  }

  function render(items) {
    if (!items.length) {
      list.innerHTML = '<li class="notif-menu__empty">Sem notificações.</li>';
      return;
    }
    list.innerHTML = items
      .map(function (it) {
        var p = it.p;
        var region = p.region || "ponto monitorado";
        return (
          '<li class="notif-item" style="--sev:' + SEV[it.sev].color + '">' +
          '<span class="material-symbols-outlined notif-item__icon" aria-hidden="true">warning</span>' +
          "<div>" +
          '<p class="notif-item__title">' + escapeHtml(SEV[it.sev].title + region) + "</p>" +
          '<p class="notif-item__sub">' +
          escapeHtml(p.region || "—") +
          (typeof p.probability === "number" ? " · Probabilidade " + Math.round(p.probability * 100) + "%" : "") +
          "</p></div>" +
          '<time class="notif-item__time">' +
          escapeHtml(MONTHS[it.idx % 12] + "/" + Math.floor(it.idx / 12)) +
          "</time></li>"
        );
      })
      .join("");
  }

  // Mais recentes primeiro; dentro do mesmo mês, os mais graves no topo.
  function load() {
    list.innerHTML = '<li class="notif-menu__empty">Carregando...</li>';
    return window.AlgamarAPI.apiFetch("/ml/coastal-risks").then(
      function (res) {
        var items = (res.data || [])
          .map(function (p) {
            return { p: p, idx: periodIndex(p), sev: severityOf(p) };
          })
          .filter(function (it) {
            return it.idx <= nowIdx;
          })
          .sort(function (a, b) {
            return (
              b.idx - a.idx ||
              RANK[b.sev] - RANK[a.sev] ||
              (b.p.probability || 0) - (a.p.probability || 0)
            );
          })
          .slice(0, MAX);
        render(items);
      },
      function (err) {
        if (err && err.status === 401) return;
        list.innerHTML =
          '<li class="notif-menu__empty">' +
          escapeHtml(err && err.status === 0 ? "Sem conexão com a API." : "Não foi possível carregar as notificações.") +
          "</li>";
      }
    );
  }

  function open() {
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    load();
  }
  function close() {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  // refreshFn: o que a tela faz ao pedir "Atualizar dados" dentro do menu.
  function init(refreshFn) {
    btn = document.getElementById("topRefresh");
    if (!btn || panel) return;
    onRefresh = refreshFn;
    btn.setAttribute("aria-label", "Notificações");
    btn.setAttribute("title", "Notificações");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    build();

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (panel.hidden) open();
      else close();
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target)) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        close();
        btn.focus();
      }
    });
  }

  return { init: init };
})();
