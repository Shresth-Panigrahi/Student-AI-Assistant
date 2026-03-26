import axios from 'axios'
import { electronIpc } from '@/electron/ipc'

const client = axios.create({
  baseURL: electronIpc.backendUrl(),
  timeout: 60_000,
})

export const api = {
  // Health check
  healthCheck: async () => {
    try {
      const response = await client.get('/api/health')
      return response.data
    } catch (error) {
      console.error('Health check failed:', error)
      return { status: 'error' }
    }
  },

  // Session management
  startSession: async (topic?: string) => {
    const response = await client.post('/api/session/start', { topic: topic || null })
    return response.data
  },

  pollTranscription: async () => {
    const response = await client.get('/api/transcription/poll')
    return response.data
  },

  stopSession: async () => {
    const response = await client.post('/api/session/stop')
    return response.data
  },

  saveSession: async (transcript: string, chat: any[], name?: string) => {
    const response = await client.post('/api/session/save', { transcript, chat, name })
    return response.data
  },

  // History
  getSessions: async () => {
    const response = await client.get('/api/sessions')
    return response.data
  },

  getSession: async (id: string) => {
    const response = await client.get(`/api/sessions/${id}`)
    return response.data
  },

  deleteSession: async (id: string) => {
    const response = await client.delete(`/api/sessions/${id}`)
    return response.data
  },

  // Q&A
  askQuestion: async (question: string, thinkMode: boolean = false) => {
    const response = await client.post('/api/qa/ask', { question, think_mode: thinkMode })
    return response.data
  },

  // Analysis
  summarizeTranscript: async (sessionId: string) => {
    const response = await client.post('/api/analyze/summarize', { sessionId })
    return response.data
  },

  extractTerminologies: async (sessionId: string) => {
    const response = await client.post('/api/analyze/terminologies', { sessionId })
    return response.data
  },

  generateQA: async (sessionId: string) => {
    const response = await client.post('/api/analyze/qa', { sessionId })
    return response.data
  },

  // Authentication
  login: async (username_or_email: string, password: string) => {
    const response = await client.post('/api/auth/login', { username_or_email, password })
    return response.data
  },

  signup: async (data: { name: string; username: string; email: string; password: string }) => {
    const response = await client.post('/api/auth/signup', data)
    return response.data
  },
}
