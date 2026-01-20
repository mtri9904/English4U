import React from 'react';
import Card from '../components/common/Card';
import { CheckCircle2, Lock, Play, MapPin } from 'lucide-react';

const LearningPathPage = () => {
    const steps = [
        { id: 1, title: 'Introduction & Assessment', status: 'completed', desc: 'Initial placement test' },
        { id: 2, title: 'Basic Grammar Foundation', status: 'completed', desc: 'Present tense fundamentals' },
        { id: 3, title: 'Daily Communication Vocabulary', status: 'current', desc: 'Common phrases for campus life' },
        { id: 4, title: 'Listening Practice: University Life', status: 'locked', desc: '' },
        { id: 5, title: 'Speaking: Self Introduction', status: 'locked', desc: '' },
        { id: 6, title: 'First Milestone Exam', status: 'locked', isExam: true, desc: '' },
    ];

    return (
        <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="text-left mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Your Learning Path</h1>
                <p className="text-gray-500">Follow this AI-generated roadmap to reach IELTS 6.5</p>
            </div>

            <div className="relative">
                {/* Connecting Line */}
                <div className="absolute left-6 top-4 bottom-4 w-1 bg-gray-200 -z-10"></div>

                <div className="space-y-8">
                    {steps.map((step, index) => (
                        <div key={step.id} className={`flex items-start gap-4 ${step.status === 'locked' ? 'opacity-50 grayscale' : ''}`}>
                            {/* Icon Node */}
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm z-10 transition-transform hover:scale-110 
                        ${step.status === 'completed' ? 'bg-green-500 text-white' :
                                    step.status === 'current' ? 'bg-primary text-white ring-4 ring-blue-100' : 'bg-gray-200 text-gray-400'}`}>
                                {step.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> :
                                    step.status === 'current' ? <Play className="w-5 h-5 fill-current ml-0.5" /> :
                                        <Lock className="w-5 h-5" />}
                            </div>

                            {/* Content Card */}
                            <Card hoverable className={`flex-1 p-5 relative ${step.status === 'current' ? 'border-primary border-2 shadow-lg' : ''}`}>
                                {step.status === 'current' && (
                                    <span className="absolute -top-3 right-4 bg-primary text-white text-xs font-bold px-2 py-1 rounded-full animate-bounce">
                                        Next Up
                                    </span>
                                )}
                                <h3 className="font-bold text-gray-900 text-lg mb-1">{step.title}</h3>
                                {step.desc && <p className="text-sm text-gray-500">{step.desc}</p>}

                                {step.status === 'current' && (
                                    <button className="mt-4 w-full py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors">
                                        Start Lesson
                                    </button>
                                )}
                            </Card>
                        </div>
                    ))}
                </div>

                <div className="flex items-start gap-4 mt-8 opacity-50">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center border-4 border-white shadow-sm z-10">
                        <MapPin className="w-6 h-6 text-gray-400" />
                    </div>
                    <div className="pt-3">
                        <p className="font-bold text-gray-400 italic">And many more tailored lessons...</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LearningPathPage;
