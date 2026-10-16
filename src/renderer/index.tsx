import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/index.css'
import { applyTheme, useSettingsStore } from './stores/settings-store'
import { reportWindowError } from './utils/report-error'

// Paint the first frame in the last-used theme; the saved setting from main
// confirms (or corrects) it once settings load.
applyTheme(useSettingsStore.getState().colorTheme)

// Errors nobody caught are sent to the site so they can be fixed.
window.addEventListener('error', (e) => reportWindowError(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => reportWindowError(e.reason))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
