import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, X, ChevronRight, HelpCircle } from 'lucide-react'
import { OneWordQuestionSet, ShortAnswerQuestionSet } from '@/store/useStore'
import { api } from '@/services/api'

interface QuizSectionProps {
    oneWordSet?: OneWordQuestionSet
    shortAnswerSet?: ShortAnswerQuestionSet
    type: 'one-word' | 'short-answer'
}

export default function QuizSection({ oneWordSet, shortAnswerSet, type }: QuizSectionProps) {
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [results, setResults] = useState<Record<string, any>>({})
    const [loading, setLoading] = useState<Record<string, boolean>>({})

    const questions = type === 'one-word' ? oneWordSet?.questions : shortAnswerSet?.questions

    const handleSubmit = async (questionId: string, questionSetId: string) => {
        if (!answers[questionId]) return

        setLoading(prev => ({ ...prev, [questionId]: true }))
        try {
            if (type === 'one-word') {
                const result = await api.checkOneWordAnswer(questionSetId, questionId, answers[questionId])
                setResults(prev => ({ ...prev, [questionId]: result }))
            } else {
                const result = await api.evaluateShortAnswer(questionId, answers[questionId])
                setResults(prev => ({ ...prev, [questionId]: result }))
            }
        } catch (error) {
            console.error('Failed to check answer:', error)
        } finally {
            setLoading(prev => ({ ...prev, [questionId]: false }))
        }
    }

    if (!questions) return null

    return (
        <div className="space-y-6">
            {questions.map((q, index) => (
                <motion.div
                    key={q.question_id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-dark-gray border border-gray-700 rounded-xl p-6"
                >
                    <div className="flex items-start gap-4 mb-4">
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center font-bold text-sm text-gray-400">
                            {index + 1}
                        </span>
                        <div className="flex-1">
                            <h3 className="text-lg font-medium mb-2">{q.question_text}</h3>
                            {type === 'one-word' && (q as any).hint && (
                                <p className="text-sm text-gray-500 mb-2 italic flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3" /> Hint: {(q as any).hint}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="pl-12">
                        {!results[q.question_id] ? (
                            <div className="flex gap-3">
                                {type === 'one-word' ? (
                                    <input
                                        type="text"
                                        value={answers[q.question_id] || ''}
                                        onChange={(e) => setAnswers(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                                        className="flex-1 bg-dark-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent-blue placeholder-gray-600"
                                        placeholder="Type your answer..."
                                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit(q.question_id, (type === 'one-word' ? oneWordSet!.question_set_id : shortAnswerSet!.question_set_id))}
                                    />
                                ) : (
                                    <textarea
                                        value={answers[q.question_id] || ''}
                                        onChange={(e) => setAnswers(prev => ({ ...prev, [q.question_id]: e.target.value }))}
                                        className="flex-1 bg-dark-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent-blue placeholder-gray-600 min-h-[100px]"
                                        placeholder="Type your answer..."
                                    />
                                )}
                                <button
                                    onClick={() => handleSubmit(q.question_id, (type === 'one-word' ? oneWordSet!.question_set_id : shortAnswerSet!.question_set_id))}
                                    disabled={loading[q.question_id] || !answers[q.question_id]}
                                    className="bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium transition-colors flex items-center self-start"
                                >
                                    {loading[q.question_id] ? 'Checking...' : <ChevronRight className="w-5 h-5" />}
                                </button>
                            </div>
                        ) : (
                            <div className={`rounded-lg p-4 border ${type === 'one-word'
                                    ? results[q.question_id].correct ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
                                    : results[q.question_id].score >= 70 ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'
                                }`}>
                                {type === 'one-word' ? (
                                    <div className="flex items-center gap-3">
                                        {results[q.question_id].correct ? (
                                            <Check className="w-5 h-5 text-green-500" />
                                        ) : (
                                            <X className="w-5 h-5 text-red-500" />
                                        )}
                                        <div>
                                            <p className={`font-medium ${results[q.question_id].correct ? 'text-green-400' : 'text-red-400'}`}>
                                                {results[q.question_id].correct ? 'Correct!' : 'Incorrect'}
                                            </p>
                                            {!results[q.question_id].correct && (
                                                <p className="text-sm text-gray-400 mt-1">
                                                    Correct answer: <span className="text-white font-medium">{results[q.question_id].correct_answer}</span>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`font-bold ${results[q.question_id].score >= 70 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                Score: {results[q.question_id].score}/100
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-300 mb-2">{results[q.question_id].feedback}</p>
                                        {results[q.question_id].key_points_missed?.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-gray-600/30">
                                                <p className="text-xs text-gray-400 mb-1">Key points missed:</p>
                                                <ul className="list-disc list-inside text-xs text-gray-400">
                                                    {results[q.question_id].key_points_missed.map((pt: string, i: number) => (
                                                        <li key={i}>{pt}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    onClick={() => setResults(prev => {
                                        const newRes = { ...prev }
                                        delete newRes[q.question_id]
                                        return newRes
                                    })}
                                    className="mt-3 text-xs text-gray-500 hover:text-white transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            ))}
        </div>
    )
}
