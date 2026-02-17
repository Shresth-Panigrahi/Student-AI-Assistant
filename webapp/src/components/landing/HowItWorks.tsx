import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Mic, Cpu, FileText, Search, ArrowRight } from 'lucide-react';

const StepCard = ({ number, title, subtitle, icon: Icon, color }: { number: string, title: string, subtitle: string, icon: any, color: string }) => (
    <div className="min-w-[80vw] md:min-w-[60vw] h-[70vh] flex flex-col items-center justify-center p-8 md:p-16 border-r border-white/5 bg-[#0D0D12] relative overflow-hidden group">
        <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-5 transition-opacity duration-700`} />

        <div className="relative z-10 flex flex-col items-center text-center">
            <div className="mb-8 p-6 rounded-full bg-white/5 border border-white/10 group-hover:scale-110 transition-transform duration-500">
                <Icon className="w-16 h-16 text-white" />
            </div>
            <span className="text-sm font-bold tracking-widest text-light-gray/50 mb-4">STEP 0{number}</span>
            <h3 className="text-4xl md:text-6xl font-bold text-white mb-6">{title}</h3>
            <p className="text-xl md:text-2xl text-light-gray max-w-2xl">{subtitle}</p>
        </div>
    </div>
);

const HowItWorks = () => {
    const containerRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
    });

    return (
        <section id="how-it-works" className="relative bg-true-black">
            <div ref={containerRef} className="relative h-[300vh]">
                <div className="sticky top-0 h-screen flex items-center overflow-x-hidden">
                    <motion.div
                        style={{ x: useTransform(scrollYProgress, [0, 1], ["0%", "-75%"]) }}
                        className="flex"
                    >
                        <div className="min-w-[100vw] h-screen flex items-center justify-center bg-black z-10">
                            <div className="text-center">
                                <h2 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-royal-purple to-deep-magenta mb-8">
                                    How It Works
                                </h2>
                                <p className="text-2xl text-light-gray flex items-center justify-center gap-2">
                                    Scroll to explore <ArrowRight className="animate-pulse" />
                                </p>
                            </div>
                        </div>

                        <StepCard
                            number="1"
                            title="Record"
                            subtitle="One click to start capturing high-fidelity audio, or upload existing files."
                            icon={Mic}
                            color="from-royal-purple to-transparent"
                        />

                        <StepCard
                            number="2"
                            title="Process"
                            subtitle="Our AI engine transcribes and identifies speakers in real-time."
                            icon={Cpu}
                            color="from-deep-magenta to-transparent"
                        />

                        <StepCard
                            number="3"
                            title="Analyze"
                            subtitle="Key points, summaries, and topics are extracted automatically."
                            icon={FileText}
                            color="from-gold-highlight to-transparent"
                        />

                        <StepCard
                            number="4"
                            title="Study"
                            subtitle="Search across all your lectures instantly to find exactly what you need."
                            icon={Search}
                            color="from-orchid to-transparent"
                        />
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
