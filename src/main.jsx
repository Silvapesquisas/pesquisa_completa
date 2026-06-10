import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Service worker: permite abrir o app sem conexão (registrado só em produção
// para não interferir no hot-reload durante o desenvolvimento)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('Falha ao registrar o service worker:', err)
    })
  })
}
