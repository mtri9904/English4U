import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Empty,
    Space,
    Typography,
} from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { ReviewCopilotDrawer } from './ReviewCopilotDrawer';
import {
    buildObjectiveAnswerMap,
    buildObjectiveReviewAnswerMap,
} from '../utils/sessionReview.utils';
import { getSharedListeningReviewAudioUrl } from '../utils/reviewCopilot.utils';
import { isObjectiveSkill } from '../utils/sessionRouting.utils';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import { ListeningBody, ReadingBody } from '@/features/exam-taking/pages/ObjectiveSessionRunnerPage';
import { useObjectiveReviewCopilot } from '../hooks/useObjectiveReviewCopilot';
import { ObjectiveReviewAudioPlayer } from './review/ObjectiveReviewAudioPlayer';
import { ObjectiveReviewNavigation } from './review/ObjectiveReviewNavigation';
import { ObjectiveReviewHeaderBar } from './review/ObjectiveReviewHeaderBar';

const { Title } = Typography;

export const ObjectiveSessionReviewRunner = ({
    session,
    onCopilotLayoutChange,
}: {
    session: PracticeSessionDto;
    onCopilotLayoutChange?: (state: { open: boolean; reservedWidth: number }) => void;
}) => {
    const skillType = session.skillType.trim().toUpperCase();
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

    const sections = useMemo(
        () => session.exam.sections.filter((section) => section.skillType.trim().toUpperCase() === skillType),
        [session.exam.sections, skillType],
    );

    const readingPassages = useMemo(
        () => sections.flatMap((section) => section.readingPassages),
        [sections],
    );

    const listeningParts = useMemo(
        () => sections.flatMap((section) => section.listeningParts),
        [sections],
    );

    const sharedListeningAudioUrl = useMemo(
        () => getSharedListeningReviewAudioUrl(listeningParts),
        [listeningParts],
    );

    const navigationItems = skillType === 'READING' ? readingPassages : listeningParts;
    const answerMap = useMemo(() => buildObjectiveAnswerMap(session), [session]);
    const reviewAnswerMap = useMemo(() => buildObjectiveReviewAnswerMap(session), [session]);

    const {
        copilotOpen,
        copilotLoadingContext,
        copilotErrorMessage,
        copilotDraftMessage,
        copilotMessages,
        copilotFocuses,
        copilotComposerFocusSignal,
        copilotStreamingMessageId,
        copilotContext,
        copilotSelectionChipLabel,
        reviewListeningAudioRef,
        setCopilotDraftMessage,
        setCopilotFocuses,
        setCopilotSelectedText,
        setCopilotReservedWidth,
        openCopilot,
        handleCloseCopilot,
        handleSendCopilotMessage,
        stopCopilotStream,
        handlePlayReplayAction,
        handleFocusQuestionCopilot,
    } = useObjectiveReviewCopilot({
        session,
        skillType,
        activeItemIndex,
        readingPassages,
        listeningParts,
        sharedListeningAudioUrl,
        answerMap,
        reviewAnswerMap,
        onCopilotLayoutChange,
    });

    useEffect(() => {
        setActiveItemIndex((current) => {
            if (navigationItems.length === 0) {
                return 0;
            }

            return Math.min(current, navigationItems.length - 1);
        });
    }, [navigationItems.length]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    const handleNavigationItemChange = (index: number) => {
        setActiveItemIndex(index);
        window.requestAnimationFrame(() => {
            document.getElementById('runner-active-section')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
                inline: 'nearest',
            });
        });
    };

    const renderQuestionAction = isObjectiveSkill(session.skillType)
        ? ({
            group,
            question,
            reviewAnswer,
            compact,
        }: {
            group: PracticeSessionQuestionGroupDto;
            question: PracticeSessionQuestionDto;
            reviewAnswer?: PracticeSessionAnswerDto;
            compact?: boolean;
        }) => {
            return (
                <Button
                    size="small"
                    icon={<RobotOutlined style={{ color: '#8b5cf6' }} />}
                    onClick={() => handleFocusQuestionCopilot({ group, question, reviewAnswer })}
                    className="hover:scale-102 hover:shadow-md transition-all duration-200"
                    style={{
                        borderRadius: 999,
                        fontWeight: 600,
                        borderColor: '#c084fc',
                        background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                        color: '#7e22ce',
                        boxShadow: '0 4px 10px rgba(168, 85, 247, 0.08)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}
                >
                    Hỏi AI
                </Button>
            );
        }
        : undefined;

    if (navigationItems.length === 0) {
        return (
            <Card style={{ borderRadius: 22 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có dữ liệu đề để xem lại." />
            </Card>
        );
    }

    return (
        <>
            <ObjectiveReviewHeaderBar
                headerSlot={headerSlot}
                copilotOpen={copilotOpen}
                onToggleCopilot={() => (copilotOpen ? handleCloseCopilot() : openCopilot(null))}
            />

            <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {skillType === 'LISTENING' && (
                    <ObjectiveReviewAudioPlayer
                        audioRef={reviewListeningAudioRef}
                        audioUrl={sharedListeningAudioUrl}
                    />
                )}

                <Card style={{ borderRadius: 22 }}>
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <div>
                            <Title level={4} style={{ margin: 0 }}>Xem lại bài làm</Title>
                        </div>

                        <div className="runner-review-shell">
                            <style>{`
                            .runner-review-shell .runner-split-layout {
                                display: grid;
                                grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                                align-items: stretch;
                                height: calc(100vh - 190px);
                                min-height: 560px;
                            }

                            .runner-review-shell .runner-split-pane {
                                min-width: 0;
                                height: 100%;
                                overflow-y: auto;
                                overscroll-behavior: contain;
                                padding-bottom: 18px !important;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar {
                                width: 8px;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar-track {
                                background: transparent;
                            }

                            .runner-review-shell .runner-split-pane::-webkit-scrollbar-thumb {
                                background: rgba(148, 163, 184, 0.42);
                                border-radius: 999px;
                            }

                            @media (max-width: 1100px) {
                                .runner-review-shell .runner-split-layout {
                                    grid-template-columns: 1fr;
                                    height: auto;
                                }

                                .runner-review-shell .runner-split-pane {
                                    height: auto;
                                    max-height: none !important;
                                    overflow: visible !important;
                                    padding-bottom: 20px !important;
                                }
                            }
                        `}</style>

                            {skillType === 'READING' ? (
                                <ReadingBody
                                    passages={readingPassages}
                                    activePassageIndex={activeItemIndex}
                                    answerMap={answerMap}
                                    reviewAnswerMap={reviewAnswerMap}
                                    readOnly
                                    onAnswerChange={() => undefined}
                                    renderQuestionAction={renderQuestionAction}
                                />
                            ) : (
                                <ListeningBody
                                    parts={listeningParts}
                                    activePartIndex={activeItemIndex}
                                    answerMap={answerMap}
                                    reviewAnswerMap={reviewAnswerMap}
                                    readOnly
                                    onAnswerChange={() => undefined}
                                    renderQuestionAction={renderQuestionAction}
                                />
                            )}
                        </div>

                        <ObjectiveReviewNavigation
                            navigationItems={navigationItems}
                            skillType={skillType}
                            activeItemIndex={activeItemIndex}
                            onChangeItem={handleNavigationItemChange}
                        />
                    </Space>
                </Card>
            </Space>

            <ReviewCopilotDrawer
                open={copilotOpen}
                loadingContext={copilotLoadingContext}
                context={copilotContext}
                messages={copilotMessages}
                draftMessage={copilotDraftMessage}
                isStreaming={!!copilotStreamingMessageId}
                errorMessage={copilotErrorMessage}
                focusComposerSignal={copilotComposerFocusSignal}
                focusChips={copilotFocuses}
                onClose={handleCloseCopilot}
                onDraftChange={setCopilotDraftMessage}
                onSendMessage={handleSendCopilotMessage}
                onStopStreaming={stopCopilotStream}
                onClearFocus={() => setCopilotFocuses([])}
                onRemoveFocus={(focusToRemove) =>
                    setCopilotFocuses((current) =>
                        current.filter((focus) =>
                            focus.questionNumber != null && focusToRemove.questionNumber != null
                                ? focus.questionNumber !== focusToRemove.questionNumber
                                : focus.label !== focusToRemove.label,
                        ),
                    )
                }
                onClearSelection={() => setCopilotSelectedText('')}
                selectionChipLabel={copilotSelectionChipLabel}
                onReservedWidthChange={setCopilotReservedWidth}
                onPlayReplayAction={handlePlayReplayAction}
            />
        </>
    );
};
