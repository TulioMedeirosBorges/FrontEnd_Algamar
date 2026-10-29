// Dados de "Condições Propícias" (GET /ml/condicoes-propicias) compartilhados
// entre a própria tela, o dashboard e os relatórios.
// Índice de condições da literatura — NÃO é probabilidade de floração.
window.CondicoesData = (function () {
  const MONTH_NAMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  // 3 níveis do índice; no mapa reaproveitam as cores (e o halo) dos níveis do ML.
  const NIVEIS = {
    "desfavorável": { key: "desfavoravel", label: "Desfavorável", short: "Desfavorável", color: "#00c05d", rgb: [0, 150, 80], risk: "BAIXO", ordem: 0 },
    "parcialmente propício": { key: "parcial", label: "Parcialmente propício", short: "Parcial", color: "#f5c518", rgb: [200, 150, 10], risk: "MODERADO", ordem: 1 },
    "propício": { key: "propicio", label: "Propício", short: "Propício", color: "#f08c28", rgb: [220, 110, 20], risk: "ALTO", ordem: 2 },
  };
  const SEM = { key: "sem", label: "Sem dado", short: "Sem dado", color: "#7a8a90", rgb: [120, 135, 140], risk: "BAIXO", ordem: -1 };
  const nivelDe = (n) => NIVEIS[n] || SEM;

  function mesLabel(ym, curto) {
    if (!ym) return "—";
    const [a, m] = ym.split("-").map(Number);
    const nome = MONTH_NAMES[m - 1];
    return curto ? `${nome.slice(0, 3)}/${String(a).slice(-2)}` : `${nome}/${a}`;
  }

  // "diarreica (DSP)" -> "DSP"
  const siglaToxina = (t) => (t || "").replace(/.*\((.*)\).*/, "$1");

  // Uma consulta por região, reaproveitada enquanto a página estiver aberta.
  const cache = new Map();
  function load(region, { force = false } = {}) {
    const key = region || "";
    if (force || !cache.has(key)) {
      const p = window.AlgamarAPI.apiFetch("/ml/condicoes-propicias", { params: { region: key || undefined } }).then((res) => ({
        data: (res.data || []).map((m) => ({ ...m, id: `${m.municipio}|${m.especie}` })),
        especies: res.especies || [],
        aviso: res.aviso || "",
      }));
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    return cache.get(key);
  }

  // Série mensal já observada do índice (GET /ml/condicoes-propicias/historico),
  // por município e espécie. Usada pelo Histórico de Ocorrências e pelo
  // mini-gráfico "Histórico da região" do painel do mapa.
  const histCache = new Map();
  function historico({ region = "", especie = "", meses = 12, force = false } = {}) {
    const key = [region, especie, meses].join("|");
    if (force || !histCache.has(key)) {
      const p = window.AlgamarAPI.apiFetch("/ml/condicoes-propicias/historico", {
        params: { region: region || undefined, especie: especie || undefined, meses },
      }).then((res) => ({ data: res.data || [], meses: res.meses || [], especies: res.especies || [] }));
      p.catch(() => histCache.delete(key));
      histCache.set(key, p);
    }
    return histCache.get(key);
  }

  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  function distKm(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
    const y = (lat2 - lat1) * r;
    return Math.sqrt(x * x + y * y) * 6371;
  }

  // Registros (um por espécie) do município de um ponto do dashboard: pelo
  // nome; se o nome não bater, pelo município mais próximo (até 30 km).
  const MAX_KM = 30;
  function doPonto(data, ponto) {
    if (!ponto || !data.length) return [];
    const nome = norm(ponto.region);
    let lista = data.filter((m) => norm(m.municipio) === nome);
    if (!lista.length && typeof ponto.latitude === "number" && typeof ponto.longitude === "number") {
      let melhor = null;
      data.forEach((m) => {
        if (typeof m.latitude !== "number" || typeof m.longitude !== "number") return;
        const d = distKm(ponto.latitude, ponto.longitude, m.latitude, m.longitude);
        if (d <= MAX_KM && (!melhor || d < melhor.d)) melhor = { d, municipio: m.municipio };
      });
      if (melhor) lista = data.filter((m) => m.municipio === melhor.municipio);
    }
    return lista.sort((a, b) => (b.agora.indice ?? -1) - (a.agora.indice ?? -1));
  }

  // Link para a tela de condições já aberta no município/espécie.
  function url(municipio, especie) {
    const q = new URLSearchParams();
    if (municipio) q.set("municipio", municipio);
    if (especie) q.set("especie", especie);
    const s = q.toString();
    return `condicoes-propicias.html${s ? `?${s}` : ""}`;
  }

  return { NIVEIS, SEM, nivelDe, mesLabel, siglaToxina, load, historico, doPonto, norm, url };
})();
