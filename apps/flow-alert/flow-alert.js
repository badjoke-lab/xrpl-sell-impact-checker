import('/apps/flow-alert/flow-alert-runtime.js').catch(() => {
  const status = document.querySelector('[data-flow-meta="status"]');
  if (status) status.textContent = 'ERROR';
});
