import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import { BookOpen, Mic, LineChart, ShieldCheck, Star } from 'lucide-react';

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-white">
            {/* Navbar Placeholder (since MainLayout is not used here) */}
            <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <span className="text-white font-bold text-xl">E</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 tracking-tight">EngMaster<span className="text-primary">.AI</span></span>
                </div>
                <div className="hidden md:flex items-center gap-8 text-gray-600 font-medium">
                    <a href="#" className="hover:text-primary transition-colors">Features</a>
                    <a href="#" className="hover:text-primary transition-colors">Courses</a>
                    <a href="#" className="hover:text-primary transition-colors">Pricing</a>
                </div>
                <div className="flex items-center gap-4">
                    <Link to="/auth/login" className="text-gray-600 font-medium hover:text-primary hidden sm:block">Log in</Link>
                    <Link to="/dashboard">
                        <Button className="shadow-lg shadow-blue-500/30">Get Started Free</Button>
                    </Link>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative px-6 pt-12 pb-20 lg:pt-24 lg:pb-32 overflow-hidden">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[600px] h-[600px] bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[400px] h-[400px] bg-green-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

                <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
                    <div className="space-y-8">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-primary rounded-full text-sm font-semibold">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                            #1 AI English Learning Platform
                        </div>
                        <h1 className="text-5xl lg:text-7xl font-bold text-gray-900 leading-[1.1]">
                            Master English <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">4 Skills</span> with AI
                        </h1>
                        <p className="text-xl text-gray-600 max-w-lg leading-relaxed">
                            Personalized learning path, real-time AI speaking assessment, and a comprehensive curriculum designed for university students.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <Link to="/dashboard">
                                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg shadow-xl shadow-blue-600/20 hover:scale-105 transition-transform duration-200">
                                    Start Learning Now
                                </Button>
                            </Link>
                            <Button variant="secondary" size="lg" className="w-full sm:w-auto h-14 px-8 text-lg hover:bg-gray-50">
                                Watch Demo
                            </Button>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <div className="flex -space-x-2">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 overflow-hidden">
                                        <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="user" />
                                    </div>
                                ))}
                            </div>
                            <p>Trusted by 10,000+ students</p>
                        </div>
                    </div>

                    <div className="relative">
                        {/* Abstract UI representation */}
                        <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                                        <Mic className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900">Speaking Test</p>
                                        <p className="text-sm text-gray-500">Topic: Daily Routines</p>
                                    </div>
                                </div>
                                <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-bold">
                                    Excellent
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                <div className="h-2 bg-gray-100 rounded-full w-full overflow-hidden">
                                    <div className="h-full bg-primary w-3/4 rounded-full"></div>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Pronunciation</span>
                                    <span className="font-bold text-gray-900">85%</span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full w-full overflow-hidden">
                                    <div className="h-full bg-green-500 w-4/5 rounded-full"></div>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Fluency</span>
                                    <span className="font-bold text-gray-900">92%</span>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1 bg-gray-50 rounded-xl p-4">
                                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Feedback</p>
                                    <p className="text-sm text-gray-700">Great intonation! Try to focus on the ending sounds of past tense verbs.</p>
                                </div>
                            </div>
                        </div>

                        {/* Floating Badge */}
                        <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-xl shadow-lg border border-gray-100 flex items-center gap-3 animate-bounce">
                            <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg">
                                <Star className="w-6 h-6 fill-current" />
                            </div>
                            <div>
                                <p className="font-bold text-gray-900">AI Scoring</p>
                                <p className="text-xs text-gray-500">Real-time analysis</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-20 bg-gray-50">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center max-w-2xl mx-auto mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything you need to master English</h2>
                        <p className="text-gray-600">We combine advanced AI technology with proven learning methods.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <FeatureCard
                            icon={<Mic className="w-6 h-6 text-white" />}
                            color="bg-purple-500"
                            title="AI Speaking Coach"
                            desc="Get instant feedback on your pronunciation, intonation, and fluency from our AI engine."
                        />
                        <FeatureCard
                            icon={<LineChart className="w-6 h-6 text-white" />}
                            color="bg-blue-500"
                            title="Personalized Path"
                            desc="Our smart algorithm analyzes your weak points and creates a tailored curriculum for you."
                        />
                        <FeatureCard
                            icon={<BookOpen className="w-6 h-6 text-white" />}
                            color="bg-green-500"
                            title="Academic Content"
                            desc="High-quality lessons designed for university standards (IELTS, TOEIC preparation)."
                        />
                    </div>
                </div>
            </section>
        </div>
    );
};

const FeatureCard = ({ icon, color, title, desc }) => (
    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg transition-shadow duration-300">
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mb-6 shadow-md`}>
            {icon}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-600 leading-relaxed">
            {desc}
        </p>
    </div>
);

export default LandingPage;
