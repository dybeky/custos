import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/index.css'
import { applyTheme, useSettingsStore } from './stores/settings-store'

// Paint the first frame in the last-used theme; the saved setting from main
// confirms (or corrects) it once settings load.
applyTheme(useSettingsStore.getState().colorTheme)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
