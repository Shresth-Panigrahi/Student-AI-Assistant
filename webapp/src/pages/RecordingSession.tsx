import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Square, Save, Send, BookOpen, Mic } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { socketService } from '@/services/socket'
import { api } from '@/services/api'
import gsap from 'gsap'
import MicIcon from '@/components/MicIcon'
import Typewriter from '@/components/Typewriter'

export default function RecordingSession() {
  const navigate = useNavigate()
  const { isRecording, transcript, messages, setRecording, appendTranscript, addMessage, clearSession, setProcessing } = useStore()
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle')
  const [thinkMode, setThinkMode] = useState(false)
  const [lectureTopic, setLectureTopic] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const pulseRef = useRef<HTMLDivElement>(null)

  // Clear session ONLY when component unmounts (leaving the page)
  useEffect(() => {
    // Cleanup function runs when component unmounts (user leaves page)
    return () => {
      clearSession()
      receivedTextsRef.current.clear()
    }
  }, [])

  // Track received texts outside useEffect to persist across renders
  const receivedTextsRef = useRef(new Set<string>())

  useEffect(() => {
    socketService.connect()

    socketService.on('transcript', (data: any) => {
      const text = data.text.trim()
      // Check if we've already received this text
      if (!receivedTextsRef.current.has(text)) {
        receivedTextsRef.current.add(text)
        appendTranscript(text + ' ')
        if (transcriptRef.current) {
          transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
        }
      }
    })

    socketService.on('status', (data: any) => {
      setStatus(data.status as any)
    })

    // Poll for transcriptions every second when recording
    const pollInterval = setInterval(async () => {
      if (isRecording) {
        try {
          const response = await api.pollTranscription()
          if (response.texts && response.texts.length > 0) {
            response.texts.forEach((text: string) => {
              const trimmedText = text.trim()
              // Only add if not already received
              if (!receivedTextsRef.current.has(trimmedText)) {
                receivedTextsRef.current.add(trimmedText)
                appendTranscript(trimmedText + ' ')
              }
            })
            if (transcriptRef.current) {
              transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
            }
          }
        } catch (error) {
          console.error('Poll error:', error)
        }
      }
    }, 1000)

    return () => {
      socketService.disconnect()
      clearInterval(pollInterval)
    }
  }, [isRecording])

  useEffect(() => {
    if (isRecording && pulseRef.current) {
      gsap.to(pulseRef.current, {
        scale: 1.2,
        opacity: 0.5,
        duration: 1,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut',
      })
    }
  }, [isRecording])

  const handleStart = async () => {
    try {
      // DON'T clear session - keep existing transcript and chat
      // Only clear deduplication tracking for new recording
      receivedTextsRef.current.clear()

      await api.startSession(lectureTopic.trim() || undefined)
      setRecording(true)
      setStatus('recording')
    } catch (error) {
      console.error('Failed to start session:', error)
    }
  }

  const handleStop = async () => {
    try {
      await api.stopSession()
      setRecording(false)
      setStatus('processing')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (error) {
      console.error('Failed to stop session:', error)
    }
  }

  const handleSaveClick = () => {
    setShowSaveModal(true)
    setSessionName('') // Reset name
  }

  const handleSaveConfirm = async () => {
    if (!sessionName.trim()) {
      alert('Please enter a session name')
      return
    }

    try {
      setIsSaving(true)
      setProcessing(true)

      console.log('Saving session with name:', sessionName.trim())
      await api.saveSession(transcript, messages, sessionName.trim())

      // Clear session after saving and navigate away
      clearSession()
      receivedTextsRef.current.clear()
      setShowSaveModal(false)
      navigate('/history')
    } catch (error) {
      console.error('Failed to save session:', error)
      alert('Failed to save session')
    } finally {
      setIsSaving(false)
      setProcessing(false)
    }
  }

  const handleAskQuestion = async () => {
    if (!question.trim()) return

    const userMessage = { role: 'user' as const, content: question, timestamp: new Date() }
    addMessage(userMessage)
    setQuestion('')

    // Add thinking message
    const thinkingMessage = { role: 'ai' as const, content: '🤔 Thinking...', timestamp: new Date() }
    addMessage(thinkingMessage)

    try {
      const response = await api.askQuestion(question, thinkMode)

      // Remove thinking message and add real answer
      const messages = useStore.getState().messages
      const filteredMessages = messages.filter(m => m.content !== '🤔 Thinking...')
      useStore.setState({ messages: filteredMessages })

      const aiMessage = { role: 'ai' as const, content: response.answer, timestamp: new Date() }
      addMessage(aiMessage)

      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight
      }
    } catch (error) {
      console.error('Failed to ask question:', error)

      // Remove thinking message and show error
      const messages = useStore.getState().messages
      const filteredMessages = messages.filter(m => m.content !== '🤔 Thinking...')
      useStore.setState({ messages: filteredMessages })

      const errorMessage = { role: 'ai' as const, content: '❌ Error: Could not get answer. Please try again.', timestamp: new Date() }
      addMessage(errorMessage)
    }
  }

  return (
    <div className="min-h-screen relative bg-true-black text-white font-sans selection:bg-royal-purple selection:text-white overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-royal-purple/20 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute top-[20%] right-[-5%] w-[500px] h-[500px] bg-deep-magenta/15 rounded-full blur-[80px] animate-pulse-slow [animation-delay:2s]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] bg-orchid/10 rounded-full blur-[100px] animate-pulse-slow [animation-delay:4s]" />
        {/* Grain Overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      </div>

      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between mb-8"
        >
          <button
            onClick={() => navigate('/')}
            className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
            <span className="text-gray-400 group-hover:text-white transition-colors font-medium">Dashboard</span>
          </button>

          <div
            className={`flex items-center gap-3 px-6 py-2 rounded-full border backdrop-blur-md transition-all duration-300 ${status === 'recording'
              ? 'bg-rose/10 border-rose/30 shadow-[0_0_15px_rgba(251,113,133,0.3)]'
              : status === 'processing'
                ? 'bg-gold-highlight/10 border-gold-highlight/30 shadow-[0_0_15px_rgba(252,211,77,0.3)]'
                : 'bg-white/5 border-white/10'
              }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'recording' ? 'bg-rose animate-pulse' :
              status === 'processing' ? 'bg-gold-highlight animate-pulse' :
                'bg-gray-500'
              }`}
            />
            <span className={`text-sm font-bold uppercase tracking-wider ${status === 'recording' ? 'text-rose' :
              status === 'processing' ? 'text-gold-highlight' :
                'text-gray-400'
              }`}>
              {status}
            </span>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Transcript Panel */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 flex flex-col h-[calc(100vh-140px)]"
          >
            <div className="flex-1 bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6 flex flex-col relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />

              <h2 className="text-xl font-bold mb-6 flex items-center gap-3 relative z-10">
                <div className="p-2 bg-royal-purple/20 rounded-lg">
                  <MicIcon size={24} color="#a855f7" showWaves={isRecording} />
                </div>
                Live Transcription
              </h2>

              <div
                ref={transcriptRef}
                className="flex-1 min-h-0 bg-black/40 border border-white/5 rounded-2xl p-8 mb-6 overflow-y-auto font-sans text-xl leading-relaxed text-light-gray relative z-10 tracking-wide custom-scrollbar"
              >
                {transcript ? (
                  <Typewriter text={transcript} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-white/30 gap-4">
                    <MicIcon size={48} color="#52525b" showWaves={false} />
                    <p className="italic">Transcript will appear here...</p>
                  </div>
                )}
              </div>

              {/* Lecture Topic Input */}
              {!isRecording && (
                <div className="mb-6 relative z-10">
                  <div className="flex items-center gap-2 mb-2 text-sm text-gray-400 font-medium">
                    <BookOpen className="w-4 h-4 text-royal-purple" />
                    <span>Lecture Topic (optional)</span>
                  </div>
                  <input
                    type="text"
                    value={lectureTopic}
                    onChange={(e) => setLectureTopic(e.target.value)}
                    placeholder="e.g., Data Structures, Operating Systems..."
                    className="w-full bg-black/40 text-white border border-white/10 rounded-xl px-5 py-3 focus:outline-none focus:border-royal-purple/50 focus:ring-1 focus:ring-royal-purple/50 transition-all placeholder-gray-600"
                  />
                  {lectureTopic && (
                    <p className="text-xs text-royal-purple/80 mt-2 font-medium">
                      ✨ AI optimizing for: {lectureTopic}
                    </p>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="flex gap-4 relative z-10">
                {!isRecording ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStart}
                    className="flex-1 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 text-white shadow-lg bg-gradient-to-r from-royal-purple to-deep-magenta hover:shadow-[0_0_30px_rgba(109,40,217,0.4)] transition-all duration-300"
                  >
                    <Mic className="w-6 h-6" />
                    Start Recording
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleStop}
                    className="flex-1 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 text-white shadow-lg bg-gradient-to-r from-rose to-red-600 hover:shadow-[0_0_30px_rgba(251,113,133,0.4)] transition-all duration-300"
                  >
                    <div ref={pulseRef} className="absolute inset-0 bg-white/10 rounded-xl" />
                    <Square className="w-6 h-6 fill-current" />
                    Stop Recording
                  </motion.button>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveClick}
                  disabled={!transcript}
                  className="px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                >
                  <Save className="w-6 h-6" />
                  Save
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Chat Panel */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6 flex flex-col h-[calc(100vh-140px)]"
          >
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <div className="p-2 bg-deep-magenta/20 rounded-lg">
                <BookOpen className="w-5 h-5 text-deep-magenta" />
              </div>
              AI Assistant
            </h2>

            <div
              ref={chatRef}
              className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-4 mb-4 overflow-y-auto space-y-4"
            >
              <AnimatePresence>
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-40">
                    <p className="font-semibold mb-2">🤖 AI Assistant Ready</p>
                    <p className="text-sm">I can answer questions about the lecture in real-time.</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-2xl text-sm ${msg.role === 'user'
                        ? 'bg-royal-purple/20 border border-royal-purple/30 ml-8 text-white'
                        : 'bg-white/5 border border-white/10 mr-8 text-light-gray'
                        }`}
                    >
                      <p className="text-[10px] uppercase font-bold tracking-wider opacity-50 mb-1">
                        {msg.role === 'user' ? 'You' : 'AI'}
                      </p>
                      <p>{msg.content}</p>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Think Mode Toggle */}
            <div className="mb-4">
              <label className="flex items-center justify-between cursor-pointer group bg-black/20 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                <span className={`text-sm font-medium transition-colors ${thinkMode ? 'text-deep-magenta' : 'text-gray-400'}`}>
                  {thinkMode ? '🧠 Deep Think Mode' : '📄 Transcript Mode'}
                </span>
                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${thinkMode ? 'bg-deep-magenta' : 'bg-gray-600'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${thinkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <input
                  type="checkbox"
                  checked={thinkMode}
                  onChange={(e) => setThinkMode(e.target.checked)}
                  className="hidden"
                />
              </label>
            </div>

            {/* Question Input */}
            <div className="relative">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                placeholder={thinkMode ? "Ask deeper questions..." : "Ask about the lecture..."}
                className="w-full bg-black/40 text-white border border-white/10 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-deep-magenta/50 focus:ring-1 focus:ring-deep-magenta/50 transition-all placeholder-gray-600 text-sm"
              />
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleAskQuestion}
                className="absolute right-2 top-2 p-1.5 rounded-lg bg-deep-magenta text-white shadow-lg"
              >
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Save Session Modal */}
      {showSaveModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => !isSaving && setShowSaveModal(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="bg-dark-900 rounded-2xl p-8 max-w-md w-full border-2 border-green-500/30 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Save className="w-8 h-8 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Save Session</h2>
              <p className="text-gray-400">Give your session a name</p>
            </div>

            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSaveConfirm()}
              placeholder="e.g., OSI Model Lecture"
              className="w-full bg-dark-800 border border-dark-500 rounded-lg px-4 py-3 mb-6 focus:outline-none focus:border-green-500 transition-colors text-lg"
              autoFocus
            />

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowSaveModal(false)}
                disabled={isSaving}
                className="flex-1 px-6 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSaveConfirm}
                disabled={isSaving}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {isSaving ? 'Saving...' : 'Save'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
