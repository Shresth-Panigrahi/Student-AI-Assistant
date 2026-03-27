import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Sparkles, BookOpen, Loader } from 'lucide-react'
import { api } from '@/services/api'
import { Session } from '@/store/useStore'
import { format } from 'date-fns'

export default function TranscriptDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState<'summary' | 'terms' | null>(null)
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'terms'>('transcript')

  useEffect(() => {
    loadSession()
  }, [id])

  const loadSession = async () => {
    try {
      const data = await api.getSession(id!)
      setSession(data.session)
    } catch (error) {
      console.error('Failed to load session:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSummarize = async () => {
    if (!id) return
    setAnalyzing('summary')
    try {
      const result = await api.summarizeTranscript(id)
      setSession((prev) => prev ? { ...prev, summary: result.summary } : null)
      setActiveTab('summary')
    } catch (error) {
      console.error('Failed to summarize:', error)
    } finally {
      setAnalyzing(null)
    }
  }

  const handleExtractTerms = async () => {
    if (!id) return
    setAnalyzing('terms')
    try {
      const result = await api.extractTerminologies(id)
      setSession((prev) => prev ? { ...prev, terminologies: result.terminologies } : null)
      setActiveTab('terms')
    } catch (error) {
      console.error('Failed to extract terms:', error)
    } finally {
      setAnalyzing(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-accent-blue border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading transcript...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Session not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 bg-true-black">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/history')}
              className="glass-effect p-2 rounded-lg hover:bg-dark-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">{session.name}</h1>
              <p className="text-sm text-gray-400">
                {format(new Date(session.timestamp), 'MMMM dd, yyyy • HH:mm')}
              </p>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="lg:col-span-2 glass-effect rounded-2xl p-6"
          >
            {/* Tabs — Transcript, Summary, Terminologies only */}
            <div className="flex gap-2 mb-6 border-b border-dark-500 flex-wrap">
              {(['transcript', 'summary', 'terms'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-medium capitalize transition-colors relative ${activeTab === tab
                    ? 'text-accent-blue'
                    : 'text-gray-400 hover:text-gray-300'
                    }`}
                >
                  {tab === 'terms' ? 'Terminologies' : tab}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue"
                    />
                  )}
                </button>
              ))}
              
              {/* Chat Entry Route Tab */}
              <button
                onClick={() => navigate(`/chat/${session.id}`)}
                className="px-4 py-2 font-medium transition-colors relative flex items-center gap-2 text-gray-400 hover:text-royal-purple sm:ml-auto group"
              >
                <Sparkles className="w-4 h-4 text-royal-purple group-hover:animate-pulse" />
                Open Chat Studio
              </button>
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
              {activeTab === 'transcript' && (
                <motion.div
                  key="transcript"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-dark-800 rounded-xl p-6 max-h-[600px] overflow-y-auto"
                >
                  <div className="prose prose-invert max-w-none">
                    <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                      {session.transcript}
                    </p>
                  </div>
                </motion.div>
              )}

              {activeTab === 'summary' && (
                <motion.div
                  key="summary"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-dark-800 rounded-xl p-6 max-h-[600px] overflow-y-auto"
                >
                  {session.summary ? (
                    <div className="space-y-4">
                      {session.summary.split('\n').map((line, index) => {
                        const trimmed = line.trim()
                        if (!trimmed) return null

                        // Main topic (starts with number)
                        if (/^\d+\./.test(trimmed)) {
                          return (
                            <div key={index} className="mt-6 first:mt-0">
                              <h3 className="text-lg font-bold text-accent-blue mb-2">
                                {trimmed}
                              </h3>
                            </div>
                          )
                        }

                        // Subtopic (starts with letter)
                        if (/^[a-z]\)/.test(trimmed) || /^[a-z]\./.test(trimmed)) {
                          return (
                            <div key={index} className="ml-4">
                              <p className="text-sm text-gray-300 font-medium mb-1">
                                {trimmed}
                              </p>
                            </div>
                          )
                        }

                        // Regular paragraph
                        return (
                          <p key={index} className="text-sm text-gray-300 leading-relaxed ml-4">
                            {trimmed}
                          </p>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Sparkles className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No summary generated yet</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Click "Summarize" to generate an AI summary
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'terms' && (
                <motion.div
                  key="terms"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-dark-800 rounded-xl p-6 max-h-[600px] overflow-y-auto"
                >
                  {session.terminologies && Object.keys(session.terminologies).length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(session.terminologies).map(([term, info]: [string, any]) => (
                        <motion.div
                          key={term}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="border-l-4 border-accent-blue pl-4 py-2"
                        >
                          <h3 className="font-semibold text-lg mb-1">{info.original_term}</h3>
                          <p className="text-xs text-gray-400 mb-2">
                            {info.subject_area} • {info.category}
                          </p>
                          <p className="text-sm text-gray-300">{info.definition}</p>
                          <p className="text-xs text-gray-500 mt-2">Source: {info.source}</p>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <BookOpen className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No terminologies extracted yet</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Click "Extract Terminologies" to analyze key terms
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Actions Panel — Simplified */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="glass-effect rounded-2xl p-6"
          >
            <h2 className="text-xl font-semibold mb-6">Analysis Tools</h2>

            <div className="space-y-4">
              {/* Summary Button */}
              <motion.button
                whileHover={{ scale: session.summary ? 1 : 1.02 }}
                whileTap={{ scale: session.summary ? 1 : 0.98 }}
                onClick={handleSummarize}
                disabled={analyzing === 'summary' || !!session.summary}
                className="w-full bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing === 'summary' ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Summarizing...
                  </>
                ) : session.summary ? (
                  <>
                    <Sparkles className="w-5 h-5" />
                    ✓ Summary Generated
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Summarize Transcript
                  </>
                )}
              </motion.button>

              {/* Extract Terms Button */}
              <motion.button
                whileHover={{ scale: (session.terminologies && Object.keys(session.terminologies).length > 0) ? 1 : 1.02 }}
                whileTap={{ scale: (session.terminologies && Object.keys(session.terminologies).length > 0) ? 1 : 0.98 }}
                onClick={handleExtractTerms}
                disabled={analyzing === 'terms' || (!!session.terminologies && Object.keys(session.terminologies).length > 0)}
                className="w-full bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing === 'terms' ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Extracting...
                  </>
                ) : (session.terminologies && Object.keys(session.terminologies).length > 0) ? (
                  <>
                    <BookOpen className="w-5 h-5" />
                    ✓ Terms Extracted
                  </>
                ) : (
                  <>
                    <BookOpen className="w-5 h-5" />
                    Extract Terminologies
                  </>
                )}
              </motion.button>
            </div>

            {/* Stats */}
            <div className="mt-8 pt-6 border-t border-dark-500 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Word Count</span>
                <span className="font-semibold">{session.transcript.split(' ').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Chat Messages</span>
                <span className="font-semibold">{session.chat?.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Summary</span>
                <span className={`font-semibold ${session.summary ? 'text-accent-green' : 'text-gray-500'}`}>
                  {session.summary ? '✓ Generated' : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Terms Extracted</span>
                <span className={`font-semibold ${session.terminologies && Object.keys(session.terminologies).length > 0 ? 'text-accent-green' : 'text-gray-500'}`}>
                  {session.terminologies && Object.keys(session.terminologies).length > 0
                    ? Object.keys(session.terminologies).length
                    : '—'}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
