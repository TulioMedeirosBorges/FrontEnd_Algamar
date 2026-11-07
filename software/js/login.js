document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const submitBtn = document.getElementById("loginSubmit");
  const errorEl = document.getElementById("loginError");
  const forgotLink = document.getElementById("loginForgot");
  const forgotInfo = document.getElementById("loginForgotInfo");

  if (!form || !submitBtn) return;

  // Já autenticado: pula direto para o dashboard.
  if (window.AlgamarAPI?.getToken()) {
    window.location.href = "dashboard.html";
    return;
  }

  // Esqueceu a senha: a API ainda não tem rota de redefinição, então
  // apenas orienta o usuário a procurar o administrador.
  forgotLink?.addEventListener("click", (event) => {
    event.preventDefault();
    if (forgotInfo) forgotInfo.hidden = !forgotInfo.hidden;
  });

  // Transição de entrada (onda cobrindo a tela + logo se montando), feita
  // em js/login-anim.js. Sem o módulo ou com "menos movimento", vai direto.
  function playEntry({ redirect = true } = {}) {
    const anim = window.AlgamarLoginAnim;
    const finish = () => {
      if (redirect) {
        window.location.href = "dashboard.html";
      } else {
        setTimeout(() => anim?.resetEntry(), 900);
      }
    };
    if (!anim) return finish();
    anim.playEntry(finish);
  }

  // Teste: abrir login.html#teste-entrada toca a transição sem logar
  // (espera a abertura da página terminar).
  if (window.location.hash === "#teste-entrada") {
    setTimeout(() => playEntry({ redirect: false }), 4500);
  }

  function showError(message) {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function hideError() {
    if (!errorEl) return;
    errorEl.hidden = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    form.querySelectorAll(".login-field--error").forEach((field) => {
      field.classList.remove("login-field--error");
    });

    // Login local de desenvolvimento (js/dev-login.local.js, espelho do
    // .env): entra sem chamar a API. Vem antes da validação porque "admin"
    // não é um e-mail.
    const dev = window.ALGAMAR_DEV_LOGIN;
    if (
      dev?.user &&
      document.getElementById("loginEmail").value.trim() === dev.user &&
      document.getElementById("loginPassword").value === dev.password
    ) {
      window.AlgamarAPI.saveSession(window.AlgamarAPI.DEV_TOKEN, {
        id: "dev-admin",
        fullName: "Administrador (local)",
        email: dev.user,
      });
      submitBtn.disabled = true;
      playEntry();
      return;
    }

    if (!form.checkValidity()) {
      form.querySelectorAll(":invalid").forEach((input) => {
        input.closest(".login-field")?.classList.add("login-field--error");
      });
      form.reportValidity();
      return;
    }

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Entrando...";

    try {
      const response = await window.AlgamarAPI.apiFetch("/auth/login", {
        method: "POST",
        body: { email, password },
        requireAuth: false,
      });

      window.AlgamarAPI.saveSession(response.token, response.user);
      playEntry();
    } catch (err) {
      if (err.status === 401) {
        showError("E-mail ou senha inválidos.");
      } else if (err.status === 0) {
        showError(
          "Não foi possível conectar à API. Verifique se o backend está rodando e a URL configurada em js/api-config.js."
        );
      } else {
        showError(err.message || "Não foi possível entrar. Tente novamente.");
      }
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
});
