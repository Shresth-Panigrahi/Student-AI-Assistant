import { useMemo } from 'react'
import { motion } from 'framer-motion'

interface Star {
    id: number
    x: number
    y: number
    size: number
    delay: number
    duration: number
}

export default function StarBackground() {
    const stars: Star[] = useMemo(() => {
        const count = 50 // Number of stars
        return Array.from({ length: count }).map((_, i) => ({
            id: i,
            x: Math.random() * 100, // percentage
            y: Math.random() * 100, // percentage
            size: Math.random() * 2 + 1, // 1-3px
            delay: Math.random() * 5, // 0-5s delay
            duration: Math.random() * 3 + 2, // 2-5s duration
        }))
    }, [])

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {stars.map((star) => (
                <motion.div
                    key={star.id}
                    className="absolute bg-white rounded-full"
                    style={{
                        left: `${star.x}%`,
                        top: `${star.y}%`,
                        width: star.size,
                        height: star.size,
                    }}
                    initial={{ opacity: 0.1 }}
                    animate={{ opacity: [0.1, 0.8, 0.1] }}
                    transition={{
                        duration: star.duration,
                        repeat: Infinity,
                        delay: star.delay,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    )
}
