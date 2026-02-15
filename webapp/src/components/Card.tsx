import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  onClick?: () => void
}

export default function Card({ children, className = '', hover = false, onClick }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hover ? { scale: 1.02, y: -5 } : {}}
      onClick={onClick}
      className={`
        glass-effect rounded-2xl p-6
        ${hover ? 'cursor-pointer hover:border-accent-blue/50' : ''}
        transition-all duration-300
        ${className}
      `}
    >
      {children}
    </motion.div>
  )
}
