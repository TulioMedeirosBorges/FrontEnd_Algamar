// Menu do sino do topo: prévia das notificações.
// Vem de GET /ml/condicoes-propicias (tela "Condições Propícias"): cada
// município × espécie tóxica com o mar propício ou parcialmente propício
// AGORA vira uma notificação, e também os meses seguintes previstos como
// propícios. Só mês atual em diante — nada de meses que já passaram.
// O contador do sino é o número de notificações de AGORA (sem as previsões).
window.NotifMenu = (function () {
  var MAX = 5;
  var MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  // Mesmas cores dos níveis em js/condicoes-data.js (que não carrega em todas as telas).
  var SEV = {
    "propício": { color: "#f08c28", rank: 2, title: "Condições propícias para " },
    "parcialmente propício": { color: "#f5c518", rank: 1, title: "Condições parcialmente propícias para " },
  };

  var now = new Date();
  var nowYm = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mesCurto(ym) {
    var parts = String(ym || "").split("-");
    return parts.length === 2 ? MONTHS[Number(parts[1]) - 1] + "/" + parts[0].slice(-2) : "—";
  }

  // "diarreica (DSP)" -> "DSP"
  function sigla(t) {
    return String(t || "").replace(/.*\((.*)\).*/, "$1");
  }

  // Lista completa (já ordenada) a partir da resposta da API.
  function itemsFrom(res) {
    var items = [];
    (res.data || []).forEach(function (m) {
      var regs = [m.agora].concat(m.proximos || []);
      regs.forEach(function (r, i) {
        if (!r || !r.mes || r.mes < nowYm || !SEV[r.nivel]) return;
        // Agora: propício ou parcial. Próximos meses: só os previstos como propícios.
        if (i > 0 && r.nivel !== "propício") return;
        items.push({ m: m, r: r, previsto: i > 0 });
      });
    });
    return items.sort(function (a, b) {
      return (
        a.r.mes.localeCompare(b.r.mes) ||
        SEV[b.r.nivel].rank - SEV[a.r.nivel].rank ||
        (b.r.indice || 0) - (a.r.indice || 0)
      );
    });
  }

  var count = null; // notificações do mês atual (null = ainda não carregou)

  function applyBadge() {
    var badge = document.getElementById("alertBadge");
    if (!badge) return;
    var n = count || 0;
    // Preferência "Alertas de risco de floração" (Configurações) desliga o contador.
    if (window.UserPrefs && !window.UserPrefs.get("notifRisk")) n = 0;
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.hidden = n <= 0;
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
      list.innerHTML = '<li class="notif-menu__empty">Sem condições propícias para espécies tóxicas.</li>';
      return;
    }
    list.innerHTML = items
      .map(function (it) {
        var m = it.m, r = it.r;
        var sev = SEV[r.nivel];
        var href = "condicoes-propicias.html?" + new URLSearchParams({ municipio: m.municipio, especie: m.especie });
        return (
          '<li class="notif-item" style="--sev:' + sev.color + ';cursor:pointer" data-href="' + escapeHtml(href) + '">' +
          '<span class="material-symbols-outlined notif-item__icon" aria-hidden="true">warning</span>' +
          "<div>" +
          '<p class="notif-item__title">' + escapeHtml((it.previsto ? "Previsão: " : "") + sev.title + m.especie + " em " + m.municipio) + "</p>" +
          '<p class="notif-item__sub">' +
          escapeHtml(
            (m.macro_region || "—") +
              (typeof r.indice === "number" ? " · Índice " + r.indice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "") +
              (m.toxina ? " · " + sigla(m.toxina) : "")
          ) +
          "</p></div>" +
          '<time class="notif-item__time">' + escapeHtml(mesCurto(r.mes)) + "</time></li>"
        );
      })
      .join("");
  }

  function fetchItems() {
    return window.AlgamarAPI.apiFetch("/ml/condicoes-propicias").then(function (res) {
      var items = itemsFrom(res);
      count = items.filter(function (it) { return !it.previsto; }).length;
      applyBadge();
      return items;
    });
  }

  function load() {
    list.innerHTML = '<li class="notif-menu__empty">Carregando...</li>';
    return fetchItems().then(
      function (items) {
        render(items.slice(0, MAX));
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
    // O contador aparece já ao abrir a tela, sem precisar clicar no sino.
    fetchItems().catch(function () {});

    list.addEventListener("click", function (e) {
      var li = e.target.closest("li[data-href]");
      if (li) window.location.href = li.dataset.href;
    });

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

  return { init: init, applyBadge: applyBadge };
})();
