// Shared behavior of overlay panels: show the active state and handle edge resizing.
// Expects the page's preload to expose window.panelApi = { onState, resize, resizeEnd }.
(function () {
  const api = window.panelApi;

  api.onState((state) => {
    document.body.classList.toggle('active', state.active);
    document.documentElement.style.setProperty('--highlight', state.highlightColor);
  });

  // The window is frameless, so track the drag here and let main set the size.
  for (const handle of document.querySelectorAll('.resize')) {
    handle.addEventListener('pointerdown', (down) => {
      const edge = handle.dataset.edge;
      const start = { x: down.screenX, y: down.screenY, width: window.innerWidth, height: window.innerHeight };
      handle.setPointerCapture(down.pointerId);
      const move = (e) =>
        api.resize({
          width: edge === 'bottom' ? start.width : start.width + (e.screenX - start.x),
          height: edge === 'right' ? start.height : start.height + (e.screenY - start.y),
        });
      const up = () => {
        handle.removeEventListener('pointermove', move);
        api.resizeEnd();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
    });
  }
})();
