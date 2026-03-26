import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Clock, Search, CheckCircle, Zap, Bot } from 'lucide-react';

const ProblemSolution = () => {
    const [activeScenario, setActiveScenario] = useState(0);

    const scenarios = [
        {
            id: 0,
            title: "The Struggle",
            problem: {
                icon: <Clock className="w-12 h-12 text-rose" />,
                text: "Missing 60% of lecture content",
                visual: "Frantic Note-Taking",
                color: "text-rose"
            },
            solution: {
                title: "Live Transcription",
                visual: <div className="p-4 bg-gray-900/50 rounded-xl border border-white/10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs text-white/60">REC 00:15:42</span>
                        </div>
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1 bg-royal-purple h-4 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />)}
                        </div>
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed font-mono">
                        The <span className="bg-royal-purple/30 text-white px-1 rounded">mitochondria</span> is the powerhouse of the cell...
                    </p>
                </div>
            }
        },
        {
            id: 1,
            title: "The Chaos",
            problem: {
                icon: <Search className="w-12 h-12 text-gold-highlight" />,
                text: "Can't find what you need",
                visual: "Lost Notes",
                color: "text-gold-highlight"
            },
            solution: {
                title: "Smart Search",
                visual: <div className="p-4 bg-gray-900/50 rounded-xl border border-white/10">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/40" />
                        <input disabled value="mitochondria" className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <div className="p-2 bg-royal-purple/20 border border-royal-purple/30 rounded-lg">
                            <div className="flex justify-between text-xs text-white/40 mb-1">
                                <span>00:12:45</span>
                                <span>98% Match</span>
                            </div>
                            <p className="text-xs text-white">...energy production in <span className="text-deep-magenta font-bold">mitochondria</span>...</p>
                        </div>
                    </div>
                </div>
            }
        },
        {
            id: 2,
            title: "The Waste",
            problem: {
                icon: <AlertCircle className="w-12 h-12 text-rose" />,
                text: "Rewinding 10+ times",
                visual: "Rewind Loop",
                color: "text-rose"
            },
            solution: {
                title: "AI Analysis",
                visual: <div className="p-4 bg-gray-900/50 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2 mb-3">
                        <Bot className="w-4 h-4 text-deep-magenta" />
                        <span className="text-sm font-bold text-white">Smart Summary</span>
                    </div>
                    <ul className="space-y-2">
                        {['Key concepts extracted', 'Topics organized', 'Action items identified'].map((item, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-white/70">
                                <CheckCircle className="w-3 h-3 text-green-400" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>
            }
        }
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveScenario(prev => (prev + 1) % scenarios.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <section className="relative min-h-screen flex flex-col md:flex-row bg-[#0D0D12] overflow-hidden">
            {/* Decorative center line */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-royal-purple/50 to-transparent z-10" />

            {/* LEFT: PROBLEM */}
            <div className="flex-1 min-h-[50vh] md:min-h-screen flex items-center justify-center p-8 md:p-20 relative border-b md:border-b-0 border-white/5">
                <div className="absolute inset-0 bg-gradient-to-br from-rose/5 to-transparent pointer-events-none" />

                <div className="w-full max-w-md relative z-10">
                    <motion.h3
                        initial={{ opacity: 0, y: -20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        className="text-3xl md:text-5xl font-bold text-light-gray mb-12"
                    >
                        The Student Struggle
                    </motion.h3>

                    <div className="h-64 relative">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={scenarios[activeScenario].id}
                                initial={{ opacity: 0, x: -50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 50 }}
                                transition={{ duration: 0.5 }}
                                className="absolute inset-0 flex flex-col justify-center"
                            >
                                <div className="mb-6">{scenarios[activeScenario].problem.icon}</div>
                                <h4 className={`text-4xl font-bold mb-4 ${scenarios[activeScenario].problem.color}`}>
                                    {scenarios[activeScenario].problem.text}
                                </h4>
                                <div className="text-xl text-white/50 font-mono">
                                    {scenarios[activeScenario].problem.visual}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* RIGHT: SOLUTION */}
            <div className="flex-1 min-h-[50vh] md:min-h-screen flex items-center justify-center p-8 md:p-20 relative">
                <div className="absolute inset-0 bg-royal-purple/5 pointer-events-none" />

                <div className="w-full max-w-md relative z-10">
                    <motion.h3
                        initial={{ opacity: 0, y: -20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        className="text-3xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-royal-purple to-deep-magenta mb-12"
                    >
                        Your Smart Solution
                    </motion.h3>

                    <div className="relative">
                        {/* Phone Mockup Frame */}
                        <div className="relative w-[300px] h-[580px] md:w-[320px] md:h-[640px] mx-auto bg-[#1C1C24] rounded-[3rem] border-8 border-[#27272F] shadow-2xl overflow-hidden ring-1 ring-white/10">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#27272F] rounded-b-2xl z-20" />

                            {/* Screen Content */}
                            <div className="absolute inset-0 pt-12 px-6 pb-8 bg-black">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={scenarios[activeScenario].id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        transition={{ duration: 0.5 }}
                                        className="h-full flex flex-col"
                                    >
                                        <div className="flex items-center justify-between mb-8">
                                            <h5 className="text-xl font-bold text-white">{scenarios[activeScenario].solution.title}</h5>
                                            <Zap className="w-5 h-5 text-gold-highlight" />
                                        </div>
                                        {scenarios[activeScenario].solution.visual}
                                    </motion.div>
                                </AnimatePresence>
                            </div>

                            {/* Floating Badges */}
                            <motion.div
                                animate={{ y: [0, -10, 0] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute -right-12 top-20 bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-full text-xs font-bold text-white shadow-xl z-30"
                            >
                                Real-time ⚡
                            </motion.div>
                            <motion.div
                                animate={{ y: [0, 10, 0] }}
                                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                                className="absolute -left-8 bottom-32 bg-black/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-full text-xs font-bold text-white shadow-xl z-30"
                            >
                                AI-Powered 🤖
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ProblemSolution;
