(function () {
  var topbar = document.getElementById("topbar");
  if (!topbar) return;

  function updateTopbar() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    topbar.style.width = Math.min(100, Math.max(0, progress)) + "%";
  }

  window.addEventListener("scroll", updateTopbar, { passive: true });
  window.addEventListener("resize", updateTopbar);
  updateTopbar();
})();

(function () {
  var svg = document.getElementById("analysisSvg");
  if (!svg) return;
  var lines = Array.prototype.slice.call(
    svg.querySelectorAll(".analysis__line")
  );

  lines.forEach(function (line) {
    var length = line.getTotalLength();
    line.style.strokeDasharray = length;
    line.style.strokeDashoffset = length;
  });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        lines.forEach(function (line, i) {
          line.style.transition =
            "stroke-dashoffset 2.8s cubic-bezier(0.22, 1, 0.36, 1) " +
            i * 0.4 +
            "s";
          line.style.strokeDashoffset = "0";
        });
        observer.disconnect();
      });
    },
    { threshold: 0.3 }
  );
  observer.observe(svg);
})();

(function () {
  var container = document.getElementById("analysisStats");
  if (!container) return;
  var values = Array.prototype.slice.call(
    container.querySelectorAll(".stat__value")
  );
  var DURATION = 2400;

  function animateValue(el) {
    var target = parseFloat(el.getAttribute("data-count-to"));
    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var suffix = el.getAttribute("data-suffix") || "";
    var start = null;

    function format(value) {
      return (
        (decimals > 0
          ? value.toFixed(decimals).replace(".", ",")
          : String(Math.round(value))) + suffix
      );
    }

    function step(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / DURATION, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = format(target * eased);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = format(target);
      }
    }

    requestAnimationFrame(step);
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        values.forEach(animateValue);
        observer.disconnect();
      });
    },
    { threshold: 0.4 }
  );
  observer.observe(container);
})();

(function () {
  var btn = document.getElementById("hamburgerBtn");
  var menu = document.getElementById("mobileNav");

  btn.addEventListener("click", function () {
    var isOpen = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!isOpen));
    menu.classList.toggle("is-open", !isOpen);
  });
})();

(function () {
  var list = document.getElementById("layersLegendList");
  if (!list) return;
  var items = list.querySelectorAll(".layers__legend-item");

  list.addEventListener("click", function (event) {
    var toggle = event.target.closest(".layers__legend-toggle");
    if (!toggle) return;
    var clickedItem = toggle.closest(".layers__legend-item");
    var wasActive = clickedItem.classList.contains("is-active");
    var willOpenSome = !wasActive;

    list.classList.toggle("has-active", willOpenSome);

    items.forEach(function (item) {
      var isActive = willOpenSome && item === clickedItem;
      item.classList.toggle("is-active", isActive);
      item
        .querySelector(".layers__legend-toggle")
        .setAttribute("aria-expanded", String(isActive));
      var dot = item.querySelector(".layers__dot");
      dot.classList.toggle("layers__dot--active", isActive);
      dot.classList.toggle("layers__dot--outline", !isActive);
    });
  });
})();

(function () {
  var wrap = document.getElementById("problemCards");
  if (!wrap) return;
  var cards = Array.prototype.slice.call(wrap.querySelectorAll(".card"));
  var dots = document.querySelectorAll("#problemDots .problem__dot");
  var prevBtn = document.getElementById("problemPrev");
  var nextBtn = document.getElementById("problemNext");
  var SLIDE_MS = 500; // must match the left/height transition duration in CSS
  var EXIT_MS = 140;
  var ENTER_MS = 200;
  var EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  var busy = false;
  var POS_CLASSES = ["card--pos-left", "card--pos-center", "card--pos-right"];

  // pos = [leftCard, centerCard, rightCard] — logical slot assignment,
  // independent of the cards' original order in the HTML
  var pos = cards.slice();

  function setPos(card, cls) {
    POS_CLASSES.forEach(function (c) {
      card.classList.remove(c);
    });
    card.classList.add(cls);
  }

  function updateDots() {
    var centerIndex = cards.indexOf(pos[1]);
    dots.forEach(function (dot, i) {
      dot.classList.toggle("problem__dot--inactive", i !== centerIndex);
    });
  }

  // the exiting card has no smooth slide: it fades out in place, is
  // snapped (no transition) to the opposite edge while invisible,
  // then fades back in — that's its whole animation.
  function snapAndReveal(card, targetPosClass) {
    card.style.transition =
      "opacity " + ENTER_MS + "ms " + EASE + ", transform " + ENTER_MS + "ms " + EASE;
    setPos(card, targetPosClass);
    void card.offsetWidth; // commit the snap before animating opacity
    card.classList.remove("card--hidden");
    requestAnimationFrame(function () {
      card.style.transition = "";
    });
  }

  // shrinking and growing DO slide: their left position and height
  // transition together, so they visibly travel into their new slot
  // while resizing (growing only reaches full size once centered).
  function next() {
    if (busy) return;
    busy = true;
    var exiting = pos[0],
      shrinking = pos[1],
      growing = pos[2];

    exiting.classList.add("card--hidden");
    shrinking.classList.remove("card--tall");
    setPos(shrinking, "card--pos-left");
    growing.classList.add("card--tall");
    setPos(growing, "card--pos-center");

    setTimeout(function () {
      snapAndReveal(exiting, "card--pos-right");
      pos = [shrinking, growing, exiting];
      updateDots();
    }, EXIT_MS);

    setTimeout(function () {
      busy = false;
    }, SLIDE_MS);
  }

  function prev() {
    if (busy) return;
    busy = true;
    var exiting = pos[2],
      shrinking = pos[1],
      growing = pos[0];

    exiting.classList.add("card--hidden");
    shrinking.classList.remove("card--tall");
    setPos(shrinking, "card--pos-right");
    growing.classList.add("card--tall");
    setPos(growing, "card--pos-center");

    setTimeout(function () {
      snapAndReveal(exiting, "card--pos-left");
      pos = [exiting, growing, shrinking];
      updateDots();
    }, EXIT_MS);

    setTimeout(function () {
      busy = false;
    }, SLIDE_MS);
  }

  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);

  dots.forEach(function (dot, i) {
    dot.addEventListener("click", function () {
      if (busy) return;
      var target = cards[i];
      if (target === pos[1]) return;
      var others = pos.filter(function (card) {
        return card !== target;
      });
      pos.forEach(function (card) {
        card.classList.remove("card--tall");
      });
      target.classList.add("card--tall");
      setPos(others[0], "card--pos-left");
      setPos(target, "card--pos-center");
      setPos(others[1], "card--pos-right");
      pos = [others[0], target, others[1]];
      updateDots();
    });
  });

  updateDots();
})();

