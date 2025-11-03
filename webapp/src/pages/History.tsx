import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, FileText, Calendar, MessageSquare } from 'lucide-react'
import { api } from '@/services/api'
import { useStore, Session } from '@/store/useStore'
import { format } from 'date-fns'

export default function History() {
  const navigate = useNavigate()
  const { sessions, setSessions } = useStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const data = await api.getSessions()
      setSessions(data.sessions)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-6" style={{ background: '#000000' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="glass-effect p-2 rounded-lg hover:bg-dark-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-3xl font-bold">Session History</h1>
          </div>
        </motion.div>

        {/* Sessions Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-4 border-accent-blue border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-gray-400">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-xl text-gray-400">No sessions yet</p>
            <p className="text-gray-500 mt-2">Start a new recording session to get started</p>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session, idx) => (
              <motion.button
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ scale: 1.05, y: -8 }}
                onClick={() => navigate(`/transcript/${session.id}`)}
                className="rounded-2xl p-6 text-left transition-all"
                style={{
                  background: 'rgba(17, 17, 17, 0.8)',
                  border: '2px solid rgba(0, 102, 255, 0.3)',
                  boxShadow: '0 4px 20px rgba(0, 102, 255, 0.2)'
                }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-accent-blue/20 rounded-lg">
                    <FileText className="w-6 h-6 text-accent-blue" />
                  </div>
                  {session.summary && (
                    <span className="text-xs bg-accent-green/20 text-accent-green px-2 py-1 rounded">
                      Analyzed
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold mb-2">{session.name}</h3>

                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{format(new Date(session.timestamp), 'MMM dd, yyyy HH:mm')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    <span>{session.chat?.length || 0} messages</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-dark-500">
                  <p className="text-xs text-gray-500 line-clamp-2">
                    {session.transcript.substring(0, 100)}...
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
