import React from 'react';
import { Button, Space } from 'antd';
import {
    ArrowRightOutlined,
    CheckCircleOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    SoundOutlined,
} from '@ant-design/icons';

interface SpeakingResponseControlsProps {
    isTransitioning: boolean;
    isNextRunning: boolean;
    nextBlinkerVisible: boolean;
    hasNextPrompt: boolean;
    handleNextTransition: () => void;
    isPreparingPromptPlayback: boolean;
    promptPlaybackQuestionId: string | null;
    activeQuestionId: string;
    isRecording: boolean;
    isPromptPlaying: boolean;
    isExaminerLeadingActivePrompt: boolean;
    systemCheckReady: boolean;
    isUploadingActivePrompt: boolean;
    isPreparationBlockingRecording: boolean;
    isPreparationReadyToRecord: boolean;
    preparationLimitSeconds: number;
    hasPreparationStarted: boolean;
    preparationRemainingSeconds: number;
    onReplayPrompt: () => void;
    onStopPromptPlayback: () => void;
    onStopRecording: () => void;
    onBeginResponseTurn: () => void;
}

export const SpeakingResponseControls: React.FC<SpeakingResponseControlsProps> = ({
    isTransitioning,
    isNextRunning,
    nextBlinkerVisible,
    hasNextPrompt,
    handleNextTransition,
    isPreparingPromptPlayback,
    promptPlaybackQuestionId,
    activeQuestionId,
    isRecording,
    isPromptPlaying,
    isExaminerLeadingActivePrompt,
    systemCheckReady,
    isUploadingActivePrompt,
    isPreparationBlockingRecording,
    isPreparationReadyToRecord,
    preparationLimitSeconds,
    hasPreparationStarted,
    preparationRemainingSeconds,
    onReplayPrompt,
    onStopPromptPlayback,
    onStopRecording,
    onBeginResponseTurn,
}) => {
    if (isTransitioning) {
        return (
            <Space wrap>
                <Button
                    type="primary"
                    size="large"
                    className={
                        isNextRunning
                            ? hasNextPrompt
                                ? 'speaking-next-btn-progress'
                                : 'speaking-next-btn-progress-success'
                            : nextBlinkerVisible
                              ? hasNextPrompt
                                  ? 'speaking-next-btn-blink'
                                  : 'speaking-next-btn-blink-success'
                              : ''
                    }
                    disabled={!nextBlinkerVisible && !isNextRunning}
                    icon={isNextRunning ? null : hasNextPrompt ? <ArrowRightOutlined /> : <CheckCircleOutlined />}
                    onClick={handleNextTransition}
                    style={{
                        height: 48,
                        borderRadius: 16,
                        paddingInline: 28,
                        fontWeight: 700,
                        fontSize: '0.98rem',
                        pointerEvents: isNextRunning ? 'none' : 'auto',
                        background: hasNextPrompt
                            ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                            : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        border: 'none',
                        boxShadow:
                            nextBlinkerVisible && !isNextRunning
                                ? hasNextPrompt
                                    ? '0 0 15px rgba(37, 99, 235, 0.5)'
                                    : '0 0 15px rgba(16, 185, 129, 0.5)'
                                : 'none',
                    }}
                >
                    {isNextRunning
                        ? hasNextPrompt
                            ? 'Đang chuẩn bị câu hỏi tiếp theo...'
                            : 'Đang chuẩn bị màn nộp bài...'
                        : hasNextPrompt
                          ? nextBlinkerVisible
                              ? 'Chuyển sang câu tiếp theo'
                              : 'Examiner đang chuyển tiếp...'
                          : nextBlinkerVisible
                            ? 'Hoàn thành & Xem màn nộp bài'
                            : 'Examiner đang kết thúc...'}
                </Button>
            </Space>
        );
    }

    return (
        <Space wrap>
            <Button
                icon={<SoundOutlined />}
                loading={isPreparingPromptPlayback && promptPlaybackQuestionId === activeQuestionId}
                disabled={isRecording || isExaminerLeadingActivePrompt}
                onClick={() => {
                    if (isPromptPlaying && promptPlaybackQuestionId === activeQuestionId) {
                        onStopPromptPlayback();
                        return;
                    }

                    onReplayPrompt();
                }}
            >
                {isPromptPlaying && promptPlaybackQuestionId === activeQuestionId
                    ? 'Dừng examiner'
                    : 'Nghe lại examiner'}
            </Button>
            <Button
                type={isRecording ? 'default' : 'primary'}
                danger={isRecording}
                disabled={!isRecording && (!systemCheckReady || isUploadingActivePrompt || isPreparationBlockingRecording)}
                icon={isRecording ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => {
                    if (isRecording) {
                        onStopRecording();
                    } else {
                        onBeginResponseTurn();
                    }
                }}
                loading={isExaminerLeadingActivePrompt && (isPreparingPromptPlayback || isPromptPlaying)}
            >
                {isRecording
                    ? 'Dừng ghi âm'
                    : isPreparationBlockingRecording
                      ? `Chờ hết prep (${preparationRemainingSeconds}s)`
                      : isPreparationReadyToRecord
                        ? 'Bắt đầu ghi âm'
                        : isExaminerLeadingActivePrompt
                          ? 'Examiner đang hỏi...'
                          : preparationLimitSeconds > 0 && !hasPreparationStarted
                            ? 'Nghe examiner để bắt đầu prep'
                            : 'Nghe examiner rồi trả lời'}
            </Button>
        </Space>
    );
};

