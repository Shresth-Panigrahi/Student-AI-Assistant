import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Play, FileText, Sparkles, CheckCircle2 } from 'lucide-react';

const LiveDemo = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [showSummary, setShowSummary] = useState(false);
    const [audioData, setAudioData] = useState<number[]>(new Array(20).fill(10));

    // Demo content representing a lecture snippet
    const fullTranscript = "Photosynthesis is the process used by plants, algae and certain bacteria to harness energy from sunlight and turn it into chemical energy. This energy is stored in carbohydrate molecules, such as sugars, which are synthesized from carbon dioxide and water.";

    const summaryPoints = [
        "Process: Plants convert sunlight to chemical energy",
        "Key input: Sunlight, Carbon Dioxide, Water",
        "Key output: Carbohydrate molecules (Sugars)"
    ];

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const textIndexRef = useRef(0);

    // Audio visualization simulation
    useEffect(() => {
        if (isRecording) {
            const visualize = setInterval(() => {
                setAudioData(prev => prev.map(() => Math.random() * 40 + 10));
            }, 100);
            return () => clearInterval(visualize);
        } else {
            setAudioData(new Array(20).fill(5));
        }
    }, [isRecording]);

    // Typing effect simulation
    useEffect(() => {
        if (isRecording) {
            intervalRef.current = setInterval(() => {
                const currentIndex = textIndexRef.current;
                if (currentIndex < fullTranscript.length) {
                    setTranscript(fullTranscript.slice(0, currentIndex + 1));
                    textIndexRef.current = currentIndex + 1;
                } else {
                    // Finished recording simulation
                    setIsRecording(false);
                    setTimeout(() => setShowSummary(true), 500);
                    if (intervalRef.current) clearInterval(intervalRef.current);
                }
            }, 50);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isRecording]);

    const handleStartDemo = () => {
        setTranscript("");
        setShowSummary(false);
        textIndexRef.current = 0;
        setIsRecording(true);
    };

    return (
        <section className="py-24 px-6 relative overflow-hidden bg-true-black">
            {/* Background Elements */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-royal-purple/20 rounded-full blur-[100px] pointer-events-none" />

            <div className="max-w-7xl mx-auto relative z-10 grid lg:grid-cols-2 gap-16 items-center">

                {/* Left: Text Content */}
                <div className="space-y-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                            Experience <span className="text-transparent bg-clip-text bg-gradient-to-r from-deep-magenta to-orchid">Smart Notes</span> in Action
                        </h2>
                        <p className="text-lg text-secondary-gray leading-relaxed mb-8">
                            Watch how our AI transforms raw lecture audio into perfectly structured notes, highlighting key concepts and generating summaries in real-time.
                        </p>

                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3 text-secondary-gray">
                                <div className="p-2 rounded-lg bg-elevated-surface border border-white/5">
                                    <Mic className="w-5 h-5 text-deep-magenta" />
                                </div>
                                <span>High-fidelity voice recording</span>
                            </div>
                            <div className="flex items-center gap-3 text-secondary-gray">
                                <div className="p-2 rounded-lg bg-elevated-surface border border-white/5">
                                    <Sparkles className="w-5 h-5 text-gold-highlight" />
                                </div>
                                <span>Instant AI summarization</span>
                            </div>
                        </div>

                        {!isRecording && !showSummary && transcript === "" && (
                            <motion.button
                                onClick={handleStartDemo}
                                className="mt-8 flex items-center gap-3 px-8 py-4 bg-white text-black rounded-full font-bold hover:scale-105 transition-transform"
                                whileTap={{ scale: 0.95 }}
                            >
                                <Play className="w-5 h-5 fill-current" />
                                Try Interactive Demo
                            </motion.button>
                        )}
                    </motion.div>
                </div>

                {/* Right: Interactive Interface */}
                <motion.div
                    initial={{ opacity: 0, x: 50 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    className="relative"
                >
                    {/* Device Border (Glassmorphism) */}
                    <div className="relative z-10 bg-elevated-surface/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl h-[500px] flex flex-col overflow-hidden">

                        {/* Header */}
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-secondary-gray'}`} />
                                <span className="text-sm font-medium text-secondary-gray">
                                    {isRecording ? 'Recording...' : 'Ready to Record'}
                                </span>
                            </div>
                            <FileText className="w-5 h-5 text-secondary-gray" />
                        </div>

                        {/* Visualizer */}
                        <div className="h-16 flex items-center justify-center gap-1 mb-6">
                            {audioData.map((height, i) => (
                                <motion.div
                                    key={i}
                                    animate={{ height: `${height}px` }}
                                    transition={{ ease: "easeInOut", duration: 0.1 }}
                                    className="w-1.5 bg-gradient-to-t from-royal-purple to-deep-magenta rounded-full"
                                />
                            ))}
                        </div>

                        {/* Transcript Area */}
                        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
                            {transcript ? (
                                <p className="text-lg text-white/90 leading-relaxed font-light">
                                    {transcript}
                                    {isRecording && <span className="inline-block w-2 h-5 ml-1 bg-deep-magenta animate-blink" />}
                                </p>
                            ) : (
                                <div className="h-full flex items-center justify-center text-center text-secondary-gray/50 italic">
                                    Click "Try Interactive Demo" to start...
                                </div>
                            )}
                        </div>

                        {/* Summary Card (Appears after recording) */}
                        <AnimatePresence>
                            {showSummary && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="absolute bottom-6 left-6 right-6 bg-true-black/80 backdrop-blur-md rounded-xl p-4 border border-white/10"
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <Sparkles className="w-4 h-4 text-gold-highlight" />
                                        <span className="text-sm font-bold text-white">AI Summary</span>
                                    </div>
                                    <ul className="space-y-2">
                                        {summaryPoints.map((point, i) => (
                                            <motion.li
                                                key={i}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.2 }}
                                                className="flex items-start gap-2 text-sm text-secondary-gray"
                                            >
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                                {point}
                                            </motion.li>
                                        ))}
                                    </ul>
                                </motion.div>
                            )}
                        </AnimatePresence>

                    </div>

                    {/* Decorative Elements behind card */}
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-deep-magenta/30 rounded-full blur-2xl animate-pulse-slow" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-royal-purple/30 rounded-full blur-2xl animate-pulse-slow delay-700" />
                </motion.div>
            </div>
        </section>
    );
};

export default LiveDemo;
