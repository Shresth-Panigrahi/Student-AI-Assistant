import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, FileText, Calendar, MessageSquare, Trash2 } from 'lucide-react'
import { api } from '@/services/api'
import { useStore, Session } from '@/store/useStore'
import { format } from 'date-fns'

export default function History() {
  const navigate = useNavigate()
  const { sessions, setSessions } = useStore()
  const [loading, setLoading] = useState(true)
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  const handleDeleteClick = (sessionId: string, sessionName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteModal({ id: sessionId, name: sessionName })
  }

  const confirmDelete = async () => {
    if (!deleteModal) return
    
    setDeleting(true)
    
    try {
      await api.deleteSession(deleteModal.id)
      
      // Wait for animation
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Reload sessions
      await loadSessions()
      setDeleteModal(null)
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert('Failed to delete session')
    } finally {
      setDeleting(false)
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
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                whileHover={{ scale: 1.05, y: -8 }}
                className="rounded-2xl p-6 text-left transition-all relative cursor-pointer"
                style={{
                  background: 'rgba(17, 17, 17, 0.8)',
                  border: '2px solid rgba(0, 102, 255, 0.3)',
                  boxShadow: '0 4px 20px rgba(0, 102, 255, 0.2)'
                }}
                onClick={() => navigate(`/transcript/${session.id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-accent-blue/20 rounded-lg">
                    <FileText className="w-6 h-6 text-accent-blue" />
                  </div>
                  <div className="flex items-center gap-2">
                    {session.summary && (
                      <span className="text-xs bg-accent-green/20 text-accent-green px-2 py-1 rounded">
                        Analyzed
                      </span>
                    )}
                    <button
                      onClick={(e) => handleDeleteClick(session.id, session.name, e)}
                      className="p-2 bg-red-600/20 hover:bg-red-600/40 rounded-lg transition-colors"
                      title="Delete session"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
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
              </motion.div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !deleting && setDeleteModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-dark-900 rounded-2xl p-8 max-w-md w-full border-2 border-red-500/30 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {deleting ? (
                <motion.div
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 1.2, 0], rotate: [0, 0, 180] }}
                  transition={{ duration: 0.8 }}
                  className="text-center py-8"
                >
                  <motion.div
                    animate={{ y: [0, -100], opacity: [1, 0] }}
                    transition={{ duration: 0.8 }}
                  >
                    <Trash2 className="w-20 h-20 text-red-500 mx-auto mb-4" />
                    <p className="text-gray-400">Deleting session...</p>
                  </motion.div>
                </motion.div>
              ) : (
                <>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Trash2 className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Delete Session?</h2>
                    <p className="text-gray-400">
                      Are you sure you want to delete
                    </p>
                    <p className="text-white font-semibold mt-1">"{deleteModal.name}"?</p>
                    <p className="text-sm text-gray-500 mt-3">
                      This action cannot be undone. All transcripts, summaries, and analysis will be permanently deleted.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setDeleteModal(null)}
                      className="flex-1 px-6 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl font-semibold transition-colors"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={confirmDelete}
                      className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      Delete
                    </motion.button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
