import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { api } from '@/services/api'

const STAGE_TEXT: Record<string, string> = {
  converting: 'Preparing your recording...',
  transcribing: 'Transcribing lecture audio...',
  refining: 'Refining with AI...',
  indexing: 'Building knowledge index...',
  complete: 'Done!',
}

const STAGE_ORDER = ['converting', 'transcribing', 'refining', 'indexing']

function getStageIndex(stage: string): number {
  const idx = STAGE_ORDER.indexOf(stage)
  return idx >= 0 ? idx : (stage === 'complete' ? STAGE_ORDER.length : -1)
}

export default function ProcessingSession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()

  const [status, setStatus] = useState<'processing' | 'complete' | 'failed'>('processing')
  const [stage, setStage] = useState('converting')
  const [error, setError] = useState<string | null>(null)
  const [completing, setCompleting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isFirstPoll = useRef(true)

  useEffect(() => {
    if (!sessionId) return

    const poll = async () => {
      try {
        const data = await api.getProcessingStatus(sessionId)

        if (data.status === 'complete') {
          setStatus('complete')
          setStage('complete')

          // Stop polling
          if (pollRef.current) clearInterval(pollRef.current)

          // If this is the first poll and it's already complete, skip animation
          if (isFirstPoll.current) {
            navigate(`/transcript/${sessionId}`, { replace: true })
            return
          }

          // Play completion animation then navigate
          setCompleting(true)
          setTimeout(() => {
            navigate(`/transcript/${sessionId}`, { replace: true })
          }, 2500)

        } else if (data.status === 'failed') {
          setStatus('failed')
          setStage(data.stage || 'unknown')
          setError(data.error || 'Processing failed. Please try again.')
          if (pollRef.current) clearInterval(pollRef.current)

        } else {
          setStatus('processing')
          setStage(data.stage || 'converting')
        }

        isFirstPoll.current = false
      } catch (err) {
        console.error('Polling error:', err)
      }
    }

    // Poll immediately, then every 3 seconds
    poll()
    pollRef.current = setInterval(poll, 3000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [sessionId, navigate])

  const currentStageIndex = getStageIndex(stage)

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center relative overflow-hidden selection:bg-royal-purple selection:text-white">

      {/* Atmospheric background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(109, 40, 217, 0.3) 0%, rgba(109, 40, 217, 0.05) 50%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
      </div>

      {/* Grain overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center max-w-md mx-auto px-6 text-center">

        {/* Error State */}
        {status === 'failed' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
          >
            <div className="p-4 bg-rose/10 rounded-full mb-6">
              <AlertCircle className="w-12 h-12 text-rose" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Processing Failed</h2>
            <p className="text-secondary-gray text-sm mb-6 max-w-sm leading-relaxed">
              {error}
            </p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-semibold hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
          </motion.div>
        ) : (
          <>
            {/* Waveform Animation */}
            <div className="flex items-end gap-2 h-24 mb-10">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-3 rounded-full"
                  animate={
                    completing
                      ? { height: 96, backgroundColor: '#a855f7' }
                      : {
                          height: [
                            20 + Math.random() * 20,
                            40 + Math.random() * 50,
                            20 + Math.random() * 20,
                          ],
                        }
                  }
                  transition={
                    completing
                      ? { duration: 0.4, delay: i * 0.05 }
                      : {
                          duration: 1.2 + i * 0.2,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          ease: 'easeInOut',
                          delay: i * 0.15,
                        }
                  }
                  style={{
                    background: completing
                      ? '#a855f7'
                      : `linear-gradient(to top, rgba(109, 40, 217, 0.6), rgba(168, 85, 247, 0.9))`,
                    borderRadius: 6,
                  }}
                />
              ))}
            </div>

            {/* Stage Text */}
            <div className="h-10 mb-8 relative">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stage}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className={`text-xl font-semibold ${
                    stage === 'complete' ? 'text-emerald-400' : 'text-white'
                  }`}
                >
                  {STAGE_TEXT[stage] || 'Processing...'}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Stage Dots */}
            <div className="flex items-center gap-3 mb-10">
              {STAGE_ORDER.map((s, i) => {
                const isActive = i <= currentStageIndex
                const isCurrent = i === currentStageIndex && status === 'processing'

                return (
                  <div key={s} className="relative">
                    <motion.div
                      className="w-3 h-3 rounded-full"
                      animate={{
                        backgroundColor: isActive ? '#a855f7' : '#27272a',
                        scale: isCurrent ? [1, 1.3, 1] : 1,
                      }}
                      transition={
                        isCurrent
                          ? { scale: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } }
                          : { duration: 0.4 }
                      }
                    />
                    {/* Ripple for newly activated dots */}
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0.8 }}
                        animate={{ scale: 2.5, opacity: 0 }}
                        transition={{ duration: 0.8 }}
                        className="absolute inset-0 rounded-full bg-royal-purple"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Helper Text */}
            <p className="text-xs text-gray-600 max-w-xs leading-relaxed">
              You can close this tab and come back — your transcript will be ready.
            </p>
          </>
        )}
      </div>

      {/* Completion fade-out overlay */}
      <AnimatePresence>
        {completing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.8 }}
            className="absolute inset-0 bg-[#0a0a0a] z-50"
          />
        )}
      </AnimatePresence>
    </div>
  )
}
