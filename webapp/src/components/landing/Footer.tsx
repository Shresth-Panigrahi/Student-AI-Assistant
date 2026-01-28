import React from 'react';
import { GraduationCap, Twitter, Github, Youtube } from 'lucide-react';

const Footer = () => {
    return (
        <footer className="bg-true-black pt-20 pb-10 border-t border-white/10">
            <div className="max-w-7xl mx-auto px-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">

                    {/* Brand */}
                    <div className="col-span-1">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-royal-purple to-deep-magenta flex items-center justify-center">
                                <GraduationCap className="text-white w-5 h-5" />
                            </div>
                            <span className="text-lg font-bold text-white">AI STUDENT</span>
                        </div>
                        <p className="text-light-gray mb-6 text-sm leading-relaxed">
                            Empowering students to learn smarter, not harder, with cutting-edge AI technology.
                        </p>
                        <div className="flex gap-4">
                            {[Twitter, Github, Youtube].map((Icon, i) => (
                                <a key={i} href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors">
                                    <Icon className="w-5 h-5" />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Links */}
                    {[
                        { title: "Product", links: ["Features", "Pricing", "Demo", "Mobile App"] },
                        { title: "Resources", links: ["Documentation", "API", "Blog", "Community"] },
                        { title: "Company", links: ["About", "Careers", "Privacy", "Terms"] }
                    ].map((col, i) => (
                        <div key={i} className="col-span-1">
                            <h4 className="text-white font-bold mb-6">{col.title}</h4>
                            <ul className="space-y-4">
                                {col.links.map(link => (
                                    <li key={link}>
                                        <a href="#" className="text-sm text-light-gray hover:text-white transition-colors">{link}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-muted-gray">© 2024 AI Student. Made with 💜 for students.</p>
                    <div className="flex gap-8">
                        <a href="#" className="text-xs text-muted-gray hover:text-white">Privacy Policy</a>
                        <a href="#" className="text-xs text-muted-gray hover:text-white">Terms of Service</a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
