import { useNavigate } from 'react-router-dom';
import { ReactLenis } from '@studio-freight/react-lenis'
import Navbar from '../components/landing/Navbar';
import Hero from '../components/landing/Hero';
import ProblemSolution from '../components/landing/ProblemSolution';
import FeaturesGrid from '../components/landing/FeaturesGrid';
import LiveDemo from '../components/landing/LiveDemo';
import HowItWorks from '../components/landing/HowItWorks';
import StatsTrust from '../components/landing/StatsTrust';
import Footer from '../components/landing/Footer';

const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <ReactLenis root>
            <div className="bg-true-black min-h-screen text-white font-sans selection:bg-royal-purple selection:text-white">
                <Navbar />
                <Hero />
                <ProblemSolution />
                <div id="features">
                    <FeaturesGrid />
                </div>
                <div id="demo">
                    <LiveDemo />
                </div>
                <div id="how-it-works">
                    <HowItWorks />
                </div>
                <div id="stats">
                    <StatsTrust />
                </div>

                {/* Final CTA */}
                <section className="py-32 px-6 flex flex-col items-center text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-royal-purple/20 pointer-events-none" />
                    <h2 className="text-5xl md:text-7xl font-black text-white mb-8 relative z-10">
                        Ready to transform <br /> your learning?
                    </h2>
                    <button
                        onClick={() => navigate('/session')}
                        className="relative z-10 px-10 py-5 bg-gradient-to-r from-royal-purple to-deep-magenta rounded-full text-xl font-bold shadow-[0_0_50px_rgba(109,40,217,0.5)] hover:scale-105 hover:shadow-[0_0_80px_rgba(109,40,217,0.7)] transition-all duration-300"
                    >
                        Start Recording Free
                    </button>
                </section>

                <Footer />
            </div>
        </ReactLenis>
    );
};

export default LandingPage;
