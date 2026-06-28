import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Automatically register PWA Service Worker for offline static assets
if ('serviceWorker' in navigator) {
  registerSW({
    onNeedRefresh() {
      console.log('[PWA] New content is available; please refresh.');
    },
    onOfflineReady() {
      console.log('[PWA] App is ready for offline usage.');
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
