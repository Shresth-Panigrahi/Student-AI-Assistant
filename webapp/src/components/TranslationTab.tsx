import { useState } from 'react'
import { Globe, Loader } from 'lucide-react'
import { api } from '@/services/api'

interface TranslationTabProps {
    sessionId: string
    originalTranscript: string
}

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese' },
    { code: 'pt', name: 'Portuguese' },
]

export default function TranslationTab({ sessionId, originalTranscript }: TranslationTabProps) {
    const [targetLang, setTargetLang] = useState('es')
    const [translation, setTranslation] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleTranslate = async () => {
        setLoading(true)
        try {
            const result = await api.translateText(sessionId, originalTranscript, targetLang)
            setTranslation(result.translated_text)
        } catch (error) {
            console.error('Translation failed:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4 bg-dark-gray border border-gray-700 p-4 rounded-xl">
                <label className="text-sm font-medium text-gray-400">Target Language:</label>
                <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="bg-dark-gray border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-blue"
                >
                    {LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                            {lang.name}
                        </option>
                    ))}
                </select>
                <button
                    onClick={handleTranslate}
                    disabled={loading}
                    className="ml-auto bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                    {loading ? (
                        <>
                            <Loader className="w-4 h-4 animate-spin" />
                            Translating...
                        </>
                    ) : (
                        <>
                            <Globe className="w-4 h-4" />
                            Translate
                        </>
                    )}
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-dark-gray border border-gray-700 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">Original</h3>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                        {originalTranscript}
                    </p>
                </div>

                <div className="bg-dark-gray border border-gray-700 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider flex items-center justify-between">
                        <span>Translated ({LANGUAGES.find(l => l.code === targetLang)?.name})</span>
                        {translation && <span className="text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded">Completed</span>}
                    </h3>
                    {translation ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white">
                            {translation}
                        </p>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-500 text-sm italic min-h-[200px]">
                            Select a language and click Translate to see the result
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
