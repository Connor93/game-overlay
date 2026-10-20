const api = window.panelApi;

api.onState((state) => {
  document.querySelector('[data-nav="back"]').disabled = !state.canGoBack;
  document.querySelector('[data-nav="forward"]').disabled = !state.canGoForward;
  document.getElementById('error').hidden = !state.loadError;
  document.getElementById('errorText').textContent = state.loadError || '';
});

for (const button of document.querySelectorAll('[data-nav]')) {
  button.addEventListener('click', () => api.nav(button.dataset.nav));
}
