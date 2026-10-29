// Parte comum das telas internas (sidebar, topo, sessão, aviso de API).
// Usado pela tela de Previsões; dashboard.js e o Mapa Interativo ainda trazem
// a própria cópia desse código dentro de dashboard.js.
window.DashShell = (function () {
  var MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function guardSession() {
    if (!window.AlgamarAPI.getToken()) {
      window.AlgamarAPI.goToLogin();
      return false;
    }
    return true;
  }

  function renderUser() {
    var user = window.AlgamarAPI.getUser();
    var name = (user && user.fullName) || "Usuário";
    $("userName").textContent = name;
    $("userEmail").textContent = (user && user.email) || "";
    $("userAvatar").textContent =
      name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(function (p) {
          return p[0].toUpperCase();
        })
        .join("") || "?";
    if (window.UserPrefs) window.UserPrefs.applyAvatar($("userAvatar"));
  }

  function showApiWarning(err) {
    $("dashApiWarningText").textContent =
      err && err.status === 0
        ? "Sem conexão com a API."
        : (err && err.message) || "Erro ao consultar a API.";
    $("dashApiWarning").hidden = false;
  }
  function hideApiWarning() {
    $("dashApiWarning").hidden = true;
  }

  function loadHealth() {
    return window.AlgamarAPI.apiFetch("/health").then(hideApiWarning, function (err) {
      if (err.status !== 401) showApiWarning(err);
    });
  }

  // O contador do sino agora vem das notificações de Condições Propícias
  // (js/notifications.js). As telas ainda chamam isto (ex.: ao mudar a
  // preferência em Configurações); o número que mandam é ignorado.
  function setAlertBadge() {
    if (window.NotifMenu) window.NotifMenu.applyBadge();
  }

  // Sair, gaveta lateral (celular) e o menu de notificações do sino.
  function bind(onRefresh) {
    $("logoutBtn").addEventListener("click", function () {
      window.AlgamarAPI.clearSession();
      window.AlgamarAPI.goToLogin();
    });

    var sidebar = $("sidebar");
    var overlay = $("sidebarOverlay");
    var menuToggle = $("menuToggle");
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
    menuToggle.addEventListener("click", function () {
      if (sidebar.classList.contains("is-open")) closeSidebar();
      else openSidebar();
    });
    overlay.addEventListener("click", closeSidebar);

    // O sino abre a prévia das notificações; "Atualizar" fica dentro do menu.
    window.NotifMenu.init(function () {
      loadHealth();
      onRefresh();
    });
  }

  // Devolve false (e manda para o login) quando não há sessão.
  function init(onRefresh) {
    if (!guardSession()) return false;
    renderUser();
    bind(onRefresh);
    loadHealth();
    return true;
  }

  return {
    MONTH_NAMES: MONTH_NAMES,
    escapeHtml: escapeHtml,
    init: init,
    showApiWarning: showApiWarning,
    hideApiWarning: hideApiWarning,
    setAlertBadge: setAlertBadge,
  };
})();
