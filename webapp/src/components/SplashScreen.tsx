import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Simulate loading progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(onComplete, 500)
          return 100
        }
        return prev + 2
      })
    }, 30)

    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      {/* Glow Effect */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(239, 68, 68, 0.1) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Animated Icon */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ marginBottom: '40px', position: 'relative' }}
      >
        <div style={{ position: 'relative', width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Microphone Icon */}
          <motion.div
            animate={{ 
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: '60px',
              height: '80px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderRadius: '30px 30px 0 0',
              position: 'relative',
            }}
          >
            <div style={{
              position: 'absolute',
              bottom: '-15px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '70px',
              height: '40px',
              border: '4px solid #ef4444',
              borderTop: 'none',
              borderRadius: '0 0 35px 35px',
            }} />
            <div style={{
              position: 'absolute',
              bottom: '-30px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '50px',
              height: '4px',
              background: '#ef4444',
            }} />
          </motion.div>
          
          {/* Pulse rings */}
          <motion.div
            animate={{ 
              scale: [1, 1.5],
              opacity: [0.5, 0]
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              width: '100px',
              height: '100px',
              border: '2px solid #ef4444',
              borderRadius: '50%',
            }}
          />
        </div>
      </motion.div>

      {/* App Name */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        style={{
          fontSize: '48px',
          fontWeight: 'bold',
          marginBottom: '8px',
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: '-1px',
        }}
      >
        <span style={{ color: '#ffffff' }}>AI Student</span>
        <span style={{ color: '#ef4444' }}>.</span>
        <span style={{ color: '#ef4444' }}>Assistant</span>
      </motion.h1>

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        style={{
          fontSize: '16px',
          color: '#9ca3af',
          marginBottom: '80px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        Intelligent Lecture Transcription
      </motion.p>

      {/* Loading Dots */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.4, 1, 0.4],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ef4444',
            }}
          />
        ))}
      </div>

      {/* Loading Text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        style={{
          fontSize: '14px',
          color: '#9ca3af',
          marginBottom: '24px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        Loading your AI assistant...
      </motion.p>

      {/* Progress Bar */}
      <div
        style={{
          width: '300px',
          height: '4px',
          background: 'rgba(239, 68, 68, 0.2)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <motion.div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
            borderRadius: '2px',
          }}
          initial={{ width: '0%' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  )
}
