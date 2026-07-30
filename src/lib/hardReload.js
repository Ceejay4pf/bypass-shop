/* ---------------------------------------------------------
   Hard reset — clear every cached file and the service worker,
   then reload from the network.

   An installed PWA can get stuck on an old copy of the app after a
   deploy: the cached files reference JavaScript the server has since
   replaced. On a phone that shows up as a blank screen, or as a login
   that says "can't fetch" because the old build is calling something
   that no longer answers. This is the way out, and it's shared by the
   crash screen and the login screen.
--------------------------------------------------------- */
export async function hardReload() {
  try {
    // Drop every cached file so the phone can't reload the broken build.
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  try {
    // Unregister the service worker so the fresh files are fetched.
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  // Reload from the network with a cache-busting query so no stale
  // index.html can be served back to us.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("fresh", String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
