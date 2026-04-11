import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Sparkles, BookOpen, Loader, Upload, CheckCircle, AlertTriangle, X, Mic } from 'lucide-react'
import { api } from '@/services/api'
import { Session } from '@/store/useStore'
import { format } from 'date-fns'
import axios from 'axios'

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface DiffToken {
  type: 'unchanged' | 'added' | 'removed'
  text: string
}

interface EnhancementStats {
  live_word_count: number
  recording_word_count: number
  enhanced_word_count: number
  aligned_pairs: number
  gaps_filled: number
  live_only_segments: number
}

interface EnhancementResult {
  enhanced_transcript: string
  diff_tokens: DiffToken[]
  stats: EnhancementStats
}

// ──────────────────────────────────────────────────────────────
// Processing Steps Indicator (inline component)
// ──────────────────────────────────────────────────────────────

const PROCESSING_STEPS = [
  'Converting audio format...',
  'Transcribing with high-quality settings...',
  'Aligning with live transcript...',
  'Reconciling differences with AI...',
  'Polishing final transcript...',
  'Almost done...',
]

function ProcessingStepsIndicator() {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev < PROCESSING_STEPS.length - 1 ? prev + 1 : prev))
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col gap-2 w-56">
      {PROCESSING_STEPS.map((step, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {/* Step indicator */}
          {idx < currentStep ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
            </motion.div>
          ) : idx === currentStep ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              className="w-3 h-3 rounded-full border border-transparent border-t-purple-500 flex-shrink-0"
            />
          ) : (
            <div className="w-3 h-3 rounded-full border border-gray-700 flex-shrink-0" />
          )}
          <span
            className={`text-[10px] ${
              idx < currentStep
                ? 'text-gray-500'
                : idx === currentStep
                ? 'text-white font-medium'
                : 'text-gray-700'
            }`}
          >
            {step}
          </span>
        </div>
      ))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────

