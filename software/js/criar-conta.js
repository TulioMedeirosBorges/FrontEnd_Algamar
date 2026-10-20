document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const submitBtn = document.getElementById("registerSubmit");
  const password = document.getElementById("registerPassword");
  const passwordConfirm = document.getElementById("registerPasswordConfirm");
  const errorEl = document.getElementById("registerError");

  if (!form || !submitBtn || !password || !passwordConfirm) return;

  if (window.AlgamarAPI?.getToken()) {
    window.location.href = "dashboard.html";
    return;
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

  function passwordsMatch() {
    return password.value === passwordConfirm.value;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    form.querySelectorAll(".login-field--error").forEach((field) => {
      field.classList.remove("login-field--error");
    });

    let valid = form.checkValidity();
    if (!valid) {
      form.querySelectorAll(":invalid").forEach((input) => {
        input.closest(".login-field")?.classList.add("login-field--error");
      });
    }

    if (valid && !passwordsMatch()) {
      valid = false;
      passwordConfirm.closest(".login-field")?.classList.add("login-field--error");
    }

    if (!valid) {
      form.reportValidity();
      return;
    }

    const fullName = document.getElementById("registerName").value.trim();
    const email = document.getElementById("registerEmail").value.trim();

    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Cadastrando...";

    try {
      const response = await window.AlgamarAPI.apiFetch("/auth/register", {
        method: "POST",
        body: { full_name: fullName, email, password: password.value },
        requireAuth: false,
      });

      // O cadastro já retorna um token válido: não é preciso logar novamente.
      window.AlgamarAPI.saveSession(response.token, response.user);
      window.location.href = "dashboard.html";
    } catch (err) {
      if (err.status === 409) {
        showError("Este e-mail já está cadastrado.");
      } else if (err.status === 400) {
        showError(err.message || "Verifique os dados informados.");
      } else if (err.status === 0) {
        showError(
          "Não foi possível conectar à API. Verifique se o backend está rodando e a URL configurada em js/api-config.js."
        );
      } else {
        showError(err.message || "Não foi possível concluir o cadastro. Tente novamente.");
      }
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });

  passwordConfirm.addEventListener("input", () => {
    if (passwordsMatch()) {
      passwordConfirm.closest(".login-field")?.classList.remove("login-field--error");
    }
  });
});
