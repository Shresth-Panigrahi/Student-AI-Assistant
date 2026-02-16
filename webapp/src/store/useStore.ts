import { create } from 'zustand'

export interface Message {
  role: 'user' | 'ai'
  content: string
  timestamp: Date
  sources?: Array<{ title: string; url: string }>
}

export interface Flashcard {
  card_id: string
  front: string
  back: string
  card_type: string
  difficulty: string
  tags: string[]
}

export interface FlashcardSet {
  flashcard_set_id: string
  session_id: string
  num_cards: number
  cards: Flashcard[]
}

export interface OneWordQuestion {
  question_id: string
  question_text: string
  correct_answer: string
  acceptable_answers: string[]
  hint?: string
  category: string
}

export interface OneWordQuestionSet {
  question_set_id: string
  session_id: string
  num_questions: number
  questions: OneWordQuestion[]
}

export interface ShortAnswerQuestion {
  question_id: string
  question_text: string
  sample_answer: string
  key_points: string[]
  difficulty: string
  topic: string
}

export interface ShortAnswerQuestionSet {
  question_set_id: string
  session_id: string
  num_questions: number
  questions: ShortAnswerQuestion[]
}

export interface TranslationLog {
  translation_id: string
  session_id: string
  original_text: string
  translated_text: string
  source_language: string
  target_language: string
}

export interface Session {
  id: string
  name: string
  timestamp: string
  transcript: string
  chat: Message[]
  chat_messages?: Message[]
  summary?: string
  terminologies?: Record<string, any>
  qa?: Array<{ question: string; answer: string }>
  flashcards?: FlashcardSet
  one_word_questions?: OneWordQuestionSet
  short_answer_questions?: ShortAnswerQuestionSet
  translations?: TranslationLog[]
}

interface AppState {
  isRecording: boolean
  transcript: string
  messages: Message[]
  sessions: Session[]
  currentSession: Session | null
  isProcessing: boolean

  setRecording: (recording: boolean) => void
  appendTranscript: (text: string) => void
  addMessage: (message: Message) => void
  clearSession: () => void
  setSessions: (sessions: Session[]) => void
  setCurrentSession: (session: Session | null) => void
  setProcessing: (processing: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  isRecording: false,
  transcript: '',
  messages: [],
  sessions: [],
  currentSession: null,
  isProcessing: false,

  setRecording: (recording) => set({ isRecording: recording }),
  appendTranscript: (text) => set((state) => ({ transcript: state.transcript + text })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearSession: () => set({ transcript: '', messages: [] }),
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setProcessing: (processing) => set({ isProcessing: processing }),
}))
