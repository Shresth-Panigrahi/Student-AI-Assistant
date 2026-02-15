import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { FlashcardSet } from '@/store/useStore'

interface FlashcardDeckProps {
    flashcardSet: FlashcardSet
}

export default function FlashcardDeck({ flashcardSet }: FlashcardDeckProps) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isFlipped, setIsFlipped] = useState(false)

    const currentCard = flashcardSet.cards[currentIndex]

    const nextCard = () => {
        setIsFlipped(false)
        setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % flashcardSet.cards.length)
        }, 200)
    }

    const prevCard = () => {
        setIsFlipped(false)
        setTimeout(() => {
            setCurrentIndex((prev) => (prev - 1 + flashcardSet.cards.length) % flashcardSet.cards.length)
        }, 200)
    }

    return (
        <div className="flex flex-col items-center">
            <div className="w-full max-w-2xl aspect-video relative perspective-1000 mb-6">
                <motion.div
                    className="w-full h-full relative preserve-3d cursor-pointer"
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                    onClick={() => setIsFlipped(!isFlipped)}
                >
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-dark-gray border border-gray-700 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
                        <span className="absolute top-4 left-4 text-xs font-medium px-2 py-1 bg-dark-600 rounded-md text-gray-400 uppercase tracking-wider">
                            {currentCard.card_type}
                        </span>
                        <span className="absolute top-4 right-4 text-xs font-medium px-2 py-1 bg-dark-600 rounded-md text-gray-400">
                            {currentIndex + 1} / {flashcardSet.cards.length}
                        </span>
                        <h3 className="text-2xl font-semibold text-white">{currentCard.front}</h3>
                        <p className="absolute bottom-6 text-sm text-gray-500">Tap to flip</p>
                    </div>

                    {/* Back */}
                    <div
                        className="absolute inset-0 backface-hidden bg-dark-gray border border-accent-blue rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-lg"
                        style={{ transform: "rotateY(180deg)" }}
                    >
                        <span className="absolute top-4 left-4 text-xs font-medium px-2 py-1 bg-dark-600 rounded-md text-accent-blue uppercase tracking-wider">
                            Answer
                        </span>
                        <p className="text-xl text-gray-200 leading-relaxed">{currentCard.back}</p>
                    </div>
                </motion.div>
            </div>

            <div className="flex gap-4">
                <button
                    onClick={prevCard}
                    className="p-3 rounded-full bg-dark-gray hover:bg-dark-600 transition-colors border border-gray-700"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="p-3 rounded-full bg-accent-blue hover:bg-accent-blue/80 transition-colors text-white"
                >
                    <RotateCcw className="w-6 h-6" />
                </button>
                <button
                    onClick={nextCard}
                    className="p-3 rounded-full bg-dark-gray hover:bg-dark-600 transition-colors border border-gray-700"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>
        </div>
    )
}
