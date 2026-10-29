import React, { useState } from 'react';
import { Spin, message } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { DictationSetupCard } from '../components/DictationSetupCard';
import { DictationRunner } from '../components/DictationRunner';
import { DictationSummaryCard } from '../components/DictationSummaryCard';
import { dictationService } from '../services/dictation.service';
import type {
    DictationExercise,
    DictationGenerateRequest,
    SentenceEvaluation,
} from '../types/dictation.types';

export const DictationPage: React.FC = () => {
    const [stage, setStage] = useState<'setup' | 'runner' | 'summary'>('setup');
    const [exercise, setExercise] = useState<DictationExercise | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [chosenVoiceId, setChosenVoiceId] = useState<string>('en-US-JennyNeural');
    const [evaluations, setEvaluations] = useState<SentenceEvaluation[]>([]);
    const [userInputs, setUserInputs] = useState<string[]>([]);

    const handleStartGenerate = async (request: DictationGenerateRequest, voiceId: string) => {
        setIsLoading(true);
        setChosenVoiceId(voiceId);

        try {
            const data = await dictationService.generateExercise(request);
            setExercise(data);
            setStage('runner');
        } catch (error) {
            console.error('Failed to generate dictation:', error);
            message.error('Không thể kết nối máy chủ AI. Đang khởi tạo bài mẫu offline...');
            // In case of complete network cut, provide offline fallback
            const fallback: DictationExercise = {
                format: request.format,
                topic: request.topic,
                level: request.level,
                title: 'Luyện nghe chép chính tả hàng ngày',
                items: [
                    {
                        id: 1,
                        sentence: 'She decided to apply for a scholarship to study environmental science abroad.',
                        translation: 'Cô ấy quyết định nộp hồ sơ xin học bổng để đi du học ngành khoa học môi trường.',
                        blindSpots: ['to', 'for', 'a'],
                        focusWord: 'scholarship',
                        focusWordDefinition: 'Học bổng tài trợ',
                    },
                    {
                        id: 2,
                        sentence: 'The research project will provide valuable insights into renewable energy solutions.',
                        translation: 'Dự án nghiên cứu này sẽ cung cấp những góc nhìn giá trị về các giải pháp năng lượng tái tạo.',
                        blindSpots: ['the', 'into'],
                        focusWord: 'renewable energy',
                        focusWordDefinition: 'Năng lượng tái tạo',
                    },
                    {
                        id: 3,
                        sentence: 'Effective communication is essential for teamwork in the modern workplace.',
                        translation: 'Giao tiếp hiệu quả là điều cốt lõi cho làm việc nhóm tại môi trường làm việc hiện đại.',
                        blindSpots: ['is', 'for', 'in', 'the'],
                        focusWord: 'communication',
                        focusWordDefinition: 'Kỹ năng giao tiếp',
                    },
                ],
            };
            setExercise(fallback);
            setStage('runner');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRunnerFinish = (results: SentenceEvaluation[], inputs: string[]) => {
        setEvaluations(results);
        setUserInputs(inputs);
        setStage('summary');
    };

    const handleRetry = () => {
        setEvaluations([]);
        setUserInputs([]);
        setStage('runner');
    };

    const handleNewExercise = () => {
        setExercise(null);
        setEvaluations([]);
        setUserInputs([]);
        setStage('setup');
    };

    return (
        <div style={{ minHeight: '100%', padding: '20px 24px', maxWidth: 1268, margin: '0 auto', width: '100%' }}>
            <Spin spinning={isLoading} tip="AI đang tổng hợp và sinh ngữ cảnh bài nghe tự nhiên..." size="large">
                <AnimatePresence mode="wait">
                    {stage === 'setup' && (
                        <motion.div
                            key="setup"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.2 }}
                        >
                            <DictationSetupCard onStart={handleStartGenerate} isLoading={isLoading} />
                        </motion.div>
                    )}

                    {stage === 'runner' && exercise && (
                        <motion.div
                            key="runner"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <DictationRunner
                                exercise={exercise}
                                initialVoiceId={chosenVoiceId}
                                onFinish={handleRunnerFinish}
                                onExit={() => setStage('setup')}
                            />
                        </motion.div>
                    )}

                    {stage === 'summary' && exercise && (
                        <motion.div
                            key="summary"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <DictationSummaryCard
                                exercise={exercise}
                                evaluations={evaluations}
                                userInputs={userInputs}
                                onRetry={handleRetry}
                                onNewExercise={handleNewExercise}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </Spin>
        </div>
    );
};

export default DictationPage;

