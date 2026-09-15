/* Findspot booking widget loader (04-widget-embedding.md).
 * Tiny on purpose — every client site pays to download it. The real bundle
 * (widget.v4.js) is dynamically imported so sites whose widget is below the
 * fold only pay for this loader until it scrolls into view.
 *
 * Lives in the widget package but is NOT built by Vite — the build copies it
 * verbatim into server/src/public/ via the copyEmbedLoader plugin in
 * vite.config.js.
 */
(function () {
  var ASSET_BASE = 'https://book.findspot.net';

  function mount(el, config) {
    var shadow = el.attachShadow({ mode: 'open' });
    var styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = ASSET_BASE + '/widget.css';
    shadow.appendChild(styleLink);

    var mountPoint = document.createElement('div');
    shadow.appendChild(mountPoint);

    import(ASSET_BASE + '/widget.v4.js').then(function (mod) {
      mod.renderWidget(mountPoint, config);
    });
  }

  function init() {
    document.querySelectorAll('[data-findspot-widget]').forEach(function (el) {
      mount(el, { publicId: el.dataset.publicId, lang: el.dataset.lang });
    });

    window.FindspotBooking = window.FindspotBooking || { q: [] };
    (window.FindspotBooking.q || []).forEach(function (call) {
      if (call[0] === 'init') mount(document.querySelector(call[1].selector), call[1]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