export default function TranscriptDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState<'summary' | 'terms' | null>(null)
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'terms'>('transcript')

  // Enhancement state
  const [enhancing, setEnhancing] = useState(false)
  const [enhancementStage, setEnhancementStage] = useState<string>('')
  const [enhancementResult, setEnhancementResult] = useState<EnhancementResult | null>(null)
  const [showDiffView, setShowDiffView] = useState(false)
  const [recordingEnhanced, setRecordingEnhanced] = useState(false)
  const [enhancementStats, setEnhancementStats] = useState<EnhancementStats | null>(null)
  const [analysisStale, setAnalysisStale] = useState(false)
  const [staleFields, setStaleFields] = useState<string[]>([])
  const [showOriginalTranscript, setShowOriginalTranscript] = useState(false)
  const [originalTranscript, setOriginalTranscript] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Local transcript state for immediate display updates after enhancement
  const [displayTranscript, setDisplayTranscript] = useState<string>('')

  useEffect(() => {
    loadSession()
  }, [id])

  const loadSession = async () => {
    try {
      const data = await api.getSession(id!)
      setSession(data.session)
      setDisplayTranscript(data.session.transcript || '')

      // Check enhancement status
      try {
        const status = await api.getEnhancementStatus(id!)
        if (status.recording_enhanced) {
          setRecordingEnhanced(true)
          setEnhancementStats(status.stats)
        }
        if (status.analysis_stale) {
          setAnalysisStale(true)
          setStaleFields(status.stale_fields || [])
        }
      } catch {
        // Enhancement status endpoint may not exist on older backends
      }
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

  const handleRegenerateSummary = async () => {
    if (!id) return
    setAnalyzing('summary')
    try {
      // Force regenerate by calling the chat endpoint with force_regenerate
      const result = await api.generateLectureReport(id, [], true)
      if (result.success) {
        setSession((prev) => prev ? { ...prev, summary: result.report } : null)
        setActiveTab('summary')
        // Remove summary from stale fields
        setStaleFields((prev) => prev.filter((f) => f !== 'summary_json'))
        if (staleFields.length <= 1) setAnalysisStale(false)
      }
    } catch (error) {
      console.error('Failed to regenerate summary:', error)
    } finally {
      setAnalyzing(null)
    }
  }

  // ── Enhancement Handlers ────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so same file can be selected again
    e.target.value = ''

    // Validate size client-side
    if (file.size > 500 * 1024 * 1024) {
      alert('File too large. Maximum size is 500MB.')
      return
    }

    await handleEnhancement(file)
  }

  const handleEnhancement = async (file: File) => {
    setEnhancing(true)
    setEnhancementStage('Uploading recording...')
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('recording', file)

      const response = await axios.post(
        `http://localhost:8000/api/session/${id}/enhance-recording`,
        formData,
        {
          onUploadProgress: (progressEvent) => {
            const pct = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || file.size)
            )
            setUploadProgress(pct)
            if (pct < 100) {
              setEnhancementStage(`Uploading recording... ${pct}%`)
            } else {
              setEnhancementStage('Processing recording...')
            }
          },
          timeout: 600000, // 10 minute timeout for long recordings
        }
      )

      const data = response.data
      setEnhancementResult(data)
      setRecordingEnhanced(true)
      setEnhancementStats(data.stats)
      setAnalysisStale(true)
      setStaleFields([
        'summary_json',
        'terminologies_map',
        'quizzes_array',
        'concept_graph',
        'flashcards',
      ])
      setShowDiffView(true) // auto-show diff after enhancement

      // Update displayed transcript immediately
      setDisplayTranscript(data.enhanced_transcript)
      setSession((prev) =>
        prev ? { ...prev, transcript: data.enhanced_transcript } : null
      )
    } catch (err: any) {
      const msg =
        err.response?.data?.detail || err.message || 'Enhancement failed'
      alert(`Enhancement failed: ${msg}`)
    } finally {
      setEnhancing(false)
      setEnhancementStage('')
      setUploadProgress(0)
    }
  }

  const handleShowOriginal = async () => {
    if (originalTranscript) {
      setShowOriginalTranscript(true)
      return
    }

    try {
      const data = await api.getOriginalTranscript(id!)
      setOriginalTranscript(data.original_transcript)
      setShowOriginalTranscript(true)
    } catch (error) {
      console.error('Failed to load original transcript:', error)
      alert('Could not load original transcript.')
    }
  }

  // ── Loading / Not Found ─────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────────

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

        {/* ── Stale Analysis Banner ── */}
        {analysisStale && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-0 mb-4 p-3 rounded-xl bg-amber-900/20 border border-amber-500/30 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-300">
                Your transcript was enhanced with a recording. Regenerate analysis for better results.
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {staleFields.includes('summary_json') && (
                <button
                  onClick={handleRegenerateSummary}
                  className="text-[10px] bg-amber-900/30 border border-amber-500/20 text-amber-400 rounded-lg px-2 py-1 hover:bg-amber-900/50 transition-all"
                >
                  Regenerate Summary
                </button>
              )}
              <button
                onClick={() => setAnalysisStale(false)}
                className="text-gray-600 hover:text-gray-400"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="lg:col-span-2 glass-effect rounded-2xl p-6 relative"
          >
            {/* Tabs — Transcript, Summary, Terminologies only */}
            <div className="flex gap-2 mb-6 border-b border-dark-500 flex-wrap">
              {(['transcript', 'summary', 'terms'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-medium capitalize transition-colors relative ${
                    activeTab === tab
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
                  className="bg-dark-800 rounded-xl p-6 max-h-[600px] overflow-y-auto relative"
                >
                  {/* ── Enhancement Loading Overlay ── */}
                  {enhancing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-20 gap-4"
                    >
                      {/* Animated processing icon */}
                      <div className="relative w-16 h-16">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          className="absolute inset-0 rounded-full border-2 border-transparent border-t-purple-500"
                        />
                        <div className="absolute inset-2 rounded-full bg-purple-900/30 flex items-center justify-center">
                          <Mic size={20} className="text-purple-400" />
                        </div>
                      </div>

                      {/* Stage text */}
                      <div className="text-center">
                        <p className="text-sm font-semibold text-white">
                          {enhancementStage}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          This may take 3-8 minutes for long recordings
                        </p>
                      </div>

                      {/* Upload progress bar — only show during upload */}
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div className="w-48">
                          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-purple-500 rounded-full"
                              animate={{ width: `${uploadProgress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-600 text-center mt-1">
                            {uploadProgress}% uploaded
                          </p>
                        </div>
                      )}

                      {/* Processing steps indicator — after upload completes */}
                      {uploadProgress >= 100 && <ProcessingStepsIndicator />}
                    </motion.div>
                  )}

                  {/* ── Enhance with Recording Button Row ── */}
                  <div className="flex items-center justify-between mb-4">
                    <div /> {/* spacer */}
                    {!recordingEnhanced ? (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 bg-purple-900/30 border border-purple-500/30 hover:bg-purple-900/50 hover:border-purple-500/50 text-purple-300 rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
                      >
                        <Upload size={12} />
                        Enhance with Recording
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-900/20 border border-emerald-500/20 rounded-full px-2 py-0.5">
                          <CheckCircle size={10} />
                          Enhanced
                        </span>
                        <button
                          onClick={() => setShowDiffView(!showDiffView)}
                          className="text-[10px] text-gray-500 hover:text-gray-300 underline"
                        >
                          {showDiffView ? 'Hide diff' : 'View changes'}
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[10px] text-gray-500 hover:text-gray-300"
                        >
                          Re-enhance
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm,.mkv,.avi,.mov,.m4v"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  {/* ── View Toggle (Enhanced / Changes / Original) ── */}
                  {recordingEnhanced && (
                    <div className="flex items-center gap-3 mb-4 text-xs">
                      <button
                        onClick={() => setShowDiffView(false)}
                        className={`px-3 py-1 rounded-lg transition-all ${
                          !showDiffView
                            ? 'bg-white/10 text-white'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        Enhanced
                      </button>
                      <button
                        onClick={() => setShowDiffView(true)}
                        className={`px-3 py-1 rounded-lg transition-all ${
                          showDiffView
                            ? 'bg-white/10 text-white'
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        Changes
                      </button>
                      <button
                        onClick={handleShowOriginal}
                        className="text-gray-600 hover:text-gray-400 ml-auto"
                      >
                        View original
                      </button>
                    </div>
                  )}

                  {/* ── Diff View ── */}
                  {showDiffView && enhancementResult ? (
                    <div>
                      {/* Legend */}
                      <div className="flex items-center gap-4 text-[10px] mb-3">
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-emerald-900/40 inline-block" />
                          <span className="text-gray-500">Added from recording</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-3 h-3 rounded bg-red-900/40 inline-block" />
                          <span className="text-gray-500">Corrected</span>
                        </span>
                      </div>

                      {/* Diff tokens */}
                      <div className="prose prose-invert max-w-none">
                        <p className="text-sm leading-relaxed font-mono">
                          {enhancementResult.diff_tokens.map((token, idx) => {
                            if (token.type === 'unchanged') {
                              return (
                                <span key={idx} className="text-gray-300">
                                  {token.text}
                                </span>
                              )
                            }
                            if (token.type === 'added') {
                              return (
                                <span
                                  key={idx}
                                  className="bg-emerald-900/40 text-emerald-300 rounded px-0.5"
                                >
                                  {token.text}
                                </span>
                              )
                            }
                            if (token.type === 'removed') {
                              return (
                                <span
                                  key={idx}
                                  className="bg-red-900/40 text-red-400 line-through rounded px-0.5"
                                >
                                  {token.text}
                                </span>
                              )
                            }
                            return null
                          })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* ── Normal Transcript View ── */
                    <div className="prose prose-invert max-w-none">
                      <p className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                        {displayTranscript || session.transcript}
                      </p>
                    </div>
                  )}

                  {/* ── Enhancement Stats Card ── */}
                  {enhancementStats && (
                    <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08] grid grid-cols-3 gap-3">
                      <div className="text-center">
                        <p className="text-sm font-semibold text-white">
                          {enhancementStats.enhanced_word_count}
                        </p>
                        <p className="text-[10px] text-gray-500">Final words</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-emerald-400">
                          +{enhancementStats.gaps_filled}
                        </p>
                        <p className="text-[10px] text-gray-500">Gaps filled</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-purple-400">
                          {enhancementStats.aligned_pairs}
                        </p>
                        <p className="text-[10px] text-gray-500">Sentences matched</p>
                      </div>
                    </div>
                  )}
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
                whileHover={{
                  scale:
                    session.terminologies && Object.keys(session.terminologies).length > 0
                      ? 1
                      : 1.02,
                }}
                whileTap={{
                  scale:
                    session.terminologies && Object.keys(session.terminologies).length > 0
                      ? 1
                      : 0.98,
                }}
                onClick={handleExtractTerms}
                disabled={
                  analyzing === 'terms' ||
                  (!!session.terminologies && Object.keys(session.terminologies).length > 0)
                }
                className="w-full bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing === 'terms' ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Extracting...
                  </>
                ) : session.terminologies &&
                  Object.keys(session.terminologies).length > 0 ? (
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
                <span className="font-semibold">
                  {(displayTranscript || session.transcript).split(' ').length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Chat Messages</span>
                <span className="font-semibold">{session.chat?.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Summary</span>
                <span
                  className={`font-semibold ${
                    session.summary ? 'text-accent-green' : 'text-gray-500'
                  }`}
                >
                  {session.summary ? '✓ Generated' : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Terms Extracted</span>
                <span
                  className={`font-semibold ${
                    session.terminologies &&
                    Object.keys(session.terminologies).length > 0
                      ? 'text-accent-green'
                      : 'text-gray-500'
                  }`}
                >
                  {session.terminologies &&
                  Object.keys(session.terminologies).length > 0
                    ? Object.keys(session.terminologies).length
                    : '—'}
                </span>
              </div>
              {recordingEnhanced && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Recording Enhanced</span>
                  <span className="font-semibold text-purple-400">✓ Yes</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Original Transcript Modal ── */}
      {originalTranscript && showOriginalTranscript && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setShowOriginalTranscript(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#1a1a1a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white">
                Original Live Transcript
              </h3>
              <button onClick={() => setShowOriginalTranscript(false)}>
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-4 text-sm text-gray-300 leading-relaxed">
              {originalTranscript}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
