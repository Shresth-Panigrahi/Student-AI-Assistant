# 🔌 API Usage Map

> Which functionality uses which external API.

## Overview

| Functionality | Gemini | Tavily | Cloudinary | OnDemand |
|---|:---:|:---:|:---:|:---:|
| **Live Transcription** | | | Cloudinary | OnDemand |
| **Transcript Refinement** | Gemini | | | |
| **Q&A (Default Mode)** | Gemini | | | |
| **Q&A (Think Mode)** | Gemini | Tavily | | |
| **Summary Generation** | Gemini | | | |
| **Terminology Extraction** | Gemini | | | |
| **Q&A Pairs Generation** | Gemini | | | |
| **Flashcard Generation** | Gemini | | | |
| **Quiz (MCQ) Generation** | Gemini | | | |
| **One-Word Questions** | Gemini | | | |
| **Short Answer Questions** | Gemini | | | |
| **Short Answer Evaluation** | Gemini | | | |
| **Translation** | Gemini | | | |
| **Authentication** | — | — | — | — |

## Details

### 🤖 Google Gemini (`gemini-2.5-flash`)
Used for all AI-powered features — generation, analysis, and evaluation.

- **Q&A Chatbot** — Answers questions based on transcript context
- **Summary** — Generates structured lecture summaries
- **Terminologies** — Extracts and defines key terms
- **Q&A Pairs** — Generates study questions from transcripts
- **Flashcards** — Creates study decks
- **Quizzes** — Generates MCQ, one-word, and short-answer questions
- **Answer Evaluation** — Grades short-answer responses with feedback
- **Translation** — Translates text between languages
- **Transcript Refinement** — Cleans up raw transcription output

### 🔍 Tavily
Used **only** when **Think Mode** is enabled in the Q&A chatbot.

- Searches the web for additional context to supplement the transcript
- Returns source URLs displayed as citations in the UI

### ☁️ Cloudinary
Used for **audio file storage** during live transcription.

- Recorded audio chunks are uploaded to Cloudinary
- The returned URL is then sent to OnDemand for transcription

### 📝 OnDemand
Used for **speech-to-text transcription**.

- Receives audio URLs (from Cloudinary) and returns transcribed text
- Powers the real-time transcription feature

### 🔐 Authentication
Uses **no external API** — handled locally with SHA-256 hashing and MongoDB.
