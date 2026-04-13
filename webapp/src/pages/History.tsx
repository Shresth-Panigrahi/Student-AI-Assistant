import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileText, Calendar, MessageSquare, Trash2, Search, Mic, Upload } from 'lucide-react'
import { api } from '@/services/api'
import { useStore } from '@/store/useStore'
import { format } from 'date-fns'

export default function History() {
  const navigate = useNavigate()
  const { sessions, setSessions } = useStore()
  const [loading, setLoading] = useState(true)
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

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
      await new Promise(resolve => setTimeout(resolve, 800))
      await loadSessions()
      setDeleteModal(null)
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert('Failed to delete session')
    } finally {
      setDeleting(false)
    }
  }

  const handleSessionClick = (session: any) => {
    // If session is still processing, go to processing page
    if (session.processing_status === 'processing') {
      navigate(`/processing/${session.id}`)
    } else {
      navigate(`/transcript/${session.id}`)
    }
  }

  const filteredSessions = sessions.filter(session =>
    session.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (session.transcript || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-true-black relative overflow-hidden font-sans selection:bg-royal-purple selection:text-white">
      {/* Background Features */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-royal-purple/20 rounded-full blur-[120px] animate-float" />
        <div className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-deep-magenta/15 rounded-full blur-[100px] animate-float [animation-delay:2s]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-orchid/10 rounded-full blur-[80px] animate-float [animation-delay:4s]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-12">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12"
        >
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/')}
              className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-royal-purple/50 transition-all duration-300 group flex-shrink-0"
            >
              <ArrowLeft className="w-6 h-6 text-light-gray group-hover:text-white" />
            </button>
            <div>
              <h1 className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-light-gray to-gray-400">
                Learning History
              </h1>
              <p className="text-secondary-gray mt-2 text-sm md:text-base hidden sm:block">
                Access your past lectures, summaries, and insights
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-center w-full md:w-auto">
            {/* Search Bar */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-11 pr-4 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-royal-purple/50 focus:ring-1 focus:ring-royal-purple/50 transition-all font-medium"
              />
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-16 h-16 border-4 border-royal-purple/30 border-t-royal-purple rounded-full animate-spin" />
            <p className="mt-4 text-secondary-gray animate-pulse">Loading your vault...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm"
          >
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-gray-600" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">No sessions found</h3>
            <p className="text-secondary-gray max-w-md mx-auto mb-8">
              {searchTerm ? "No sessions match your search criteria." : "Start recording your first lecture to see it appear here."}
            </p>
            {!searchTerm && (
              <button
                onClick={() => navigate('/session')}
                className="px-8 py-3 bg-gradient-to-r from-royal-purple to-deep-magenta rounded-xl font-bold text-white shadow-lg shadow-royal-purple/20 hover:shadow-royal-purple/40 hover:scale-105 transition-all duration-300"
              >
                Start Recording
              </button>
            )}
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredSessions.map((session, idx) => {
                const isProcessing = (session as any).processing_status === 'processing'
                const isUpload = (session as any).source === 'upload'

                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ y: -5 }}
                    onClick={() => handleSessionClick(session)}
                    className="group relative bg-[#0D0D12]/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden hover:border-royal-purple/50 transition-all duration-300 cursor-pointer hover:shadow-[0_0_30px_rgba(109,40,217,0.15)]"
                  >
                    {/* Hover Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-royal-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="p-6 relative z-10">
                      <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-white/5 rounded-xl group-hover:bg-royal-purple/10 transition-colors">
                          <FileText className="w-6 h-6 text-royal-purple" />
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Source Badge */}
                          {isUpload ? (
                            <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white/5 rounded-lg border border-white/5">
                              <Upload className="w-3 h-3" />
                              Upload
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white/5 rounded-lg border border-white/5">
                              <Mic className="w-3 h-3" />
                              Live
                            </span>
                          )}

                          {/* Processing badge */}
                          {isProcessing && (
                            <span className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-royal-purple bg-royal-purple/10 rounded-lg border border-royal-purple/20">
                              <span className="w-2 h-2 rounded-full bg-royal-purple animate-pulse" />
                              Processing
                            </span>
                          )}

                          {!isProcessing && session.summary && (
                            <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 rounded-lg border border-emerald-400/20">
                              Analyzed
                            </span>
                          )}
                          <button
                            onClick={(e) => handleDeleteClick(session.id, session.name, e)}
                            className="p-2 text-gray-500 hover:text-rose hover:bg-rose/10 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-xl font-bold text-white mb-2 line-clamp-1 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 transition-all">
                        {session.name}
                      </h3>

                      <div className="flex items-center gap-4 text-sm text-secondary-gray mb-6">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{format(new Date(session.timestamp), 'MMM dd')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>{session.chat?.length || 0} chats</span>
                        </div>
                      </div>

                      <div className="relative">
                        {isProcessing ? (
                          <p className="text-sm text-royal-purple/60 italic">
                            Transcript is being generated...
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed">
                            {session.transcript}
                          </p>
                        )}
                        <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-[#0D0D12] to-transparent" />
                      </div>
                    </div>

                    <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-between text-xs font-medium text-gray-400 group-hover:text-royal-purple transition-colors">
                      <span>{isProcessing ? 'View Progress' : 'View Details'}</span>
                      <ArrowLeft className="w-4 h-4 rotate-180 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Delete Modal */}
        <AnimatePresence>
          {deleteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => !deleting && setDeleteModal(null)}
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="relative bg-[#1A1A1A] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl z-10"
              >
                {deleting ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 border-4 border-rose/30 border-t-rose rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Deleting session...</p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-2xl font-bold text-white mb-2">Delete Session?</h3>
                    <p className="text-secondary-gray mb-6">
                      Are you sure you want to delete <span className="text-white font-semibold">{deleteModal.name}</span>? This action cannot be undone.
                    </p>
                    <div className="flex gap-4">
                      <button
                        onClick={() => setDeleteModal(null)}
                        className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmDelete}
                        className="flex-1 py-3 rounded-xl bg-rose hover:bg-rose/90 text-white font-bold shadow-lg shadow-rose/20 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
