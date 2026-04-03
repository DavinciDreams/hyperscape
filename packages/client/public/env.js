/**
 * Runtime public env bootstrap (no secrets).
 *
 * Served as a static file from Vite public/ in dev (not proxied), so window.env exists
 * even when the game server on :5555 is down or restarting.
 *
 * Only fills defaults on loopback hosts so production (hyperscape.club, etc.) is unchanged.
 */
(function () {
  if (typeof window === "undefined") return;
  var h = window.location.hostname;
  var loopback =
    h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  if (!loopback) return;

  window.env = window.env || {};
  if (!window.env.PUBLIC_API_URL) {
    window.env.PUBLIC_API_URL = "http://127.0.0.1:5555";
  }
  if (!window.env.PUBLIC_WS_URL) {
    window.env.PUBLIC_WS_URL = "ws://127.0.0.1:5556/ws";
  }
  if (!window.env.PUBLIC_CDN_URL) {
    window.env.PUBLIC_CDN_URL = "http://127.0.0.1:5555/game-assets";
  }
})();
