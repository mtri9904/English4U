import { type FC } from 'react';
import { createPortal } from 'react-dom';
import { BulbOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Space } from 'antd';
import type { PracticeSessionDto, PracticeSessionResultDto } from '../../types/session.types';
import { ReviewCopilotDrawer } from '../ReviewCopilotDrawer';
import { useSpeakingReviewCopilot } from '../../hooks/useSpeakingReviewCopilot';
import { getSpeakingPromptEntries } from './speakingSessionReview.utils';
import { SpeakingReviewHeaderCard } from './SpeakingReviewHeaderCard';
import { SpeakingPromptCard } from './SpeakingPromptCard';

interface SpeakingSessionReviewProps {
    session: PracticeSessionDto;
    result: PracticeSessionResultDto | null;
    canSubmitNow: boolean;
    submitLoading: boolean;
    headerSlot?: HTMLElement | null;
    onSubmit: () => void;
    onBackToRunner: () => void;
    onBackToLibrary: () => void;
}

export const SpeakingSessionReview: FC<SpeakingSessionReviewProps> = ({
    session,
    result,
    canSubmitNow,
    submitLoading,
    headerSlot,
    onSubmit,
    onBackToRunner,
    onBackToLibrary,
}) => {
    const {
        baseContext,
        copilotOpen,
        setCopilotOpen,
        copilotMessages,
        copilotDraftMessage,
        setCopilotDraftMessage,
        copilotStreamingMessageId,
        copilotErrorMessage,
        copilotFocuses,
        setCopilotFocuses,
        copilotComposerFocusSignal,
        setCopilotComposerFocusSignal,
        copilotReservedWidth,
        setCopilotReservedWidth,
        stopCopilotStream,
        handleSendCopilotMessage,
    } = useSpeakingReviewCopilot({ session });

    const promptEntries = getSpeakingPromptEntries(session);
    const isRescoreMode = session.status !== 'InProgress';
    const speakingAnswers = new Map(
        session.answers
            .filter((answer) => !!answer.speakingQuestionId)
            .map((answer) => [answer.speakingQuestionId!, answer]),
    );

    return (
        <>
            {headerSlot && result?.speakingScore != null ? createPortal(
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        minWidth: 0,
                        width: 'auto',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        flex: '0 0 auto',
                    }}
                >
                    <Button
                        type="text"
                        onClick={() => setCopilotOpen((prev) => !prev)}
                        style={{
                            height: 40,
                            marginLeft: 10,
                            paddingInline: 16,
                            borderRadius: 999,
                            border: copilotOpen ? '1px solid #93c5fd' : '1px solid #dbeafe',
                            background: copilotOpen
                                ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                                : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            boxShadow: copilotOpen
                                ? '0 8px 18px rgba(59, 130, 246, 0.18)'
                                : '0 6px 14px rgba(15, 23, 42, 0.06)',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <Space size={8}>
                            <BulbOutlined />
                            <span>Hỏi AI</span>
                        </Space>
                    </Button>
                </div>,
                headerSlot,
            ) : null}

            <div
                style={{
                    width: '100%',
                    paddingRight: copilotOpen ? copilotReservedWidth : 0,
                    transition: 'padding-right 0.2s ease',
                }}
            >
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    <SpeakingReviewHeaderCard
                        session={session}
                        result={result}
                        promptCount={promptEntries.length}
                        canSubmitNow={canSubmitNow}
                        submitLoading={submitLoading}
                        isRescoreMode={isRescoreMode}
                        onSubmit={onSubmit}
                        onBackToRunner={onBackToRunner}
                        onBackToLibrary={onBackToLibrary}
                    />

                    {promptEntries.length === 0 ? (
                        <Card style={{ borderRadius: 24 }}>
                            <Empty description="Session này chưa có speaking prompt." />
                        </Card>
                    ) : (
                        promptEntries.map((entry) => (
                            <SpeakingPromptCard
                                key={entry.question.id}
                                entry={entry}
                                answer={speakingAnswers.get(entry.question.id)}
                                hasSpeakingScore={result?.speakingScore != null}
                                onFocusCopilot={(focusPayload) => {
                                    setCopilotFocuses([focusPayload]);
                                    setCopilotOpen(true);
                                    setCopilotComposerFocusSignal((prev) => prev + 1);
                                }}
                            />
                        ))
                    )}
                </Space>
            </div>

            <ReviewCopilotDrawer
                open={copilotOpen}
                loadingContext={false}
                context={baseContext}
                messages={copilotMessages}
                draftMessage={copilotDraftMessage}
                isStreaming={!!copilotStreamingMessageId}
                errorMessage={copilotErrorMessage}
                focusComposerSignal={copilotComposerFocusSignal}
                focusChips={copilotFocuses}
                onClose={() => {
                    stopCopilotStream();
                    setCopilotOpen(false);
                }}
                onDraftChange={setCopilotDraftMessage}
                onSendMessage={handleSendCopilotMessage}
                onStopStreaming={stopCopilotStream}
                onClearFocus={() => setCopilotFocuses([])}
                onRemoveFocus={(focusToRemove) =>
                    setCopilotFocuses((current) =>
                        current.filter((focus) => focus.label !== focusToRemove.label),
                    )
                }
                onClearSelection={() => { }}
                selectionChipLabel=""
                onReservedWidthChange={setCopilotReservedWidth}
            />
        </>
    );
};
