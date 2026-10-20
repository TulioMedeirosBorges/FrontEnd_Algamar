// Tela "Configurações do usuário".
//  - Perfil: nome e e-mail vêm da sessão (resposta de /auth/login) e são
//    salvos com PUT /auth/me { full_name, email }. Cargo só aparece se a API
//    o devolver (role/cargo) e não é editável.
//  - Senha: PUT /auth/me { current_password, password }.
//  - Excluir conta: DELETE /auth/me, depois limpa a sessão e vai ao login.
//  - Foto, preferências e notificações: guardadas neste dispositivo
//    (js/user-prefs.js).
(function () {
  const S = window.DashShell;
  const U = window.UserPrefs;
  const $ = (id) => document.getElementById(id);

  const AVATAR_PX = 256;
  const MAX_FILE_MB = 8;

  function toast(msg, isError) {
    const el = $("stToast");
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (el.hidden = true), 4000);
  }

  // ------------------------------------------------------------------
  // Perfil
  // ------------------------------------------------------------------
  function renderProfile() {
    const user = window.AlgamarAPI.getUser() || {};
    $("stName").value = user.fullName || user.full_name || "";
    $("stEmail").value = user.email || "";
    $("stRole").value = user.role || user.cargo || "—";
  }

  let defaultFace = ""; // SVG do rosto padrão (vem do HTML), usado sem foto

  function renderAvatar() {
    const box = $("stAvatar");
    const photo = U.getAvatar();
    if (photo) {
      const img = document.createElement("img");
      img.src = photo;
      img.alt = "Sua foto de perfil";
      box.replaceChildren(img);
      box.classList.add("has-photo");
    } else {
      box.innerHTML = defaultFace;
      box.classList.remove("has-photo");
    }
    $("stPhotoRemove").hidden = !photo;
    U.applyAvatar($("userAvatar")); // topo
    if (!photo) renderTopInitials();
  }

  // Sem foto, volta às iniciais no avatar do topo.
  function renderTopInitials() {
    const user = window.AlgamarAPI.getUser();
    const el = $("userAvatar");
    el.style.backgroundImage = "";
    el.textContent =
      ((user && (user.fullName || "Usuário")) || "Usuário")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("") || "?";
  }

  // Recorta (centro) e reduz para 256x256 JPEG: cabe folgado no localStorage.
  function fileToAvatar(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = AVATAR_PX;
        canvas
          .getContext("2d")
          .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível ler a imagem."));
      };
      img.src = url;
    });
  }

  async function onPhotoChosen(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("Escolha um arquivo de imagem.", true);
    if (file.size > MAX_FILE_MB * 1024 * 1024) return toast(`A imagem deve ter até ${MAX_FILE_MB} MB.`, true);
    try {
      const dataUrl = await fileToAvatar(file);
      if (!U.setAvatar(dataUrl)) return toast("O navegador não deixou salvar a foto.", true);
      renderAvatar();
      toast("Foto atualizada neste dispositivo.");
    } catch (err) {
      toast(err.message, true);
    }
  }

  // ------------------------------------------------------------------
  // Preferências e notificações (ficam neste dispositivo)
  // ------------------------------------------------------------------
  let riskCount = 0; // áreas em alto risco, para o contador do sino

  function bindPrefs() {
    $("stDate").value = U.get("dateFormat");
    $("stDate").addEventListener("change", (e) => {
      U.set("dateFormat", e.target.value);
      toast("Preferência salva neste dispositivo.");
    });

    document.querySelectorAll("input[data-pref]").forEach((input) => {
      input.checked = !!U.get(input.dataset.pref);
      input.addEventListener("change", () => {
        U.set(input.dataset.pref, input.checked);
        if (input.dataset.pref === "notifRisk") S.setAlertBadge(riskCount);
        toast("Preferência salva neste dispositivo.");
      });
    });
  }

  // Grava na sessão o usuário devolvido pelo PUT /auth/me (ou, se a API não
  // devolver nada, os campos enviados) e atualiza o nome/e-mail do topo.
  function applyUpdatedUser(res, sent) {
    const API = window.AlgamarAPI;
    const fromApi = res && (res.user || res.data);
    const merged = { ...(API.getUser() || {}), ...(fromApi || sent) };
    const name = (fromApi && (fromApi.fullName || fromApi.full_name)) || sent.full_name;
    if (name) merged.fullName = name;
    API.saveSession((res && res.token) || API.getToken(), merged);
    $("userName").textContent = merged.fullName || "Usuário";
    $("userEmail").textContent = merged.email || "";
    if (!U.getAvatar()) renderTopInitials();
  }

  function msgFor(err, fallback) {
    if (err.status === 0) return "Sem conexão com a API.";
    if (err.status === 409) return "Este e-mail já está em uso por outra conta.";
    return err.message || fallback;
  }

  async function onProfileSubmit(e) {
    e.preventDefault();
    const user = window.AlgamarAPI.getUser() || {};
    const full_name = $("stName").value.trim();
    const email = $("stEmail").value.trim();

    if (!full_name) return showMsg("Informe seu nome.", "error", "stProfileMsg");
    if (!$("stEmail").checkValidity() || !email) return showMsg("Informe um e-mail válido.", "error", "stProfileMsg");

    // Só envia o que mudou.
    const body = {};
    if (full_name !== (user.fullName || user.full_name || "")) body.full_name = full_name;
    if (email !== (user.email || "")) body.email = email;
    if (!Object.keys(body).length) return showMsg("Nenhuma alteração para salvar.", "warn", "stProfileMsg");

    const btn = $("stProfileSubmit");
    btn.disabled = true;
    showMsg("", "ok", "stProfileMsg");
    try {
      const res = await window.AlgamarAPI.apiFetch("/auth/me", { method: "PUT", body });
      applyUpdatedUser(res, body);
      renderProfile();
      showMsg("Perfil atualizado.", "ok", "stProfileMsg");
    } catch (err) {
      if (err.status !== 401) showMsg(msgFor(err, "Não foi possível salvar o perfil."), "error", "stProfileMsg");
    } finally {
      btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Segurança
  // ------------------------------------------------------------------
  function showMsg(text, kind, id = "stPwMsg") {
    const el = $(id);
    el.textContent = text;
    el.className = `st-msg st-msg--${kind}`;
    el.hidden = !text;
  }

  async function onPasswordSubmit(e) {
    e.preventDefault();
    const cur = $("stPwCur").value;
    const next = $("stPwNew").value;
    const conf = $("stPwConf").value;

    if (!cur) return showMsg("Informe a senha atual.", "error");
    if (next.length < 6) return showMsg("A nova senha deve ter pelo menos 6 caracteres.", "error");
    if (next !== conf) return showMsg("A confirmação não confere com a nova senha.", "error");
    if (next === cur) return showMsg("A nova senha deve ser diferente da atual.", "error");

    const btn = $("stPwSubmit");
    btn.disabled = true;
    showMsg("", "ok");
    try {
      // requireAuth:false — um 401 aqui significa "senha atual incorreta", não
      // sessão expirada, e não deve derrubar o usuário para o login.
      const res = await window.AlgamarAPI.apiFetch("/auth/me", {
        method: "PUT",
        body: { current_password: cur, password: next },
        requireAuth: false,
      });
      if (res && res.token) window.AlgamarAPI.saveSession(res.token, window.AlgamarAPI.getUser());
      $("stPwForm").reset();
      showMsg("Senha alterada com sucesso.", "ok");
    } catch (err) {
      if (err.status === 401 || err.status === 403) showMsg("Senha atual incorreta.", "error");
      else showMsg(msgFor(err, "Não foi possível alterar a senha."), "error");
    } finally {
      btn.disabled = false;
    }
  }

  // ------------------------------------------------------------------
  // Excluir conta (pede confirmação antes do DELETE /auth/me)
  // ------------------------------------------------------------------
  function toggleDeleteConfirm(show) {
    $("stDeleteConfirm").hidden = !show;
    $("stDeleteBtn").hidden = show;
    showMsg("", "ok", "stDeleteMsg");
    if (show) $("stDeleteCancel").focus();
  }

  async function onDeleteConfirmed() {
    const btn = $("stDeleteYes");
    btn.disabled = true;
    $("stDeleteCancel").disabled = true;
    try {
      await window.AlgamarAPI.apiFetch("/auth/me", { method: "DELETE" });
      U.setAvatar(null);
      window.AlgamarAPI.clearSession();
      window.AlgamarAPI.goToLogin();
    } catch (err) {
      if (err.status !== 401) showMsg(msgFor(err, "Não foi possível excluir a conta."), "error", "stDeleteMsg");
      btn.disabled = false;
      $("stDeleteCancel").disabled = false;
    }
  }

  function bindPasswordEyes() {
    document.querySelectorAll(".st-eye").forEach((btn) =>
      btn.addEventListener("click", () => {
        const input = $(btn.dataset.target);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
      })
    );
  }

  // ------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    if (!S.init(() => {})) return;
    defaultFace = $("stAvatar").innerHTML;

    renderProfile();
    renderAvatar();
    bindPrefs();
    bindPasswordEyes();

    $("stPhotoBtn").addEventListener("click", () => $("stPhotoInput").click());
    $("stPhotoInput").addEventListener("change", onPhotoChosen);
    $("stPhotoRemove").addEventListener("click", () => {
      U.setAvatar(null);
      renderAvatar();
      toast("Foto removida.");
    });
    $("stPwForm").addEventListener("submit", onPasswordSubmit);
    $("stProfileForm").addEventListener("submit", onProfileSubmit);
    $("stDeleteBtn").addEventListener("click", () => toggleDeleteConfirm(true));
    $("stDeleteCancel").addEventListener("click", () => toggleDeleteConfirm(false));
    $("stDeleteYes").addEventListener("click", onDeleteConfirmed);

    // Contador do sino (áreas em alto risco), como nas outras telas.
    window.AlgamarAPI.apiFetch("/ml/coastal-risks")
      .then((res) => {
        riskCount = (res.data || []).filter((p) => /^ALT/i.test(String(p.risk_level || ""))).length;
        S.setAlertBadge(riskCount);
      })
      .catch(() => {});
  });
})();
