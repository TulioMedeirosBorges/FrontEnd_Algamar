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
