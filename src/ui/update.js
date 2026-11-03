// Offline support and updates. A new version installs in the background and waits; a small
// banner offers it on Home, and the page reloads only after the player taps Update, so
// nobody loses a puzzle in progress.
let waitingWorker = null;
let updateRequested = false;

function showBanner() {
  if (!waitingWorker || document.getElementById("update-banner") || document.getElementById("home").hidden) return;
  const banner = document.createElement("div");
  banner.id = "update-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = '<p>✨ A new version is ready.</p>'
    + '<button type="button" id="update-btn">Update</button>'
    + '<button type="button" id="update-later" class="secondary">Later</button>';
  document.body.appendChild(banner);
  document.getElementById("update-btn").addEventListener("click", () => {
    updateRequested = true;
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
    banner.remove();
  });
  document.getElementById("update-later").addEventListener("click", () => banner.remove());
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  try {
    const registration = await navigator.serviceWorker.register("service-worker.js");
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (updateRequested) location.reload();
    });
    const ready = (worker) => {
      waitingWorker = worker;
      showBanner();
    };
    if (registration.waiting && navigator.serviceWorker.controller) ready(registration.waiting);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) ready(worker);
      });
    });
    // Offer a waiting update whenever Home comes back into view.
    new MutationObserver(showBanner).observe(document.getElementById("home"), { attributes: true, attributeFilter: ["hidden"] });
  } catch {
    // No offline support here; the app still works online.
  }
}
