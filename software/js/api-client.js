// Cliente HTTP fino para a API Algamar.
// Centraliza: header de autenticação, Content-Type e o comportamento de
// sessão expirada (401 -> limpa token e redireciona para o login).
(function () {
  function getToken() {
    return localStorage.getItem(window.ALGAMAR_TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(window.ALGAMAR_USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(token, user) {
    localStorage.setItem(window.ALGAMAR_TOKEN_KEY, token);
    if (user) localStorage.setItem(window.ALGAMAR_USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(window.ALGAMAR_TOKEN_KEY);
    localStorage.removeItem(window.ALGAMAR_USER_KEY);
  }

  function goToLogin() {
    const onPagesDir = window.location.pathname.includes("/pages/");
    window.location.href = onPagesDir ? "login.html" : "pages/login.html";
  }

  /**
   * @param {string} path - ex: "/auth/login", "/ml/coastal-risks"
   * @param {object} [opts]
   * @param {string} [opts.method]
   * @param {object} [opts.body]
   * @param {object} [opts.params] - query params
   * @param {boolean} [opts.requireAuth] - default true. Quando true, um 401
   *   limpa a sessão e redireciona para o login automaticamente.
   */
  async function apiFetch(path, opts = {}) {
    const { method = "GET", body, params, requireAuth = true } = opts;

    let url = window.ALGAMAR_API_BASE + path;
    if (params) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      ).toString();
      if (qs) url += "?" + qs;
    }

    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkError) {
      throw { status: 0, message: "Não foi possível conectar à API.", cause: networkError };
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      // resposta sem corpo JSON
    }

    if (response.status === 401 && requireAuth) {
      clearSession();
      goToLogin();
      throw { status: 401, message: data?.message || "Sessão expirada." };
    }

    if (!response.ok) {
      throw { status: response.status, message: data?.message || "Erro na requisição.", data };
    }

    return data;
  }

  window.AlgamarAPI = { apiFetch, getToken, getUser, saveSession, clearSession, goToLogin };
})();

// Nível de floração: UMA regra para todas as telas. Quem decide é o ML
// (campo risk_level de /ml/coastal-risks: BAIXO, MODERADO, ALTO, MUITO ALTO;
// as faixas vêm em summary.niveis). As telas só traduzem o texto para uma
// chave; a probabilidade só é usada quando o registro não traz risk_level
// (ou para médias, como a de uma região), com as mesmas faixas do ML.
(function () {
  const CORTES = { moderado: 0.24, alto: 0.48, muito_alto: 0.8 }; // = summary.niveis
  const LABEL = { baixo: "Baixo", moderado: "Moderado", alto: "Alto", muito_alto: "Muito alto" };
  const COLOR = { baixo: "#00c05d", moderado: "#f5c518", alto: "#f08c28", muito_alto: "#ff383c" };

  function fromProbability(v) {
    if (typeof v !== "number" || Number.isNaN(v)) return null;
    if (v >= CORTES.muito_alto) return "muito_alto";
    if (v >= CORTES.alto) return "alto";
    if (v >= CORTES.moderado) return "moderado";
    return "baixo";
  }

  function fromLevel(level) {
    const norm = String(level || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase();
    if (norm.startsWith("MUIT")) return "muito_alto";
    if (norm.startsWith("ALT")) return "alto";
    if (norm.startsWith("MED") || norm.startsWith("MOD")) return "moderado";
    if (norm.startsWith("BAIX")) return "baixo";
    return null;
  }

  // Chave do registro: risk_level do ML; sem ele, pela probabilidade.
  function of(p) {
    return fromLevel(p && p.risk_level) || fromProbability(p && p.probability) || "baixo";
  }

  // Atualiza as faixas com as que a API mandou (summary.niveis).
  function setRanges(niveis) {
    (niveis || []).forEach((n) => {
      const k = fromLevel(n.nivel);
      if (k && k !== "baixo" && typeof n.de === "number") CORTES[k] = n.de;
    });
  }

  window.AlgamarRisk = { LEVELS: ["baixo", "moderado", "alto", "muito_alto"], LABEL, COLOR, CORTES,
    of, fromLevel, fromProbability, setRanges };
})();
