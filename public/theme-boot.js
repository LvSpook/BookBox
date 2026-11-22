/* Theme bootstrap. Runs synchronously in <head> so the first paint already has
   the right palette — no dark flash for light-mode users.
   Classic script on purpose: extension pages block inline script under MV3 CSP. */
(function () {
  var theme = 'dark';
  try {
    theme = localStorage.getItem('bookbox-theme') || 'dark';
  } catch (e) {
    /* private mode or blocked storage */
  }
  var resolved = theme;
  if (theme === 'system') {
    resolved =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : 'dark');
})();
