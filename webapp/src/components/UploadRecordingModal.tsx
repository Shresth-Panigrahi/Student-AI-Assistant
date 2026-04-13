import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, FileAudio, FileVideo, Check, AlertCircle } from 'lucide-react'
import { api } from '@/services/api'
import { useNavigate } from 'react-router-dom'

interface UploadRecordingModalProps {
  isOpen: boolean
  onClose: () => void
}

const ACCEPTED_EXTENSIONS = [
  '.mp3', '.wav', '.m4a', '.mp4', '.webm', '.mkv', '.mov', '.avi', '.flac', '.ogg'
]

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg']

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

function getFileExtension(filename: string): string {
  return '.' + filename.split('.').pop()?.toLowerCase()
}

function isAudioFile(ext: string): boolean {
  return AUDIO_EXTENSIONS.includes(ext)
}

export default function UploadRecordingModal({ isOpen, onClose }: UploadRecordingModalProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')

  const resetState = () => {
    setFile(null)
    setTitle('')
    setTopic('')
    setIsDragOver(false)
    setUploading(false)
    setUploadProgress(0)
    setError('')
  }

  const handleClose = () => {
    if (uploading) return // prevent closing during upload
    resetState()
    onClose()
  }

  const validateFile = (f: File): string | null => {
    const ext = getFileExtension(f.name)
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type: ${ext}. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`
    }
    if (f.size > MAX_FILE_SIZE) {
      return `File too large (${formatFileSize(f.size)}). Maximum: 500 MB.`
    }
    return null
  }

  const handleFileSelect = (f: File) => {
    const validationError = validateFile(f)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleUpload = async () => {
    if (!file || !title.trim()) return

    setUploading(true)
    setUploadProgress(0)
    setError('')

    try {
      const formData = new FormData()
      formData.append('recording', file)
      formData.append('title', title.trim())
      if (topic.trim()) formData.append('topic', topic.trim())

      const result = await api.uploadRecording(formData, (progressEvent: any) => {
        if (progressEvent.total) {
          const pct = Math.round((progressEvent.loaded / progressEvent.total) * 100)
          setUploadProgress(pct)
        }
      })

      if (result.success && result.session_id) {
        // Upload complete — navigate to processing page
        resetState()
        onClose()
        navigate(`/processing/${result.session_id}`)
      } else {
        setError(result.message || 'Upload failed')
        setUploading(false)
      }
    } catch (err: any) {
      console.error('Upload error:', err)
      const message = err.response?.data?.detail || err.message || 'Upload failed'
      setError(message)
      setUploading(false)
    }
  }

  const canUpload = file && title.trim() && !uploading
  const fileExt = file ? getFileExtension(file.name) : ''

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-lg bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl shadow-royal-purple/10 overflow-hidden z-10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-royal-purple/10 rounded-xl">
                  <Upload className="w-5 h-5 text-royal-purple" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Upload Recording</h2>
                  <p className="text-xs text-secondary-gray">Process a saved lecture file</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={uploading}
                className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Section 1 — File Drop Zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                  transition-all duration-300
                  ${isDragOver
                    ? 'border-royal-purple bg-royal-purple/10 scale-[1.02]'
                    : file
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                  }
                  ${uploading ? 'pointer-events-none opacity-60' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(',')}
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                {isDragOver ? (
                  <div className="py-4">
                    <Upload className="w-10 h-10 text-royal-purple mx-auto mb-3 animate-bounce" />
                    <p className="text-royal-purple font-semibold text-lg">Drop to upload</p>
                  </div>
                ) : file ? (
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-500/10 rounded-xl flex-shrink-0">
                      {isAudioFile(fileExt) ? (
                        <FileAudio className="w-8 h-8 text-emerald-400" />
                      ) : (
                        <FileVideo className="w-8 h-8 text-emerald-400" />
                      )}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-secondary-gray">{formatFileSize(file.size)}</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-400/10 rounded border border-emerald-400/20">
                          {fileExt.replace('.', '')}
                        </span>
                      </div>
                    </div>
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  </div>
                ) : (
                  <div className="py-2">
                    <Upload className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                    <p className="text-white font-medium mb-1">
                      Drag & drop your recording here
                    </p>
                    <p className="text-xs text-secondary-gray mb-3">
                      or click to browse
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {['MP3', 'WAV', 'M4A', 'MP4', 'WebM', 'MKV', 'MOV'].map((fmt) => (
                        <span
                          key={fmt}
                          className="px-2 py-0.5 text-[10px] font-medium text-gray-500 bg-white/5 rounded border border-white/5"
                        >
                          {fmt}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2">Maximum 500 MB</p>
                  </div>
                )}
              </div>

              {/* Section 2 — Metadata Fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-secondary-gray mb-1.5">
                    Lecture Title <span className="text-rose">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Linear Algebra — Week 4"
                    disabled={uploading}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-royal-purple/50 focus:ring-1 focus:ring-royal-purple/50 transition-all disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-secondary-gray mb-1.5">
                    Topic / Subject <span className="text-gray-600">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Eigenvalues and Eigenvectors"
                    disabled={uploading}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-royal-purple/50 focus:ring-1 focus:ring-royal-purple/50 transition-all disabled:opacity-50"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">
                    Helps prime the AI for domain-specific terminology
                  </p>
                </div>
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-2 text-sm text-rose bg-rose/10 border border-rose/20 rounded-xl px-4 py-3"
                  >
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Upload Progress */}
              <AnimatePresence>
                {uploading && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="flex items-center justify-between text-xs text-secondary-gray mb-2">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-royal-purple to-deep-magenta rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Section 3 — Upload Button */}
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className={`
                  w-full py-3 rounded-xl font-bold text-sm transition-all duration-300
                  ${canUpload
                    ? 'bg-gradient-to-r from-royal-purple to-deep-magenta text-white shadow-lg shadow-royal-purple/20 hover:shadow-royal-purple/40 hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-white/5 text-gray-600 cursor-not-allowed'
                  }
                `}
              >
                {uploading
                  ? 'Uploading...'
                  : file
                    ? `Upload & Process (${formatFileSize(file.size)})`
                    : 'Select a file to upload'
                }
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
