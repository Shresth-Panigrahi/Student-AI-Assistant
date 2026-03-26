import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
// import NavigationLoader from './components/NavigationLoader'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import RecordingSession from './pages/RecordingSession'
import History from './pages/History'
import TranscriptDetail from './pages/TranscriptDetail'
import ChatSession from './pages/ChatSession'
import LandingPage from './pages/LandingPage'
import DesktopChrome from './components/desktop/DesktopChrome'
import UpdateBanner from './components/desktop/UpdateBanner'
import { useElectron } from './electron/useElectron'
// import { useState } from 'react'

function AppContent() {
  const isAuth = !!localStorage.getItem('user') // Matching Auth.tsx logic
  const electron = useElectron()
  const topOffset = electron.useCustomTitleBar ? 48 : 0
  const appPaddingTop = electron.useCustomTitleBar ? 'pt-12' : ''

  // Note: Previous "InitialSplash" is removed in favor of LandingPage

  return (
    <>
      <AnimatePresence mode="wait">
        {/* {showLoader && <NavigationLoader key="nav-loader" />} */}
      </AnimatePresence>

      {electron.useCustomTitleBar && (
        <DesktopChrome
          isMaximized={electron.isMaximized}
          onMinimize={electron.windowControls.minimize}
          onToggleMaximize={electron.windowControls.maximize}
          onClose={electron.windowControls.close}
        />
      )}

      <UpdateBanner
        status={electron.updateStatus}
        offsetTop={topOffset}
        onDismiss={electron.dismissUpdate}
        onInstall={electron.installUpdate}
        onCheck={electron.checkForUpdates}
      />

      <div className={`min-h-screen bg-true-black ${appPaddingTop}`}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={isAuth ? <Navigate to="/dashboard" replace /> : <Auth />} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={isAuth ? <Dashboard /> : <Navigate to="/auth" replace />} />
          <Route path="/session" element={isAuth ? <RecordingSession /> : <Navigate to="/auth" replace />} />
          <Route path="/history" element={isAuth ? <History /> : <Navigate to="/auth" replace />} />
          <Route path="/transcript/:id" element={isAuth ? <TranscriptDetail /> : <Navigate to="/auth" replace />} />
          <Route path="/chat/:sessionId" element={isAuth ? <ChatSession /> : <Navigate to="/auth" replace />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
