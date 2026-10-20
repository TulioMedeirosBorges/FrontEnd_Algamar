(function () {
  var rail = document.getElementById("sideRail");
  var fill = document.getElementById("railFill");
  var marker = document.getElementById("railMarker");
  var label = document.getElementById("railLabel");
  var percentEl = document.getElementById("railPercent");
  if (!rail || !fill || !label || !percentEl) return;

  var checkpoints = Array.prototype.slice
    .call(document.querySelectorAll("[data-checkpoint]"))
    .map(function (el) {
      return { el: el, text: el.getAttribute("data-checkpoint-label") };
    });

  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }

  function updateRail() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - innerHeight;
    var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progress = clamp(progress, 0, 100);

    fill.style.height = progress + "%";
    if (marker) marker.style.top = progress + "%";
    percentEl.textContent = Math.round(progress) + "%";

    var current = checkpoints[0];
    for (var i = 0; i < checkpoints.length; i++) {
      if (checkpoints[i].el.getBoundingClientRect().top <= 160) current = checkpoints[i];
    }
    if (current) label.textContent = current.text;
  }

  var throttled = false;
  function onScroll() {
    if (throttled) return;
    throttled = true;
    requestAnimationFrame(function () {
      updateRail();
      throttled = false;
    });
  }

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  updateRail();
})();
