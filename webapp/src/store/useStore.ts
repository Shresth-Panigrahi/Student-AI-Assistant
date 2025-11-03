import { create } from 'zustand'

export interface Message {
  role: 'user' | 'ai'
  content: string
  timestamp: Date
}

export interface Session {
  id: string
  name: string
  timestamp: string
  transcript: string
  chat: Message[]
  summary?: string
  terminologies?: Record<string, any>
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
