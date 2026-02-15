import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, FileText, Sparkles, BookOpen, Loader, Eye, EyeOff, Brain, HelpCircle, Languages } from 'lucide-react'
import { api } from '@/services/api'
import { Session } from '@/store/useStore'
import { format } from 'date-fns'
import TranslationTab from '@/components/TranslationTab'
import FlashcardDeck from '@/components/FlashcardDeck'
import QuizSection from '@/components/QuizSection'

export default function TranscriptDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState<'summary' | 'terms' | 'qa' | 'flashcards' | 'one-word' | 'short-answer' | null>(null)
  const [activeTab, setActiveTab] = useState<'transcript' | 'summary' | 'terms' | 'qa' | 'flashcards' | 'quiz' | 'translate'>('transcript')
  const [quizType, setQuizType] = useState<'one-word' | 'short-answer'>('one-word')
  const [visibleAnswers, setVisibleAnswers] = useState<Set<number>>(new Set())

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

  const handleGenerateQA = async () => {
    if (!id) return
    setAnalyzing('qa')
    try {
      const result = await api.generateQA(id)
      setSession((prev) => prev ? { ...prev, qa: result.qa } : null)
      setActiveTab('qa')
      setVisibleAnswers(new Set()) // Hide all answers initially
    } catch (error) {
      console.error('Failed to generate Q&A:', error)
    } finally {
      setAnalyzing(null)
    }
  }

  const handleGenerateFlashcards = async () => {
    if (!id) return
    setAnalyzing('flashcards')
    try {
      const result = await api.generateFlashcards(id)
      setSession((prev) => prev ? { ...prev, flashcards: result } : null)
      setActiveTab('flashcards')
    } catch (error) {
      console.error('Failed to generate flashcards:', error)
    } finally {
      setAnalyzing(null)
    }
  }

  const handleGenerateQuiz = async (type: 'one-word' | 'short-answer') => {
    if (!id) return
    setAnalyzing(type === 'one-word' ? 'one-word' : 'short-answer')
    try {
      if (type === 'one-word') {
        const result = await api.generateOneWordQuestions(id)
        setSession((prev) => prev ? { ...prev, one_word_questions: result } : null)
      } else {
        const result = await api.generateShortAnswerQuestions(id)
        setSession((prev) => prev ? { ...prev, short_answer_questions: result } : null)
      }
      setQuizType(type)
      setActiveTab('quiz')
    } catch (error) {
      console.error('Failed to generate quiz:', error)
    } finally {
      setAnalyzing(null)
    }
  }

  const toggleAnswer = (index: number) => {
    setVisibleAnswers((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
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
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-700 overflow-x-auto pb-1">
              {['transcript', 'summary', 'terms', 'qa', 'flashcards', 'quiz', 'translate'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-2 font-medium capitalize transition-colors relative whitespace-nowrap ${activeTab === tab
                    ? 'text-accent-blue'
                    : 'text-gray-400 hover:text-gray-300'
                    }`}
                >
                  {tab === 'terms' ? 'Terminologies' : tab === 'qa' ? 'Q&A' : tab}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-blue"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <AnimatePresence mode="wait">
              {activeTab === 'transcript' && (
                <motion.div
                  key="transcript"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-dark-gray rounded-xl p-6 max-h-[600px] overflow-y-auto"
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
                  className="bg-dark-gray rounded-xl p-6 max-h-[600px] overflow-y-auto"
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
                  className="bg-dark-gray rounded-xl p-6 max-h-[600px] overflow-y-auto"
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

              {activeTab === 'qa' && (
                <motion.div
                  key="qa"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-dark-gray rounded-xl p-6 max-h-[600px] overflow-y-auto"
                >
                  {session.qa && session.qa.length > 0 ? (
                    <div className="space-y-6">
                      {session.qa.map((item: any, index: number) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="border border-gray-700 rounded-lg p-4"
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex items-start gap-2 flex-1">
                              <span className="text-red-500 font-bold text-sm">Q{index + 1}:</span>
                              <p className="text-white font-medium">{item.question}</p>
                            </div>
                            <button
                              onClick={() => toggleAnswer(index)}
                              className="p-2 hover:bg-dark-600 rounded-lg transition-colors"
                              title={visibleAnswers.has(index) ? "Hide answer" : "Show answer"}
                            >
                              {visibleAnswers.has(index) ? (
                                <EyeOff className="w-5 h-5 text-gray-400" />
                              ) : (
                                <Eye className="w-5 h-5 text-accent-blue" />
                              )}
                            </button>
                          </div>
                          <AnimatePresence>
                            {visibleAnswers.has(index) && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="flex items-start gap-2 pl-6 overflow-hidden"
                              >
                                <span className="text-green-500 font-bold text-sm">A:</span>
                                <p className="text-gray-300 text-sm">{item.answer}</p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No Q&A generated yet</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Click "Generate Q&A" to create practice questions
                      </p>
                      <button
                        onClick={handleGenerateQA}
                        className="mt-4 text-accent-blue hover:underline"
                      >
                        Generate Now
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'flashcards' && (
                <motion.div
                  key="flashcards"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-xl p-6 min-h-[400px]"
                >
                  {session.flashcards ? (
                    <FlashcardDeck flashcardSet={session.flashcards} />
                  ) : (
                    <div className="text-center py-12 bg-dark-gray rounded-xl">
                      <Brain className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No flashcards generated yet</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Click "Generate Flashcards" to create study materials
                      </p>
                      <button
                        onClick={handleGenerateFlashcards}
                        className="mt-4 text-accent-blue hover:underline"
                      >
                        Generate Now
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'quiz' && (
                <motion.div
                  key="quiz"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-dark-gray rounded-xl p-6 min-h-[400px]"
                >
                  <div className="flex gap-4 mb-6">
                    <button
                      onClick={() => setQuizType('one-word')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${quizType === 'one-word' ? 'bg-accent-blue text-white' : 'bg-dark-600 text-gray-400 hover:text-white'
                        }`}
                    >
                      One-Word Quiz
                    </button>
                    <button
                      onClick={() => setQuizType('short-answer')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${quizType === 'short-answer' ? 'bg-accent-blue text-white' : 'bg-dark-600 text-gray-400 hover:text-white'
                        }`}
                    >
                      Short Answer Quiz
                    </button>
                  </div>

                  {((quizType === 'one-word' && session.one_word_questions) || (quizType === 'short-answer' && session.short_answer_questions)) ? (
                    <QuizSection
                      type={quizType}
                      oneWordSet={session.one_word_questions}
                      shortAnswerSet={session.short_answer_questions}
                    />
                  ) : (
                    <div className="text-center py-12">
                      <HelpCircle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">No {quizType.replace('-', ' ')} quiz generated yet</p>
                      <button
                        onClick={() => handleGenerateQuiz(quizType)}
                        className="mt-4 text-accent-blue hover:underline"
                      >
                        Generate {quizType === 'one-word' ? 'One-Word' : 'Short Answer'} Quiz
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'translate' && (
                <motion.div
                  key="translate"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <TranslationTab sessionId={session.id} originalTranscript={session.transcript} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Actions Panel */}
          <motion.div
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="glass-effect rounded-2xl p-6"
          >
            <h2 className="text-xl font-semibold mb-6">Analysis Tools</h2>

            <div className="space-y-4">
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

              <motion.button
                whileHover={{ scale: session.terminologies ? 1 : 1.02 }}
                whileTap={{ scale: session.terminologies ? 1 : 0.98 }}
                onClick={handleExtractTerms}
                disabled={analyzing === 'terms' || !!session.terminologies}
                className="w-full bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing === 'terms' ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Extracting...
                  </>
                ) : session.terminologies ? (
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

              <motion.button
                whileHover={{ scale: session.qa ? 1 : 1.02 }}
                whileTap={{ scale: session.qa ? 1 : 0.98 }}
                onClick={handleGenerateQA}
                disabled={analyzing === 'qa' || !!session.qa}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing === 'qa' ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : session.qa ? (
                  <>
                    <FileText className="w-5 h-5" />
                    ✓ Q&A Generated
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5" />
                    Generate Q&A
                  </>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: session.flashcards ? 1 : 1.02 }}
                whileTap={{ scale: session.flashcards ? 1 : 0.98 }}
                onClick={handleGenerateFlashcards}
                disabled={analyzing === 'flashcards' || !!session.flashcards}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {analyzing === 'flashcards' ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : session.flashcards ? (
                  <>
                    <Brain className="w-5 h-5" />
                    ✓ Flashcards Ready
                  </>
                ) : (
                  <>
                    <Brain className="w-5 h-5" />
                    Generate Flashcards
                  </>
                )}
              </motion.button>

              <div className="grid grid-cols-2 gap-3">
                <motion.button
                  whileHover={{ scale: session.one_word_questions ? 1 : 1.02 }}
                  whileTap={{ scale: session.one_word_questions ? 1 : 0.98 }}
                  onClick={() => handleGenerateQuiz('one-word')}
                  disabled={analyzing === 'one-word' || !!session.one_word_questions}
                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-4 rounded-xl font-semibold flex flex-col items-center justify-center gap-2 transition-colors text-sm"
                >
                  {analyzing === 'one-word' ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <HelpCircle className="w-5 h-5" />
                  )}
                  {session.one_word_questions ? '✓ One-Word' : 'One-Word Quiz'}
                </motion.button>

                <motion.button
                  whileHover={{ scale: session.short_answer_questions ? 1 : 1.02 }}
                  whileTap={{ scale: session.short_answer_questions ? 1 : 0.98 }}
                  onClick={() => handleGenerateQuiz('short-answer')}
                  disabled={analyzing === 'short-answer' || !!session.short_answer_questions}
                  className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-4 rounded-xl font-semibold flex flex-col items-center justify-center gap-2 transition-colors text-sm"
                >
                  {analyzing === 'short-answer' ? (
                    <Loader className="w-5 h-5 animate-spin" />
                  ) : (
                    <HelpCircle className="w-5 h-5" />
                  )}
                  {session.short_answer_questions ? '✓ Short Ans' : 'Short Answer Quiz'}
                </motion.button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab('translate')}
                className="w-full bg-blue-600 hover:bg-blue-700 px-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Languages className="w-5 h-5" />
                Translate Transcript
              </motion.button>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-700 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Word Count</span>
                <span className="font-semibold">{session.transcript.split(' ').length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Chat Messages</span>
                <span className="font-semibold">{session.chat?.length || 0}</span>
              </div>
              {session.summary && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Summary</span>
                  <span className="text-accent-green font-semibold">✓ Generated</span>
                </div>
              )}
              {session.terminologies && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Terms Extracted</span>
                  <span className="text-accent-green font-semibold">
                    {Object.keys(session.terminologies).length}
                  </span>
                </div>
              )}
              {session.qa && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Q&A Generated</span>
                  <span className="text-red-500 font-semibold">
                    {session.qa.length} questions
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
