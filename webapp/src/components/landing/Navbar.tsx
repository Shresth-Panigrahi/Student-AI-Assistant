import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

import { motion } from 'framer-motion';
import logoUrl from '@/assets/logo.png';

const Navbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const goToSection = (sectionId: string) => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
        setIsMobileMenuOpen(false);
    };

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
                ? 'bg-[#0D0D12]/80 backdrop-blur-2xl border-b border-[#6D28D9]/10'
                : 'bg-transparent'
                }`}
        >
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                {/* Logo */}
                <div className="flex items-center gap-4 group cursor-pointer">
                    <div className="relative w-24 h-24 flex items-center justify-center transition-transform hover:scale-105">
                        <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-light-gray whitespace-nowrap">
                        Lecture Lyft
                    </span>
                </div>

                {/* Desktop Nav */}
                <div className="hidden md:flex items-center gap-8">
                    {[
                        { name: 'Features', sectionId: 'features' },
                        { name: 'How it Works', sectionId: 'how-it-works' },
                        { name: 'Stats', sectionId: 'stats' },
                    ].map((item) => (
                        <button
                            type="button"
                            key={item.name}
                            onClick={() => goToSection(item.sectionId)}
                            className="text-sm font-medium text-light-gray hover:text-white transition-colors relative group"
                        >
                            {item.name}
                            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-royal-purple to-deep-magenta group-hover:w-full transition-all duration-300" />
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => { window.location.hash = '/history' }}
                        className="text-sm font-medium text-light-gray hover:text-white transition-colors relative group"
                    >
                        History
                        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-royal-purple to-deep-magenta group-hover:w-full transition-all duration-300" />
                    </button>
                </div>

                {/* CTA Button */}
                <div className="hidden md:block">
                    <motion.button
                        onClick={() => { window.location.hash = '/session' }}
                        initial="initial"
                        whileHover="hover"
                        variants={{
                            initial: {
                                borderColor: "rgba(109, 40, 217, 0.3)",
                                color: "#ffffff",
                                boxShadow: "0 0 0px rgba(168, 85, 247, 0)"
                            },
                            hover: {
                                borderColor: [
                                    "rgba(109, 40, 217, 0.3)", // Start
                                    "rgba(168, 85, 247, 0)",   // Off
                                    "#a855f7",                 // On (Purple)
                                    "rgba(168, 85, 247, 0)",   // Off
                                    "#a855f7",                 // On (Purple)
                                    "rgba(168, 85, 247, 0)",   // Off
                                    "#a855f7"                  // Final (Stable)
                                ],
                                color: [
                                    "#ffffff",                 // Start
                                    "rgba(255, 255, 255, 0.1)",// Off
                                    "#a855f7",                 // On (Purple)
                                    "rgba(255, 255, 255, 0.1)",// Off
                                    "#a855f7",                 // On (Purple)
                                    "rgba(255, 255, 255, 0.1)",// Off
                                    "#a855f7"                  // Final (Stable)
                                ],
                                boxShadow: [
                                    "0 0 0px rgba(168, 85, 247, 0)",
                                    "0 0 0px rgba(168, 85, 247, 0)",
                                    "0 0 10px rgba(168, 85, 247, 0.4)", // Mild glow on flash
                                    "0 0 0px rgba(168, 85, 247, 0)",
                                    "0 0 10px rgba(168, 85, 247, 0.4)", // Mild glow on flash
                                    "0 0 0px rgba(168, 85, 247, 0)",
                                    "0 0 25px rgba(168, 85, 247, 0.6)"  // Final strong glow
                                ],
                                transition: {
                                    duration: 0.8,
                                    times: [0, 0.1, 0.3, 0.4, 0.6, 0.8, 1], // Rapid 'bulb' flickering
                                    ease: "linear"
                                }
                            }
                        }}
                        className="px-6 py-2.5 rounded-xl bg-royal-purple/10 border text-sm font-semibold backdrop-blur-sm"
                    >
                        Start Recording
                    </motion.button>
                </div>

                {/* Mobile Menu Toggle */}
                <button
                    className="md:hidden text-light-gray hover:text-white"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                    {isMobileMenuOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Mobile Menu */}
            {isMobileMenuOpen && (
                <div className="md:hidden absolute top-20 left-0 w-full bg-[#0D0D12] border-b border-royal-purple/10 p-6 flex flex-col gap-4 shadow-2xl animate-in slide-in-from-top-4">
                    {[
                        { name: 'Features', sectionId: 'features' },
                        { name: 'How it Works', sectionId: 'how-it-works' },
                        { name: 'Stats', sectionId: 'stats' },
                    ].map((item) => (
                        <button
                            type="button"
                            key={item.name}
                            className="text-light-gray hover:text-white text-lg font-medium py-2"
                            onClick={() => goToSection(item.sectionId)}
                        >
                            {item.name}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => {
                            setIsMobileMenuOpen(false)
                            window.location.hash = '/history'
                        }}
                        className="text-left text-light-gray hover:text-white text-lg font-medium py-2"
                    >
                        History
                    </button>
                    <button
                        onClick={() => { window.location.hash = '/session' }}
                        className="w-full mt-4 h-12 rounded-xl bg-gradient-to-r from-royal-purple to-deep-magenta text-white font-bold shadow-lg"
                    >
                        Start Recording
                    </button>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
