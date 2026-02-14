import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Square, Save, Send, Sparkles } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { socketService } from '@/services/socket'
import { api } from '@/services/api'
import gsap from 'gsap'
import MicIcon from '@/components/MicIcon'
import TypewriterText from '@/components/TypewriterText'
import StarBackground from '@/components/StarBackground'

export default function RecordingSession() {
  const navigate = useNavigate()
  const { isRecording, transcript, messages, setRecording, appendTranscript, addMessage, clearSession, setProcessing } = useStore()
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle')
  const [thinkMode, setThinkMode] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const pulseRef = useRef<HTMLDivElement>(null)

  // Clear session ONLY when component unmounts (leaving the page)
  useEffect(() => {
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

    const pollInterval = setInterval(async () => {
      if (isRecording) {
        try {
          const response = await api.pollTranscription()
          if (response.texts && response.texts.length > 0) {
            response.texts.forEach((text: string) => {
              const trimmedText = text.trim()
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
      receivedTextsRef.current.clear()
      await api.startSession()
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
    setSessionName('')
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

    const thinkingMessage = { role: 'ai' as const, content: '🤔 Thinking...', timestamp: new Date() }
    addMessage(thinkingMessage)

    try {
      const response = await api.askQuestion(question, thinkMode)

      const messages = useStore.getState().messages
      const filteredMessages = messages.filter(m => m.content !== '🤔 Thinking...')
      useStore.setState({ messages: filteredMessages })

      const aiMessage = {
        role: 'ai' as const,
        content: response.answer,
        timestamp: new Date(),
        sources: response.sources
      }
      addMessage(aiMessage)

      if (chatRef.current) {
        chatRef.current.scrollTop = chatRef.current.scrollHeight
      }
    } catch (error) {
      console.error('Failed to ask question:', error)

      const messages = useStore.getState().messages
      const filteredMessages = messages.filter(m => m.content !== '🤔 Thinking...')
      useStore.setState({ messages: filteredMessages })

      const errorMessage = { role: 'ai' as const, content: '❌ Error: Could not get answer. Please try again.', timestamp: new Date() }
      addMessage(errorMessage)
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-true-black overflow-hidden pt-6 px-6">
      {/* Background Orbs (Matches Hero) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <StarBackground />
        <div className="absolute top-1/4 left-1/4 w-[800px] h-[800px] bg-royal-purple/20 rounded-full blur-[120px] animate-float" />
        <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-deep-magenta/15 rounded-full blur-[100px] animate-float [animation-delay:2s]" />
        <div className="absolute bottom-1/4 left-1/2 w-[500px] h-[500px] bg-orchid/10 rounded-full blur-[80px] animate-float [animation-delay:4s]" />
        {/* Grain Overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
      </div>

      <div className="relative z-10 max-w-[95%] mx-auto h-full flex flex-col min-h-[calc(100vh-3rem)]">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between mb-6"
        >
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-light-gray hover:text-white backdrop-blur-sm"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>

          {/* Status Indicator */}
          <div
            className="flex items-center gap-3 px-6 py-2.5 rounded-full border backdrop-blur-md transition-all duration-300"
            style={{
              background: status === 'recording' ? 'rgba(239, 68, 68, 0.1)' :
                status === 'processing' ? 'rgba(249, 115, 22, 0.1)' :
                  'rgba(255, 255, 255, 0.05)',
              borderColor: status === 'recording' ? 'rgba(239, 68, 68, 0.3)' :
                status === 'processing' ? 'rgba(249, 115, 22, 0.3)' :
                  'rgba(255, 255, 255, 0.1)',
              boxShadow: status === 'recording' ? '0 0 20px rgba(239, 68, 68, 0.2)' : 'none'
            }}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${status === 'recording' ? 'bg-red-500 animate-pulse' :
              status === 'processing' ? 'bg-orange-500 animate-pulse' :
                'bg-gray-500'
              }`} />
            <span className="text-sm font-semibold tracking-wide uppercase text-white/90">
              {status}
            </span>
          </div>
        </motion.div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6 flex-1 pb-6">

          {/* Left Column: Transcription */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 flex flex-col gap-6 h-full"
          >
            {/* Transcript Panel */}
            <div className="flex-1 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 flex flex-col relative overflow-hidden group min-h-[600px]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-white">
                <div className="p-2 bg-royal-purple/20 rounded-lg border border-royal-purple/30">
                  <MicIcon size={28} color="#a855f7" showWaves={isRecording} />
                </div>
                Live Transcription
              </h2>

              <div
                ref={transcriptRef}
                className="flex-1 bg-black/20 rounded-2xl p-8 overflow-y-auto font-mono text-base leading-relaxed text-gray-200 shadow-inner custom-scrollbar"
              >
                {transcript ? (
                  <TypewriterText
                    text={transcript}
                    speed={30}
                    onUpdate={() => {
                      if (transcriptRef.current) {
                        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
                      }
                    }}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-6">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center animate-pulse">
                      <MicIcon size={40} color="#4b5563" showWaves={false} />
                    </div>
                    <p className="text-xl">Waiting for speech...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex gap-4 h-24">
              {!isRecording ? (
                <button
                  onClick={handleStart}
                  className="flex-1 group relative rounded-3xl bg-royal-purple/20 border border-royal-purple/30 hover:bg-royal-purple/30 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-royal-purple/50 to-deep-magenta/50 opacity-0 group-hover:opacity-20 transition-opacity" />
                  <div className="flex items-center justify-center gap-4 relative z-10">
                    <div className="p-3 bg-white/10 rounded-full">
                      <MicIcon size={32} color="#ffffff" showWaves={false} />
                    </div>
                    <span className="text-2xl font-bold text-white">Start Recording</span>
                  </div>
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  className="flex-1 group relative rounded-3xl bg-rose/20 border border-rose/30 hover:bg-rose/30 transition-all duration-300 overflow-hidden"
                >
                  <div ref={pulseRef} className="absolute inset-0 bg-rose/10 pointer-events-none" />
                  <div className="flex items-center justify-center gap-4 relative z-10">
                    <div className="p-3 bg-white/10 rounded-full animate-pulse">
                      <Square className="w-6 h-6 text-white fill-current" />
                    </div>
                    <span className="text-2xl font-bold text-white">Stop Recording</span>
                  </div>
                </button>
              )}

              <button
                onClick={handleSaveClick}
                disabled={!transcript}
                className="w-1/4 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                <Save className="w-8 h-8 text-emerald-400" />
                <span className="text-xl font-bold text-white">Save</span>
              </button>
            </div>
          </motion.div>

          {/* Right Column: AI Assistant */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 h-full relative overflow-hidden min-h-[700px]"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
              <Sparkles className="w-40 h-40 text-royal-purple" />
            </div>

            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-white relative z-10">
              <div className="p-2 bg-deep-magenta/20 rounded-lg border border-deep-magenta/30">
                <Sparkles className="w-6 h-6 text-deep-magenta" />
              </div>
              AI Assistant
            </h2>

            <div
              ref={chatRef}
              className="flex-1 bg-black/20 rounded-2xl p-6 mb-6 overflow-y-auto space-y-6 relative z-10 custom-scrollbar"
            >
              <AnimatePresence>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 p-4">
                    <Sparkles className="w-12 h-12 mb-3 text-gray-600 opacity-50" />
                    <p className="text-sm font-medium">AI Ready</p>
                    <p className="text-xs mt-1 max-w-[200px]">Ask questions about your lecture transcript in real-time.</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-2xl max-w-[90%] ${msg.role === 'user'
                        ? 'bg-royal-purple/20 border border-royal-purple/20 ml-auto rounded-tr-sm'
                        : 'bg-white/5 border border-white/10 mr-auto rounded-tl-sm'
                        }`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </p>
                      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                      {/* Display Sources if available */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10">
                          <p className="text-[10px] font-semibold text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                            <i className="w-1 h-1 rounded-full bg-sky-400 float-left mr-1 mt-0.5" />
                            Sources
                          </p>
                          <div className="space-y-1">
                            {msg.sources.map((source, sIdx) => (
                              <a
                                key={sIdx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-xs text-sky-400/80 hover:text-sky-300 truncate hover:underline transition-colors flex items-center gap-1"
                              >
                                <span className="opacity-50">🔗</span>
                                {source.title}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="relative z-10 mt-auto">
              <div className="flex items-center justify-between mb-3 px-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${thinkMode ? 'bg-deep-magenta' : 'bg-gray-700'}`}>
                    <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform ${thinkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <input
                    type="checkbox"
                    checked={thinkMode}
                    onChange={(e) => setThinkMode(e.target.checked)}
                    className="hidden"
                  />
                  <span className="text-xs font-medium text-gray-400 group-hover:text-gray-300 transition-colors">
                    Think Mode {thinkMode && '(Enabled)'}
                  </span>
                </label>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                  placeholder="Ask a question..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-royal-purple/50 focus:bg-black/60 transition-all"
                />
                <button
                  onClick={handleAskQuestion}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div >

      {/* Save Session Modal */}
      {
        showSaveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => !isSaving && setShowSaveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-[#0D0D12] rounded-3xl p-8 max-w-md w-full border border-white/10 shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Background Gradients */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-royal-purple/20 blur-[50px]" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-deep-magenta/20 blur-[50px]" />

              <div className="text-center mb-8 relative z-10">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                  <Save className="w-8 h-8 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2 text-white">Save Session</h2>
                <p className="text-gray-400">Enter a name for this recording</p>
              </div>

              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSaveConfirm()}
                placeholder="e.g., Computer Networks Lecture 1"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 mb-6 focus:outline-none focus:border-royal-purple/50 text-white placeholder-gray-600 transition-colors text-lg relative z-10"
                autoFocus
              />

              <div className="flex gap-4 relative z-10">
                <button
                  onClick={() => setShowSaveModal(false)}
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-semibold text-gray-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfirm}
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-royal-purple to-deep-magenta hover:brightness-110 rounded-xl font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30"
                >
                  {isSaving ? (
                    <>Saving...</>
                  ) : (
                    <>Save Session</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )
      }
    </div >
  )
}
