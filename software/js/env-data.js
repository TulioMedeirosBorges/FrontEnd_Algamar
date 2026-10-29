// Dados ambientais diários (passado recente + previsão) direto da Open-Meteo
// — gratuita, sem chave, chamada do navegador. A API do Algamar fica só com
// a previsão de algas; tempo e mar vêm daqui.
//
//  - forecast: temperatura do ar, vento, chuva, radiação solar e nebulosidade
//    (até 16 dias de previsão);
//  - marine: temperatura da superfície do mar e corrente (só horárias —
//    viram média diária aqui) e altura máxima de ondas. O horizonte é menor
//    (~6 a 9 dias); depois disso a série vem null e o gráfico para ali.
// Região "Todas" = média das 3 regiões (uma requisição só, com várias
// coordenadas). Usado pela tela Dados Ambientais e pelo card do dashboard.
// monthly(): vento e chuva mês a mês (histórico + normal), para a tela Previsões.
window.EnvData = (function () {
  var FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  var MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
  var TIMEOUT_MS = 12000;
  var CACHE_MS = 15 * 60 * 1000;

  // Mesmos pontos do card de clima (dashboard.js): `land` = cidade,
  // `sea` = ponto no mar em frente a ela.
  var PLACES = {
    "Litoral Norte": { name: "Ubatuba", land: [-23.43, -45.08], sea: [-23.5, -45.0] },
    "Baixada Santista": { name: "Santos", land: [-23.96, -46.33], sea: [-24.04, -46.29] },
    "Litoral Sul": { name: "Cananéia", land: [-25.01, -47.93], sea: [-25.1, -47.8] },
  };

  var cache = {};

  function placesFor(region) {
    return PLACES[region] ? [PLACES[region]] : Object.keys(PLACES).map(function (k) { return PLACES[k]; });
  }

  function fetchJson(base, params) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    return fetch(base + "?" + new URLSearchParams(params), { signal: ctrl.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function coords(list, key) {
    return {
      latitude: list.map(function (p) { return p[key][0]; }).join(","),
      longitude: list.map(function (p) { return p[key][1]; }).join(","),
    };
  }

  function mean(vals) {
    var ok = vals.filter(function (v) { return typeof v === "number"; });
    return ok.length ? ok.reduce(function (a, b) { return a + b; }, 0) / ok.length : null;
  }

  // Série diária de uma variável, média entre os locais. `block` é "daily"
  // ou "hourly" (horária vira média do dia).
  function dailySeries(responses, block, field, dates) {
    var perPlace = responses.map(function (r) {
      var b = r && r[block];
      var byDay = {};
      if (b && b[field]) {
        b.time.forEach(function (t, i) {
          var day = t.slice(0, 10);
          (byDay[day] = byDay[day] || []).push(b[field][i]);
        });
      }
      return dates.map(function (d) { return byDay[d] ? mean(byDay[d]) : null; });
    });
    return dates.map(function (_, i) {
      return mean(perPlace.map(function (s) { return s[i]; }));
    });
  }

  function isoDay(date) {
    var y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  // -> { dates: ["2026-10-23", ...], todayIdx, places: "Santos", series: {...} }
  // Cada série tem o mesmo tamanho de `dates`, com null onde não há dado.
  // opts.place ({ name, land: [lat, lon], sea: [lat, lon] }) usa um local
  // específico — ex.: o ponto de floração selecionado no mapa — em vez da
  // região.
  function load(opts) {
    var region = opts.region || "";
    var pastDays = opts.pastDays || 7;
    var forecastDays = opts.forecastDays || 16;
    var list = opts.place ? [opts.place] : placesFor(region);
    var key = [list.map(function (p) { return p.land.concat(p.sea).join(","); }).join(";"), pastDays, forecastDays].join("|");
    var hit = cache[key];
    if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.data);

    var common = { timezone: "America/Sao_Paulo", past_days: pastDays, forecast_days: forecastDays };
    var land = coords(list, "land"), sea = coords(list, "sea");

    return Promise.allSettled([
      fetchJson(FORECAST_URL, Object.assign({}, common, land, {
        daily: "temperature_2m_mean,wind_speed_10m_mean,wind_speed_10m_max,precipitation_sum,shortwave_radiation_sum,cloud_cover_mean",
      })),
      fetchJson(MARINE_URL, Object.assign({}, common, sea, {
        cell_selection: "sea",
        daily: "wave_height_max",
        hourly: "sea_surface_temperature,ocean_current_velocity",
      })),
    ]).then(function (res) {
      if (res[0].status !== "fulfilled" && res[1].status !== "fulfilled") {
        throw new Error("Open-Meteo indisponível");
      }
      // Com uma coordenada só a Open-Meteo devolve um objeto; com várias, lista.
      var asList = function (r) {
        if (r.status !== "fulfilled") return [];
        return Array.isArray(r.value) ? r.value : [r.value];
      };
      var weather = asList(res[0]), marine = asList(res[1]);

      var start = new Date();
      start.setDate(start.getDate() - pastDays);
      var dates = [];
      for (var i = 0; i < pastDays + forecastDays; i++) {
        var d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(isoDay(d));
      }

      var data = {
        dates: dates,
        todayIdx: dates.indexOf(isoDay(new Date())),
        places: list.map(function (p) { return p.name; }).join(", "),
        series: {
          sst: dailySeries(marine, "hourly", "sea_surface_temperature", dates),
          current: dailySeries(marine, "hourly", "ocean_current_velocity", dates),
          waves: dailySeries(marine, "daily", "wave_height_max", dates),
          air: dailySeries(weather, "daily", "temperature_2m_mean", dates),
          wind: dailySeries(weather, "daily", "wind_speed_10m_mean", dates),
          windMax: dailySeries(weather, "daily", "wind_speed_10m_max", dates),
          rain: dailySeries(weather, "daily", "precipitation_sum", dates),
          radiation: dailySeries(weather, "daily", "shortwave_radiation_sum", dates),
          clouds: dailySeries(weather, "daily", "cloud_cover_mean", dates),
        },
      };
      cache[key] = { at: Date.now(), data: data };
      return data;
    });
  }

  // "2026-10-23" -> "23/10"
  function dayLabel(iso) {
    return iso.slice(8, 10) + "/" + iso.slice(5, 7);
  }

  // Vento e chuva MÊS A MÊS, do histórico diário da Open-Meteo (archive, ERA5):
  // os últimos NORMAL_YEARS anos até ~5 dias atrás. monthly(...).month("2026-12")
  // devolve o mês medido se ele já passou (≥ 20 dias com dado); senão o normal
  // do mesmo mês nesses anos (fonte "normal": não é previsão).
  var ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
  var NORMAL_YEARS = 10;
  var DIRS = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];

  function dirLabel(sumX, sumY) {
    if (!sumX && !sumY) return null;
    var ang = (Math.atan2(sumX, sumY) * 180) / Math.PI;
    return DIRS[Math.round(((ang + 360) % 360) / 45) % 8];
  }

  function monthly(opts) {
    var list = opts.place ? [opts.place] : placesFor(opts.region || "");
    var key = "m|" + list.map(function (p) { return p.land.join(","); }).join(";");
    var hit = cache[key];
    if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.data);

    var end = new Date();
    end.setDate(end.getDate() - 5); // o arquivo da Open-Meteo chega com ~5 dias de atraso
    var start = new Date(end.getFullYear() - NORMAL_YEARS, 0, 1);
    var land = coords(list, "land");
    return fetchJson(ARCHIVE_URL, Object.assign({}, land, {
      timezone: "America/Sao_Paulo", start_date: isoDay(start), end_date: isoDay(end),
      daily: "precipitation_sum,wind_speed_10m_mean,wind_direction_10m_dominant",
    })).then(function (r) {
      var resp = Array.isArray(r) ? r : [r];
      // por mês "AAAA-MM": somas dos dias (média entre os locais em cada dia)
      var byMonth = {};
      resp.forEach(function (one) {
        var d = one.daily;
        d.time.forEach(function (t, i) {
          var ym = t.slice(0, 7);
          var m = (byMonth[ym] = byMonth[ym] || { rain: [], wind: [], x: 0, y: 0 });
          if (typeof d.precipitation_sum[i] === "number") m.rain.push(d.precipitation_sum[i]);
          if (typeof d.wind_speed_10m_mean[i] === "number") m.wind.push(d.wind_speed_10m_mean[i]);
          var dir = d.wind_direction_10m_dominant[i];
          if (typeof dir === "number") {
            m.x += Math.sin((dir * Math.PI) / 180);
            m.y += Math.cos((dir * Math.PI) / 180);
          }
        });
      });
      var stats = {};
      Object.keys(byMonth).forEach(function (ym) {
        var m = byMonth[ym];
        stats[ym] = { rain: mean(m.rain), wind: mean(m.wind), windDir: dirLabel(m.x, m.y), days: m.rain.length / resp.length, x: m.x, y: m.y };
      });
      var full = Object.keys(stats).filter(function (ym) { return stats[ym].days >= 20; });
      var data = {
        places: list.map(function (p) { return p.name; }).join(", "),
        normalYears: NORMAL_YEARS,
        month: function (ym) {
          if (stats[ym] && stats[ym].days >= 20) return Object.assign({ fonte: "medido" }, stats[ym]);
          var same = full.filter(function (k) { return k.slice(5) === ym.slice(5); }).map(function (k) { return stats[k]; });
          if (!same.length) return null;
          return {
            fonte: "normal",
            rain: mean(same.map(function (s) { return s.rain; })),
            wind: mean(same.map(function (s) { return s.wind; })),
            windDir: dirLabel(same.reduce(function (a, s) { return a + s.x; }, 0), same.reduce(function (a, s) { return a + s.y; }, 0)),
          };
        },
      };
      cache[key] = { at: Date.now(), data: data };
      return data;
    });
  }

  return { load: load, monthly: monthly, dayLabel: dayLabel, PLACES: PLACES };
})();
