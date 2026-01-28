import { useNavigate } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import MicIcon from '@/components/MicIcon'
import QuestionIcon from '@/components/QuestionIcon'
import NavigationLoader from '@/components/NavigationLoader'

export default function Dashboard() {
  const navigate = useNavigate()
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [isNavigating, setIsNavigating] = useState(false)

  // Track mouse position
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Navigation handler with loader
  const handleNavigation = (path: string) => {
    setIsNavigating(true)
    setTimeout(() => {
      navigate(path)
    }, 800) // Show loader for 800ms
  }

  const features = [
    {
      icon: '🎯',
      title: 'One-stop solution',
      description: 'Complete lecture transcription and analysis in one platform',
    },
    {
      icon: '📊',
      title: 'Detailed Analytics',
      description: 'Track your learning with comprehensive session insights',
    },
    {
      icon: '🧩',
      title: 'Integrated Q&A',
      description: 'AI-powered chatbot for instant lecture-based answers',
    },
    {
      icon: '📚',
      title: 'Organized Sessions',
      description: 'All transcripts organized with smart session management',
    },
    {
      icon: '🎓',
      title: 'Best-in class',
      description: 'Industry-leading Whisper AI transcription accuracy',
    },
    {
      icon: '🔄',
      title: 'Real-time Processing',
      description: 'Live audio transcription with instant text updates',
    },
    {
      icon: '📝',
      title: 'Smart Summaries',
      description: 'Auto-generate summaries and extract key terminologies',
    },
    {
      icon: '💬',
      title: 'Context-Aware Chat',
      description: 'Ollama-powered AI understands your lecture content',
    },
  ]

  const categories = [
    { name: 'Start Recording', icon: '🎤', useMicIcon: true },
    { name: 'View History', icon: '📜' },
    { name: 'Session Analysis', icon: '📊' },
    { name: 'AI Chat Assistant', icon: '💬' },
  ]

  return (
    <>
      <AnimatePresence>
        {isNavigating && <NavigationLoader />}
      </AnimatePresence>

      <div style={{ minHeight: '100vh', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
        {/* Animated Background Elements */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
          {/* Cursor Following Glow */}
          <motion.div
            animate={{
              x: mousePosition.x - 200,
              y: mousePosition.y - 200,
            }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 200,
              mass: 0.5,
            }}
            style={{
              position: 'absolute',
              width: '400px',
              height: '400px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0, 102, 255, 0.15) 0%, rgba(0, 191, 255, 0.08) 30%, transparent 70%)',
              filter: 'blur(60px)',
              pointerEvents: 'none',
            }}
          />

          {/* Secondary Cursor Glow (delayed) */}
          <motion.div
            animate={{
              x: mousePosition.x - 150,
              y: mousePosition.y - 150,
            }}
            transition={{
              type: 'spring',
              damping: 20,
              stiffness: 100,
              mass: 0.8,
            }}
            style={{
              position: 'absolute',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 40%, transparent 70%)',
              filter: 'blur(50px)',
              pointerEvents: 'none',
            }}
          />

          {/* Cursor Trail Effect */}
          <motion.div
            animate={{
              x: mousePosition.x - 100,
              y: mousePosition.y - 100,
            }}
            transition={{
              type: 'spring',
              damping: 15,
              stiffness: 80,
              mass: 1,
            }}
            style={{
              position: 'absolute',
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 60%)',
              filter: 'blur(40px)',
              pointerEvents: 'none',
            }}
          />

          {/* Floating Orbs */}
          <motion.div
            animate={{
              x: [0, 100, 0],
              y: [0, -100, 0],
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              top: '10%',
              left: '10%',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0, 102, 255, 0.15) 0%, transparent 70%)',
              filter: 'blur(40px)',
            }}
          />

          <motion.div
            animate={{
              x: [0, -150, 0],
              y: [0, 100, 0],
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 25,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2,
            }}
            style={{
              position: 'absolute',
              top: '50%',
              right: '10%',
              width: '400px',
              height: '400px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(239, 68, 68, 0.12) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }}
          />

          <motion.div
            animate={{
              x: [0, 80, 0],
              y: [0, -80, 0],
              scale: [1, 1.1, 1],
              opacity: [0.25, 0.45, 0.25],
            }}
            transition={{
              duration: 18,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 5,
            }}
            style={{
              position: 'absolute',
              bottom: '15%',
              left: '20%',
              width: '350px',
              height: '350px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%)',
              filter: 'blur(45px)',
            }}
          />

          {/* Animated Grid Lines */}
          <motion.div
            animate={{
              opacity: [0.03, 0.08, 0.03],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
            `,
              backgroundSize: '50px 50px',
            }}
          />

          {/* Floating Particles */}
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              animate={{
                y: [-20, -1000],
                opacity: [0, 0.5, 0],
              }}
              transition={{
                duration: 15 + i * 2,
                repeat: Infinity,
                ease: 'linear',
                delay: i * 1.5,
              }}
              style={{
                position: 'absolute',
                left: `${5 + i * 6}%`,
                bottom: '-20px',
                width: '2px',
                height: '2px',
                borderRadius: '50%',
                background: i % 3 === 0 ? '#0066ff' : i % 3 === 1 ? '#ef4444' : '#10b981',
                boxShadow: `0 0 10px ${i % 3 === 0 ? '#0066ff' : i % 3 === 1 ? '#ef4444' : '#10b981'}`,
              }}
            />
          ))}

          {/* Scanning Line Effect */}
          <motion.div
            animate={{
              y: ['-100%', '200%'],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent, rgba(0, 102, 255, 0.5), transparent)',
              boxShadow: '0 0 20px rgba(0, 102, 255, 0.5)',
            }}
          />
        </div>

        {/* Content with higher z-index */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Info Banner */}
          <div style={{
            background: 'linear-gradient(90deg, #0066ff 0%, #00bfff 100%)',
            padding: '10px 60px',
            textAlign: 'center',
            fontSize: '14px',
            color: '#ffffff',
          }}>
            <span style={{ fontWeight: '500' }}>🚀 Upcoming Features: Flashcard Generation & Mind Map Visualization</span>
            <span style={{ marginLeft: '12px', color: '#d1fae5', fontWeight: '600' }}>Coming Soon!</span>
          </div>

          {/* Header */}
          <header style={{
            padding: '20px 60px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '80px', height: '80px', objectFit: 'contain' }} />
              <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>
                Student AI <span style={{ color: '#ef4444' }}>Assistant</span>
              </h1>
            </div>
            <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
              <a href="#home" style={{ color: '#ffffff', textDecoration: 'none', fontSize: '15px', fontWeight: '500' }}>Home</a>
              <a href="#features" style={{ color: '#ffffff', textDecoration: 'none', fontSize: '15px', fontWeight: '500' }}>Features</a>
              <a href="#how-it-works" style={{ color: '#ffffff', textDecoration: 'none', fontSize: '15px', fontWeight: '500' }}>How It Works</a>
              <a href="#about" style={{ color: '#ffffff', textDecoration: 'none', fontSize: '15px', fontWeight: '500' }}>About</a>
              <button
                onClick={() => handleNavigation('/history')}
                style={{
                  background: 'transparent',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                }}
              >
                History
              </button>
              <motion.button
                onClick={() => handleNavigation('/session')}
                whileHover={{
                  scale: 1.1,
                  boxShadow: '0 10px 30px rgba(0, 102, 255, 0.6), 0 0 25px rgba(239, 68, 68, 0.4)',
                  background: 'linear-gradient(135deg, #ff0066 0%, #0066ff 50%, #00ff88 100%)',
                }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  boxShadow: [
                    '0 4px 15px rgba(0, 102, 255, 0.3)',
                    '0 4px 15px rgba(239, 68, 68, 0.3)',
                    '0 4px 15px rgba(16, 185, 129, 0.3)',
                    '0 4px 15px rgba(0, 102, 255, 0.3)',
                  ],
                }}
                transition={{
                  boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                }}
                style={{
                  background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 50%, #10b981 100%)',
                  color: '#ffffff',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '10px 24px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
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
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    pointerEvents: 'none',
                  }}
                />
                <span style={{ position: 'relative', zIndex: 1 }}>Start Recording 🎤</span>
              </motion.button>
            </div>
          </header>

          {/* Hero Section */}
          <section style={{ padding: '80px 60px', textAlign: 'center' }}>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              style={{
                fontSize: '68px',
                fontWeight: 'bold',
                marginBottom: '24px',
                lineHeight: '1.1',
                letterSpacing: '-1.5px',
              }}
            >
              <span style={{ color: '#ffffff' }}>Learn</span>
              <span style={{ color: '#ef4444' }}>.</span>
              <span style={{ color: '#ffffff' }}> Transcribe</span>
              <span style={{ color: '#ef4444' }}>.</span>
              <span style={{ color: '#ffffff' }}> Succeed</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              style={{
                fontSize: '18px',
                color: '#9ca3af',
                marginBottom: '50px',
                maxWidth: '700px',
                margin: '0 auto 50px',
                lineHeight: '1.6',
              }}
            >
              Transform your lectures into searchable transcripts with AI-powered transcription,
              get instant answers, and never miss important content again.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '60px' }}
            >
              <motion.button
                onClick={() => handleNavigation('/session')}
                whileHover={{
                  scale: 1.1,
                  boxShadow: '0 15px 40px rgba(0, 102, 255, 0.6), 0 0 30px rgba(239, 68, 68, 0.4)',
                  background: 'linear-gradient(135deg, #ff0066 0%, #0066ff 50%, #00ff88 100%)',
                }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  boxShadow: [
                    '0 5px 20px rgba(0, 102, 255, 0.3)',
                    '0 5px 20px rgba(239, 68, 68, 0.3)',
                    '0 5px 20px rgba(16, 185, 129, 0.3)',
                    '0 5px 20px rgba(0, 102, 255, 0.3)',
                  ],
                }}
                transition={{
                  boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                }}
                style={{
                  background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 50%, #10b981 100%)',
                  color: '#ffffff',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative',
                  overflow: 'hidden',
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
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    pointerEvents: 'none',
                  }}
                />
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>Start Recording 🎤</span>
              </motion.button>
              <motion.button
                onClick={() => handleNavigation('/history')}
                whileHover={{
                  scale: 1.1,
                  boxShadow: '0 15px 40px rgba(168, 85, 247, 0.6), 0 0 30px rgba(236, 72, 153, 0.4)',
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)',
                }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  boxShadow: [
                    '0 5px 20px rgba(168, 85, 247, 0.3)',
                    '0 5px 20px rgba(236, 72, 153, 0.3)',
                    '0 5px 20px rgba(249, 115, 22, 0.3)',
                    '0 5px 20px rgba(168, 85, 247, 0.3)',
                  ],
                }}
                transition={{
                  boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                }}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)',
                  color: '#ffffff',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative',
                  overflow: 'hidden',
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
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    pointerEvents: 'none',
                  }}
                />
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>View History 📜</span>
              </motion.button>
            </motion.div>
          </section>

          {/* Promo Banner */}
          <section style={{ padding: '0 60px 60px' }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              transition={{ delay: 0.7, duration: 0.3 }}
              style={{
                background: 'linear-gradient(135deg, #2a2a2a 0%, #333333 100%)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '16px',
                padding: '50px',
                maxWidth: '1200px',
                margin: '0 auto',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '40px',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{
                  display: 'inline-block',
                  background: '#ef4444',
                  color: '#ffffff',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '700',
                  marginBottom: '20px',
                }}>
                  New!
                </div>
                <h2 style={{ fontSize: '36px', fontWeight: 'bold', color: '#ffffff', marginBottom: '16px' }}>
                  <span style={{ color: '#ef4444' }}>AI Transcription 2.0</span> is finally LIVE
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                  {[
                    'One-stop solution for lecture transcription',
                    'Best-in class AI-powered accuracy',
                    'Detailed Analytics of learning progress',
                    'Smooth Live/Recorded audio processing',
                    'Integrated Q&A chatbot environment',
                    'Context-aware responses for better understanding',
                    'Organized & Curated session management',
                    'Whisper AI & Ollama - cutting-edge technology',
                  ].slice(0, 6).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <CheckCircle size={18} style={{ color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: '#d1d5db', lineHeight: '1.5' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                style={{
                  background: '#2a2a2a',
                  borderRadius: '12px',
                  padding: '30px',
                  textAlign: 'center',
                }}
              >
                <motion.div
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.6 }}
                  style={{
                    width: '200px',
                    height: '200px',
                    margin: '0 auto 20px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '80px',
                  }}
                >
                  🎓
                </motion.div>
                <h3 style={{ fontSize: '22px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
                  AI-Powered Lecture
                </h3>
                <p style={{ fontSize: '16px', color: '#ef4444', marginBottom: '20px', fontWeight: '600' }}>
                  Transcription & Analysis
                </p>
                <motion.button
                  onClick={() => handleNavigation('/session')}
                  whileHover={{ scale: 1.05, boxShadow: '0 10px 30px rgba(239, 68, 68, 0.5)' }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    padding: '12px 32px',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Start Recording Now
                </motion.button>
              </motion.div>
            </motion.div>
          </section>

          {/* Success Section */}
          <section style={{ padding: '80px 60px', textAlign: 'center' }}>
            <h2 style={{ fontSize: '42px', fontWeight: 'bold', color: '#ffffff', marginBottom: '16px', letterSpacing: '-0.8px' }}>
              Transform Your Learning
            </h2>
            <h2 style={{ fontSize: '42px', fontWeight: 'bold', color: '#ffffff', marginBottom: '24px', letterSpacing: '-0.8px' }}>
              Experience with <span style={{ color: '#ef4444' }}>AI Student Assistant</span>
            </h2>
            <p style={{ fontSize: '17px', color: '#9ca3af', marginBottom: '60px', maxWidth: '700px', margin: '0 auto 60px' }}>
              Elevate your learning with AI-powered transcription, intelligent Q&A, and unlock the
              full potential of every lecture.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '24px',
              maxWidth: '1200px',
              margin: '0 auto 60px',
            }}>
              {features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  whileHover={{
                    y: -8,
                    scale: 1.02,
                    boxShadow: '0 20px 40px rgba(239, 68, 68, 0.2)',
                    borderColor: 'rgba(239, 68, 68, 0.5)'
                  }}
                  transition={{ delay: idx * 0.05, duration: 0.3 }}
                  viewport={{ once: true }}
                  style={{
                    background: '#2a2a2a',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '28px 20px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <CheckCircle size={20} style={{ color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <motion.div
                        whileHover={{ scale: 1.2, rotate: 10 }}
                        style={{ fontSize: '28px', marginBottom: '12px' }}
                      >
                        {feature.icon}
                      </motion.div>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#ffffff', marginBottom: '8px' }}>
                        {feature.title}
                      </h3>
                      <p style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.5' }}>
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <motion.button
                onClick={() => handleNavigation('/session')}
                whileHover={{
                  scale: 1.1,
                  boxShadow: '0 15px 40px rgba(0, 102, 255, 0.6), 0 0 30px rgba(239, 68, 68, 0.4)',
                  background: 'linear-gradient(135deg, #ff0066 0%, #0066ff 50%, #00ff88 100%)',
                }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  boxShadow: [
                    '0 5px 20px rgba(0, 102, 255, 0.3)',
                    '0 5px 20px rgba(239, 68, 68, 0.3)',
                    '0 5px 20px rgba(16, 185, 129, 0.3)',
                    '0 5px 20px rgba(0, 102, 255, 0.3)',
                  ],
                }}
                transition={{
                  boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                }}
                style={{
                  background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 50%, #10b981 100%)',
                  color: '#ffffff',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
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
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    pointerEvents: 'none',
                  }}
                />
                <span style={{ position: 'relative', zIndex: 1 }}>Start Recording 🎤</span>
              </motion.button>
              <motion.button
                onClick={() => handleNavigation('/history')}
                whileHover={{
                  scale: 1.1,
                  boxShadow: '0 15px 40px rgba(168, 85, 247, 0.6), 0 0 30px rgba(236, 72, 153, 0.4)',
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #f97316 100%)',
                }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  boxShadow: [
                    '0 5px 20px rgba(168, 85, 247, 0.3)',
                    '0 5px 20px rgba(236, 72, 153, 0.3)',
                    '0 5px 20px rgba(249, 115, 22, 0.3)',
                    '0 5px 20px rgba(168, 85, 247, 0.3)',
                  ],
                }}
                transition={{
                  boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                }}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #ec4899 100%)',
                  color: '#ffffff',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '14px 32px',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  position: 'relative',
                  overflow: 'hidden',
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
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    pointerEvents: 'none',
                  }}
                />
                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>View Sessions 📜</span>
              </motion.button>
            </div>
          </section>

          {/* Categories Section */}
          <section style={{ padding: '80px 60px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '24px',
              maxWidth: '1200px',
              margin: '0 auto',
            }}>
              {categories.map((category, idx) => (
                <motion.button
                  key={idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  whileHover={{
                    y: -10,
                    scale: 1.05,
                    borderColor: '#ef4444',
                    boxShadow: '0 20px 40px rgba(239, 68, 68, 0.3)'
                  }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ delay: idx * 0.1, duration: 0.3 }}
                  viewport={{ once: true }}
                  onClick={() => handleNavigation('/session')}
                  style={{
                    background: '#2a2a2a',
                    border: '2px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '12px',
                    padding: '32px 24px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <motion.div
                    whileHover={{ scale: 1.2, rotate: 10 }}
                    style={{ fontSize: '48px', marginBottom: '16px' }}
                  >
                    {category.useMicIcon ? (
                      <MicIcon size={60} color="#ffffff" showWaves={true} />
                    ) : (
                      category.icon
                    )}
                  </motion.div>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff' }}>
                    {category.name}
                  </h3>
                </motion.button>
              ))}
            </div>
          </section>

          {/* How It Works Section */}
          <section id="how-it-works" style={{ padding: '80px 60px', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
            {/* Animated Background for How It Works */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
              {/* Cursor Following Glow in this section */}
              <motion.div
                animate={{
                  x: mousePosition.x - 250,
                  y: mousePosition.y - 250,
                }}
                transition={{
                  type: 'spring',
                  damping: 25,
                  stiffness: 150,
                  mass: 0.6,
                }}
                style={{
                  position: 'absolute',
                  width: '500px',
                  height: '500px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(0, 102, 255, 0.12) 0%, rgba(0, 191, 255, 0.06) 30%, transparent 70%)',
                  filter: 'blur(70px)',
                }}
              />

              {/* Floating Orbs specific to this section */}
              <motion.div
                animate={{
                  x: [0, 120, 0],
                  y: [0, -80, 0],
                  scale: [1, 1.15, 1],
                  opacity: [0.2, 0.4, 0.2],
                }}
                transition={{
                  duration: 22,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{
                  position: 'absolute',
                  top: '20%',
                  left: '5%',
                  width: '350px',
                  height: '350px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(239, 68, 68, 0.1) 0%, transparent 70%)',
                  filter: 'blur(50px)',
                }}
              />

              <motion.div
                animate={{
                  x: [0, -100, 0],
                  y: [0, 90, 0],
                  scale: [1, 1.2, 1],
                  opacity: [0.15, 0.35, 0.15],
                }}
                transition={{
                  duration: 26,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: 3,
                }}
                style={{
                  position: 'absolute',
                  bottom: '10%',
                  right: '8%',
                  width: '400px',
                  height: '400px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)',
                  filter: 'blur(55px)',
                }}
              />

              {/* Animated Grid */}
              <motion.div
                animate={{
                  opacity: [0.02, 0.06, 0.02],
                }}
                transition={{
                  duration: 10,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: `
                linear-gradient(rgba(0, 102, 255, 0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 102, 255, 0.05) 1px, transparent 1px)
              `,
                  backgroundSize: '60px 60px',
                }}
              />

              {/* Floating Particles */}
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    y: [-20, -800],
                    opacity: [0, 0.6, 0],
                  }}
                  transition={{
                    duration: 12 + i * 1.5,
                    repeat: Infinity,
                    ease: 'linear',
                    delay: i * 1.2,
                  }}
                  style={{
                    position: 'absolute',
                    left: `${10 + i * 8}%`,
                    bottom: '-20px',
                    width: '3px',
                    height: '3px',
                    borderRadius: '50%',
                    background: i % 2 === 0 ? '#0066ff' : '#10b981',
                    boxShadow: `0 0 15px ${i % 2 === 0 ? '#0066ff' : '#10b981'}`,
                  }}
                />
              ))}
            </div>

            <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
              <h2 style={{ fontSize: '42px', fontWeight: 'bold', color: '#ffffff', marginBottom: '16px', letterSpacing: '-0.8px' }}>
                How It Works
              </h2>
              <p style={{ fontSize: '17px', color: '#9ca3af', marginBottom: '60px', maxWidth: '700px', margin: '0 auto 60px' }}>
                Simple steps to transform your lectures into powerful learning materials
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '32px',
              }}>
                {[
                  {
                    step: '1',
                    icon: '🎤',
                    title: 'Record',
                    description: 'Start recording your lecture with a single click',
                    color: '#0066ff',
                    useMicIcon: true
                  },
                  {
                    step: '2',
                    icon: '🤖',
                    title: 'Transcribe',
                    description: 'AI automatically converts speech to text in real-time',
                    color: '#00bfff',
                    useCustomIcon: true
                  },
                  {
                    step: '3',
                    icon: '💬',
                    title: 'Ask Questions',
                    description: 'Chat with AI about the lecture content instantly',
                    color: '#10b981',
                    useQuestionIcon: true
                  },
                  {
                    step: '4',
                    icon: '📚',
                    title: 'Generate Flashcards',
                    description: 'Auto-create flashcards from key concepts for review',
                    color: '#ef4444',
                    comingSoon: true
                  },
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    whileHover={{
                      y: -10,
                      scale: 1.05,
                      boxShadow: `0 20px 40px ${item.color}40`
                    }}
                    transition={{ delay: idx * 0.1, duration: 0.3 }}
                    viewport={{ once: true }}
                    style={{
                      background: '#2a2a2a',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '16px',
                      padding: '32px 24px',
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Coming Soon Badge */}
                    {item.comingSoon && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                        color: '#000000',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        boxShadow: '0 2px 8px rgba(251, 191, 36, 0.4)'
                      }}>
                        Coming Soon
                      </div>
                    )}

                    {/* Step Number */}
                    <div style={{
                      position: 'absolute',
                      top: '-15px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: item.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#ffffff',
                      boxShadow: `0 4px 12px ${item.color}60`
                    }}>
                      {item.step}
                    </div>

                    {/* Icon */}
                    <motion.div
                      whileHover={{ scale: 1.2, rotate: 10 }}
                      style={{
                        fontSize: '56px',
                        marginBottom: '20px',
                        marginTop: '20px'
                      }}
                    >
                      {item.useMicIcon ? (
                        <MicIcon size={70} color="#ffffff" showWaves={true} />
                      ) : item.useQuestionIcon ? (
                        <QuestionIcon size={70} color="#ffffff" />
                      ) : item.useCustomIcon ? (
                        <div style={{
                          width: '80px',
                          height: '80px',
                          margin: '0 auto',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {/* Robot Head */}
                          <div style={{
                            width: '60px',
                            height: '50px',
                            background: '#ffffff',
                            borderRadius: '12px',
                            border: '4px solid #000000',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px'
                          }}>
                            {/* Eyes */}
                            <div style={{
                              width: '10px',
                              height: '10px',
                              background: '#000000',
                              borderRadius: '50%'
                            }} />
                            <div style={{
                              width: '10px',
                              height: '10px',
                              background: '#000000',
                              borderRadius: '50%'
                            }} />

                            {/* Antenna */}
                            <div style={{
                              position: 'absolute',
                              top: '-15px',
                              right: '10px',
                              width: '3px',
                              height: '12px',
                              background: '#000000'
                            }} />
                            <div style={{
                              position: 'absolute',
                              top: '-20px',
                              right: '6px',
                              width: '10px',
                              height: '10px',
                              background: '#000000',
                              borderRadius: '50%'
                            }} />

                            {/* Headphones */}
                            <div style={{
                              position: 'absolute',
                              left: '-8px',
                              top: '10px',
                              width: '8px',
                              height: '20px',
                              background: '#ef4444',
                              borderRadius: '4px 0 0 4px',
                              border: '3px solid #000000',
                              borderRight: 'none'
                            }} />
                            <div style={{
                              position: 'absolute',
                              right: '-8px',
                              top: '10px',
                              width: '8px',
                              height: '20px',
                              background: '#ef4444',
                              borderRadius: '0 4px 4px 0',
                              border: '3px solid #000000',
                              borderLeft: 'none'
                            }} />
                          </div>

                          {/* Smile */}
                          <div style={{
                            position: 'absolute',
                            bottom: '25px',
                            width: '20px',
                            height: '8px',
                            borderBottom: '3px solid #000000',
                            borderRadius: '0 0 10px 10px'
                          }} />
                        </div>
                      ) : (
                        item.icon
                      )}
                    </motion.div>

                    {/* Title */}
                    <h3 style={{
                      fontSize: '20px',
                      fontWeight: '600',
                      color: '#ffffff',
                      marginBottom: '12px'
                    }}>
                      {item.title}
                    </h3>

                    {/* Description */}
                    <p style={{
                      fontSize: '14px',
                      color: '#9ca3af',
                      lineHeight: '1.6'
                    }}>
                      {item.description}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* CTA Button */}
              <motion.button
                onClick={() => handleNavigation('/session')}
                whileHover={{
                  scale: 1.15,
                  boxShadow: '0 20px 50px rgba(0, 102, 255, 0.7), 0 0 40px rgba(239, 68, 68, 0.5)',
                  background: 'linear-gradient(135deg, #ff0066 0%, #0066ff 50%, #00ff88 100%)',
                }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  boxShadow: [
                    '0 8px 25px rgba(0, 102, 255, 0.4)',
                    '0 8px 25px rgba(239, 68, 68, 0.4)',
                    '0 8px 25px rgba(16, 185, 129, 0.4)',
                    '0 8px 25px rgba(0, 102, 255, 0.4)',
                  ],
                }}
                transition={{
                  boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                }}
                style={{
                  background: 'linear-gradient(135deg, #0066ff 0%, #00bfff 50%, #10b981 100%)',
                  color: '#ffffff',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '18px 50px',
                  borderRadius: '16px',
                  fontSize: '20px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  marginTop: '60px',
                  position: 'relative',
                  overflow: 'hidden',
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
                <span style={{ position: 'relative', zIndex: 1 }}>Get Started Now 🚀</span>
              </motion.button>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
