import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, User, UserPlus, LogIn } from 'lucide-react'
import { api } from '@/services/api'

export default function Auth() {
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)

  // Login form
  const [loginData, setLoginData] = useState({
    username_or_email: '',
    password: ''
  })

  // Signup form
  const [signupData, setSignupData] = useState({
    name: '',
    username: '',
    email: '',
    password: ''
  })

  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.login(loginData.username_or_email, loginData.password)

      if (result.success) {
        // Store user data
        localStorage.setItem('user', JSON.stringify(result.user))
        // Navigate to homepage
        navigate('/')
      } else {
        setError(result.message)
      }
    } catch (error) {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.signup(signupData)

      if (result.success) {
        // Store user data and navigate
        localStorage.setItem('user', JSON.stringify(result.user))
        // Navigate to homepage
        navigate('/')
      } else {
        setError(result.message)
      }
    } catch (error) {
      setError('Signup failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-true-black">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        {/* Logo */}
        <div className="flex flex-row items-center justify-center gap-6 mb-8">
          <div className="w-24 h-24 flex items-center justify-center">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div className="text-left">
            <h1 className="text-3xl font-bold mb-1 whitespace-nowrap">
              Student AI <span className="text-accent-blue">Assistant</span>
            </h1>
            <p className="text-gray-400 text-sm">Intelligent Lecture Transcription</p>
          </div>
        </div>

        {/* Auth Card */}
        <div className="glass-effect rounded-2xl p-8">
          {/* Toggle */}
          <div className="flex gap-2 mb-6 p-1 bg-dark-800 rounded-lg">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${isLogin ? 'bg-accent-blue text-white' : 'text-gray-400'
                }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${!isLogin ? 'bg-accent-blue text-white' : 'text-gray-400'
                }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {isLogin ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Username or Email</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={loginData.username_or_email}
                    onChange={(e) => setLoginData({ ...loginData, username_or_email: e.target.value })}
                    className="w-full bg-dark-gray border border-white/10 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-accent-blue transition-colors text-white placeholder-gray-500"
                    placeholder="Enter username or email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    className="w-full bg-dark-gray border border-white/10 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-accent-blue transition-colors text-white placeholder-gray-500"
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="w-5 h-5" />
                {loading ? 'Logging in...' : 'Login'}
              </motion.button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={signupData.name}
                    onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                    className="w-full bg-dark-gray border border-white/10 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-accent-blue transition-colors text-white placeholder-gray-500"
                    placeholder="Enter your name"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={signupData.username}
                    onChange={(e) => setSignupData({ ...signupData, username: e.target.value })}
                    className="w-full bg-dark-gray border border-white/10 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-accent-blue transition-colors text-white placeholder-gray-500"
                    placeholder="Choose a username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={signupData.email}
                    onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                    className="w-full bg-dark-gray border border-white/10 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-accent-blue transition-colors text-white placeholder-gray-500"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={signupData.password}
                    onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                    className="w-full bg-dark-gray border border-white/10 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-accent-blue transition-colors text-white placeholder-gray-500"
                    placeholder="Create a password"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Must be 8+ characters with 1 digit and 1 special character
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loading}
                className="w-full bg-accent-green hover:bg-accent-green/80 disabled:opacity-50 px-6 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus className="w-5 h-5" />
                {loading ? 'Creating account...' : 'Sign Up'}
              </motion.button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
