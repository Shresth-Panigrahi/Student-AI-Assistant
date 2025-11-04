import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import InitialSplash from './components/InitialSplash'
import NavigationLoader from './components/NavigationLoader'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import RecordingSession from './pages/RecordingSession'
import History from './pages/History'
import TranscriptDetail from './pages/TranscriptDetail'

function AppContent() {
  // Check if splash screen has been shown in this session
  const splashShown = sessionStorage.getItem('splashShown') === 'true'
  const [showInitialSplash, setShowInitialSplash] = useState(!splashShown)
  const [showLoader, setShowLoader] = useState(false)
  const navigate = useNavigate()

  const handleEnter = () => {
    setShowLoader(true)
    setTimeout(() => {
      setShowInitialSplash(false)
      // Mark splash as shown for this session
      sessionStorage.setItem('splashShown', 'true')
      setTimeout(() => {
        setShowLoader(false)
        // Always navigate to auth page after splash screen
        navigate('/auth')
      }, 600)
    }, 1200)
  }

  const isAuthenticated = () => {
    return !!localStorage.getItem('user')
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {showInitialSplash && !showLoader && (
          <InitialSplash key="initial-splash" onEnter={handleEnter} />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {showLoader && <NavigationLoader key="nav-loader" />}
      </AnimatePresence>

      {!showInitialSplash && !showLoader && (
        <div className="min-h-screen bg-dark-900">
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={isAuthenticated() ? <Dashboard /> : <Navigate to="/auth" replace />} />
            <Route path="/session" element={isAuthenticated() ? <RecordingSession /> : <Navigate to="/auth" replace />} />
            <Route path="/history" element={isAuthenticated() ? <History /> : <Navigate to="/auth" replace />} />
            <Route path="/transcript/:id" element={isAuthenticated() ? <TranscriptDetail /> : <Navigate to="/auth" replace />} />
          </Routes>
        </div>
      )}
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
