import React, { useState } from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import { Mic, Play, RefreshCw, Award } from 'lucide-react';

const PracticePage = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [hasResult, setHasResult] = useState(false);

    const toggleRecord = () => {
        if (!isRecording) {
            setIsRecording(true);
            setHasResult(false);
            // Simulate recording duration
            setTimeout(() => {
                setIsRecording(false);
                setHasResult(true);
            }, 3000);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Speaking Practice</h1>
                <p className="text-gray-500 mt-2">Topic: Describing a Memorable Event</p>
            </div>

            {/* Question Card */}
            <Card className="p-8 text-center bg-gradient-to-br from-blue-50 to-white border-blue-100">
                <h2 className="text-xl font-medium text-gray-800 italic mb-6">
                    "Describe a time when you helped someone. Who did you help and why?"
                </h2>

                <Button variant="secondary" size="sm" className="gap-2">
                    <Play className="w-4 h-4" /> Listen to Sample Answer
                </Button>
            </Card>

            {/* Interaction Area */}
            <div className="flex flex-col items-center justify-center py-10">
                <div className="relative">
                    {isRecording && (
                        <div className="absolute inset-0 rounded-full bg-red-100 animate-ping"></div>
                    )}
                    <button
                        onClick={toggleRecord}
                        className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 
                     ${isRecording ? 'bg-red-500 text-white' : 'bg-primary text-white'}`}
                    >
                        <Mic className={`w-10 h-10 ${isRecording ? 'animate-pulse' : ''}`} />
                    </button>
                </div>
                <p className="mt-6 text-gray-500 font-medium">
                    {isRecording ? 'Listening...' : 'Tap microphone to start'}
                </p>
            </div>

            {/* Result Section (Simulated) */}
            {hasResult && (
                <div className="animate-in slide-in-from-bottom-8 duration-500">
                    <Card className="border-green-100 overflow-hidden">
                        <div className="bg-green-50 p-4 border-b border-green-100 flex items-center justify-between">
                            <span className="font-bold text-green-800 flex items-center gap-2">
                                <Award className="w-5 h-5" /> AI Assessment Complete
                            </span>
                            <span className="text-2xl font-bold text-green-700">85/100</span>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <ScoreBar label="Pronunciation" score={80} color="bg-blue-500" />
                                <ScoreBar label="Fluency" score={90} color="bg-green-500" />
                                <ScoreBar label="Grammar" score={75} color="bg-purple-500" />
                                <ScoreBar label="Vocabulary" score={85} color="bg-orange-500" />
                            </div>
                            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
                                <p className="font-bold text-gray-900 mb-2">AI Feedback:</p>
                                <p>Great job! You spoke clearly and maintained a good pace. However, watch out for the pronunciation of <b>"specifically"</b> and try to use more complex transitions than just "and then".</p>
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 flex justify-end">
                            <Button variant="secondary" onClick={() => setHasResult(false)} className="gap-2">
                                <RefreshCw className="w-4 h-4" /> Try Again
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

const ScoreBar = ({ label, score, color }) => (
    <div>
        <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-gray-600">{label}</span>
            <span className="font-bold text-gray-900">{score}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${score}%` }}></div>
        </div>
    </div>
);

export default PracticePage;
