import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import InitialSplash from './components/InitialSplash'
import NavigationLoader from './components/NavigationLoader'
import Dashboard from './pages/Dashboard'
import RecordingSession from './pages/RecordingSession'
import History from './pages/History'
import TranscriptDetail from './pages/TranscriptDetail'

function App() {
  const [showInitialSplash, setShowInitialSplash] = useState(true)
  const [showLoader, setShowLoader] = useState(false)

  const handleEnter = () => {
    setShowLoader(true)
    setTimeout(() => {
      setShowInitialSplash(false)
      // Keep loader visible for zoom animation
      setTimeout(() => {
        setShowLoader(false)
      }, 600) // Wait for zoom animation to complete
    }, 1200) // Show loader for 1.2 seconds before starting zoom
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
        <Router>
          <div className="min-h-screen bg-dark-900">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/session" element={<RecordingSession />} />
              <Route path="/history" element={<History />} />
              <Route path="/transcript/:id" element={<TranscriptDetail />} />
            </Routes>
          </div>
        </Router>
      )}
    </>
  )
}

export default App
