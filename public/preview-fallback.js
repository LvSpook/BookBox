/* Preview page guard (classic script, so it also runs where modules cannot).
   Browsers refuse to load ES modules over file://, which would otherwise leave
   the preview frame blank with no explanation. Detect that case and say what to
   do instead of showing an empty page. */
(function () {
  'use strict';

  if (location.protocol !== 'file:') return;

  function showMessage() {
    var frame = document.getElementById('preview-frame');
    if (!frame || document.body.dataset.demoReady === '1') return;
    frame.innerHTML =
      '<div class="install-card" style="margin:0">' +
      '<h2>The demo needs a local web server</h2>' +
      '<p class="note">You opened this file directly from disk. Browsers block the ' +
      'page\'s JavaScript in that mode, so the interactive demo cannot start.</p>' +
      '<p class="note">Either install the extension (the popup and settings page work ' +
      'once loaded unpacked), or run one of these inside the <code>public</code> folder ' +
      'and open <code>http://localhost:8000</code>:</p>' +
      '<p class="note"><code>python -m http.server 8000</code><br>' +
      '<code>npx serve .</code></p>' +
      '<p class="note">The hosted demo at ' +
      '<a href="https://lvspook.github.io/BookBox/">lvspook.github.io/BookBox</a> ' +
      'needs no setup.</p>' +
      '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showMessage);
  } else {
    showMessage();
  }
})();
