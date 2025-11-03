import { motion } from 'framer-motion'

export default function NavigationLoader() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ 
        scale: 3,
        opacity: 0,
      }}
      transition={{
        exit: { duration: 0.6, ease: 'easeInOut' }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1a1a1a',
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
          background: 'radial-gradient(circle, rgba(0, 102, 255, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Animated Logo */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 2, opacity: 0 }}
        transition={{ 
          initial: { duration: 0.5, ease: 'easeOut' },
          exit: { duration: 0.6, ease: 'easeInOut' }
        }}
        style={{ position: 'relative' }}
      >
        <motion.div 
          exit={{ scale: 1.5 }}
          transition={{ exit: { duration: 0.6, ease: 'easeInOut' } }}
          style={{ 
            width: '32px', 
            height: '32px', 
            background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 100%)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px'
          }}
        >
          🎓
        </motion.div>
      </motion.div>

      {/* Pulsing Rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            scale: [1, 2.5],
            opacity: [0.6, 0],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.4,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            width: '80px',
            height: '80px',
            border: '3px solid #0066ff',
            borderRadius: '50%',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      {/* Rotating Circle */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          position: 'absolute',
          width: '120px',
          height: '120px',
          border: '3px solid transparent',
          borderTopColor: '#0066ff',
          borderRightColor: '#00bfff',
          borderRadius: '50%',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Orbiting Dots */}
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={`dot-${i}`}
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
            delay: i * 0.2,
          }}
          style={{
            position: 'absolute',
            width: '150px',
            height: '150px',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: i % 2 === 0 ? '#0066ff' : '#00bfff',
              boxShadow: `0 0 10px ${i % 2 === 0 ? '#0066ff' : '#00bfff'}`,
            }}
          />
        </motion.div>
      ))}
    </motion.div>
  )
}