(function () {
  var header = document.getElementById("siteHeader");
  if (!header) return;

  function updateHeaderShadow() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle("header--scrolled", scrollTop > 4);
  }

  window.addEventListener("scroll", updateHeaderShadow, { passive: true });
  updateHeaderShadow();
})();

(function () {
  var targets = Array.prototype.slice.call(
    document.querySelectorAll(".split-text")
  );
  if (!targets.length) return;
  var counter = 0;

  function computeLabel(node) {
    var out = "";
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        out += child.tagName === "BR" ? " " : computeLabel(child);
      }
    });
    return out;
  }

  function wrapChars(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        var text = child.textContent.replace(/\s+/g, " ");
        var frag = document.createDocumentFragment();
        var words = text.split(" ");
        words.forEach(function (word, wordIndex) {
          if (word.length) {
            var wordSpan = document.createElement("span");
            wordSpan.className = "word";
            word.split("").forEach(function (ch) {
              var span = document.createElement("span");
              span.className = "char";
              span.style.setProperty("--i", String(counter++));
              span.textContent = ch;
              wordSpan.appendChild(span);
            });
            frag.appendChild(wordSpan);
          }
          if (wordIndex < words.length - 1) {
            frag.appendChild(document.createTextNode(" "));
          }
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
        wrapChars(child);
      }
    });
  }

  targets.forEach(function (el) {
    var label = computeLabel(el).replace(/\s+/g, " ").trim();
    var wrapper = document.createElement("span");
    wrapper.setAttribute("aria-hidden", "true");
    while (el.firstChild) {
      wrapper.appendChild(el.firstChild);
    }
    el.appendChild(wrapper);
    el.setAttribute("aria-label", label);
    counter = 0;
    wrapChars(wrapper);
  });
})();

(function () {
  var targets = Array.prototype.slice.call(
    document.querySelectorAll("[data-reveal]")
  );
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach(function (el) {
      el.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  targets.forEach(function (el) {
    observer.observe(el);
  });
})();

/* ---- ambient plankton field, drifting behind the whole page ---- */
(function () {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var cv = document.getElementById("plancton");
  if (!cv || !cv.getContext) return;
  var cx = cv.getContext("2d");
  var d = Math.min(devicePixelRatio || 1, 2);
  var W, H;

  function size() {
    W = cv.width = innerWidth * d;
    H = cv.height = innerHeight * d;
    cv.style.width = innerWidth + "px";
    cv.style.height = innerHeight + "px";
  }
  size();
  addEventListener("resize", size);

  var particles = [];
  for (var i = 0; i < 60; i++) {
    particles.push({
      x: Math.random(),
      y: Math.random(),
      r: 0.7 + Math.random() * 2.1,
      v: 0.012 + Math.random() * 0.045,
      f: Math.random() * 6.28,
      a: 0.05 + Math.random() * 0.12,
    });
  }

  var lastY = window.scrollY || 0;
  var push = 0;
  addEventListener(
    "scroll",
    function () {
      var y = window.scrollY || document.documentElement.scrollTop;
      push = y - lastY;
      lastY = y;
    },
    { passive: true }
  );

  function paint() {
    cx.clearRect(0, 0, W, H);
    particles.forEach(function (p) {
      p.y -= p.v / 1000 + push * 0.0006 * (p.r / 2);
      p.f += 0.007;
      if (p.y < -0.06) p.y = 1.06;
      if (p.y > 1.06) p.y = -0.06;
      cx.beginPath();
      cx.ellipse((p.x + Math.sin(p.f) * 0.014) * W, p.y * H, p.r * d, p.r * 1.6 * d, p.f, 0, 6.283);
      cx.fillStyle = "rgba(15, 118, 110, " + p.a + ")";
      cx.fill();
    });
    push *= 0.88;
    requestAnimationFrame(paint);
  }
  paint();
})();
