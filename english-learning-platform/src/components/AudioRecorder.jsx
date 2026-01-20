import React, { useState, useRef, useEffect } from 'react';

const AudioRecorder = ({ onRecordingComplete, questionId }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [audioBlob, setAudioBlob] = useState(null);
    const [audioURL, setAudioURL] = useState(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, []);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                setAudioBlob(blob);
                setAudioURL(url);

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            setRecordingTime(0);

            // Start timer
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Cannot access microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
    };

    const resetRecording = () => {
        setAudioBlob(null);
        setAudioURL(null);
        setRecordingTime(0);
    };

    const submitRecording = () => {
        if (audioBlob && onRecordingComplete) {
            onRecordingComplete(audioBlob);
        }
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-gray-900">Voice Recorder</h3>
                <div className="text-2xl font-mono text-blue-600">{formatTime(recordingTime)}</div>
            </div>

            {/* Waveform Animation (when recording) */}
            {isRecording && (
                <div className="flex items-center justify-center gap-1 h-20 mb-6">
                    {[...Array(20)].map((_, i) => (
                        <div
                            key={i}
                            className="w-1 bg-blue-500 rounded-full animate-pulse"
                            style={{
                                height: `${Math.random() * 100}%`,
                                animationDelay: `${i * 0.05}s`,
                                animationDuration: '0.8s'
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Audio Player (when recorded) */}
            {audioURL && !isRecording && (
                <div className="mb-6">
                    <audio src={audioURL} controls className="w-full" />
                </div>
            )}

            {/* Recording Status */}
            <div className="flex items-center justify-center gap-2 mb-6">
                {isRecording && (
                    <div className="flex items-center gap-2 text-red-500">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="font-medium">Recording...</span>
                    </div>
                )}
                {audioBlob && !isRecording && (
                    <div className="flex items-center gap-2 text-green-500">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                        </svg>
                        <span className="font-medium">Recording complete!</span>
                    </div>
                )}
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3">
                {!isRecording && !audioBlob && (
                    <button
                        onClick={startRecording}
                        className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"></path>
                        </svg>
                        Start Recording
                    </button>
                )}

                {isRecording && (
                    <button
                        onClick={stopRecording}
                        className="flex-1 bg-gray-800 hover:bg-gray-900 text-white font-medium py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path>
                        </svg>
                        Stop
                    </button>
                )}

                {audioBlob && !isRecording && (
                    <>
                        <button
                            onClick={resetRecording}
                            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-3 px-6 rounded-lg transition"
                        >
                            Record Again
                        </button>
                        <button
                            onClick={submitRecording}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                            </svg>
                            Submit Recording
                        </button>
                    </>
                )}
            </div>

            {/* Microphone Permission Info */}
            <p className="text-xs text-gray-500 text-center mt-4">
                Make sure to allow microphone access when prompted by your browser
            </p>
        </div>
    );
};

export default AudioRecorder;
