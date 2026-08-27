import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const PRELOAD_RELOAD_KEY = 'jobscan_preload_reload';

// Recover once when a browser still references a chunk from an older deploy.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (sessionStorage.getItem(PRELOAD_RELOAD_KEY)) return;
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1');
  window.location.reload();
});

// Register service worker for production PWA support with loop-safe reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    const lastReload = parseInt(sessionStorage.getItem('sitetactix_sw_reload_ts') || '0', 10);
    const now = Date.now();
    // Prevent reload loops: only reload if at least 5 seconds have passed since last reload
    if (now - lastReload < 5000) return;
    
    refreshing = true;
    sessionStorage.setItem('sitetactix_sw_reload_ts', String(now));
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update();
        console.log('Service Worker registered successfully:', reg.scope);

        // Check for updates on foreground resume (app switch / tab focus)
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            const now = Date.now();
            // Throttle foreground checks to at most once every 30 seconds
            if (now - lastCheck > 30000) {
              lastCheck = now;
              reg.update().catch(() => {});
            }
          }
        });
      })
      .catch(err => console.error('Service Worker registration failed:', err));

    setTimeout(() => sessionStorage.removeItem(PRELOAD_RELOAD_KEY), 5000);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

