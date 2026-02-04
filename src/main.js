import { createApp } from 'vue'
import './styles/main.css'
import App from './App.vue'
import { setFatalError } from './utils/fatalError.js'

const app = createApp(App)

// Global error handler: uncaught errors in components (render, watchers, etc.)
app.config.errorHandler = (err) => {
  console.error('[Fatal]', err)
  setFatalError(err)
}

app.mount('#app')

// Browser-level handlers for uncaught errors (only after app is mounted)
window.addEventListener('error', (event) => {
  if (event.message) {
    setFatalError(event.message)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message ?? event.reason ?? 'Unhandled promise rejection'
  setFatalError(msg)
})
