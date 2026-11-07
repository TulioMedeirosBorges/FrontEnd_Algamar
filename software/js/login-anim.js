// Animações da tela de login (painel do mapa + transição de entrada).
//
// Princípios (da skill motion-reel, adaptados para uma página viva):
//  - Tudo é função de um único tempo t: nada de Math.random, timers ou
//    transições CSS soltas. Por isso dá pra congelar qualquer quadro:
//      login.html?t=2.5           → mapa no segundo 2,5
//      login.html?e=1.2           → transição de entrada no segundo 1,2
//    ou, pelo console, window.seek(tMapa, tEntrada).
//  - Movimento com molas (mola amortecida), não "tudo entrando com fade".
//  - Com "reduzir movimento" ligado no sistema, o mapa é desenhado parado
//    e a transição de entrada é pulada.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const params = new URLSearchParams(window.location.search);

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeInOut = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Mola amortecida partindo de 0 e assentando em 1 (com overshoot).
  // zeta = amortecimento (menor → mais "quique"), w = rigidez.
  function mola(t, zeta = 0.55, w = 13) {
    if (t <= 0) return 0;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    return (
      1 -
      Math.exp(-zeta * w * t) *
        (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t))
    );
  }

  // Coordenadas do SVG do mapa (viewBox 0 0 762 565.269).
  const MAP_W = 762;
  const MAP_H = 565.269;

  // ============================================================ MAPA
  const visual = document.querySelector(".login-visual");
  const wavesSvg = document.getElementById("loginWaves");
  const mapEl = document.getElementById("loginMap");
  const routePath = document.getElementById("loginRoute");
  const surf1 = document.getElementById("loginSurf1");
  const surf2 = document.getElementById("loginSurf2");

  // Estações: calculadas ao longo da própria linha da costa (frações do
  // comprimento do litoral), afastadas um pouco para o mar. Assim ficam
  // sempre coladas no litoral, na ordem em que o pulso passa.
  const STATION_FRACS = [0.05, 0.15, 0.25, 0.36, 0.47, 0.58, 0.69, 0.8, 0.9];
  const STATION_OFFSET = 20; // distância da costa, em unidades do mapa
  const STATIONS = [];

  function computeStations() {
    const coast = document.getElementById("loginSurf1"); // linha da costa
    const land = document.getElementById("loginLand");
    if (!coast) return;
    const len = coast.getTotalLength();
    for (const f of STATION_FRACS) {
      const a = coast.getPointAtLength(len * f);
      const b = coast.getPointAtLength(Math.min(len, len * f + 4));
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const n = Math.hypot(tx, ty) || 1;
      // Normal apontando para o mar (a costa vai de cima-direita para
      // baixo-esquerda, então o mar fica à "direita-baixo" da tangente).
      const nx = ty / n;
      const ny = -tx / n;
      let off = STATION_OFFSET;
      let p = { x: a.x + nx * off, y: a.y + ny * off };
      // Em reentrâncias, afasta mais até sair de cima da terra.
      if (land?.isPointInFill) {
        const pt = new DOMPoint(p.x, p.y);
        while (off < 70 && land.isPointInFill(pt)) {
          off += 6;
          pt.x = a.x + nx * off;
          pt.y = a.y + ny * off;
        }
        p = { x: pt.x, y: pt.y };
      }
      STATIONS.push([p.x, p.y]);
    }
  }

  // Rota suave passando por todas as estações (Catmull-Rom → Bézier).
  function routeThrough(pts) {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1.map((v) => v.toFixed(1)).join(" ")} ${c2
        .map((v) => v.toFixed(1))
        .join(" ")} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }

  let waveLines = [];
  let W = 0;
  let H = 0;

  function layoutWaves() {
    if (!visual || !wavesSvg) return;
    const r = visual.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    wavesSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    wavesSvg.textContent = "";
    waveLines = [];

    const gap = Math.max(46, H * 0.135);
    const n = Math.ceil(H / gap) + 2;
    for (let i = 0; i < n; i++) {
      const far = i % 3 === 2;
      const base = document.createElementNS(NS, "path");
      base.setAttribute("class", far ? "login-wave login-wave--far" : "login-wave");
      wavesSvg.appendChild(base);

      // Algumas linhas ganham um brilho menta que corre por cima delas.
      let glint = null;
      if (i % 3 === 1) {
        glint = document.createElementNS(NS, "path");
        glint.setAttribute("class", "login-wave login-wave--glint");
        glint.setAttribute("pathLength", "1");
        glint.setAttribute("stroke-dasharray", "0.07 0.93");
        wavesSvg.appendChild(glint);
      }

      waveLines.push({
        base,
        glint,
        y0: (i - 0.6) * gap + (far ? gap * 0.45 : 0),
        amp: gap * (far ? 0.18 : 0.3) * (1 + 0.12 * Math.sin(i * 1.7)),
        phase: i * 0.85,
        speed: (far ? 0.22 : 0.38) + 0.05 * (i % 4),
        glintSpeed: 0.045 + 0.012 * (i % 2),
        glintPhase: i * 0.37,
      });
    }
  }

  // Cada linha é a soma de duas senoides que andam em sentidos opostos:
  // a onda ondula de verdade em vez de só deslizar.
  function drawWaves(t) {
    const k = (2 * Math.PI) / W;
    const steps = 56;
    const grow = clamp(mola(t - 0.05, 0.75, 6), 0, 1.2);
    for (const L of waveLines) {
      let d = "";
      for (let s = 0; s <= steps; s++) {
        const x = (W * s) / steps;
        const y =
          L.y0 +
          L.amp * grow * Math.sin(k * x + L.phase - t * L.speed) +
          L.amp * 0.32 * grow * Math.sin(k * 2.4 * x - L.phase * 1.3 + t * L.speed * 1.7);
        d += (s ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      }
      L.base.setAttribute("d", d);
      if (L.glint) {
        L.glint.setAttribute("d", d);
        const off = (L.glintPhase - t * L.glintSpeed) % 1;
        L.glint.setAttribute("stroke-dashoffset", off.toFixed(4));
        L.glint.style.opacity = (0.55 * clamp((t - 1.2) / 0.8)).toFixed(3);
      }
    }
  }

  // Estações, anéis e pulso (HTML, posicionados em % do mapa).
  const stationEls = [];
  let pulseEl = null;
  let routeLen = 0;
  const arrivals = []; // fração da rota em que o pulso chega a cada estação

  function buildStations() {
    if (!mapEl) return;
    computeStations();
    if (routePath && STATIONS.length > 1) {
      routePath.setAttribute("d", routeThrough(STATIONS));
    }
    STATIONS.forEach(([x, y]) => {
      const el = document.createElement("span");
      el.className = "login-station";
      el.style.setProperty("--x", `${(x / MAP_W) * 100}%`);
      el.style.setProperty("--y", `${(y / MAP_H) * 100}%`);
      const r1 = document.createElement("span");
      const r2 = document.createElement("span");
      r1.className = r2.className = "login-station__ring";
      el.append(r1, r2);
      mapEl.appendChild(el);
      stationEls.push({ el, rings: [r1, r2] });
    });
    pulseEl = document.createElement("span");
    pulseEl.className = "login-pulse";
    mapEl.appendChild(pulseEl);

    if (routePath) {
      routeLen = routePath.getTotalLength();
      // Acha, por busca simples, o ponto da rota mais perto de cada estação.
      STATIONS.forEach(([sx, sy]) => {
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i <= 200; i++) {
          const p = routePath.getPointAtLength((routeLen * i) / 200);
          const dd = (p.x - sx) ** 2 + (p.y - sy) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = i / 200;
          }
        }
        arrivals.push(best);
      });
    }
  }

  const PULSE_START = 1.8; // s
  const PULSE_TRAVEL = 4.6; // s para percorrer a rota
  const PULSE_PERIOD = 6.6; // s entre um pulso e outro

  // Logo e textos do painel sobem com mola, em sequência.
  const introEls = [
    [".login-visual__logo", 0.1],
    [".login-visual__eyebrow", 0.35],
    [".login-visual__headline", 0.5],
    [".login-visual__caption", 0.7],
  ]
    .map(([sel, d]) => [document.querySelector(sel), d])
    .filter(([el]) => el);

  function drawMap(t) {
    for (const [el, d] of introEls) {
      const lt = t - d;
      const m = mola(lt, 0.75, 9);
      el.style.opacity = clamp(lt * 3.5).toFixed(3);
      el.style.transform = `translateY(${((1 - m) * 18).toFixed(2)}px)`;
    }

    // Mapa desce de leve com mola ao abrir a página.
    if (mapEl) {
      const m = mola(t - 0.05, 0.7, 8);
      mapEl.style.transform = `translateY(${((1 - m) * -7).toFixed(3)}%)`;
    }

    // Espuma correndo ao longo da costa, em sentidos opostos.
    if (surf1 && surf2) {
      surf1.setAttribute("stroke-dasharray", "0.012 0.02");
      surf1.setAttribute("stroke-dashoffset", (-t * 0.012).toFixed(4));
      surf2.setAttribute("stroke-dasharray", "0.006 0.03");
      surf2.setAttribute("stroke-dashoffset", (t * 0.008).toFixed(4));
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.3);
      surf1.style.opacity = ((0.3 + 0.2 * breathe) * clamp((t - 0.5) / 0.6)).toFixed(3);
      surf2.style.opacity = ((0.12 + 0.12 * (1 - breathe)) * clamp((t - 0.7) / 0.6)).toFixed(3);
    }

    // Rota tracejada "anda" devagar.
    if (routePath) {
      routePath.style.strokeDashoffset = (-t * 6).toFixed(2);
      routePath.style.opacity = (0.35 * clamp((t - 1.3) / 0.6)).toFixed(3);
    }

    // Tempo dentro do ciclo do pulso.
    const tp = t - PULSE_START;
    const cycle = tp >= 0 ? tp % PULSE_PERIOD : -1;

    if (pulseEl && routeLen && cycle >= 0 && cycle <= PULSE_TRAVEL) {
      const u = easeInOut(cycle / PULSE_TRAVEL);
      const p = routePath.getPointAtLength(u * routeLen);
      pulseEl.style.setProperty("--x", `${(p.x / MAP_W) * 100}%`);
      pulseEl.style.setProperty("--y", `${(p.y / MAP_H) * 100}%`);
      const edge = Math.min(cycle, PULSE_TRAVEL - cycle);
      pulseEl.style.opacity = clamp(edge / 0.25).toFixed(3);
    } else if (pulseEl) {
      pulseEl.style.opacity = "0";
    }

    stationEls.forEach(({ el, rings }, i) => {
      // Entrada: cada estação "estala" com mola, em sequência.
      const pop = mola(t - 0.9 - i * 0.07, 0.45, 15);

      // Quanto tempo desde que o pulso passou por esta estação.
      let dt = Infinity;
      if (tp >= 0 && arrivals.length) {
        // Inverte o easeInOut para achar o instante de chegada.
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < 20; k++) {
          const mid = (lo + hi) / 2;
          if (easeInOut(mid) < arrivals[i]) lo = mid;
          else hi = mid;
        }
        const arrive = lo * PULSE_TRAVEL;
        dt = cycle - arrive;
        if (dt < 0) dt += PULSE_PERIOD;
        if (tp < arrive) dt = Infinity; // pulso ainda não chegou pela 1ª vez
      }

      // Pulso chega: estação dá um "soco" e acende; dois anéis se abrem.
      const kick = dt < 2 ? Math.exp(-5 * dt) * Math.sin(14 * dt) * 0.7 : 0;
      el.style.setProperty("--s", (pop + kick).toFixed(3));
      el.style.setProperty("--glow", clamp(1 - dt / 0.9).toFixed(3));

      rings.forEach((ring, r) => {
        const u = (dt - r * 0.3) / 1.5;
        if (u >= 0 && u <= 1) {
          const e = easeOut(u);
          ring.style.transform = `scale(${(1 + 5 * e).toFixed(3)})`;
          ring.style.opacity = ((1 - u) * 0.85).toFixed(3);
        } else {
          ring.style.opacity = "0";
        }
      });
    });

    drawWaves(t);
  }

  // ============================================================ ENTRADA
  const entryEl = document.getElementById("loginEntry");
  const seaSvg = document.getElementById("loginEntrySea");
  const seaLayers = seaSvg ? [...seaSvg.querySelectorAll("path")] : [];
  const logoEl = document.getElementById("loginEntryLogo");
  const lineEl = document.getElementById("loginEntryLine");
  const textEl = document.getElementById("loginEntryText");

  // Peças do logo (caixas medidas em LogoBranca.png, 932×640).
  const LOGO_W = 932;
  const LOGO_H = 640;
  const PIECES = [
    // símbolo da esquerda: 4 pétalas em 2×2 + base em onda
    { id: "a1", box: [0, 0, 175, 175], kind: "petal", d: 0.0, spin: -1 },
    { id: "a2", box: [215, 0, 390, 175], kind: "petal", d: 0.07, spin: 1 },
    { id: "a4", box: [215, 209, 390, 384], kind: "petal", d: 0.14, spin: 1 },
    { id: "a3", box: [0, 209, 175, 384], kind: "petal", d: 0.21, spin: -1 },
    { id: "a5", box: [0, 417, 390, 640], kind: "base", d: 0.3 },
    // letra da direita: 4 peças que caem
    { id: "b1", box: [508, 216, 692, 400], kind: "drop", d: 0.18 },
    { id: "b2", box: [748, 216, 932, 400], kind: "drop", d: 0.25 },
    { id: "b3", box: [508, 456, 692, 640], kind: "drop", d: 0.32 },
    { id: "b4", box: [748, 456, 932, 640], kind: "drop", d: 0.39 },
  ];
  const pieceEls = [];

  function buildLogo() {
    if (!logoEl) return;
    for (const p of PIECES) {
      const [x0, y0, x1, y1] = p.box;
      const w = x1 - x0;
      const h = y1 - y0;
      const el = document.createElement("span");
      el.className = "login-logo-piece";
      el.style.left = `${(x0 / LOGO_W) * 100}%`;
      el.style.top = `${(y0 / LOGO_H) * 100}%`;
      el.style.width = `${(w / LOGO_W) * 100}%`;
      el.style.height = `${(h / LOGO_H) * 100}%`;
      el.style.backgroundSize = `${(LOGO_W / w) * 100}% ${(LOGO_H / h) * 100}%`;
      el.style.backgroundPosition = `${LOGO_W === w ? 0 : (x0 / (LOGO_W - w)) * 100}% ${
        LOGO_H === h ? 0 : (y0 / (LOGO_H - h)) * 100
      }%`;
      if (p.kind === "base") el.style.transformOrigin = "0% 50%";
      logoEl.appendChild(el);
      pieceEls.push({ el, p });
    }
    for (let i = 0; i < 2; i++) {
      const r = document.createElement("span");
      r.className = "login-entry__ripple";
      logoEl.prepend(r);
      rippleEls.push(r);
    }
  }
  const rippleEls = [];

  const contentEl = entryEl?.querySelector(".login-entry__content");

  const ENTRY_DURATION = 2.9; // s até redirecionar
  const LOGO_START = 0.85;

  // Abertura da página: mar fechado → logo se monta → ondas recuam.
  const INTRO_LOGO_START = 0.25;
  const INTRO_RECEDE = 1.75; // quando as ondas começam a recuar
  const INTRO_DURATION = 2.95;
  const INTRO_MAP_DELAY = 2.05; // o mapa começa a se animar quando aparece

  // mode "entry" = depois do login (ondas sobem, texto "Carregando painel").
  // mode "intro" = ao abrir a página (já começa coberto; ondas descem).
  function drawEntry(te, mode = "entry") {
    const intro = mode === "intro";
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (seaSvg) seaSvg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    seaLayers.forEach((path, i) => {
      // Na entrada sobem menta → azul → navy; na abertura recuam ao contrário
      // (navy sai primeiro, revelando azul e menta, depois a página).
      const p = intro
        ? 1 - easeInOut(clamp((te - INTRO_RECEDE - (2 - i) * 0.13) / 0.9))
        : easeInOut(clamp((te - i * 0.14) / 0.95));
      const front = vh * (1.08 - 1.3 * p);
      const amp = (22 + vh * 0.055) * (1 - 0.75 * p);
      const k = (2 * Math.PI) / vw;
      let d = `M0 ${vh + 10}`;
      const steps = 48;
      for (let s = 0; s <= steps; s++) {
        const x = (vw * s) / steps;
        const y =
          front +
          amp * Math.sin(k * 1.25 * x + te * 5 + i * 1.4) +
          amp * 0.4 * Math.sin(k * 3.1 * x - te * 7 + i);
        d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      d += `L${vw} ${vh + 10}Z`;
      path.setAttribute("d", d);
    });

    // Logo montando peça por peça.
    const tl = te - (intro ? INTRO_LOGO_START : LOGO_START);
    for (const { el, p } of pieceEls) {
      const lt = tl - p.d;
      let m;
      let tf;
      if (p.kind === "petal") {
        m = mola(lt, 0.5, 14);
        tf = `scale(${m.toFixed(3)}) rotate(${((1 - m) * 110 * p.spin).toFixed(1)}deg)`;
      } else if (p.kind === "base") {
        m = mola(lt, 0.6, 12);
        tf = `translateX(${((1 - m) * -25).toFixed(2)}%) scaleX(${clamp(m, 0, 1.2).toFixed(3)})`;
      } else {
        m = mola(lt, 0.42, 15);
        tf = `translateY(${((1 - m) * -140).toFixed(1)}%)`;
      }
      el.style.transform = tf;
      el.style.opacity = clamp(lt * 7).toFixed(3);
    }
    // Gota na água: dois anéis se abrem quando as peças assentam.
    rippleEls.forEach((r, i) => {
      const u = (tl - 0.5 - i * 0.22) / 0.95;
      if (u >= 0 && u <= 1) {
        const e = easeOut(u);
        r.style.transform = `scale(${(0.6 + 1.3 * e).toFixed(3)})`;
        r.style.opacity = ((1 - u) * (1 - u) * 0.5).toFixed(3);
      } else {
        r.style.opacity = "0";
      }
    });

    if (logoEl) {
      const settle = tl - 0.9;
      const bob = settle > 0 ? Math.sin(settle * 3.2) * 3 * clamp(settle / 0.4) : 0;
      logoEl.style.transform = `translateY(${bob.toFixed(2)}px)`;
    }

    // Linha de onda se desenha, texto sobe com mola.
    if (lineEl) {
      const lp = intro
        ? easeInOut(clamp((te - 0.8) / 0.75))
        : easeInOut(clamp((te - 1.45) / 0.9));
      lineEl.style.strokeDashoffset = (1 - lp).toFixed(4);
    }

    // Na abertura, logo + linha afundam junto com o mar que recua.
    if (contentEl) {
      if (intro) {
        const x = easeInOut(clamp((te - (INTRO_RECEDE - 0.15)) / 0.5));
        contentEl.style.transform = `translateY(${(x * 46).toFixed(2)}px) scale(${(1 - 0.12 * x).toFixed(3)})`;
        contentEl.style.opacity = (1 - x).toFixed(3);
      } else {
        contentEl.style.transform = "";
        contentEl.style.opacity = "";
      }
    }
    if (textEl && intro) {
      textEl.style.opacity = "0";
    } else if (textEl) {
      const tt = te - 1.75;
      const m = mola(tt, 0.7, 10);
      const blink = tt > 0.6 ? 0.72 + 0.28 * Math.cos((tt - 0.6) * 5) : 1;
      textEl.style.opacity = (clamp(tt * 4) * blink).toFixed(3);
      textEl.style.transform = `translateY(${((1 - m) * 12).toFixed(2)}px)`;
    }
  }

  // ============================================================ RELÓGIO
  // fixedMap / fixedEntry: quando definidos, congelam o quadro (modo seek).
  let fixedMap = params.has("t") ? parseFloat(params.get("t")) : null;
  let fixedEntry = params.has("e") ? parseFloat(params.get("e")) : null;
  let fixedIntro = params.has("i") ? parseFloat(params.get("i")) : null;
  let t0 = performance.now();
  let entryStart = null;
  let entryDone = null;
  // Abertura: roda ao abrir a página, a menos que esteja congelando quadros
  // do mapa/entrada ou com "reduzir movimento".
  let introStart =
    !REDUCE && fixedMap == null && fixedEntry == null ? performance.now() : null;
  let mapDelay = introStart != null || fixedIntro != null ? INTRO_MAP_DELAY : 0;

  function endIntro() {
    introStart = null;
    entryEl?.classList.remove("is-intro", "is-active", "is-drawn");
    if (contentEl) {
      contentEl.style.transform = "";
      contentEl.style.opacity = "";
    }
  }

  // Clique ou tecla durante a abertura: pula direto para o recuo das ondas.
  function skipIntro() {
    if (introStart == null) return;
    const te = (performance.now() - introStart) / 1000;
    if (te < INTRO_RECEDE - 0.15) {
      const jump = INTRO_RECEDE - 0.15 - te;
      introStart -= jump * 1000;
      t0 -= jump * 1000;
    }
  }

  function frame(now) {
    const tMap = fixedMap ?? (now - t0) / 1000 - mapDelay;
    drawMap(tMap);

    if (fixedIntro != null) {
      entryEl?.classList.add("is-active", "is-drawn");
      drawEntry(fixedIntro, "intro");
    } else if (introStart != null) {
      const ti = (now - introStart) / 1000;
      drawEntry(ti, "intro");
      entryEl?.classList.add("is-drawn");
      if (ti >= INTRO_DURATION) endIntro();
    } else if (fixedEntry != null) {
      entryEl?.classList.add("is-active");
      drawEntry(fixedEntry);
    } else if (entryStart != null) {
      const te = (now - entryStart) / 1000;
      drawEntry(te);
      if (te >= ENTRY_DURATION && entryDone) {
        const cb = entryDone;
        entryDone = null;
        cb();
      }
    }

    if (!REDUCE || entryStart != null || introStart != null) {
      requestAnimationFrame(frame);
    }
  }

  function init() {
    layoutWaves();
    buildStations();
    buildLogo();
    if (window.ResizeObserver && visual) {
      new ResizeObserver(() => {
        layoutWaves();
        if (REDUCE) drawMap(8);
      }).observe(visual);
    }
    if (REDUCE && fixedMap == null) fixedMap = 8; // quadro final, parado
    if (introStart == null && fixedIntro == null) endIntro();
    else {
      entryEl?.classList.add("is-active");
      window.addEventListener("pointerdown", skipIntro);
      window.addEventListener("keydown", skipIntro);
    }
    requestAnimationFrame(frame);
  }

  // API usada por login.js e para testes.
  window.AlgamarLoginAnim = {
    // Toca a transição de entrada e chama onDone no fim.
    playEntry(onDone) {
      if (REDUCE || !entryEl) {
        onDone?.();
        return;
      }
      endIntro();
      entryEl.classList.add("is-active");
      entryStart = performance.now();
      entryDone = onDone || null;
      drawEntry(0);
      requestAnimationFrame(frame);
    },
    // Para a transição e esconde o overlay (usado no modo de teste).
    resetEntry() {
      entryStart = null;
      entryDone = null;
      entryEl?.classList.remove("is-active");
    },
    ENTRY_DURATION,
  };

  // window.seek(tMapa, tEntrada): congela um quadro (null = volta a rodar).
  window.seek = (tMap, tEntry) => {
    fixedMap = tMap ?? null;
    fixedEntry = tEntry ?? null;
    if (fixedEntry == null) entryEl?.classList.remove("is-active");
    requestAnimationFrame(frame);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
