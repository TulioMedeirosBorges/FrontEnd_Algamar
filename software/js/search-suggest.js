// Busca do topo com sugestões inteligentes (todas as telas internas).
//
// Enquanto a pessoa digita, abre uma lista agrupada que diz o QUE é cada
// resultado e PARA ONDE ele leva:
//   - Municípios e regiões do litoral  → filtra a tela atual (ou abre o mapa)
//     + atalhos: ver no mapa, histórico, condições propícias
//   - Espécies de alga                 → abre Condições Propícias da espécie
//   - Telas e funções ("chuva", "pdf", "senha"...) → abre a tela certa
// A busca ignora acento e maiúsculas, aceita início de palavra e tolera um
// erro de digitação ("ubatba" acha Ubatuba). Sem texto, mostra as buscas
// recentes e atalhos. Teclado: ↑ ↓ escolhem, Enter abre, Esc fecha.
//
// Não substitui o filtro que cada tela já faz no evento "input" do campo:
// ao escolher um município/região, o texto vai para o campo e a tela filtra.
(function () {
  const input = document.getElementById("dashSearch");
  if (!input) return;
  const box = input.closest(".dash-search");
  if (!box) return;

  const PAGE = (location.pathname.split("/").pop() || "").toLowerCase();
  // Telas cujo campo de busca filtra por município/região/espécie.
  const FILTRA = new Set([
    "dashboard.html",
    "mapa-interativo.html",
    "previsoes.html",
    "condicoes-propicias.html",
    "historico-ocorrencias.html",
    "alertas.html",
    "relatorios.html",
  ]);
  const FILTRA_ESPECIE = new Set(["alertas.html"]);

  // ---------------------------------------------------------------- dados
  const REGIOES = {
    "Litoral Norte": ["Ubatuba", "Caraguatatuba", "Ilhabela", "São Sebastião"],
    "Baixada Santista": [
      "Bertioga", "Guarujá", "Santos", "São Vicente", "Praia Grande",
      "Mongaguá", "Itanhaém", "Peruíbe",
    ],
    "Litoral Sul": ["Iguape", "Ilha Comprida", "Cananéia"],
  };

  const ESPECIES = [
    { nome: "Dinophysis", toxina: "Toxina diarreica (DSP)" },
    { nome: "Pseudo-nitzschia", toxina: "Toxina amnésica (ASP)" },
    { nome: "Alexandrium", toxina: "Toxina paralisante (PSP)" },
    { nome: "Gymnodinium", toxina: "Toxina paralisante (PSP)" },
    { nome: "Prorocentrum lima", toxina: "Toxina diarreica (DSP)" },
  ];

  // Telas, com palavras que as pessoas costumam digitar para chegar nelas.
  const TELAS = [
    { href: "dashboard.html", nome: "Dashboard", icon: "dashboard",
      desc: "Resumo do litoral: indicadores, mapa e alertas",
      kw: ["inicio", "resumo", "painel", "visao geral", "home"] },
    { href: "mapa-interativo.html", nome: "Mapa Interativo", icon: "explore",
      desc: "Mapa com o risco de floração por região",
      kw: ["mapa", "satelite", "camadas", "pontos", "localizacao"] },
    { href: "previsoes.html", nome: "Previsões", icon: "calendar_month",
      desc: "Previsão de floração para os próximos meses",
      kw: ["previsao", "futuro", "proximos meses", "probabilidade", "risco", "mare vermelha"] },
    { href: "condicoes-propicias.html", nome: "Condições Propícias", icon: "eco",
      desc: "Condições favoráveis a cada espécie de alga",
      kw: ["condicoes", "propicio", "favoravel", "especie", "indice"] },
    { href: "alertas.html", nome: "Alertas", icon: "notifications",
      desc: "Alertas de algas tóxicas e notificações",
      kw: ["alerta", "aviso", "notificacao", "toxica", "perigo", "urgente"] },
    { href: "historico-ocorrencias.html", nome: "Histórico de Ocorrências", icon: "history",
      desc: "Florações registradas no passado",
      kw: ["historico", "ocorrencia", "passado", "registro", "anterior"] },
    { href: "dados-ambientais.html", nome: "Dados Ambientais", icon: "thermostat",
      desc: "Temperatura, clorofila, chuva e outras medições",
      kw: ["temperatura", "agua", "mar", "chuva", "vento", "onda", "clorofila", "clima", "tempo", "corrente", "sol"] },
    { href: "relatorios.html", nome: "Relatórios", icon: "description",
      desc: "Relatórios para exportar e compartilhar",
      kw: ["relatorio", "pdf", "exportar", "baixar", "imprimir", "documento", "download"] },
    { href: "configuracoes.html", nome: "Configurações", icon: "settings",
      desc: "Perfil, senha e preferências",
      kw: ["configuracao", "perfil", "senha", "conta", "foto", "notificacoes", "preferencias", "email"] },
  ];

  // ---------------------------------------------------------------- busca
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  // Distância de edição limitada (para tolerar 1 erro de digitação).
  function quasePrefixo(termo, palavra) {
    if (termo.length < 4) return false;
    const alvo = palavra.slice(0, termo.length + 1);
    const a = termo;
    const b = alvo;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    // melhor alinhamento contra qualquer prefixo da palavra
    return Math.min(...dp[a.length]) <= 1;
  }

  // Nota de 0 a 100 de quanto `texto` combina com o termo.
  // estrito = só conta início de palavra (usado em palavras-chave e
  // descrições, para "sant" não achar "paralisante").
  function nota(termo, texto, estrito = false) {
    const t = norm(texto);
    if (!termo) return 0;
    if (t === termo) return 100;
    if (t.startsWith(termo)) return 90;
    const palavras = t.split(/[\s\-/()]+/);
    if (palavras.some((p) => p.startsWith(termo))) return 75;
    if (estrito) return 0;
    if (t.includes(termo)) return 55;
    if (palavras.some((p) => quasePrefixo(termo, p))) return 40;
    return 0;
  }

  function buscar(q) {
    const termo = norm(q);
    const grupos = [];
    if (!termo) return grupos;

    // Municípios e regiões
    const locais = [];
    for (const [regiao, cidades] of Object.entries(REGIOES)) {
      const nr = nota(termo, regiao);
      if (nr) locais.push({ tipo: "regiao", nome: regiao, score: nr + 2, regiao, cidades });
      for (const c of cidades) {
        const nc = nota(termo, c);
        if (nc) locais.push({ tipo: "municipio", nome: c, score: nc, regiao });
      }
    }
    locais.sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome));
    if (locais.length) grupos.push({ titulo: "Locais do litoral", itens: locais.slice(0, 5) });

    // Espécies
    const esp = ESPECIES.map((e) => ({ tipo: "especie", ...e, score: Math.max(nota(termo, e.nome), nota(termo, e.toxina, true) - 20) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    if (esp.length) grupos.push({ titulo: "Espécies de alga", itens: esp.slice(0, 3) });

    // Telas (pelo nome ou por palavra-chave)
    const telas = TELAS.map((p) => {
      const porNome = nota(termo, p.nome);
      const porKw = Math.max(0, ...p.kw.map((k) => nota(termo, k, true)));
      const motivo = !porNome && porKw ? p.kw.find((k) => nota(termo, k, true) === porKw) : "";
      return { tipo: "tela", ...p, score: Math.max(porNome, porKw - 10), motivo };
    })
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
    if (telas.length) grupos.push({ titulo: "Telas e funções", itens: telas.slice(0, 3) });

    // Grupo mais relevante primeiro.
    grupos.sort((a, b) => b.itens[0].score - a.itens[0].score);

    // Sempre dá para só filtrar a tela atual com o texto digitado.
    if (FILTRA.has(PAGE)) {
      grupos.push({
        titulo: "Nesta tela",
        itens: [{ tipo: "filtro", nome: q.trim(), score: 0 }],
      });
    }
    return grupos;
  }

  // ---------------------------------------------------------------- recentes
  const KEY = "algamar_busca_recentes";
  function lerRecentes() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]").slice(0, 4);
    } catch {
      return [];
    }
  }
  function guardarRecente(item) {
    try {
      const chave = item.tipo + ":" + item.nome;
      const lista = lerRecentes().filter((r) => r.tipo + ":" + r.nome !== chave);
      const salvo = { tipo: item.tipo, nome: item.nome };
      if (item.regiao) salvo.regiao = item.regiao;
      if (item.href) salvo.href = item.href;
      lista.unshift(salvo);
      localStorage.setItem(KEY, JSON.stringify(lista.slice(0, 4)));
    } catch {
      /* sem localStorage: segue sem recentes */
    }
  }
  // Reidrata um recente salvo com os dados completos do item.
  function reidratar(r) {
    if (r.tipo === "tela") return TELAS.find((t) => t.href === r.href) && { tipo: "tela", ...TELAS.find((t) => t.href === r.href) };
    if (r.tipo === "especie") return ESPECIES.find((e) => e.nome === r.nome) && { tipo: "especie", ...ESPECIES.find((e) => e.nome === r.nome) };
    if (r.tipo === "regiao" && REGIOES[r.nome]) return { tipo: "regiao", nome: r.nome, regiao: r.nome, cidades: REGIOES[r.nome] };
    if (r.tipo === "municipio" && r.regiao) return { tipo: "municipio", nome: r.nome, regiao: r.regiao };
    return null;
  }

  function sugestoesIniciais() {
    const grupos = [];
    const rec = lerRecentes().map(reidratar).filter(Boolean);
    if (rec.length) grupos.push({ titulo: "Buscas recentes", recentes: true, itens: rec });
    grupos.push({
      titulo: "Experimente buscar",
      itens: [
        { tipo: "regiao", nome: "Litoral Norte", regiao: "Litoral Norte", cidades: REGIOES["Litoral Norte"] },
        { tipo: "municipio", nome: "Santos", regiao: "Baixada Santista" },
        { tipo: "especie", ...ESPECIES[0] },
        { tipo: "tela", ...TELAS.find((t) => t.href === "alertas.html") },
      ],
    });
    return grupos;
  }

  // ---------------------------------------------------------------- texto
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Destaca o trecho que combinou (comparando sem acento).
  function realce(texto, q) {
    const termo = norm(q);
    if (!termo) return esc(texto);
    const n = norm(texto);
    const i = n.indexOf(termo);
    if (i < 0) return esc(texto);
    // norm() mantém o comprimento das letras base, então os índices batem.
    return esc(texto.slice(0, i)) + "<mark>" + esc(texto.slice(i, i + termo.length)) + "</mark>" + esc(texto.slice(i + termo.length));
  }

  // O que cada item mostra: ícone, título, linha de explicação, selo de tipo
  // e para onde vai ao clicar.
  function descrever(item) {
    const aqui = FILTRA.has(PAGE);
    switch (item.tipo) {
      case "municipio":
        return {
          icon: "location_on",
          selo: "Município",
          linha: `${item.regiao} · ${aqui ? "filtrar esta tela" : "abrir no mapa"}`,
          atalhos: [
            { label: "Mapa", icon: "explore", href: `mapa-interativo.html?municipio=${encodeURIComponent(item.nome)}` },
            { label: "Histórico", icon: "history", href: `historico-ocorrencias.html?municipio=${encodeURIComponent(item.nome)}` },
            { label: "Condições", icon: "eco", href: `condicoes-propicias.html?municipio=${encodeURIComponent(item.nome)}` },
          ],
        };
      case "regiao":
        return {
          icon: "map",
          selo: "Região",
          linha: `${item.cidades.length} municípios · ${item.cidades.slice(0, 3).join(", ")}…`,
        };
      case "especie":
        return {
          icon: "microbiology",
          selo: "Alga",
          linha: `${item.toxina} · ver condições propícias`,
          atalhos: FILTRA_ESPECIE.has(PAGE) ? [{ label: "Filtrar aqui", icon: "filter_alt", filtro: true }] : [],
        };
      case "tela":
        return {
          icon: item.icon,
          selo: PAGE === item.href ? "Você está aqui" : "Tela",
          linha: item.motivo ? `${item.desc} · por “${item.motivo}”` : item.desc,
        };
      case "filtro":
        return { icon: "filter_alt", selo: "Filtro", linha: "Mostrar só o que combina com o texto nesta tela" };
      default:
        return { icon: "search", selo: "", linha: "" };
    }
  }

  // ---------------------------------------------------------------- UI
  const painel = document.createElement("div");
  painel.className = "dash-suggest";
  painel.id = "dashSuggest";
  painel.setAttribute("role", "listbox");
  painel.hidden = true;
  box.appendChild(painel);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", painel.id);
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("autocomplete", "off");

  let itensVisiveis = [];
  let ativo = -1;

  function render() {
    const q = input.value;
    const grupos = q.trim() ? buscar(q) : sugestoesIniciais();
    itensVisiveis = [];
    let html = "";

    const temResultado = grupos.some((g) => g.titulo !== "Nesta tela");
    if (q.trim() && !temResultado) {
      html += `<p class="dash-suggest__vazio">Nada encontrado para “${esc(q.trim())}”. Tente um município (ex.: Ubatuba), uma região ou uma alga.</p>`;
    }

    for (const g of grupos) {
      html += `<div class="dash-suggest__grupo" role="group" aria-label="${esc(g.titulo)}">`;
      html += `<p class="dash-suggest__titulo">${esc(g.titulo)}${
        g.recentes ? '<button type="button" class="dash-suggest__limpar" data-limpar>Limpar</button>' : ""
      }</p>`;
      for (const item of g.itens) {
        const i = itensVisiveis.length;
        itensVisiveis.push(item);
        const d = descrever(item);
        const titulo =
          item.tipo === "filtro"
            ? `Filtrar por “${esc(item.nome)}”`
            : realce(item.nome, q);
        html += `<div class="dash-suggest__item" role="option" id="sug-${i}" data-i="${i}" aria-selected="false">
          <span class="dash-suggest__icone dash-suggest__icone--${item.tipo}"><span class="material-symbols-outlined" aria-hidden="true">${esc(d.icon)}</span></span>
          <span class="dash-suggest__texto">
            <span class="dash-suggest__nome">${titulo}</span>
            <span class="dash-suggest__linha">${esc(d.linha)}</span>
          </span>
          ${(d.atalhos || [])
            .map(
              (a, k) =>
                `<button type="button" class="dash-suggest__atalho" data-i="${i}" data-a="${k}" title="${esc(a.label)}" tabindex="-1"><span class="material-symbols-outlined" aria-hidden="true">${esc(a.icon)}</span><span>${esc(a.label)}</span></button>`
            )
            .join("")}
          <span class="dash-suggest__selo">${esc(d.selo)}</span>
        </div>`;
      }
      html += "</div>";
    }
    html += `<p class="dash-suggest__dica"><kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> fechar</p>`;
    painel.innerHTML = html;
    ativo = q.trim() && itensVisiveis.length ? 0 : -1;
    marcarAtivo();
    abrir();
  }

  function marcarAtivo() {
    painel.querySelectorAll(".dash-suggest__item").forEach((el) => {
      const sel = Number(el.dataset.i) === ativo;
      el.classList.toggle("is-active", sel);
      el.setAttribute("aria-selected", sel ? "true" : "false");
      if (sel) el.scrollIntoView({ block: "nearest" });
    });
    if (ativo >= 0) input.setAttribute("aria-activedescendant", `sug-${ativo}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function abrir() {
    painel.hidden = false;
    box.classList.add("is-open");
    input.setAttribute("aria-expanded", "true");
  }
  function fechar() {
    painel.hidden = true;
    box.classList.remove("is-open");
    input.setAttribute("aria-expanded", "false");
    ativo = -1;
  }

  // Põe o texto no campo e dispara o filtro que a tela já tem.
  function filtrarCom(texto) {
    input.value = texto;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function escolher(item, atalho) {
    if (!item) return;
    if (item.tipo !== "filtro") guardarRecente(item);
    fechar();

    if (atalho) {
      if (atalho.filtro) return filtrarCom(item.nome);
      window.location.href = atalho.href;
      return;
    }
    switch (item.tipo) {
      case "municipio":
        if (FILTRA.has(PAGE)) return filtrarCom(item.nome);
        window.location.href = `mapa-interativo.html?municipio=${encodeURIComponent(item.nome)}`;
        return;
      case "regiao":
        if (FILTRA.has(PAGE)) return filtrarCom(item.nome);
        window.location.href = "mapa-interativo.html";
        return;
      case "especie":
        window.location.href = `condicoes-propicias.html?especie=${encodeURIComponent(item.nome)}`;
        return;
      case "tela":
        if (PAGE !== item.href) window.location.href = item.href;
        else input.value = "";
        return;
      case "filtro":
        return filtrarCom(item.nome);
    }
  }

  // ---------------------------------------------------------------- eventos
  // O "input" do campo continua filtrando a tela (listener de cada página);
  // aqui só atualizamos a lista.
  input.addEventListener("input", (e) => {
    if (e.isTrusted) render();
  });
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (e) => {
    if (painel.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      render();
      e.preventDefault();
      return;
    }
    if (painel.hidden) return;
    if (e.key === "ArrowDown") {
      ativo = (ativo + 1) % itensVisiveis.length;
      marcarAtivo();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      ativo = ativo <= 0 ? itensVisiveis.length - 1 : ativo - 1;
      marcarAtivo();
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (ativo >= 0) escolher(itensVisiveis[ativo]);
      else fechar();
      e.preventDefault();
    } else if (e.key === "Escape") {
      fechar();
      e.preventDefault();
    }
  });

  // mousedown (não click) para agir antes de o campo perder o foco.
  painel.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (e.target.closest("[data-limpar]")) {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignora */
      }
      render();
      return;
    }
    const at = e.target.closest(".dash-suggest__atalho");
    if (at) {
      const item = itensVisiveis[Number(at.dataset.i)];
      escolher(item, descrever(item).atalhos[Number(at.dataset.a)]);
      return;
    }
    const el = e.target.closest(".dash-suggest__item");
    if (el) escolher(itensVisiveis[Number(el.dataset.i)]);
  });
  painel.addEventListener("mousemove", (e) => {
    const el = e.target.closest(".dash-suggest__item");
    if (el && Number(el.dataset.i) !== ativo) {
      ativo = Number(el.dataset.i);
      painel.querySelectorAll(".dash-suggest__item").forEach((x) => {
        const sel = Number(x.dataset.i) === ativo;
        x.classList.toggle("is-active", sel);
        x.setAttribute("aria-selected", sel ? "true" : "false");
      });
    }
  });

  input.addEventListener("blur", () => setTimeout(fechar, 120));

  // ?busca=texto na URL abre a busca já preenchida (link direto / testes).
  const inicial = new URLSearchParams(location.search).get("busca");
  if (inicial != null) {
    input.value = inicial;
    input.focus();
    render();
  }

  // Atalho: "/" foca a busca de qualquer lugar da tela.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    input.focus();
  });
})();
