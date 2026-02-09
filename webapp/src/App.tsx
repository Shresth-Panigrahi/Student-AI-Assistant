import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Auth from './pages/Auth'
import RecordingSession from './pages/RecordingSession'
import History from './pages/History'
import TranscriptDetail from './pages/TranscriptDetail'
import LandingPage from './pages/LandingPage'

function AppContent() {
  const isAuth = !!localStorage.getItem('user')

  return (
    <div className="min-h-screen bg-true-black">
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={isAuth ? <Navigate to="/session" replace /> : <Auth />} />

        {/* Protected Routes */}
        <Route path="/session" element={isAuth ? <RecordingSession /> : <Navigate to="/auth" replace />} />
        <Route path="/history" element={isAuth ? <History /> : <Navigate to="/auth" replace />} />
        <Route path="/transcript/:id" element={isAuth ? <TranscriptDetail /> : <Navigate to="/auth" replace />} />

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
