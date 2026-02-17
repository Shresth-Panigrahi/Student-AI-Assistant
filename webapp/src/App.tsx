import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
// import NavigationLoader from './components/NavigationLoader'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import RecordingSession from './pages/RecordingSession'
import History from './pages/History'
import TranscriptDetail from './pages/TranscriptDetail'
import LandingPage from './pages/LandingPage'
// import { useState } from 'react'

function AppContent() {
  // const isAuth = !!localStorage.getItem('user') // Auth bypassed per user request

  // Note: Previous "InitialSplash" is removed in favor of LandingPage

  return (
    <>
      <AnimatePresence mode="wait">
        {/* {showLoader && <NavigationLoader key="nav-loader" />} */}
      </AnimatePresence>

      <div className="min-h-screen bg-true-black">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<Auth />} />

          {/* Protected Routes (Auth removed) */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/session" element={<RecordingSession />} />
          <Route path="/history" element={<History />} />
          <Route path="/transcript/:id" element={<TranscriptDetail />} />

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
