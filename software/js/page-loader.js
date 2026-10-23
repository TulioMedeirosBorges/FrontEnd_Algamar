// Tela de carregamento das telas internas. O HTML (#pageLoader) já vem na
// página, para cobrir o conteúdo desde o primeiro desenho; cada tela chama
// PageLoader.done() depois de renderizar a primeira resposta da API (com
// dados ou com erro). Só a primeira carga usa a tela cheia: nos refreshes os
// dados antigos continuam visíveis até chegarem os novos.
window.PageLoader = (function () {
  var SAFETY_MS = 25000; // API pendurada: não prende o usuário para sempre
  var finished = false;

  function el() {
    return document.getElementById("pageLoader");
  }

  // Começa logo abaixo da barra do topo, que continua utilizável.
  function placeBelowTopbar() {
    var loader = el();
    var topbar = document.querySelector(".dash-topbar");
    if (!loader || !topbar) return;
    loader.style.top = topbar.offsetTop + topbar.offsetHeight + "px";
  }

  function done() {
    if (finished) return;
    finished = true;
    var loader = el();
    if (!loader) return;
    loader.classList.add("is-done");
    loader.setAttribute("aria-busy", "false");
    setTimeout(function () {
      loader.hidden = true;
    }, 300);
  }

  document.addEventListener("DOMContentLoaded", function () {
    placeBelowTopbar();
    window.addEventListener("resize", function () {
      if (!finished) placeBelowTopbar();
    });
    setTimeout(done, SAFETY_MS);
  });

  return { done: done };
})();
