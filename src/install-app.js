// Samsung Internet uses the manifest and service worker to offer app installation.
// The installed app's standalone mode leaves navigation to the phone's Back button.
if ('serviceWorker' in navigator && window.isSecureContext) {
  const register = () => navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
    .catch(error => console.warn('2SPEAKER app installation setup failed:', error));

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
