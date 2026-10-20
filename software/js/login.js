document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const submitBtn = document.getElementById("loginSubmit");
  const errorEl = document.getElementById("loginError");
  const demoBtn = document.getElementById("loginDemoBtn");

  if (!form || !submitBtn) return;

  // Já autenticado: pula direto para o dashboard.
  if (window.AlgamarAPI?.getToken()) {
    window.location.href = "dashboard.html";
    return;
  }

  // Modo demonstração: entra sem chamar a API. O dashboard mostra os
  // avisos de "API indisponível" normalmente, já que nenhum dado é real.
  demoBtn?.addEventListener("click", () => {
    window.AlgamarAPI.saveSession("demo-mode", {
      id: "demo",
      fullName: "Usuário demonstração",
      email: "demo@algamar.local",
    });
    window.location.href = "dashboard.html";
  });

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
      window.location.href = "dashboard.html";
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
