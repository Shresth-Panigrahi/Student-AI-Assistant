import React from 'react';
import { motion } from 'framer-motion';
import { Mic, Globe, WifiOff, FileText, Search, MessageSquare, ArrowRight } from 'lucide-react';

const FeatureCard = ({ className, children, delay = 0 }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay, duration: 0.5 }}
        whileHover={{ scale: 1.02, backgroundColor: 'rgba(28, 28, 36, 0.8)' }}
        className={`relative overflow-hidden group rounded-[2rem] bg-[#1C1C24]/60 backdrop-blur-2xl border border-royal-purple/20 p-8 md:p-10 transition-colors duration-300 ${className}`}
    >
        <div className="absolute inset-0 bg-gradient-to-br from-royal-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative z-10 h-full flex flex-col">
            {children}
        </div>
    </motion.div>
);

const FeaturesGrid = () => {
    return (
        <section id="features" className="relative py-32 px-6 bg-true-black overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-royal-purple/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="max-w-[1400px] mx-auto">
                <div className="text-center mb-20">
                    <h2 className="text-5xl md:text-7xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-royal-purple to-deep-magenta mb-6">
                        Powerful Features
                    </h2>
                    <p className="text-light-gray text-xl">Everything you need to learn smarter</p>
                </div>

                {/* Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-[250px] md:auto-rows-[280px]">

                    {/* LARGE 1: Real-Time Transcription */}
                    <FeatureCard className="md:col-span-2 md:row-span-2 relative group" delay={0.1}>
                        <div className="flex items-start justify-between mb-8">
                            <div className="p-4 bg-royal-purple/20 rounded-2xl">
                                <Mic className="w-8 h-8 text-white" />
                            </div>
                            <div className="px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full text-green-400 text-sm font-bold flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                95% Accuracy
                            </div>
                        </div>

                        <h3 className="text-3xl font-bold text-white mb-2">Real-Time Transcription</h3>
                        <p className="text-light-gray mb-8">Never miss a word with lightning fast speech-to-text.</p>

                        {/* Live Transcript Visual */}
                        <div className="flex-1 bg-black/40 rounded-xl p-6 overflow-hidden relative">
                            <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-black/20 to-transparent z-10" />
                            <div className="space-y-4 font-mono text-sm text-white/80">
                                <p><span className="text-royal-purple">00:01</span> Welcome to advanced biology.</p>
                                <p><span className="text-royal-purple">00:05</span> Today we are discussing cell structures.</p>
                                <p><span className="text-royal-purple">00:12</span> Notice how the membrane acts as a barrier...</p>
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ repeat: Infinity, duration: 2 }}
                                    className="text-white/50"
                                >
                                    processing...
                                </motion.p>
                            </div>
                        </div>
                    </FeatureCard>

                    {/* S1: Multi-Language */}
                    <FeatureCard className="md:col-span-1 md:row-span-1" delay={0.2}>
                        <Globe className="w-10 h-10 text-deep-magenta mb-6" />
                        <h3 className="text-2xl font-bold text-white mb-2">50+ Languages</h3>
                        <div className="flex flex-wrap gap-2 mt-auto">
                            {['EN', 'ES', 'FR', 'ZH', 'JA'].map(lang => (
                                <span key={lang} className="px-3 py-1 bg-white/5 rounded-lg text-xs text-light-gray">{lang}</span>
                            ))}
                        </div>
                    </FeatureCard>

                    {/* S2: Offline Mode */}
                    <FeatureCard className="md:col-span-1 md:row-span-1" delay={0.3}>
                        <WifiOff className="w-10 h-10 text-rosetext-white mb-6 text-white" />
                        <h3 className="text-2xl font-bold text-white mb-1">Offline Mode</h3>
                        <p className="text-sm text-light-gray">No internet? No problem.</p>
                    </FeatureCard>

                    {/* M1: AI Summaries */}
                    <FeatureCard className="md:col-span-1 md:row-span-1" delay={0.4}>
                        <FileText className="w-10 h-10 text-gold-highlight mb-6" />
                        <h3 className="text-2xl font-bold text-white mb-2">Smart Summaries</h3>
                        <div className="mt-auto h-20 bg-white/5 rounded-lg p-3 space-y-2 overflow-hidden">
                            <div className="h-2 w-3/4 bg-white/20 rounded" />
                            <div className="h-2 w-full bg-white/20 rounded" />
                            <div className="h-2 w-1/2 bg-white/20 rounded" />
                        </div>
                    </FeatureCard>

                    {/* M2: Smart Search */}
                    <FeatureCard className="md:col-span-1 md:row-span-1" delay={0.5}>
                        <Search className="w-10 h-10 text-orchid mb-6" />
                        <h3 className="text-2xl font-bold text-white mb-2">Instant Search</h3>
                        <div className="mt-auto relative">
                            <input disabled placeholder="Search..." className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm" />
                            <Search className="absolute right-3 top-2.5 w-4 h-4 text-white/30" />
                        </div>
                    </FeatureCard>

                    {/* LARGE 2: Interactive Q&A */}
                    <FeatureCard className="md:col-span-2 md:row-span-1 bg-gradient-to-br from-royal-purple/20 to-transparent" delay={0.6}>
                        <div className="flex justify-between items-start">
                            <div>
                                <MessageSquare className="w-10 h-10 text-white mb-4" />
                                <h3 className="text-2xl font-bold text-white">Ask Anything</h3>
                                <p className="text-light-gray text-sm max-w-xs">Chat with your transcripts to clarify doubts instantly.</p>
                            </div>
                            <button className="p-4 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                                <ArrowRight className="w-6 h-6 text-white" />
                            </button>
                        </div>
                    </FeatureCard>

                </div>
            </div>
        </section>
    );
};

export default FeaturesGrid;
