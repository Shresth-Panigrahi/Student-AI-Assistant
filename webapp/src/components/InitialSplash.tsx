import { motion } from 'framer-motion'

interface InitialSplashProps {
  onEnter: () => void
}

export default function InitialSplash({ onEnter }: InitialSplashProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      {/* Glow Effect */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, rgba(0, 102, 255, 0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        style={{ marginBottom: '40px', position: 'relative' }}
      >
        <div style={{ 
          width: '80px', 
          height: '80px', 
          background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 100%)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '48px',
          boxShadow: '0 10px 40px rgba(0, 102, 255, 0.4)',
        }}>
          🎓
        </div>

        {/* Pulsing Ring */}
        <motion.div
          animate={{
            scale: [1, 1.3],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            inset: '-20px',
            border: '3px solid #0066ff',
            borderRadius: '20px',
          }}
        />
      </motion.div>

      {/* App Name */}
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        style={{
          fontSize: '56px',
          fontWeight: 'bold',
          marginBottom: '16px',
          letterSpacing: '-1px',
        }}
      >
        <span style={{ color: '#ffffff' }}>AI Student</span>
        <span style={{ color: '#0066ff' }}>.</span>
        <span style={{ color: '#0066ff' }}>Assistant</span>
      </motion.h1>

      {/* Tagline */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        style={{
          fontSize: '18px',
          color: '#9ca3af',
          marginBottom: '60px',
        }}
      >
        Intelligent Lecture Transcription & Analysis
      </motion.p>

      {/* Enter Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.6 }}
        onClick={onEnter}
        whileHover={{ 
          scale: 1.1,
          boxShadow: '0 15px 40px rgba(0, 102, 255, 0.6), 0 0 30px rgba(0, 191, 255, 0.4)',
        }}
        whileTap={{ scale: 0.95 }}
        style={{
          background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 100%)',
          color: '#ffffff',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          padding: '18px 50px',
          borderRadius: '16px',
          fontSize: '20px',
          fontWeight: '700',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 25px rgba(0, 102, 255, 0.4)',
        }}
      >
        <motion.div
          animate={{
            x: ['-100%', '200%'],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '50%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
            pointerEvents: 'none',
          }}
        />
        <span style={{ position: 'relative', zIndex: 1 }}>Get Started 🚀</span>
      </motion.button>

      {/* Floating Particles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          animate={{
            y: [-20, -600],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: 10 + i * 2,
            repeat: Infinity,
            ease: 'linear',
            delay: i * 1.5,
          }}
          style={{
            position: 'absolute',
            left: `${15 + i * 10}%`,
            bottom: '-20px',
            width: '3px',
            height: '3px',
            borderRadius: '50%',
            background: '#0066ff',
            boxShadow: '0 0 10px #0066ff',
          }}
        />
      ))}
    </motion.div>
  )
}
