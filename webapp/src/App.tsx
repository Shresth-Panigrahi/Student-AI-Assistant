import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'

import RecordingSession from './pages/RecordingSession'
import History from './pages/History'
import TranscriptDetail from './pages/TranscriptDetail'
import LandingPage from './pages/LandingPage'

function AppContent() {
  return (
    <div className="min-h-screen bg-true-black">
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />

        {/* Previously Protected Routes (Now Public) */}
        <Route path="/session" element={<RecordingSession />} />
        <Route path="/history" element={<History />} />
        <Route path="/transcript/:id" element={<TranscriptDetail />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
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
