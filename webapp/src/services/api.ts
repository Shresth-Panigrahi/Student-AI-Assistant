import axios from 'axios'

const API_BASE = 'http://localhost:8000/api'

export const api = {
  // Health check
  healthCheck: async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/health')
      return response.data
    } catch (error) {
      console.error('Health check failed:', error)
      return { status: 'error' }
    }
  },

  // Session management
  startSession: async () => {
    const response = await axios.post(`${API_BASE}/session/start`)
    return response.data
  },

  pollTranscription: async () => {
    const response = await axios.get(`${API_BASE}/transcription/poll`)
    return response.data
  },
  
  stopSession: async () => {
    const response = await axios.post(`${API_BASE}/session/stop`)
    return response.data
  },
  
  saveSession: async (transcript: string, chat: any[]) => {
    const response = await axios.post(`${API_BASE}/session/save`, { transcript, chat })
    return response.data
  },
  
  // History
  getSessions: async () => {
    const response = await axios.get(`${API_BASE}/sessions`)
    return response.data
  },
  
  getSession: async (id: string) => {
    const response = await axios.get(`${API_BASE}/sessions/${id}`)
    return response.data
  },
  
  // Q&A
  askQuestion: async (question: string) => {
    const response = await axios.post(`${API_BASE}/qa/ask`, { question })
    return response.data
  },
  
  // Analysis
  summarizeTranscript: async (sessionId: string) => {
    const response = await axios.post(`${API_BASE}/analyze/summarize`, { sessionId })
    return response.data
  },
  
  extractTerminologies: async (sessionId: string) => {
    const response = await axios.post(`${API_BASE}/analyze/terminologies`, { sessionId })
    return response.data
  },
}
