// Preferências do usuário guardadas NESTE dispositivo (localStorage), por
// e-mail da sessão. A API não tem rota de preferências/foto, então nada disso
// vai para o servidor. Efeitos reais hoje:
//  - foto: aparece no avatar do topo de todas as telas;
//  - notifRisk: mostra/oculta o contador do sino;
//  - dateFormat: formato da data nos relatórios.
// As demais chaves (ocorrências, sistema, semanal, novidades) só ficam salvas
// até existir um serviço de envio de notificações.
window.UserPrefs = (function () {
  const DEFAULTS = {
    dateFormat: "DD/MM/AAAA",
    notifRisk: true,
    notifOccurrences: true,
    notifSystem: true,
    notifWeekly: false,
    notifNews: false,
  };

  function who() {
    const user = window.AlgamarAPI && window.AlgamarAPI.getUser();
    return (user && user.email) || "anon";
  }
  const prefsKey = () => `algamar_prefs:${who()}`;
  const avatarKey = () => `algamar_avatar:${who()}`;

  function all() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(prefsKey()) || "{}") };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function get(key) {
    return all()[key];
  }
  function set(key, value) {
    const cur = all();
    cur[key] = value;
    try {
      localStorage.setItem(prefsKey(), JSON.stringify(cur));
      return true;
    } catch {
      return false;
    }
  }

  function getAvatar() {
    try {
      return localStorage.getItem(avatarKey());
    } catch {
      return null;
    }
  }
  // dataUrl = null remove a foto. Devolve false se o navegador não deixou gravar.
  function setAvatar(dataUrl) {
    try {
      if (dataUrl) localStorage.setItem(avatarKey(), dataUrl);
      else localStorage.removeItem(avatarKey());
      return true;
    } catch {
      return false;
    }
  }
  // Troca as iniciais do avatar do topo pela foto, quando existir.
  function applyAvatar(el) {
    const photo = getAvatar();
    if (!el || !photo) return;
    el.textContent = "";
    el.style.backgroundImage = `url("${photo}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  }

  function formatDate(d) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    switch (get("dateFormat")) {
      case "MM/DD/AAAA":
        return `${mm}/${dd}/${yyyy}`;
      case "AAAA-MM-DD":
        return `${yyyy}-${mm}-${dd}`;
      default:
        return `${dd}/${mm}/${yyyy}`;
    }
  }

  return { DEFAULTS, get, set, getAvatar, setAvatar, applyAvatar, formatDate };
})();
