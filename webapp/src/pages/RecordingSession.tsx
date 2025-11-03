import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Square, Save, Send } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { socketService } from '@/services/socket'
import { api } from '@/services/api'
import gsap from 'gsap'
import MicIcon from '@/components/MicIcon'

export default function RecordingSession() {
  const navigate = useNavigate()
  const { isRecording, transcript, messages, setRecording, appendTranscript, addMessage, clearSession, setProcessing } = useStore()
  const [question, setQuestion] = useState('')
  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle')
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

  const handleSave = async () => {
    try {
      setProcessing(true)
      await api.saveSession(transcript, messages)
      // Clear session after saving and navigate away
      clearSession()
      receivedTextsRef.current.clear()
      navigate('/history')
    } catch (error) {
      console.error('Failed to save session:', error)
    } finally {
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
      const response = await api.askQuestion(question)
      
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
    <div className="min-h-screen p-6" style={{ background: '#000000' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between mb-6"
        >
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 glass-effect px-4 py-2 rounded-lg hover:bg-dark-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Dashboard</span>
          </button>

          <div className="flex items-center gap-4">
            <div 
              className="flex items-center gap-3 px-6 py-3 rounded-xl"
              style={{
                background: status === 'recording' ? 'rgba(255,0,0,0.2)' : 
                           status === 'processing' ? 'rgba(255,165,0,0.2)' : 
                           'rgba(128,128,128,0.2)',
                border: status === 'recording' ? '2px solid rgba(255,0,0,0.5)' : 
                       status === 'processing' ? '2px solid rgba(255,165,0,0.5)' : 
                       '2px solid rgba(128,128,128,0.3)',
                boxShadow: status === 'recording' ? '0 0 20px rgba(255,0,0,0.4)' : 
                          status === 'processing' ? '0 0 20px rgba(255,165,0,0.4)' : 
                          'none'
              }}
            >
              <div className={`w-4 h-4 rounded-full ${
                status === 'recording' ? 'bg-red-500 animate-pulse' :
                status === 'processing' ? 'bg-orange-500 animate-pulse' :
                'bg-gray-500'
              }`} 
              style={{
                boxShadow: status === 'recording' ? '0 0 10px rgba(255,0,0,0.8)' : 
                          status === 'processing' ? '0 0 10px rgba(255,165,0,0.8)' : 
                          'none'
              }}
              />
              <span className="text-base font-bold uppercase text-white">
                {status}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Transcript Panel */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 glass-effect rounded-2xl p-6 flex flex-col"
          >
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <div style={{ transform: 'scale(0.4)', transformOrigin: 'left center' }}>
                <MicIcon size={50} color="#00bfff" showWaves={false} />
              </div>
              Live Transcription
            </h2>

            <div
              ref={transcriptRef}
              className="flex-1 bg-dark-800 rounded-xl p-6 mb-4 overflow-y-auto min-h-[400px] max-h-[500px] font-mono text-sm leading-relaxed"
            >
              {transcript || (
                <p className="text-gray-500 italic">
                  Transcript will appear here as you speak...
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-4">
              {!isRecording ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStart}
                  className="flex-1 px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 100%)',
                    boxShadow: '0 0 30px rgba(0,102,255,0.6), 0 4px 20px rgba(0,102,255,0.4)',
                    border: '2px solid rgba(0,191,255,0.5)'
                  }}
                >
                  <div style={{ transform: 'scale(0.35)' }}>
                    <MicIcon size={60} color="#ffffff" showWaves={true} />
                  </div>
                  Start Recording
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleStop}
                  className="flex-1 px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #ff0000 0%, #ff6600 100%)',
                    boxShadow: '0 0 40px rgba(255,0,0,0.8), 0 4px 20px rgba(255,0,0,0.6)',
                    border: '2px solid rgba(255,102,0,0.5)'
                  }}
                >
                  <div ref={pulseRef} className="absolute inset-0 bg-red-600 rounded-xl" />
                  <Square className="w-6 h-6 relative z-10 fill-current" />
                  <span className="relative z-10">Stop Recording</span>
                </motion.button>
              )}

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSave}
                disabled={!transcript}
                className="px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: transcript ? 'linear-gradient(135deg, #00ff00 0%, #32cd32 100%)' : '#2a2a2a',
                  boxShadow: transcript ? '0 0 30px rgba(0,255,0,0.6), 0 4px 20px rgba(0,255,0,0.4)' : 'none',
                  border: transcript ? '2px solid rgba(50,205,50,0.5)' : '2px solid #3a3a3a'
                }}
              >
                <Save className="w-6 h-6" />
                Save
              </motion.button>
            </div>
          </motion.div>

          {/* Chat Panel */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-effect rounded-2xl p-6 flex flex-col"
          >
            <h2 className="text-xl font-semibold mb-4">AI Assistant</h2>

            <div
              ref={chatRef}
              className="flex-1 bg-dark-800 rounded-xl p-4 mb-4 overflow-y-auto min-h-[400px] max-h-[500px] space-y-4"
            >
              <AnimatePresence>
                {messages.length === 0 ? (
                  <div className="text-sm space-y-2">
                    <p className="text-gray-400 font-semibold">
                      🤖 AI Assistant Ready
                    </p>
                    <p className="text-gray-500 italic">
                      I can answer questions about the lecture based on the transcript.
                      Start recording and ask me anything!
                    </p>
                    <p className="text-gray-600 text-xs">
                      Powered by Ollama AI
                    </p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-accent-blue/20 ml-8'
                          : 'bg-dark-700 mr-8'
                      }`}
                    >
                      <p className="text-xs text-gray-400 mb-1">
                        {msg.role === 'user' ? 'You' : 'AI'}
                      </p>
                      <p className="text-sm">{msg.content}</p>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Question Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                placeholder="Ask a question..."
                className="flex-1 bg-dark-800 border border-dark-500 rounded-lg px-4 py-2 focus:outline-none focus:border-accent-blue transition-colors"
              />
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleAskQuestion}
                className="p-3 rounded-xl transition-all"
                style={{
                  background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 100%)',
                  boxShadow: '0 0 20px rgba(0,102,255,0.5)',
                  border: '2px solid rgba(0,191,255,0.3)'
                }}
              >
                <Send className="w-6 h-6" />
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
