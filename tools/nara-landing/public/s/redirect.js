function runRedirect() {
  const target =
    (document.body && document.body.getAttribute("data-target")) ||
    document.documentElement.getAttribute("data-target") ||
    "/";
  window.location.replace(target.startsWith("/") ? target : "/");
}
if (document.body) {
  runRedirect();
} else {
  window.addEventListener("DOMContentLoaded", runRedirect, { once: true });
}
