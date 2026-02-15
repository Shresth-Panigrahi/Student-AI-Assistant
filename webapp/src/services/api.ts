import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:8000/api'

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

  // Analysis
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

  // Study Tools
  generateFlashcards: async (sessionId: string, numCards: number = 10, cardTypes?: string[]) => {
    const response = await axios.post(`${API_BASE}/analyze/generate-flashcards`, {
      session_id: sessionId,
      num_cards: numCards,
      card_types: cardTypes
    })
    return response.data
  },

  generateOneWordQuestions: async (sessionId: string, numQuestions: number = 10) => {
    const response = await axios.post(`${API_BASE}/analyze/generate-one-word-questions`, {
      session_id: sessionId,
      num_questions: numQuestions
    })
    return response.data
  },

  checkOneWordAnswer: async (questionSetId: string, questionId: string, userAnswer: string) => {
    const response = await axios.post(`${API_BASE}/one-word-questions/${questionSetId}/check-answer`, {
      question_id: questionId,
      user_answer: userAnswer
    })
    return response.data
  },

  generateShortAnswerQuestions: async (sessionId: string, numQuestions: number = 5) => {
    const response = await axios.post(`${API_BASE}/analyze/generate-short-answer-questions`, {
      session_id: sessionId,
      num_questions: numQuestions
    })
    return response.data
  },

  evaluateShortAnswer: async (questionId: string, userAnswer: string) => {
    const response = await axios.post(`${API_BASE}/short-answer-questions/evaluate`, {
      question_id: questionId,
      user_answer: userAnswer
    })
    return response.data
  },

  // Translation
  translateText: async (sessionId: string, text: string, targetLanguage: string) => {
    const response = await axios.post(`${API_BASE}/translate/text`, {
      session_id: sessionId,
      text,
      target_language: targetLanguage
    })
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
}
