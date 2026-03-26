import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Lock, User, UserPlus, LogIn } from 'lucide-react'
import { api } from '@/services/api'
import logoUrl from '@/assets/logo.png'

export default function Auth() {
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const authInputClasses =
    'w-full rounded-xl border border-white/10 bg-white/[0.05] pl-12 pr-4 py-3 text-base text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition placeholder:text-zinc-500 caret-white focus:border-royal-purple focus:ring-2 focus:ring-royal-purple/20'

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
            <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
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
          <div className="mb-6 flex gap-2 rounded-xl border border-white/6 bg-white/[0.04] p-1">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 rounded-lg py-2 font-semibold transition-all ${
                isLogin
                  ? 'bg-gradient-to-r from-royal-purple to-deep-magenta text-white shadow-lg shadow-royal-purple/20'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 rounded-lg py-2 font-semibold transition-all ${
                !isLogin
                  ? 'bg-gradient-to-r from-royal-purple to-deep-magenta text-white shadow-lg shadow-royal-purple/20'
                  : 'text-zinc-400 hover:text-white'
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
                  <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={loginData.username_or_email}
                    onChange={(e) => setLoginData({ ...loginData, username_or_email: e.target.value })}
                    className={authInputClasses}
                    placeholder="Enter username or email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    className={authInputClasses}
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
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-royal-purple to-deep-magenta px-6 py-3 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
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
                  <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={signupData.name}
                    onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                    className={authInputClasses}
                    placeholder="Enter your name"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Username</label>
                <div className="relative">
                  <UserPlus className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={signupData.username}
                    onChange={(e) => setSignupData({ ...signupData, username: e.target.value })}
                    className={authInputClasses}
                    placeholder="Choose a username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="email"
                    value={signupData.email}
                    onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                    className={authInputClasses}
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="password"
                    value={signupData.password}
                    onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                    className={authInputClasses}
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
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-6 py-3 font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
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
