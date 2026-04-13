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
  startSession: async (topic?: string) => {
    const response = await axios.post(`${API_BASE}/session/start`, { topic: topic || null })
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

  saveSession: async (transcript: string, chat: any[], name?: string) => {
    const response = await axios.post(`${API_BASE}/session/save`, { transcript, chat, name })
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

  deleteSession: async (id: string) => {
    const response = await axios.delete(`${API_BASE}/sessions/${id}`)
    return response.data
  },

  // Q&A
  askQuestion: async (question: string, thinkMode: boolean = false) => {
    const response = await axios.post(`${API_BASE}/qa/ask`, { question, think_mode: thinkMode })
    return response.data
  },

  // Analysis (existing)
  summarizeTranscript: async (sessionId: string) => {
    const response = await axios.post(`${API_BASE}/analyze/summarize`, { sessionId })
    return response.data
  },

  extractTerminologies: async (sessionId: string) => {
    const response = await axios.post(`${API_BASE}/analyze/terminologies`, { sessionId })
    return response.data
  },

  generateQA: async (sessionId: string) => {
    const response = await axios.post(`${API_BASE}/analyze/qa`, { sessionId })
    return response.data
  },

  // Chat Studio Features
  generateLectureReport: async (session_id: string, context_files: any[] = [], force_regenerate: boolean = false) => {
    const response = await axios.post(`${API_BASE}/chat/lecture-report`, { session_id, context_files, force_regenerate })
    return response.data
  },

  generateFlashcards: async (session_id: string, context_files: any[] = [], count: number = 15, force_regenerate: boolean = false) => {
    const response = await axios.post(`${API_BASE}/chat/flashcards`, { session_id, context_files, count, force_regenerate })
    return response.data
  },

  generateQAAnalysis: async (session_id: string, context_files: any[] = [], count: number = 10, force_regenerate: boolean = false) => {
    const response = await axios.post(`${API_BASE}/chat/qa-analysis`, { session_id, context_files, count, force_regenerate })
    return response.data
  },

  generateAudioOverview: async (session_id: string, context_files: any[] = []) => {
    const response = await axios.post(`${API_BASE}/chat/audio-overview`, { session_id, context_files })
    return response.data
  },

  checkAudioOverview: async (session_id: string) => {
    const response = await axios.get(`${API_BASE}/chat/audio-overview/${session_id}`)
    return response.data
  },

  // Authentication
  login: async (username_or_email: string, password: string) => {
    const response = await axios.post(`${API_BASE}/auth/login`, { username_or_email, password })
    return response.data
  },

  signup: async (data: { name: string; username: string; email: string; password: string }) => {
    const response = await axios.post(`${API_BASE}/auth/signup`, data)
    return response.data
  },

  // RAG Status
  getRagStatus: async (sessionId: string) => {
    const response = await axios.get(`${API_BASE}/rag/status/${sessionId}`)
    return response.data
  },

  // Concept Graph
  getConceptGraph: async (sessionId: string) => {
    const response = await axios.get(`${API_BASE}/chat/concept-graph/${sessionId}`)
    return response.data
  },

  generateConceptGraph: async (sessionId: string, contextFiles: any[] = [], forceRegenerate = false) => {
    const response = await axios.post(`${API_BASE}/chat/concept-graph`, {
      session_id: sessionId,
      context_files: contextFiles,
      force_regenerate: forceRegenerate
    })
    return response.data
  },

  // Session-aware Q&A (uses RAG when session_id is provided)
  askSessionQuestion: async (question: string, sessionId: string, thinkMode: boolean = false) => {
    const response = await axios.post(`${API_BASE}/qa/ask`, {
      question,
      session_id: sessionId,
      think_mode: thinkMode
    })
    return response.data
  },

  // Recording Enhancement
  enhanceWithRecording: async (sessionId: string, formData: FormData, onUploadProgress?: (e: any) => void) => {
    const response = await axios.post(
      `${API_BASE}/session/${sessionId}/enhance-recording`,
      formData,
      {
        onUploadProgress,
        timeout: 600000  // 10 minute timeout for long recordings
      }
    )
    return response.data
  },

  getEnhancementStatus: async (sessionId: string) => {
    const response = await axios.get(`${API_BASE}/session/${sessionId}/enhancement-status`)
    return response.data
  },

  getOriginalTranscript: async (sessionId: string) => {
    const response = await axios.get(`${API_BASE}/session/${sessionId}/original-transcript`)
    return response.data
  },

  // Upload Recording
  uploadRecording: async (formData: FormData, onUploadProgress?: (e: any) => void) => {
    const response = await axios.post(
      `${API_BASE}/session/upload-recording`,
      formData,
      {
        onUploadProgress,
        timeout: 120000, // 2 min timeout for upload itself
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    )
    return response.data
  },

  getProcessingStatus: async (sessionId: string) => {
    const response = await axios.get(`${API_BASE}/session/${sessionId}/processing-status`)
    return response.data
  },
}
