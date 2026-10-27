import { useEffect, useState } from 'react';
import { Button, Card, Col, Empty, Row, Space, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { isSpeakingSkill } from '../utils/sessionRouting.utils';
import { getNextPromptQuestionId } from '../utils/speakingSession.utils';
import { SpeakingAvatarCanvas } from '../components/speaking/SpeakingAvatarCanvas';
import { speakingRunnerStyles } from '../styles/speakingRunner.styles';
import { SpeakingRunnerToolbar } from '../components/speaking/SpeakingRunnerToolbar';
import { SpeakingPromptSidebar } from '../components/speaking/SpeakingPromptSidebar';
import { SpeakingPromptDetailsCard } from '../components/speaking/SpeakingPromptDetailsCard';
import { SpeakingResponseControls } from '../components/speaking/SpeakingResponseControls';
import { SpeakingTranscriptAndAnalytics } from '../components/speaking/SpeakingTranscriptAndAnalytics';
import { useSpeakingSessionRunner } from '../hooks/useSpeakingSessionRunner';

const { Paragraph } = Typography;

export const ClientSpeakingSessionPage = () => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    const {
        session,
        isLoading,
        isError,
        promptEntries,
        activePrompt,
        activeQuestionId,
        setSelectedQuestionId,
        lockedPart2QuestionIds,
        uploadingQuestionIds,
        hasPromptResponse,
        hasResolvedTranscriptOrAnalytics,
        setCueCardDrafts,
        timerText,
        isTransitioning,
        nextBlinkerVisible,
        transitionText,
        isNextRunning,
        handleNextTransition,
        audioLevel,
        promptAudioLevel,
        isRecording,
        isPromptPlaying,
        isPreparingPromptPlayback,
        promptPlaybackQuestionId,
        activeViseme,
        promptPlaybackMode,
        stopPromptPlayback,
        handleReplayPrompt,
        handleBeginResponseTurn,
        handleStopRecording,
        systemCheckReady,
        isUploadingActivePrompt,
        isExaminerLeadingActivePrompt,
        isPreparationBlockingRecording,
        isPreparationReadyToRecord,
        preparationLimitSeconds,
        hasPreparationStarted,
        preparationRemainingSeconds,
        activeCueCardPoints,
        activeCueCardDraft,
        activeTranscriptText,
        activeSpeakingAnalytics,
        activeSavedAnswer,
    } = useSpeakingSessionRunner(sessionId);

    if (isLoading) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Paragraph style={{ margin: 0 }}>Đang tải speaking session...</Paragraph>
            </Card>
        );
    }

    if (isError || !session) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Không tìm thấy speaking session."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay về bài thi của tôi
                    </Button>
                </Empty>
            </Card>
        );
    }

    if (!isSpeakingSkill(session.skillType) || promptEntries.length === 0 || !activePrompt) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Session này không phải speaking runner hoặc chưa có prompt speaking."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay về bài thi của tôi
                    </Button>
                </Empty>
            </Card>
        );
    }

    const hasNextPrompt = !!getNextPromptQuestionId(promptEntries, activeQuestionId);

    return (
        <>
            <SpeakingRunnerToolbar
                headerSlot={headerSlot}
                examTitle={session.examTitle}
                skillType={session.skillType}
                activePartNumber={activePrompt.partNumber}
                timerText={timerText}
                onBack={() => navigate('/app/my-exams')}
                onSubmitClick={() => navigate(`/app/sessions/${sessionId}/submit`)}
            />

            <div style={{ width: '100%', padding: '8px 8px 46px' }}>
                <style>{speakingRunnerStyles}</style>

                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    <Row gutter={[16, 16]} className="speaking-runner-main-grid">
                        <SpeakingPromptSidebar
                            promptEntries={promptEntries}
                            activeQuestionId={activeQuestionId}
                            lockedPart2QuestionIds={lockedPart2QuestionIds}
                            uploadingQuestionIds={uploadingQuestionIds}
                            hasPromptResponse={hasPromptResponse}
                            hasResolvedTranscriptOrAnalytics={hasResolvedTranscriptOrAnalytics}
                            isRecording={isRecording}
                            isPreparingPromptPlayback={isPreparingPromptPlayback}
                            isPromptPlaying={isPromptPlaying}
                            hasQueuedAutoRecording={isExaminerLeadingActivePrompt}
                            isTransitioning={isTransitioning}
                            onSelectPrompt={(qId) => setSelectedQuestionId(qId)}
                        />

                        <Col xs={24} xl={16}>
                            <Space direction="vertical" size={16} className="speaking-runner-right-stack">
                                <Card style={{ borderRadius: 20 }}>
                                    <SpeakingAvatarCanvas
                                        microphoneLevel={audioLevel}
                                        promptAudioLevel={promptAudioLevel}
                                        isPromptPlaying={isPromptPlaying && (promptPlaybackQuestionId === activeQuestionId || promptPlaybackQuestionId === 'transition')}
                                        isRecording={isRecording}
                                        promptText={promptPlaybackQuestionId === 'transition' ? transitionText : activePrompt.question.content}
                                        activeViseme={activeViseme}
                                        playbackMode={promptPlaybackMode}
                                    />
                                </Card>

                                <Card style={{ borderRadius: 20 }}>
                                    <Space direction="vertical" size={18} style={{ width: '100%' }}>
                                        <SpeakingPromptDetailsCard
                                            activePrompt={activePrompt}
                                            preparationLimitSeconds={preparationLimitSeconds}
                                            hasPreparationStarted={hasPreparationStarted}
                                            preparationRemainingSeconds={preparationRemainingSeconds}
                                            activeCueCardPoints={activeCueCardPoints}
                                            activeCueCardDraft={activeCueCardDraft}
                                            onDraftChange={(val) =>
                                                setCueCardDrafts((current) => ({
                                                    ...current,
                                                    [activePrompt.partId]: val,
                                                }))
                                            }
                                        />

                                        <SpeakingResponseControls
                                            isTransitioning={isTransitioning}
                                            isNextRunning={isNextRunning}
                                            nextBlinkerVisible={nextBlinkerVisible}
                                            hasNextPrompt={hasNextPrompt}
                                            handleNextTransition={handleNextTransition}
                                            isPreparingPromptPlayback={isPreparingPromptPlayback}
                                            promptPlaybackQuestionId={promptPlaybackQuestionId}
                                            activeQuestionId={activeQuestionId}
                                            isRecording={isRecording}
                                            isPromptPlaying={isPromptPlaying}
                                            isExaminerLeadingActivePrompt={isExaminerLeadingActivePrompt}
                                            systemCheckReady={systemCheckReady}
                                            isUploadingActivePrompt={isUploadingActivePrompt}
                                            isPreparationBlockingRecording={isPreparationBlockingRecording}
                                            isPreparationReadyToRecord={isPreparationReadyToRecord}
                                            preparationLimitSeconds={preparationLimitSeconds}
                                            hasPreparationStarted={hasPreparationStarted}
                                            preparationRemainingSeconds={preparationRemainingSeconds}
                                            onReplayPrompt={() => void handleReplayPrompt(activePrompt)}
                                            onStopPromptPlayback={stopPromptPlayback}
                                            onStopRecording={() => void handleStopRecording()}
                                            onBeginResponseTurn={() => void handleBeginResponseTurn()}
                                        />

                                        <SpeakingTranscriptAndAnalytics
                                            isExaminerLeadingActivePrompt={isExaminerLeadingActivePrompt}
                                            isUploadingActivePrompt={isUploadingActivePrompt}
                                            activeTranscriptText={activeTranscriptText}
                                            activeSpeakingAnalytics={activeSpeakingAnalytics}
                                            activeSavedAnswer={activeSavedAnswer}
                                            activeQuestionId={activeQuestionId}
                                        />
                                    </Space>
                                </Card>
                            </Space>
                        </Col>
                    </Row>
                </Space>
            </div>
        </>
    );
};

export const SpeakingSessionPage = ClientSpeakingSessionPage;
