import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { lessonsService, speakingService } from '../services/api.service';
import AudioRecorder from '../components/AudioRecorder';

const LessonViewerPage = () => {
    const { lessonId } = useParams();
    const navigate = useNavigate();
    const [lesson, setLesson] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [answers, setAnswers] = useState({});
    const [result, setResult] = useState(null);

    useEffect(() => {
        loadLesson();
    }, [lessonId]);

    const loadLesson = async () => {
        try {
            const data = await lessonsService.getLessonById(lessonId);
            setLesson(data);
        } catch (error) {
            toast.error('Failed to load lesson');
        } finally {
            setLoading(false);
        }
    };

    const handleAnswerChange = (questionId, value) => {
        setAnswers({
            ...answers,
            [questionId]: value
        });
    };

    const handleAudioRecording = async (questionId, audioBlob) => {
        setSubmitting(true);
        try {
            const result = await speakingService.uploadAudio(questionId, audioBlob);
            toast.success(`Recording submitted! Score: ${result.overallScore?.toFixed(1) || 'Processing...'}`);

            // Show detailed feedback
            if (result.feedback) {
                setTimeout(() => {
                    toast.success(result.feedback, { duration: 5000 });
                }, 1000);
            }
        } catch (error) {
            toast.error('Failed to upload recording');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitAnswers = async () => {
        // Convert answers to API format
        const answerArray = Object.entries(answers).map(([questionId, value]) => ({
            QuestionID: parseInt(questionId),
            SelectedOptionID: typeof value === 'number' ? value : null,
            TextAnswer: typeof value === 'string' ? value : null,
        }));

        if (answerArray.length === 0) {
            toast.error('Please answer at least one question');
            return;
        }

        setSubmitting(true);
        try {
            const result = await lessonsService.submitAnswers(lesson.LessonID, answerArray);
            setResult(result);
            toast.success(`Score: ${result.percentageScore?.toFixed(1)}%`);

            // Show completion message
            if (result.isCompleted) {
                toast.success('🎉 Lesson completed! You earned coins!', { duration: 3000 });
            }
        } catch (error) {
            toast.error('Failed to submit answers');
        } finally {
            setSubmitting(false);
        }
    };

    const renderQuestion = (question, index) => {
        switch (question.QuestionType) {
            case 'MCQ':
            case 'TrueFalse':
                return (
                    <div key={question.QuestionID} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex gap-4 mb-4">
                            <div className="bg-blue-100 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center font-bold">
                                {index + 1}
                            </div>
                            <div className="flex-1">
                                <p className="text-gray-900 font-medium">{question.ContentText}</p>
                                {question.MediaURL && (
                                    <img src={question.MediaURL} alt="Question" className="mt-3 rounded-lg max-w-md" />
                                )}
                            </div>
                        </div>

                        <div className="space-y-2 ml-14">
                            {question.options?.map((option) => (
                                <label
                                    key={option.OptionID}
                                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition ${answers[question.QuestionID] === option.OptionID
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-blue-200'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name={`question-${question.QuestionID}`}
                                        value={option.OptionID}
                                        checked={answers[question.QuestionID] === option.OptionID}
                                        onChange={() => handleAnswerChange(question.QuestionID, option.OptionID)}
                                        className="w-5 h-5 text-blue-600"
                                    />
                                    <span className="ml-3 text-gray-700">{option.OptionText}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                );

            case 'ShortAnswer':
            case 'Essay':
                return (
                    <div key={question.QuestionID} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex gap-4 mb-4">
                            <div className="bg-purple-100 text-purple-600 w-10 h-10 rounded-lg flex items-center justify-center font-bold">
                                {index + 1}
                            </div>
                            <p className="flex-1 text-gray-900 font-medium">{question.ContentText}</p>
                        </div>

                        <textarea
                            value={answers[question.QuestionID] || ''}
                            onChange={(e) => handleAnswerChange(question.QuestionID, e.target.value)}
                            className="w-full ml-14 p-4 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                            placeholder="Type your answer here..."
                            rows={question.QuestionType === 'Essay' ? 8 : 3}
                        />
                    </div>
                );

            case 'Speaking':
                return (
                    <div key={question.QuestionID} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex gap-4 mb-6">
                            <div className="bg-red-100 text-red-600 w-10 h-10 rounded-lg flex items-center justify-center font-bold">
                                {index + 1}
                            </div>
                            <div className="flex-1">
                                <p className="text-gray-900 font-medium mb-2">{question.ContentText}</p>
                                <p className="text-sm text-gray-600">Record your answer speaking clearly</p>
                            </div>
                        </div>

                        <div className="ml-14">
                            <AudioRecorder
                                questionId={question.QuestionID}
                                onRecordingComplete={(blob) => handleAudioRecording(question.QuestionID, blob)}
                            />
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading lesson...</p>
                </div>
            </div>
        );
    }

    if (!lesson) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Lesson not found</h2>
                    <button onClick={() => navigate(-1)} className="text-blue-600 hover:underline">
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
            <div className="max-w-4xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                    </button>

                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                            {lesson.LessonType}
                        </span>
                        {lesson.Duration && (
                            <span className="text-sm text-gray-600 flex items-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"></path>
                                </svg>
                                {lesson.Duration} min
                            </span>
                        )}
                    </div>

                    <h1 className="text-3xl font-bold text-gray-900 mb-3">{lesson.Title}</h1>
                </div>

                {/* Lesson Content */}
                {(lesson.LessonType === 'Reading' || lesson.LessonType === 'Grammar') && lesson.ContentText && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
                        <div className="prose max-w-none">
                            <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                {lesson.ContentText}
                            </div>
                        </div>
                    </div>
                )}

                {(lesson.LessonType === 'Listening' && lesson.MediaURL) && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                        <h3 className="font-bold text-gray-900 mb-4">Listen to the audio</h3>
                        <audio src={lesson.MediaURL} controls className="w-full" />
                    </div>
                )}

                {/* Questions */}
                {lesson.questions && lesson.questions.length > 0 && (
                    <div className="space-y-6 mb-8">
                        <h2 className="text-2xl font-bold text-gray-900">Questions</h2>
                        {lesson.questions.map((question, index) => renderQuestion(question, index))}
                    </div>
                )}

                {/* Submit Button */}
                {lesson.questions?.some(q => q.QuestionType !== 'Speaking') && (
                    <div className="sticky bottom-4">
                        <button
                            onClick={handleSubmitAnswers}
                            disabled={submitting}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Submitting...' : 'Submit Answers'}
                        </button>
                    </div>
                )}

                {/* Result Display */}
                {result && (
                    <div className="mt-8 bg-white rounded-xl shadow-xl border-2 border-blue-200 p-8">
                        <div className="text-center mb-6">
                            <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 ${result.isCompleted ? 'bg-green-100' : 'bg-yellow-100'
                                }`}>
                                <span className={`text-4xl font-bold ${result.isCompleted ? 'text-green-600' : 'text-yellow-600'
                                    }`}>
                                    {result.percentageScore?.toFixed(0)}%
                                </span>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">
                                {result.isCompleted ? '🎉 Well Done!' : 'Keep Practicing!'}
                            </h3>
                            <p className="text-gray-600">
                                You scored {result.totalScore} out of {result.maxScore} points
                            </p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{result.totalScore}</div>
                                <div className="text-sm text-gray-600">Points Earned</div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{result.percentageScore?.toFixed(1)}%</div>
                                <div className="text-sm text-gray-600">Accuracy</div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="text-2xl font-bold text-green-600">
                                    {result.isCompleted ? '+10' : '0'}
                                </div>
                                <div className="text-sm text-gray-600">Coins</div>
                            </div>
                        </div>

                        <button
                            onClick={() => navigate(-1)}
                            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition"
                        >
                            Continue Learning
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LessonViewerPage;
