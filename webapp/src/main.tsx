import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (window.lectureLyft?.config.isElectron) {
  document.body.classList.add('electron-app')
  document.body.dataset.platform = window.lectureLyft.config.platform
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
