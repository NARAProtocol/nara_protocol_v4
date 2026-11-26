const SAFE_TARGETS = Object.freeze({
  "/": "/",
  "/vault": "/vault",
  "/#fameBoardSection": "/#fameBoardSection",
});

function runRedirect() {
  const raw =
    (document.body && document.body.getAttribute("data-target")) ||
    document.documentElement.getAttribute("data-target") ||
    "/";
  const dest = Object.prototype.hasOwnProperty.call(SAFE_TARGETS, raw)
    ? SAFE_TARGETS[raw]
    : "/";
  window.location.replace(dest);
}

if (document.body) {
  runRedirect();
} else {
  window.addEventListener("DOMContentLoaded", runRedirect, { once: true });
}
