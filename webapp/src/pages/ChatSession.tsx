import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Sparkles, ChevronRight, ChevronDown, ChevronUp, ChevronLeft,
  Headphones, FileText, Layers, HelpCircle, Film, Lock, Plus, X,
  RefreshCw, Download, Play, Pause, Trophy
} from 'lucide-react'
import { api } from '@/services/api'
import { format } from 'date-fns'
import axios from 'axios'

// ─── Types ───────────────────────────────────────────────────
interface SessionData {
  id: string
  name: string
  timestamp: string
  transcript: string
  summary?: string
  terminologies?: Record<string, any>
  chat?: any[]
}

interface Flashcard {
  question: string
  answer: string
  category: string
}

interface QAItem {
  question: string
  answer: string
  difficulty: string
  type: string
}

interface ContextFile {
  name: string
  size: number
  content_base64: string
  type: string
}

interface CaptionSegment {
  id: number
  speaker: 'HOST_A' | 'HOST_B'
  text: string
  startTime: number
  endTime: number
}

type ActiveFeature = null | 'audio' | 'report' | 'flashcards' | 'qa' | 'video'

// ─── Component ───────────────────────────────────────────────
export default function ChatSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  // Session
  const [session, setSession] = useState<SessionData | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  // Feature
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>(null)

  // Context files
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([])
  const [contextOpen, setContextOpen] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lecture Report
  const [report, setReport] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportFromCache, setReportFromCache] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  // Flash Cards
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [flashcardsLoading, setFlashcardsLoading] = useState(false)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [scores, setScores] = useState({ correct: 0, wrong: 0 })
  const [cardResults, setCardResults] = useState<Record<number, 'correct' | 'wrong' | null>>({})
  const [flashcardsComplete, setFlashcardsComplete] = useState(false)

  // Q&A Analysis
  const [qaQuestions, setQaQuestions] = useState<QAItem[]>([])
  const [qaLoading, setQaLoading] = useState(false)
  const [expandedQA, setExpandedQA] = useState<number | null>(null)

  // Audio Overview
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [captionsUrl, setCaptionsUrl] = useState<string | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [audioError, setAudioError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Captions — fetched from backend (real timestamps)
  const [captions, setCaptions] = useState<CaptionSegment[]>([])
  const [activeCaptionId, setActiveCaptionId] = useState<number | null>(null)
  const captionsRef = useRef<CaptionSegment[]>([])

  // Video Lecture
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoStatus, setVideoStatus] = useState<string>('none')
  const [videoProgress, setVideoProgress] = useState('')
  const [videoError, setVideoError] = useState<string | null>(null)
  const videoPollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Load Session ────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    const load = async () => {
      try {
        const data = await api.getSession(sessionId)
        setSession(data.session)
      } catch (e) {
        console.error('Failed to load session:', e)
      } finally {
        setSessionLoading(false)
      }
    }
    load()
  }, [sessionId])

  // ─── Fetch captions from backend ──────────────────────────
  const fetchCaptions = useCallback(async (url: string) => {
    try {
      const res = await axios.get(`http://localhost:8000${url}`)
      const caps: CaptionSegment[] = res.data
      setCaptions(caps)
      captionsRef.current = caps
      console.log(`✅ Loaded ${caps.length} real captions from backend`)
    } catch (e) {
      console.error('Failed to fetch captions:', e)
    }
  }, [])

  // ─── Audio element wiring ───────────────────────────────────
  useEffect(() => {
    if (!audioUrl) return
    const audio = new Audio(`http://localhost:8000${audioUrl}`)
    audioRef.current = audio

    const onTime = () => {
      setCurrentTime(audio.currentTime)
      // Active caption tracking using real timestamps
      const caps = captionsRef.current
      const t = audio.currentTime
      const active = caps.find(c => t >= c.startTime && t < c.endTime)
      setActiveCaptionId(active ? active.id : null)
    }
    const onMeta = () => {
      setDuration(audio.duration)
    }
    const onEnd = () => {
      setIsPlaying(false)
      setActiveCaptionId(null)
    }

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)

    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.pause()
    }
  }, [audioUrl])

  // ─── Load captions when captionsUrl is set ──────────────────
  useEffect(() => {
    if (captionsUrl) fetchCaptions(captionsUrl)
  }, [captionsUrl, fetchCaptions])

  // ─── Feature triggers ──────────────────────────────────────
  useEffect(() => {
    if (activeFeature === 'report' && !report && !reportLoading) fetchReport()
    if (activeFeature === 'flashcards' && flashcards.length === 0 && !flashcardsLoading) fetchFlashcards()
    if (activeFeature === 'qa' && qaQuestions.length === 0 && !qaLoading) fetchQA()
    if (activeFeature === 'audio' && !audioUrl && !generating && !audioLoading) checkAudio()
    if (activeFeature === 'video' && !videoUrl && videoStatus === 'none') checkVideoStatus()
  }, [activeFeature])

  // Cleanup video polling on unmount
  useEffect(() => {
    return () => {
      if (videoPollingRef.current) clearInterval(videoPollingRef.current)
    }
  }, [])

  // ─── API Calls ──────────────────────────────────────────────
  const fetchReport = async (force = false) => {
    if (!sessionId) return
    setReportLoading(true)
    setReportError(null)
    try {
      const res = await api.generateLectureReport(sessionId, contextFiles, force)
      if (res.success) {
        setReport(res.report)
        setReportFromCache(!!res.from_cache)
      } else {
        setReportError(res.message || 'Failed to generate report')
      }
    } catch (e: any) {
      setReportError(e.message || 'Network error')
    } finally {
      setReportLoading(false)
    }
  }

  const fetchFlashcards = async (force = false) => {
    if (!sessionId) return
    setFlashcardsLoading(true)
    try {
      const res = await api.generateFlashcards(sessionId, contextFiles, 15, force)
      if (res.success) {
        setFlashcards(res.flashcards)
        setCurrentCardIndex(0)
        setFlipped(false)
        setScores({ correct: 0, wrong: 0 })
        setCardResults({})
        setFlashcardsComplete(false)
      }
    } catch (e) {
      console.error('Flashcards error:', e)
    } finally {
      setFlashcardsLoading(false)
    }
  }

  const fetchQA = async (force = false) => {
    if (!sessionId) return
    setQaLoading(true)
    try {
      const res = await api.generateQAAnalysis(sessionId, contextFiles, 10, force)
      if (res.success) {
        setQaQuestions(res.questions)
        setExpandedQA(null)
      }
    } catch (e) {
      console.error('Q&A error:', e)
    } finally {
      setQaLoading(false)
    }
  }

  const checkAudio = async () => {
    if (!sessionId) return
    setAudioLoading(true)
    try {
      const res = await api.checkAudioOverview(sessionId)
      if (res.exists && res.audio_url) {
        setAudioUrl(`${res.audio_url}?t=${Date.now()}`)
        if (res.captions_url) setCaptionsUrl(`${res.captions_url}?t=${Date.now()}`)
      }
    } catch (e) {
      console.error('Audio check error:', e)
    } finally {
      setAudioLoading(false)
    }
  }

  const generatePodcast = async () => {
    if (!sessionId) return
    setGenerating(true)
    setAudioError(null)

    const steps = ['Analyzing transcript...', 'Writing podcast script...', 'Synthesizing Host A voice...', 'Synthesizing Host B voice...', 'Mixing audio tracks...', 'Finalizing podcast...']
    let stepIdx = 0
    setGenStep(steps[0])
    const interval = setInterval(() => {
      stepIdx = (stepIdx + 1) % steps.length
      setGenStep(steps[stepIdx])
    }, 3000)

    try {
      const res = await api.generateAudioOverview(sessionId, contextFiles)
      if (res.success) {
        setAudioUrl(`${res.audio_url}?t=${Date.now()}`)
        setDuration(res.duration_seconds)
        if (res.captions_url) setCaptionsUrl(`${res.captions_url}?t=${Date.now()}`)
      } else {
        setAudioError(res.message || 'Failed to generate audio')
      }
    } catch (e: any) {
      setAudioError(e.message || 'Network error')
    } finally {
      clearInterval(interval)
      setGenerating(false)
    }
  }

  // ─── Video Lecture ─────────────────────────────────────────
  const checkVideoStatus = async () => {
    if (!sessionId) return
    try {
      const res = await api.getVideoStatus(sessionId)
      setVideoStatus(res.status || 'none')
      setVideoProgress(res.message || '')
      if (res.video_url) setVideoUrl(res.video_url)
      if (res.error) setVideoError(res.error)
      // If in progress, start polling
      if (['queued', 'generating', 'rendering', 'audio', 'merging'].includes(res.status)) {
        startVideoPolling()
      }
    } catch (e) {
      console.error('Video status check error:', e)
    }
  }

  const startVideoPolling = () => {
    if (videoPollingRef.current) return // already polling
    videoPollingRef.current = setInterval(async () => {
      if (!sessionId) return
      try {
        const res = await api.getVideoStatus(sessionId)
        setVideoStatus(res.status || 'none')
        setVideoProgress(res.message || '')
        if (res.video_url) {
          setVideoUrl(res.video_url)
        }
        if (res.error) setVideoError(res.error)
        // Stop polling if complete or failed
        if (res.status === 'complete' || res.status === 'failed') {
          if (videoPollingRef.current) clearInterval(videoPollingRef.current)
          videoPollingRef.current = null
        }
      } catch (e) {
        console.error('Video polling error:', e)
      }
    }, 5000)
  }

  const generateVideo = async () => {
    if (!sessionId) return
    setVideoError(null)
    setVideoUrl(null)
    setVideoStatus('queued')
    setVideoProgress('Starting video generation pipeline...')
    try {
      const res = await api.generateVideo(sessionId)
      if (res.success) {
        setVideoStatus(res.status || 'queued')
        startVideoPolling()
      } else {
        setVideoError(res.message || 'Failed to start video generation')
        setVideoStatus('failed')
      }
    } catch (e: any) {
      setVideoError(e.message || 'Network error')
      setVideoStatus('failed')
    }
  }

  // ─── File handling ─────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    if (contextFiles.length + files.length > 3) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1] || ''
        setContextFiles(prev => [...prev, {
          name: file.name,
          size: file.size,
          content_base64: base64,
          type: file.type
        }])
      }
      reader.readAsDataURL(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Flashcard helpers ─────────────────────────────────────
  const handleCardResult = useCallback((result: 'correct' | 'wrong') => {
    setScores(prev => ({
      ...prev,
      [result === 'correct' ? 'correct' : 'wrong']: prev[result === 'correct' ? 'correct' : 'wrong'] + 1
    }))
    setCardResults(prev => ({ ...prev, [currentCardIndex]: result }))

    const allDone = Object.keys(cardResults).length + 1 >= flashcards.length
    setTimeout(() => {
      if (allDone) {
        setFlashcardsComplete(true)
      } else if (currentCardIndex < flashcards.length - 1) {
        setCurrentCardIndex(prev => prev + 1)
        setFlipped(false)
      } else {
        setFlashcardsComplete(true)
      }
    }, 300)
  }, [currentCardIndex, flashcards.length, cardResults])

  // ─── Helpers ───────────────────────────────────────────────
  const wordCount = session?.transcript?.split(' ').length || 0
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }
  const fmtSize = (b: number) => `${(b / 1024).toFixed(0)} KB`

  // ─── Render: Loading ───────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!session) {
    return (
      <div className="h-screen bg-[#0a0a0a] flex items-center justify-center text-gray-400">
        Session not found
      </div>
    )
  }

  // ─── Feature Cards Data ────────────────────────────────────
  const featureCards: {
    id: ActiveFeature
    icon: React.ReactNode
    title: string
    subtitle: string
    badge?: { text: string; style: string }
    disabled?: boolean
  }[] = [
      {
        id: 'audio',
        icon: <Headphones className="w-5 h-5 text-[#7c3aed]" />,
        title: 'Audio Overview',
        subtitle: 'AI podcast of this lecture',
        badge: { text: 'BETA', style: 'bg-purple-900/40 text-purple-300' }
      },
      {
        id: 'report',
        icon: <FileText className="w-5 h-5 text-[#7c3aed]" />,
        title: 'Lecture Report',
        subtitle: 'Comprehensive written summary'
      },
      {
        id: 'flashcards',
        icon: <Layers className="w-5 h-5 text-[#7c3aed]" />,
        title: 'Flash Cards',
        subtitle: 'Interactive study deck'
      },
      {
        id: 'qa',
        icon: <HelpCircle className="w-5 h-5 text-[#7c3aed]" />,
        title: 'Q&A Analysis',
        subtitle: 'Expected exam questions'
      },
      {
        id: 'video' as ActiveFeature,
        icon: <Film className="w-5 h-5 text-[#7c3aed]" />,
        title: 'Video Lecture',
        subtitle: 'Animated explainer video',
        badge: { text: 'BETA', style: 'bg-purple-900/40 text-purple-300' }
      }
    ]

  // ─── RENDER ────────────────────────────────────────────────
  return (
    <div className="h-screen bg-[#0a0a0a] text-white overflow-hidden flex">
      {/* ███ LEFT PANEL ███ */}
      <div className="w-[380px] bg-[#111111] border-r border-white/5 flex flex-col overflow-y-auto shrink-0">
        {/* Header */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => navigate(`/transcript/${sessionId}`)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-sm font-bold text-white truncate flex-1">{session.name}</h1>
          </div>
          <p className="text-xs text-gray-500 ml-9">
            {format(new Date(session.timestamp), 'MMM dd, yyyy • HH:mm')}
          </p>
        </div>

        {/* Feature Cards */}
        <div className="p-4 flex flex-col gap-3 flex-1">
          {featureCards.map((card, i) => (
            <div
              key={i}
              onClick={() => !card.disabled && card.id !== null && setActiveFeature(card.id)}
              className={`
                rounded-2xl bg-[#1a1a1a] border p-4 cursor-pointer transition-all duration-200
                flex items-center gap-3
                ${card.disabled ? 'opacity-40 cursor-not-allowed border-white/[0.08]' : ''}
                ${!card.disabled && activeFeature === card.id
                  ? 'border-purple-500/40 border-l-[3px] border-l-purple-600'
                  : 'border-white/[0.08] hover:border-white/20 hover:bg-[#1f1f1f]'}
              `}
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                {card.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm">{card.title}</span>
                  {card.badge && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${card.badge.style}`}>
                      {card.badge.text}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{card.subtitle}</p>
              </div>
              {!card.disabled && <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />}
            </div>
          ))}

          {/* ─── Context Files Panel ─── */}
          <div className="mt-auto pt-4 border-t border-white/5">
            <button
              onClick={() => setContextOpen(p => !p)}
              className="flex items-center justify-between w-full mb-3"
            >
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Context</span>
              {contextOpen ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
            </button>

            {contextOpen && (
              <div className="space-y-2">
                {/* Primary source file (locked) */}
                <div className="flex items-center gap-3 bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-3">
                  <FileText className="w-4 h-4 text-[#7c3aed] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{session.name}</p>
                    <p className="text-[10px] text-gray-500">{wordCount} words</p>
                  </div>
                  <Lock className="w-3 h-3 text-gray-600 shrink-0" />
                </div>
                <p className="text-[10px] text-purple-400 ml-1 -mt-1">Primary Source</p>

                {/* Uploaded context files */}
                {contextFiles.map((cf, i) => (
                  <div key={i} className="flex items-center gap-3 bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-3">
                    <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">{cf.name.slice(0, 20)}{cf.name.length > 20 ? '...' : ''}</p>
                      <p className="text-[10px] text-gray-500">{fmtSize(cf.size)}</p>
                    </div>
                    <button onClick={() => setContextFiles(p => p.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {/* Add File */}
                {contextFiles.length < 3 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-white/20 rounded-xl p-3 text-center text-xs text-gray-500 hover:border-purple-500/40 hover:text-gray-400 cursor-pointer transition-all"
                  >
                    <Plus className="w-4 h-4 mx-auto mb-1" />
                    Add File
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-600 text-center">Max 3 context files</p>
                )}
                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" multiple className="hidden" onChange={handleFileUpload} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ███ RIGHT PANEL ███ */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ─── Welcome State ─── */}
          {activeFeature === null && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full flex flex-col items-center justify-center gap-6 px-8"
            >
              <Sparkles className="w-16 h-16 text-[#7c3aed] opacity-80" />
              <h2 className="text-2xl font-bold text-white text-center">{session.name}</h2>
              <p className="text-sm text-gray-500">{wordCount} words in transcript</p>
              <div className="flex flex-wrap gap-3 justify-center">
                {(['audio', 'report', 'flashcards', 'qa', 'video'] as ActiveFeature[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setActiveFeature(f)}
                    className="px-4 py-2 rounded-full border border-purple-500/30 text-sm text-purple-300 hover:bg-purple-900/20 hover:border-purple-500/50 transition-all duration-200"
                  >
                    {f === 'audio' ? 'Audio Overview' : f === 'report' ? 'Lecture Report' : f === 'flashcards' ? 'Flash Cards' : f === 'qa' ? 'Q&A Analysis' : 'Video Lecture'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2">Select a feature to get started</p>
            </motion.div>
          )}

          {/* ─── Lecture Report Panel ─── */}
          {activeFeature === 'report' && (
            <motion.div
              key="report"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full flex flex-col"
            >
              {/* Top bar */}
              <div className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-[#7c3aed]" />
                  <span className="font-bold text-white">Lecture Report</span>
                </div>
                <div className="flex items-center gap-2">
                  {reportFromCache && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">Cached</span>
                  )}
                  <button
                    onClick={() => fetchReport(true)}
                    disabled={reportLoading}
                    className="flex items-center gap-1.5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-white/30 transition-all"
                  >
                    <RefreshCw className={`w-3 h-3 ${reportLoading ? 'animate-spin' : ''}`} />
                    Regenerate
                  </button>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                {reportLoading ? (
                  <div className="space-y-4">
                    {[16, 12, 12, 16, 12, 12, 16].map((h, i) => (
                      <div key={i} className={`animate-pulse bg-white/5 rounded-lg`} style={{ height: `${h}px` }} />
                    ))}
                  </div>
                ) : reportError ? (
                  <div className="border border-red-500/30 bg-red-900/10 rounded-xl p-4">
                    <p className="text-sm text-red-400">{reportError}</p>
                    <button onClick={() => fetchReport(true)} className="mt-2 text-xs text-red-300 underline">
                      Retry
                    </button>
                  </div>
                ) : report ? (
                  <div>
                    {report.split('\n').map((line, i) => {
                      const t = line.trim()
                      if (!t) return <div key={i} className="h-2" />
                      if (t.startsWith('## ')) {
                        return (
                          <div key={i}>
                            {i > 0 && <div className="border-t border-white/5 my-4" />}
                            <h2 className="text-lg font-semibold text-white mt-6 mb-3 flex items-center gap-2">{t.replace('## ', '')}</h2>
                          </div>
                        )
                      }
                      if (t.startsWith('- ')) {
                        const content = t.slice(2)
                        const boldMatch = content.match(/^\*\*(.*?)\*\*(.*)/)
                        return (
                          <li key={i} className="text-gray-300 text-sm leading-relaxed ml-4 mb-1 list-disc">
                            {boldMatch ? <><strong className="text-white">{boldMatch[1]}</strong>{boldMatch[2]}</> : content}
                          </li>
                        )
                      }
                      // inline bold
                      const parts = t.split(/(\*\*.*?\*\*)/g)
                      return (
                        <p key={i} className="text-gray-300 text-sm leading-relaxed mb-2">
                          {parts.map((p, j) => p.startsWith('**') && p.endsWith('**')
                            ? <strong key={j} className="text-white">{p.slice(2, -2)}</strong>
                            : <span key={j}>{p}</span>
                          )}
                        </p>
                      )
                    })}
                    {/* Download */}
                    <div className="mt-8">
                      <button
                        onClick={() => {
                          const blob = new Blob([report], { type: 'text/plain' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `lecture-report-${session.name}.txt`
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-400 flex items-center gap-2 transition-all"
                      >
                        <Download className="w-4 h-4" />
                        Download Report
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}

          {/* ─── Flash Cards Panel ─── */}
          {activeFeature === 'flashcards' && (
            <motion.div
              key="flashcards"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full flex flex-col"
            >
              {/* Top bar */}
              <div className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <Layers className="w-5 h-5 text-[#7c3aed]" />
                  <span className="font-bold text-white">Flash Cards</span>
                  {flashcards.length > 0 && (
                    <span className="text-xs text-gray-500">{currentCardIndex + 1} / {flashcards.length}</span>
                  )}
                </div>
                <button
                  onClick={() => fetchFlashcards(true)}
                  disabled={flashcardsLoading}
                  className="flex items-center gap-1.5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-white/30 transition-all"
                >
                  <RefreshCw className={`w-3 h-3 ${flashcardsLoading ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center gap-6 min-h-[500px] px-6">
                {flashcardsLoading ? (
                  <div className="w-full max-w-lg h-[220px] animate-pulse bg-white/5 rounded-2xl" />
                ) : flashcardsComplete ? (
                  /* Completion state */
                  <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 text-center max-w-md w-full">
                    <Trophy className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-white mb-6">Session Complete!</h3>
                    <div className="flex justify-center gap-8 mb-4">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-emerald-400">{scores.correct}</p>
                        <p className="text-xs text-gray-500 mt-1">Correct</p>
                      </div>
                      <div className="text-center">
                        <p className="text-3xl font-bold text-red-400">{scores.wrong}</p>
                        <p className="text-xs text-gray-500 mt-1">Missed</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-[#7c3aed] mb-6">
                      {flashcards.length > 0 ? Math.round(scores.correct / flashcards.length * 100) : 0}%
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => {
                          setCurrentCardIndex(0); setFlipped(false); setScores({ correct: 0, wrong: 0 }); setCardResults({}); setFlashcardsComplete(false)
                        }}
                        className="px-6 py-2 border border-white/10 rounded-xl text-sm text-gray-400 hover:text-white hover:border-white/30 transition-all"
                      >
                        Restart
                      </button>
                      <button
                        onClick={() => fetchFlashcards(true)}
                        className="px-6 py-2 bg-[#7c3aed] rounded-xl text-sm text-white hover:bg-purple-500 transition-all"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>
                ) : flashcards.length > 0 ? (
                  <>
                    {/* Score counters */}
                    <div className="flex gap-3">
                      <span className="bg-white/5 rounded-lg px-3 py-1 text-sm font-semibold text-emerald-400">✓ {scores.correct}</span>
                      <span className="bg-white/5 rounded-lg px-3 py-1 text-sm font-semibold text-red-400">✗ {scores.wrong}</span>
                    </div>

                    {/* The flashcard */}
                    <div className="w-full max-w-lg" style={{ perspective: '1000px' }}>
                      <div
                        className="relative w-full cursor-pointer"
                        style={{ transformStyle: 'preserve-3d', transition: 'transform 0.5s ease', transform: flipped ? 'rotateY(180deg)' : '' }}
                        onClick={() => setFlipped(p => !p)}
                      >
                        {/* Front */}
                        <div
                          className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[220px]"
                          style={{ backfaceVisibility: 'hidden' }}
                        >
                          <span className="bg-purple-900/30 text-purple-400 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider mb-4">
                            {flashcards[currentCardIndex]?.category}
                          </span>
                          <p className="text-xl font-semibold text-white text-center leading-relaxed">
                            {flashcards[currentCardIndex]?.question}
                          </p>
                          <p className="text-xs text-gray-600 mt-4">Click to reveal answer</p>
                        </div>

                        {/* Back */}
                        <div
                          className="absolute inset-0 bg-[#1f1a2e] border border-purple-500/20 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[220px]"
                          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                        >
                          <span className="text-xs text-purple-400 uppercase tracking-wider mb-4">Answer</span>
                          <p className="text-base text-gray-200 text-center leading-relaxed">
                            {flashcards[currentCardIndex]?.answer}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Result buttons — only when flipped */}
                    {flipped && (
                      <div className="flex gap-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCardResult('correct') }}
                          className="bg-emerald-900/30 border border-emerald-500/30 hover:bg-emerald-900/50 text-emerald-400 rounded-xl px-8 py-3 text-sm font-medium transition-all"
                        >
                          Got it ✓
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCardResult('wrong') }}
                          className="bg-red-900/30 border border-red-500/30 hover:bg-red-900/50 text-red-400 rounded-xl px-8 py-3 text-sm font-medium transition-all"
                        >
                          Missed ✗
                        </button>
                      </div>
                    )}

                    {/* Navigation row */}
                    <div className="flex items-center gap-4">
                      <button
                        disabled={currentCardIndex === 0}
                        onClick={() => { setCurrentCardIndex(p => p - 1); setFlipped(false) }}
                        className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="flex gap-1.5 items-center flex-wrap justify-center">
                        {flashcards.slice(0, 10).map((_, i) => (
                          <div
                            key={i}
                            className={`w-2 h-2 rounded-full transition-all ${i === currentCardIndex ? 'bg-[#7c3aed] scale-125'
                                : cardResults[i] === 'correct' ? 'bg-emerald-500'
                                  : cardResults[i] === 'wrong' ? 'bg-red-500'
                                    : 'bg-gray-600'
                              }`}
                          />
                        ))}
                        {flashcards.length > 10 && <span className="text-xs text-gray-600">...</span>}
                      </div>
                      <button
                        disabled={currentCardIndex >= flashcards.length - 1}
                        onClick={() => { setCurrentCardIndex(p => p + 1); setFlipped(false) }}
                        className="p-2 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </motion.div>
          )}

          {/* ─── Q&A Analysis Panel ─── */}
          {activeFeature === 'qa' && (
            <motion.div
              key="qa"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full flex flex-col"
            >
              {/* Top bar */}
              <div className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-[#7c3aed]" />
                  <span className="font-bold text-white">Q&A Analysis</span>
                  {qaQuestions.length > 0 && (
                    <span className="text-xs text-gray-500">{qaQuestions.length} Questions</span>
                  )}
                </div>
                <button
                  onClick={() => fetchQA(true)}
                  disabled={qaLoading}
                  className="flex items-center gap-1.5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-white/30 transition-all"
                >
                  <RefreshCw className={`w-3 h-3 ${qaLoading ? 'animate-spin' : ''}`} />
                  Regenerate
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                {qaLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="animate-pulse bg-white/5 rounded-xl h-16" />
                    ))}
                  </div>
                ) : qaQuestions.length > 0 ? (
                  <div className="space-y-3">
                    {qaQuestions.map((item, i) => {
                      const diffColors: Record<string, string> = {
                        easy: 'bg-emerald-900/40 text-emerald-300',
                        medium: 'bg-amber-900/40 text-amber-300',
                        hard: 'bg-red-900/40 text-red-300'
                      }
                      return (
                        <div
                          key={i}
                          onClick={() => setExpandedQA(expandedQA === i ? null : i)}
                          className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-4 cursor-pointer hover:border-white/20 transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${diffColors[item.difficulty] || diffColors.medium}`}>
                              {item.difficulty}
                            </span>
                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                              {item.type}
                            </span>
                            <p className="text-sm font-medium text-white flex-1 ml-2">{item.question}</p>
                            {expandedQA === i ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                          </div>
                          <AnimatePresence>
                            {expandedQA === i && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <p className="text-sm text-gray-300 leading-relaxed pt-3 border-t border-white/5 mt-3">{item.answer}</p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                    {/* Export */}
                    <button
                      onClick={() => {
                        const text = qaQuestions.map((q, i) => `Q${i + 1} [${q.difficulty}] (${q.type}): ${q.question}\nA: ${q.answer}\n`).join('\n')
                        const blob = new Blob([text], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `qa-analysis-${session.name}.txt`
                        a.click()
                        URL.revokeObjectURL(url)
                      }}
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2 text-sm text-gray-400 flex items-center justify-center gap-2 transition-all mt-4"
                    >
                      <Download className="w-4 h-4" />
                      Export Q&A
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}

          {/* ─── Audio Overview Panel ─── */}
          {activeFeature === 'audio' && (
            <motion.div
              key="audio"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full flex flex-col"
            >
              {audioUrl ? (
                <>
                  {/* Top bar */}
                  <div className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                      <Headphones className="w-5 h-5 text-[#7c3aed]" />
                      <span className="font-bold text-white">Audio Overview</span>
                      <span className="text-xs text-gray-500">{fmtTime(duration)}</span>
                    </div>
                    <button
                      onClick={() => { setAudioUrl(null); setCaptionsUrl(null); setCaptions([]); setActiveCaptionId(null); generatePodcast() }}
                      className="flex items-center gap-1.5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-white/30 transition-all"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>

                  {/* Player */}
                  <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="bg-[#1a1a1a] border border-purple-500/20 rounded-2xl p-6 max-w-lg mx-auto mt-8">
                      {/* Avatars */}
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold">A</div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold">B</div>
                        <span className="text-xs text-gray-500 ml-2">AI Podcast · {fmtTime(duration)}</span>
                      </div>

                      {/* Play button */}
                      <div className="flex justify-center mb-6">
                        <button
                          onClick={() => {
                            if (!audioRef.current) return
                            if (isPlaying) { audioRef.current.pause(); setIsPlaying(false) }
                            else { audioRef.current.play(); setIsPlaying(true) }
                          }}
                          className="w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-900/40 transition-all"
                        >
                          {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-1" />}
                        </button>
                      </div>

                      {/* Progress bar */}
                      <div
                        className="w-full h-1.5 bg-white/10 rounded-full cursor-pointer relative mb-2"
                        onClick={(e) => {
                          if (!audioRef.current || !duration) return
                          const rect = e.currentTarget.getBoundingClientRect()
                          const pct = (e.clientX - rect.left) / rect.width
                          audioRef.current.currentTime = pct * duration
                        }}
                      >
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                          style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mb-4">
                        <span>{fmtTime(currentTime)}</span>
                        <span>{fmtTime(duration)}</span>
                      </div>

                      {/* Playback speed */}
                      <div className="flex gap-2 justify-center mb-4">
                        {[0.75, 1, 1.25, 1.5].map(r => (
                          <button
                            key={r}
                            onClick={() => { setPlaybackRate(r); if (audioRef.current) audioRef.current.playbackRate = r }}
                            className={`px-2 py-1 rounded text-xs transition-all ${playbackRate === r ? 'bg-purple-900/40 text-purple-300' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            {r}x
                          </button>
                        ))}
                      </div>

                      {/* Download */}
                      <button
                        onClick={() => {
                          const a = document.createElement('a')
                          a.href = `http://localhost:8000${audioUrl}`
                          a.download = `podcast-${session.name}.mp3`
                          a.click()
                        }}
                        className="bg-white/5 rounded-lg px-3 py-1.5 text-xs text-gray-400 flex items-center gap-1.5 hover:bg-white/10 transition-all w-full justify-center"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    </div>

                    {/* Live Captions */}
                    {captions.length > 0 && (
                      <div className="max-w-lg mx-auto w-full mt-6 relative h-[160px]">
                        {/* Ambient glow */}
                        <div className={`absolute inset-0 rounded-2xl blur-2xl opacity-10 transition-colors duration-700 pointer-events-none ${activeCaptionId !== null && captions[activeCaptionId]?.speaker === 'HOST_A'
                            ? 'bg-purple-600'
                            : activeCaptionId !== null
                              ? 'bg-blue-600'
                              : 'bg-transparent'
                          }`} />
                        {/* Background */}
                        <div className="absolute inset-0 rounded-2xl bg-[#111111]/60 backdrop-blur-sm border border-white/5" />
                        {/* Gradient fade — top */}
                        <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-[#0a0a0a] to-transparent z-10 rounded-t-2xl pointer-events-none" />
                        {/* Gradient fade — bottom */}
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0a0a0a] to-transparent z-10 rounded-b-2xl pointer-events-none" />
                        {/* Caption content */}
                        <div
                          className="absolute inset-0 flex flex-col items-center justify-center px-8 z-[5] transition-opacity duration-500"
                          style={{ opacity: activeCaptionId !== null && !isPlaying ? 0.5 : 1 }}
                        >
                          <AnimatePresence mode="wait">
                            {activeCaptionId === null ? (
                              <motion.p
                                key="placeholder"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-xs text-gray-600 text-center"
                              >
                                Captions will appear here during playback
                              </motion.p>
                            ) : (() => {
                              const caption = captions.find(c => c.id === activeCaptionId)
                              if (!caption) return null
                              return (
                                <motion.div
                                  key={activeCaptionId}
                                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -10 }}
                                  transition={{
                                    duration: 0.3,
                                    ease: [0, 0, 0.2, 1],
                                    exit: { duration: 0.2 }
                                  }}
                                  className="flex flex-col items-center gap-2 text-center relative"
                                >
                                  {/* Left accent bar */}
                                  <motion.div
                                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-10 rounded-full ${caption.speaker === 'HOST_A' ? 'bg-purple-500' : 'bg-blue-500'
                                      }`}
                                    initial={{ scaleY: 0 }}
                                    animate={{ scaleY: 1 }}
                                    transition={{ duration: 0.3 }}
                                  />
                                  {/* Speaker label */}
                                  <motion.span
                                    className={`text-[10px] font-bold uppercase tracking-[0.15em] ${caption.speaker === 'HOST_A' ? 'text-purple-400' : 'text-blue-400'
                                      }`}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.05, duration: 0.2 }}
                                  >
                                    {caption.speaker === 'HOST_A' ? 'Host A' : 'Host B'}
                                  </motion.span>
                                  {/* Caption text — solid block */}
                                  <motion.p
                                    className={`text-sm font-medium leading-relaxed ${caption.speaker === 'HOST_A' ? 'text-purple-300' : 'text-blue-300'
                                      }`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.1, duration: 0.25 }}
                                  >
                                    {caption.text}
                                  </motion.p>
                                </motion.div>
                              )
                            })()}
                          </AnimatePresence>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : generating ? (
                /* Generating state */
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
                  {/* Waveform animation */}
                  <div className="flex items-end gap-1 h-12">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className="w-1.5 bg-purple-500 rounded-full"
                        style={{
                          animation: `waveBar 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
                          height: '8px'
                        }}
                      />
                    ))}
                  </div>
                  <style>{`
                    @keyframes waveBar {
                      0% { height: 8px; }
                      100% { height: 40px; }
                    }
                  `}</style>
                  <p className="text-sm text-gray-300 animate-pulse">{genStep}</p>
                  <p className="text-xs text-gray-600">This may take 2-4 minutes. Please keep this page open.</p>
                </div>
              ) : audioError ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
                  <div className="border border-red-500/30 bg-red-900/10 rounded-xl p-4 max-w-md text-center">
                    <p className="text-sm text-red-400">{audioError}</p>
                    <button onClick={generatePodcast} className="mt-3 text-xs text-red-300 underline">Retry</button>
                  </div>
                </div>
              ) : (
                /* Generation prompt */
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
                  <div className="relative">
                    <Headphones className="w-16 h-16 text-[#7c3aed]" style={{ filter: 'drop-shadow(0 0 20px rgba(124,58,237,0.3))' }} />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Audio Overview</h2>
                  <p className="text-sm text-gray-500 text-center max-w-md">
                    Generate an AI podcast of this lecture — a two-host conversational discussion covering all the key topics.
                  </p>
                  <button
                    onClick={generatePodcast}
                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold rounded-xl px-8 py-4 text-base flex items-center gap-3 shadow-lg shadow-purple-900/30 transition-all"
                  >
                    <Headphones className="w-5 h-5" />
                    Generate Podcast
                  </button>
                  <p className="text-xs text-gray-600">Generation takes 2-4 minutes</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ─── Video Lecture Panel ─── */}
          {activeFeature === 'video' && (
            <motion.div
              key="video"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="h-full flex flex-col"
            >
              {videoUrl && videoStatus === 'complete' ? (
                <>
                  {/* Top bar */}
                  <div className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm border-b border-white/5 px-6 py-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-3">
                      <Film className="w-5 h-5 text-[#7c3aed]" />
                      <span className="font-bold text-white">Video Lecture</span>
                    </div>
                    <button
                      onClick={() => { setVideoUrl(null); setVideoStatus('none'); setVideoError(null); generateVideo() }}
                      className="flex items-center gap-1.5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-white/30 transition-all"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>

                  {/* Video Player */}
                  <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="max-w-2xl mx-auto">
                      <video
                        controls
                        className="w-full rounded-2xl border border-white/10 bg-black"
                        src={`http://localhost:8000${videoUrl}`}
                      >
                        Your browser does not support the video tag.
                      </video>
                      <div className="mt-4 flex gap-3">
                        <button
                          onClick={() => {
                            const a = document.createElement('a')
                            a.href = `http://localhost:8000${videoUrl}`
                            a.download = `video-lecture-${session.name}.mp4`
                            a.click()
                          }}
                          className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-400 flex items-center justify-center gap-2 transition-all"
                        >
                          <Download className="w-4 h-4" />
                          Download MP4
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : videoStatus !== 'none' && videoStatus !== 'failed' ? (
                /* Generating state */
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
                  {/* Animated film icon */}
                  <div className="relative">
                    <Film className="w-16 h-16 text-[#7c3aed] animate-pulse" style={{ filter: 'drop-shadow(0 0 20px rgba(124,58,237,0.4))' }} />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-white">Generating Video</h3>
                  {/* Progress steps */}
                  <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-md w-full">
                    {[
                      { key: 'generating', label: 'Extracting JSON script via Groq' },
                      { key: 'rendering', label: 'Playwright HTML rendering' },
                      { key: 'audio', label: 'Synthesizing Kokoro voice' },
                      { key: 'merging', label: 'Multiplexing AV via FFmpeg' },
                    ].map((step, i) => {
                      const statuses = ['queued', 'generating', 'rendering', 'audio', 'merging', 'complete']
                      const currentIdx = statuses.indexOf(videoStatus)
                      const stepIdx = statuses.indexOf(step.key)

                      // In parallel, rendering and audio might happen interchangeably.
                      // The statuses provided by job are sequential though
                      const isDone = stepIdx < currentIdx
                      const isActive = stepIdx === currentIdx
                      return (
                        <div key={step.key} className={`flex items-center gap-3 py-2 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDone ? 'bg-emerald-500/20 text-emerald-400' :
                              isActive ? 'bg-purple-500/20 text-purple-400' :
                                'bg-white/5 text-gray-600'
                            }`}>
                            {isDone ? '✓' : isActive ? (
                              <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                            ) : (i + 1)}
                          </div>
                          <span className={`text-sm ${isDone ? 'text-emerald-400' :
                              isActive ? 'text-white font-medium' :
                                'text-gray-600'
                            }`}>{step.label}</span>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-sm text-gray-400 animate-pulse">{videoProgress}</p>
                  <p className="text-xs text-gray-600">This may take 5-15 minutes. You can leave and come back.</p>
                </div>
              ) : videoStatus === 'failed' ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
                  <div className="border border-red-500/30 bg-red-900/10 rounded-xl p-4 max-w-md text-center">
                    <p className="text-sm text-red-400">{videoError || 'Video generation failed'}</p>
                    <button onClick={() => { setVideoError(null); setVideoStatus('none'); generateVideo() }} className="mt-3 text-xs text-red-300 underline">Retry</button>
                  </div>
                </div>
              ) : (
                /* Initial generation prompt */
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
                  <div className="relative">
                    <Film className="w-16 h-16 text-[#7c3aed]" style={{ filter: 'drop-shadow(0 0 20px rgba(124,58,237,0.3))' }} />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Video Lecture</h2>
                  <p className="text-sm text-gray-500 text-center max-w-md">
                    Generate an animated explainer video of this lecture — utilizing dynamic HTML animations recorded in real-time, coupled with an AI narration voiceover.
                  </p>
                  <button
                    onClick={generateVideo}
                    className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold rounded-xl px-8 py-4 text-base flex items-center gap-3 shadow-lg shadow-purple-900/30 transition-all"
                  >
                    <Film className="w-5 h-5" />
                    Generate Video
                  </button>
                  <p className="text-xs text-gray-600">Generation takes 5-15 minutes</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
