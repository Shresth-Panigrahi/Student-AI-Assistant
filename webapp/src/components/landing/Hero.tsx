import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Mic, Play, ArrowDown, Mouse } from 'lucide-react';
import gsap from 'gsap';

const Hero = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLHeadingElement>(null);
    const [typingPhase, setTypingPhase] = useState(0); // 0-3: phases, 4: final

    const { scrollY } = useScroll();
    const y1 = useTransform(scrollY, [0, 500], [0, 100]);
    const y2 = useTransform(scrollY, [0, 500], [0, -100]);
    const opacity = useTransform(scrollY, [0, 300], [1, 0]);

    useEffect(() => {
        let phase = 0;
        let timeoutId: any;

        const runSequence = async () => {
            setTypingPhase(phase);

            // Determine delay based on phase
            // Phase 3 is "SMART NOTES" (final state), allow it to stay longer (7 seconds)
            // Phases 0-2 need enough time for typing animation (approx 2.5s)
            const delay = phase === 3 ? 7000 : 2500;

            await new Promise(r => {
                timeoutId = setTimeout(r, delay);
            });

            // Move to next phase, loop back to 0 after 3
            phase = (phase + 1) % 4;

            // Allow a small pause before restarting cleanly if needed
            timeoutId = setTimeout(runSequence, phase === 0 ? 100 : 200);
        };

        runSequence();

        return () => {
            clearTimeout(timeoutId);
        };
    }, []);

    const TypewriterText = ({ text }: { text: string }) => (
        <motion.span
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={{
                hidden: { opacity: 0 },
                visible: {
                    opacity: 1,
                    transition: {
                        staggerChildren: 0.05,
                    },
                },
            }}
        >
            {text.split("").map((char, i) => (
                <motion.span
                    key={i}
                    variants={{
                        hidden: { opacity: 0, y: 5 },
                        visible: { opacity: 1, y: 0 },
                    }}
                >
                    {char}
                </motion.span>
            ))}
        </motion.span>
    );

    return (
        <div ref={containerRef} className="relative min-h-screen w-full bg-true-black overflow-hidden flex flex-col items-center justify-center pt-20">

            {/* Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-[800px] h-[800px] bg-royal-purple/20 rounded-full blur-[120px] animate-float" />
                <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-deep-magenta/15 rounded-full blur-[100px] animate-float [animation-delay:2s]" />
                <div className="absolute bottom-1/4 left-1/2 w-[500px] h-[500px] bg-orchid/10 rounded-full blur-[80px] animate-float [animation-delay:4s]" />

                {/* Grain Overlay */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]" />
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex flex-col items-center text-center px-4 max-w-5xl mx-auto">

                {/* Dynamic Typography */}
                <div className="relative h-32 md:h-48 flex items-center justify-center mb-8">
                    {typingPhase < 3 ? (
                        <h1 className="text-4xl md:text-7xl font-bold text-light-gray relative">
                            <span className="relative inline-block">
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={typingPhase}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="block"
                                    >
                                        {typingPhase === 0 && <TypewriterText text="Manual Note Taking" />}
                                        {typingPhase === 1 && <TypewriterText text="Missing Important Points" />}
                                        {typingPhase === 2 && <TypewriterText text="Rewinding Lectures" />}
                                    </motion.span>
                                </AnimatePresence>
                                <motion.div
                                    key={`strike-${typingPhase}`}
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: 1 }}
                                    transition={{ delay: 1.5, duration: 0.4, ease: "easeInOut" }}
                                    className="absolute top-1/2 left-0 w-full h-1 bg-rose transform -rotate-2 origin-left z-20"
                                />
                            </span>
                        </h1>
                    ) : (
                        <motion.h1
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-6xl md:text-9xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-royal-purple via-deep-magenta to-orchid drop-shadow-2xl"
                        >
                            SMART NOTES
                        </motion.h1>
                    )}
                </div>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="text-lg md:text-2xl text-light-gray/80 max-w-2xl mb-12"
                >
                    Transform lectures into searchable, intelligent notes—automatically.
                </motion.p>

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="flex flex-col md:flex-row gap-6"
                >
                    <button
                        onClick={() => window.location.href = '/session'}
                        className="group relative w-full md:w-auto flex items-center gap-4 px-8 py-4 rounded-3xl bg-royal-purple/10 border border-royal-purple/20 hover:bg-royal-purple/20 transition-all duration-300"
                    >
                        <div className="p-3 bg-gradient-to-br from-royal-purple to-deep-magenta rounded-xl group-hover:scale-110 transition-transform">
                            <Mic className="text-white w-6 h-6" />
                        </div>
                        <div className="text-left">
                            <div className="text-white font-bold text-lg">Start Recording Free</div>
                            <div className="text-xs text-secondary-gray">No signup required</div>
                        </div>
                    </button>

                    <button
                        onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                        className="group relative w-full md:w-auto flex items-center gap-4 px-8 py-4 rounded-3xl bg-deep-magenta/10 border border-deep-magenta/20 hover:bg-deep-magenta/20 transition-all duration-300"
                    >
                        <div className="p-3 bg-white/10 rounded-xl group-hover:scale-110 transition-transform">
                            <Play className="text-white w-6 h-6 fill-current" />
                        </div>
                        <div className="text-left">
                            <div className="text-white font-bold text-lg">Watch Demo</div>
                            <div className="text-xs text-secondary-gray">See in action</div>
                        </div>
                    </button>
                </motion.div>

                {/* Trust Badges */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.2 }}
                    className="mt-12 flex gap-4 md:gap-8 flex-wrap justify-center"
                >
                    {['🔒 Secure & Private', '⚡ Real-time Processing', '🎯 95% Accurate'].map((badge) => (
                        <div key={badge} className="px-4 py-2 rounded-full border border-white/10 bg-white/5 text-xs text-light-gray backdrop-blur-sm">
                            {badge}
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* Floating 3D Elements */}
            <motion.div style={{ y: y1 }} className="absolute right-[10%] top-[20%] w-32 h-32 hidden md:flex items-center justify-center p-6 rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 animate-float">
                <Mic className="w-16 h-16 text-royal-purple" />
            </motion.div>

            <motion.div style={{ y: y2 }} className="absolute left-[10%] bottom-[30%] w-24 h-32 hidden md:flex flex-col gap-2 p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 animate-float [animation-delay:1.5s]">
                <div className="h-2 w-full bg-white/10 rounded-full" />
                <div className="h-2 w-3/4 bg-white/10 rounded-full" />
                <div className="h-2 w-full bg-white/10 rounded-full" />
            </motion.div>

            {/* Scroll Indicator */}
            <motion.div style={{ opacity }} className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
                <Mouse className="text-white/50 w-6 h-6" />
                <span className="text-[10px] uppercase tracking-widest text-white/30">Scroll</span>
                <ArrowDown className="text-white/30 w-4 h-4 animate-bounce" />
            </motion.div>

        </div>
    );
};

export default Hero;
