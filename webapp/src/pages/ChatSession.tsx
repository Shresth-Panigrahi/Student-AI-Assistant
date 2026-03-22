import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Sparkles, MessageSquare, Paperclip, X, UploadCloud, Headphones, FileText, Layers, HelpCircle, Search, RefreshCcw, File as FileIcon, Image as ImageIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore, Session, Message } from '@/store/useStore'
import { api } from '@/services/api'
import axios from 'axios'

import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

// Subcomponents will be defined below or kept in line for now depending on size
export default function ChatSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { sessions } = useStore()

  // Try to get session from router state, fallback to store lookup
  const sessionData = (location.state?.session as Session | undefined) || sessions.find((s: Session) => s.id === sessionId)
  const [session] = useState<Session | null>(sessionData || null)
  
  // State
  const [time, setTime] = useState(new Date())
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false)
  const [transcriptSearch, setTranscriptSearch] = useState('')
  const [messages, setMessages] = useState<Message[]>(session?.chat || [])
  const [inputValue, setInputValue] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [files, setFiles] = useState<{name: string, content: string, size: number}[]>([])
  const [showDropzone, setShowDropzone] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  
  // Right Panel States
  const [showReport, setShowReport] = useState(false)
  const [reportContent, setReportContent] = useState<string | null>(null)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  const [showQA, setShowQA] = useState(false)
  const [qaContent, setQaContent] = useState<string | null>(null)
  const [isGeneratingQA, setIsGeneratingQA] = useState(false)

  const [showFlashcards, setShowFlashcards] = useState(false)
  const [flashcards, setFlashcards] = useState<{q: string, a: string}[]>([])
  const [flashcardIndex, setFlashcardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const wordInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Cleanup abort controller
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const handleSend = async (messageText = inputValue) => {
    if (!messageText.trim() || !session) return
    
    const userMsg: Message = { role: 'user', content: messageText.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInputValue('')
    setIsTyping(true)
    setErrorMsg('')

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    try {
      const allFilesContent = files.map(f => `--- FILE: ${f.name} ---\n${f.content}\n`).join('\n')
      const augmentedTranscript = session.transcript + (allFilesContent ? `\n\n--- ADDITIONAL CONTEXT ---\n${allFilesContent}` : '')

      const response = await api.askQuestion(augmentedTranscript + '\n\nUSER QUESTION: ' + messageText, false)
      const aiMsg: Message = { role: 'ai', content: response.answer, timestamp: new Date() }
      setMessages(prev => [...prev, aiMsg])
    } catch (error: any) {
      if (axios.isCancel(error)) return
      setErrorMsg('Failed to fetch response. Please try again.')
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSend()
    }
  }

  const extractPdfText = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n'
      }
      return fullText
    } catch (e) {
      console.error('PDF extraction failed', e)
      return ''
    }
  }

  const handleFiles = async (newFiles: FileList | File[]) => {
    for (const file of Array.from(newFiles)) {
      if (file.type === 'text/plain') {
        const content = await file.text()
        setFiles(prev => [...prev, { name: file.name, content, size: file.size }])
      } else if (file.type === 'application/pdf') {
        const content = await extractPdfText(file)
        if (content) {
          setFiles(prev => [...prev, { name: file.name, content, size: file.size }])
        }
      } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        // Mock parsing for DOCX for now
        setFiles(prev => [...prev, { name: file.name, content: "[DOCX Content Placeholder]", size: file.size }])
      } else if (file.type.startsWith('image/')) {
        // Mock image metadata for now
        setFiles(prev => [...prev, { name: file.name, content: "[Image Reference]", size: file.size }])
      }
    }
    setShowDropzone(false)
    setIsDraggingOver(false)
  }

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <span>{text}</span>
    const parts = text.split(new RegExp(`(${highlight})`, 'gi'))
    return (
      <span>
        {parts.map((p: string, i: number) => 
          p.toLowerCase() === highlight.toLowerCase() ? 
          <mark key={i} className="bg-royal-purple/50 text-white rounded px-0.5">{p}</mark> : p
        )}
      </span>
    )
  }

  const handleGenerateReport = async () => {
    if (!session) return
    setShowReport(true)
    if (reportContent) return
    setIsGeneratingReport(true)
    try {
      const res = await api.summarizeTranscript(session.id!)
      setReportContent(res.summary || res.content || (typeof res === 'string' ? res : JSON.stringify(res, null, 2)))
    } catch {
      setReportContent("Failed to generate report.")
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const handleGenerateQA = async (openFlashcards = false) => {
    if (!session) return
    if (openFlashcards) setShowFlashcards(true)
    else setShowQA(true)
    
    if (qaContent) return
    setIsGeneratingQA(true)
    try {
      const res = await api.generateQA(session.id!)
      const text = res.qa || res.content || (typeof res === 'string' ? res : JSON.stringify(res, null, 2))
      setQaContent(text)
      
      // Attempt rudimentary parsing of Q&A for flashcards
      const parsed: {q: string, a: string}[] = []
      const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
      let currentQ = ''
      for (const line of lines) {
        if (line.toLowerCase().startsWith('q:') || line.toLowerCase().startsWith('question')) {
          currentQ = line.replace(/^(Q:|Question\s*\d*:?)\s*/i, '')
        } else if (line.toLowerCase().startsWith('a:') || line.toLowerCase().startsWith('answer')) {
          if (currentQ) {
            parsed.push({ q: currentQ, a: line.replace(/^(A:|Answer\s*\d*:?)\s*/i, '') })
            currentQ = ''
          }
        }
      }
      if (parsed.length === 0) {
        // Fallback generic split
        parsed.push({ q: "What is the main topic of this lecture?", a: "Review the full Q&A section for details." })
      }
      setFlashcards(parsed)
    } catch {
      setQaContent("Failed to generate Q&A.")
      setFlashcards([{q: "Error", a: "Could not load flashcards."}])
    } finally {
      setIsGeneratingQA(false)
    }
  }

  if (!session) {
    // If no session passed, we should ideally fetch it. For now, fallback to history.
    return (
      <div className="min-h-screen bg-true-black flex items-center justify-center">
        <div className="text-white">Session not found. Redirecting...</div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-true-black text-white overflow-hidden relative font-sans selection:bg-royal-purple selection:text-white flex flex-col">
      {/* Entrance Scanner Line */}
      <motion.div
        initial={{ left: '-100%' }}
        animate={{ left: '100%' }}
        transition={{ duration: 0.6, ease: 'linear' }}
        className="absolute top-0 w-1/3 h-[2px] bg-gradient-to-r from-transparent via-royal-purple to-transparent z-50 pointer-events-none shadow-[0_0_15px_rgba(109,40,217,0.8)]"
      />

      {/* Page Header */}
      <header className="h-12 border-b border-white/5 bg-[#0D0D12]/80 backdrop-blur-md flex items-center justify-between px-4 z-40 flex-shrink-0">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button 
            onClick={() => navigate('/history')}
            className="p-1.5 -ml-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors group"
          >
            <motion.div whileHover={{ x: -4 }} transition={{ duration: 0.2 }}>
              <ArrowLeft className="w-4 h-4" />
            </motion.div>
          </button>
          <div className="h-4 w-[1px] bg-white/10" />
          <h1 className="text-sm font-medium text-gray-300 truncate">
            {session.name}
          </h1>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-xs font-medium text-gray-500 tracking-wider">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="h-4 w-[1px] bg-white/10" />
          <button className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 hover:text-white transition-colors">
            New Chat
          </button>
        </div>
      </header>

      {/* Main Two-Panel Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative z-10 w-full h-[calc(100vh-3rem)]">
        
        {/* LEFT PANEL - CHAT INTERFACE */}
        <motion.div 
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 120, delay: 0 }}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDraggingOver(false) }}
          onDrop={(e) => {
            e.preventDefault()
            handleFiles(e.dataTransfer.files)
          }}
          className={`flex-1 lg:w-[65%] flex flex-col relative bg-[#0D0D12] z-20 h-full border-b lg:border-b-0 border-white/5 transition-colors duration-300 ${isDraggingOver ? 'bg-royal-purple/10 border-royal-purple/50' : ''}`}
        >
          {/* Drag Overlay */}
          <AnimatePresence>
            {isDraggingOver && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center bg-royal-purple/5 backdrop-blur-sm pointer-events-none"
              >
                <div className="absolute inset-4 border-2 border-dashed border-royal-purple/50 rounded-3xl" />
                <div className="flex flex-col items-center gap-4">
                  <UploadCloud className="w-16 h-16 text-royal-purple animate-bounce" />
                  <p className="text-xl font-bold text-white shadow-black drop-shadow-lg">Drop files to add context</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Context Indicator Pill */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', delay: 0.3 }}
              className="group relative cursor-pointer"
              onClick={() => setShowTranscriptDrawer(true)}
            >
              {/* Shimmer background */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-r from-royal-purple/5 via-royal-purple/20 to-royal-purple/5 bg-[length:200%_auto] border border-royal-purple/20 backdrop-blur-md"
                style={{ animation: 'shimmer 3s linear infinite' }}
              />
              <style>{`
                @keyframes shimmer {
                  0% { background-position: 0% center; }
                  100% { background-position: -200% center; }
                }
                @keyframes pulse-dot {
                  0%, 100% { transform: scale(1); opacity: 1; }
                  50% { transform: scale(1.3); opacity: 0.6; }
                }
              `}</style>
              
              <div className="relative px-4 py-1.5 flex items-center gap-2">
                <div 
                  className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                  style={{ animation: 'pulse-dot 2s ease-in-out infinite' }}
                />
                <span className="text-xs font-medium text-purple-100 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 opacity-80" />
                  <span className="max-w-[150px] truncate">{session.name}</span>
                  <span className="opacity-60">· loaded as context</span>
                </span>
              </div>
            </motion.div>
          </div>

          <div className="flex-1 overflow-y-overlay px-6 pt-16 pb-32 flex flex-col custom-scrollbar">
            {/* Transcript Drawer Overlay */}
            <AnimatePresence>
              {showTranscriptDrawer && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowTranscriptDrawer(false)}
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                  />
                  <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '-100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed left-0 top-0 bottom-0 w-full md:w-[400px] bg-[#111116] border-r border-white/5 z-50 flex flex-col shadow-2xl"
                  >
                    <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#1A1A24]/50">
                      <h3 className="font-semibold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-royal-purple" />
                        Full Transcript
                      </h3>
                      <button 
                        onClick={() => setShowTranscriptDrawer(false)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="p-4 border-b border-white/5">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                          type="text"
                          placeholder="Search in transcript..."
                          value={transcriptSearch}
                          onChange={(e) => setTranscriptSearch(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-royal-purple/50 focus:ring-1 focus:ring-royal-purple/50"
                        />
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-overlay custom-scrollbar p-6">
                      <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed font-sans">
                        {highlightText(session.transcript, transcriptSearch)}
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Chat Messages */}
            <AnimatePresence>
              {messages.length === 0 ? (
                <div className="m-auto flex flex-col items-center justify-center max-w-md w-full">
                  <MessageSquare className="w-16 h-16 text-white opacity-[0.08] mb-6" />
                  <h2 className="text-lg font-medium text-gray-300 mb-8">Ask anything about this lecture</h2>
                  
                  <div className="flex flex-col gap-3 w-full">
                    {["Summarize the key points", "What topics were covered?", "Generate 5 quiz questions"].map((suggestion, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + idx * 0.08 }}
                      >
                        <button 
                          onClick={() => handleSend(suggestion)}
                          className="w-full text-left px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl text-sm text-gray-400 hover:text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
                        >
                          {suggestion}
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex flex-col group ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`
                        max-w-[85%] md:max-w-[75%] p-4 rounded-2xl
                        ${msg.role === 'user' 
                          ? 'bg-gradient-to-br from-royal-purple to-deep-magenta text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] rounded-tr-sm' 
                          : 'bg-[#1A1A24] text-gray-200 border-l-[3px] border-royal-purple rounded-tl-sm'
                        }
                      `}>
                        {msg.role === 'ai' ? (
                          <div className="prose prose-invert prose-sm max-w-none ai-content overflow-x-hidden">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </motion.div>
                  ))}
                  
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start"
                    >
                      <div className="bg-[#1A1A24] border-l-[3px] border-royal-purple p-4 rounded-2xl rounded-tl-sm flex items-center gap-1.5 h-12">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                            className="w-1.5 h-1.5 bg-royal-purple rounded-full"
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                  
                  {errorMsg && (
                    <div className="bg-rose/10 border border-rose/30 text-rose p-3 rounded-xl flex items-center justify-between text-sm max-w-[85%] self-start">
                      <span>{errorMsg}</span>
                      <button onClick={() => handleSend()} className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-xs ml-4 transition-colors">
                        <RefreshCcw className="w-3 h-3" /> Retry
                      </button>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Bottom Input Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0D0D12] to-transparent pointer-events-none z-30">
            {/* Uploaded Files Chips (above input) */}
            <AnimatePresence>
              {files.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="mx-auto max-w-3xl flex items-center gap-2 mb-2 pointer-events-auto overflow-x-auto custom-scrollbar pb-1"
                >
                  {files.map((file, idx) => (
                    <motion.div 
                      key={idx}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex-shrink-0 flex items-center gap-2 bg-[#1A1A24] border border-white/10 rounded-lg pl-3 pr-2 py-1.5"
                    >
                      <FileIcon className="w-3.5 h-3.5 text-royal-purple" />
                      <span className="text-xs font-medium text-gray-300 max-w-[120px] truncate">{file.name}</span>
                      <span className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(0)}kb</span>
                      <button 
                        onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="ml-1 p-0.5 rounded-md hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Dropzone Area (expandable) */}
            <AnimatePresence>
              {showDropzone && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 120, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="mx-auto max-w-3xl mb-2 pointer-events-auto overflow-hidden bg-[#141419]/90 backdrop-blur-xl rounded-2xl border border-white/10"
                >
                  <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-white/5 transition-colors border-2 border-dashed border-transparent hover:border-royal-purple/30 m-2 rounded-xl" style={{ width: 'calc(100% - 16px)', height: 'calc(100% - 16px)' }}>
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-400 font-semibold mb-1"><span className="text-royal-purple">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-gray-500">PDF, TXT, Word, Image</p>
                    </div>
                    <input 
                      ref={fileInputRef}
                      type="file" 
                      className="hidden" 
                      multiple 
                      accept=".txt,.pdf,.doc,.docx,image/*" 
                      onChange={(e) => {
                        if (e.target.files) handleFiles(e.target.files)
                      }}
                    />
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`mx-auto max-w-3xl border-t border-royal-purple/15 bg-[#141419]/90 backdrop-blur-xl rounded-2xl shadow-2xl p-2 flex items-end gap-2 pointer-events-auto transition-all duration-150 focus-within:shadow-[0_0_0_2px_rgba(109,40,217,0.3)] ${showDropzone ? 'shadow-[0_0_0_2px_rgba(109,40,217,0.3)]' : ''}`}>
              <button 
                onClick={() => setShowDropzone(!showDropzone)}
                className="flex-shrink-0 w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors group"
              >
                <motion.div className="flex items-center justify-center" animate={{ rotate: showDropzone ? 45 : 0 }} transition={{ duration: 0.2 }}>
                  <Paperclip className="w-4 h-4" />
                </motion.div>
              </button>
              
              <textarea 
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your thoughts (Cmd+Enter to send)..."
                className="flex-1 max-h-[120px] min-h-[40px] py-2 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none resize-none custom-scrollbar"
                style={{ overflowY: 'overlay' as any }}
              />
              
              <button 
                onClick={() => handleSend()}
                disabled={!inputValue.trim() || isTyping}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-royal-purple disabled:opacity-50 disabled:bg-white/10 hover:bg-royal-purple/90 flex items-center justify-center text-white transition-colors relative overflow-hidden group"
              >
                <motion.div className="absolute inset-0 flex items-center justify-center" whileHover={{ x: '100%' }} transition={{ duration: 0.2 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
                <motion.div className="absolute inset-0 flex items-center justify-center -translate-x-full group-hover:translate-x-0" transition={{ duration: 0.2 }}>
                  <Sparkles className="w-4 h-4" />
                </motion.div>
              </button>
            </div>
          </div>
        </motion.div>

        {/* GRADIENT DIVIDER */}
        <div className="hidden lg:block w-[1px] h-full bg-gradient-to-b from-transparent via-royal-purple/20 to-transparent z-30 flex-shrink-0" />

        {/* RIGHT PANEL - ACTIONS SIDEBAR */}
        <motion.div 
          initial={{ x: 30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 25, stiffness: 120, delay: 0.08 }}
          className="lg:w-[35%] w-full bg-[#111116] z-20 h-full overflow-y-overlay custom-scrollbar p-6 flex flex-col gap-6"
        >
          {/* Uploaded Files Section */}
          <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                <Paperclip className="w-4 h-4 text-gray-500" />
                Context Files
              </div>
              <AnimatePresence mode="popLayout">
                <motion.div 
                  key={files.length}
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="px-2 py-0.5 rounded bg-white/10 text-xs font-bold font-mono text-gray-300"
                >
                  {files.length}
                </motion.div>
              </AnimatePresence>
            </div>
            
            <div className="p-4 flex flex-col gap-2 min-h-[80px] justify-center">
              <AnimatePresence mode="popLayout">
                {files.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-center"
                  >
                    <span className="text-xs italic text-gray-500">No additional files added yet</span>
                  </motion.div>
                ) : (
                  files.map((file, idx) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      key={idx}
                      className="flex items-center justify-between bg-[#1A1A24] border border-white/5 rounded-lg p-2.5 group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileIcon className="w-4 h-4 text-royal-purple flex-shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-gray-300 truncate">{file.name}</span>
                          <span className="text-[10px] text-gray-500">{(file.size / 1024).toFixed(0)}kb</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-500 hover:text-white transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>

            {/* Upload Buttons */}
            <div className="px-4 py-3 border-t border-white/5 bg-white/[0.01] flex gap-2">
              {/* Hidden Inputs */}
              <input ref={pdfInputRef} type="file" className="hidden" accept=".pdf" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <input ref={wordInputRef} type="file" className="hidden" accept=".doc,.docx" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <input ref={imageInputRef} type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && handleFiles(e.target.files)} />

              <button 
                onClick={() => pdfInputRef.current?.click()}
                className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white flex flex-col items-center gap-1 transition-colors border border-white/5 hover:border-white/10"
              >
                <div className="w-6 h-6 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                PDF
              </button>
              <button 
                onClick={() => wordInputRef.current?.click()}
                className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white flex flex-col items-center gap-1 transition-colors border border-white/5 hover:border-white/10"
              >
                <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <FileIcon className="w-3.5 h-3.5" />
                </div>
                Word
              </button>
              <button 
                onClick={() => imageInputRef.current?.click()}
                className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white flex flex-col items-center gap-1 transition-colors border border-white/5 hover:border-white/10"
              >
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ImageIcon className="w-3.5 h-3.5" />
                </div>
                Image
              </button>
            </div>
          </div>

          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-1 font-mono">Lecture Tools</div>

          {/* Action Cards */}
          <div className="flex flex-col gap-3">
            {/* Audio Overview - Disabled */}
            <div className="relative p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-4 opacity-40 cursor-not-allowed group">
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white/10 text-[10px] uppercase font-bold text-gray-400">Coming Soon</div>
              <div className="p-2.5 rounded-lg bg-white/5 text-gray-400">
                <Headphones className="w-5 h-5" />
              </div>
              <div className="cursor-not-allowed">
                <h4 className="text-sm font-bold text-gray-300">Audio Overview</h4>
                <p className="text-xs text-gray-500 mt-0.5">Listen to an AI podcast of this lecture</p>
              </div>
              <Tooltip text="Audio overview coming in the next update 🎧" />
            </div>

            {/* Reports */}
            <ActionCard 
              icon={<FileText className="w-5 h-5" />} 
              title="Lecture Report" 
              desc="Generate a comprehensive written summary" 
              onClick={handleGenerateReport} 
            />
            
            {/* Flash Cards */}
            <ActionCard 
              icon={<Layers className="w-5 h-5" />} 
              title="Flash Cards" 
              desc="Review key concepts with an interactive deck" 
              onClick={() => handleGenerateQA(true)} 
            />
            
            {/* Q & A */}
            <ActionCard 
              icon={<HelpCircle className="w-5 h-5" />} 
              title="Q & A Analysis" 
              desc="Deep dive into expected questions and answers" 
              onClick={() => handleGenerateQA(false)} 
            />
          </div>
        </motion.div>
      </div>

      {/* DRAWERS & MODALS */}

      {/* Report Drawer */}
      <AnimatePresence>
        {showReport && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowReport(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full md:w-[500px] bg-[#111116] border-l border-white/5 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#1A1A24]/50">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-royal-purple" />
                  Lecture Report
                </h3>
                <button onClick={() => setShowReport(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-overlay custom-scrollbar p-6">
                {isGeneratingReport ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                    <RefreshCcw className="w-8 h-8 animate-spin text-royal-purple" />
                    <p>Generating comprehensive report...</p>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed font-sans ai-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportContent || "*Empty report*"}</ReactMarkdown>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Q&A Drawer */}
      <AnimatePresence>
        {showQA && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowQA(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full md:w-[500px] bg-[#111116] border-l border-white/5 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#1A1A24]/50">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-royal-purple" />
                  Q & A Analysis
                </h3>
                <button onClick={() => setShowQA(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-overlay custom-scrollbar p-6">
                {isGeneratingQA ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                    <RefreshCcw className="w-8 h-8 animate-spin text-royal-purple" />
                    <p>Extracting key questions and answers...</p>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed font-sans ai-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{qaContent || "*Empty Q&A*"}</ReactMarkdown>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Flashcards Modal (3D CSS setup) */}
      <AnimatePresence>
        {showFlashcards && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowFlashcards(false); setIsFlipped(false); setFlashcardIndex(0); }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
            >
              {isGeneratingQA ? (
                <div className="flex flex-col items-center justify-center text-gray-400 gap-4">
                  <RefreshCcw className="w-8 h-8 animate-spin text-royal-purple" />
                  <p>Building flashcard deck...</p>
                </div>
              ) : (
                <div 
                  className="w-full max-w-2xl aspect-video perspective-1000" 
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-full flex justify-between items-center mb-6 text-white font-mono gap-4">
                    <span className="text-gray-400">Card {flashcardIndex + 1} of {flashcards.length}</span>
                    <button onClick={() => setShowFlashcards(false)} className="hover:text-royal-purple text-gray-400 transition-colors">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div 
                    className={`relative w-full h-[300px] cursor-pointer preserve-3d transition-transform duration-700 ${isFlipped ? 'rotate-y-180' : ''}`}
                    onClick={() => setIsFlipped(!isFlipped)}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-gradient-to-br from-[#1A1A24] to-[#111116] border border-white/10 rounded-3xl shadow-2xl flex flex-col items-center justify-center p-8 text-center">
                      <HelpCircle className="w-8 h-8 text-royal-purple/50 mb-4" />
                      <h3 className="text-2xl font-bold text-white text-balance">{flashcards[flashcardIndex]?.q}</h3>
                      <p className="absolute bottom-6 text-xs text-gray-500 font-mono">Click to flip</p>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-gradient-to-br from-royal-purple/20 to-[#111116] border border-royal-purple/30 rounded-3xl shadow-[0_0_50px_rgba(109,40,217,0.15)] flex flex-col items-center justify-center p-8 text-center">
                      <div className="flex-1 w-full flex items-center justify-center overflow-y-auto custom-scrollbar">
                        <p className="text-xl font-medium text-gray-200 text-balance leading-relaxed">
                          {flashcards[flashcardIndex]?.a}
                        </p>
                      </div>
                      <p className="text-xs text-royal-purple/60 mt-4 font-mono">Click to flip back</p>
                    </div>
                  </div>

                  {/* Navigation below card */}
                  <div className="flex justify-center gap-4 mt-8">
                    <button 
                      disabled={flashcardIndex === 0}
                      onClick={(e) => { e.stopPropagation(); setIsFlipped(false); setTimeout(() => setFlashcardIndex(prev => Math.max(0, prev - 1)), 150) }}
                      className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-colors font-semibold text-sm"
                    >
                      Previous
                    </button>
                    <button 
                      disabled={flashcardIndex === flashcards.length - 1}
                      onClick={(e) => { e.stopPropagation(); setIsFlipped(false); setTimeout(() => setFlashcardIndex(prev => Math.min(flashcards.length - 1, prev + 1)), 150) }}
                      className="px-6 py-3 rounded-xl bg-royal-purple hover:bg-royal-purple/80 disabled:opacity-30 disabled:hover:bg-royal-purple transition-colors font-semibold text-sm shadow-[0_4px_20px_rgba(109,40,217,0.3)]"
                    >
                      Next Card
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(109, 40, 217, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(109, 40, 217, 0.5);
        }

        .ai-content p { margin-bottom: 0.75em; }
        .ai-content p:last-child { margin-bottom: 0; }
        .ai-content ul { list-style-type: disc; padding-left: 1.5em; margin-bottom: 0.75em; }
        .ai-content ol { list-style-type: decimal; padding-left: 1.5em; margin-bottom: 0.75em; }
        .ai-content li { margin-bottom: 0.25em; }
        .ai-content code { bg-color: rgba(0,0,0,0.3); padding: 0.2em 0.4em; border-radius: 0.25em; font-family: monospace; font-size: 0.9em; }
        .ai-content pre code { bg-color: transparent; padding: 0; }
        .ai-content pre { background-color: rgba(0,0,0,0.3); padding: 1em; border-radius: 0.5em; overflow-x: auto; margin-bottom: 0.75em; }

        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  )
}

function ActionCard({ icon, title, desc, onClick }: { icon: React.ReactNode, title: string, desc: string, onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2, backgroundColor: 'rgba(255,255,255,0.04)', boxShadow: '0 8px 20px rgba(0,0,0,0.2)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center gap-4 text-left group transition-colors"
    >
      <div className="p-2.5 rounded-lg bg-white/5 text-royal-purple group-hover:bg-royal-purple/20 transition-colors">
        {icon}
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">{title}</h4>
        <p className="text-xs text-gray-500 mt-0.5 group-hover:text-gray-400 transition-colors">{desc}</p>
      </div>
      <motion.div className="text-gray-600 group-hover:text-gray-400" transition={{ duration: 0.2 }}>
        <ArrowLeft className="w-4 h-4 rotate-180 group-hover:translate-x-1 transition-transform duration-200" />
      </motion.div>
    </motion.button>
  )
}

function Tooltip({ text }: { text: string }) {
  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-50">
      <div className="px-3 py-1.5 bg-[#1A1A1A] border border-white/10 rounded-lg text-xs tracking-wide text-gray-300 whitespace-nowrap shadow-xl">
        {text}
      </div>
    </div>
  )
}
