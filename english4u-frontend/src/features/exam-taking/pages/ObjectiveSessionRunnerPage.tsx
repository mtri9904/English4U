import { useMemo, type FC } from 'react';
import { Alert, Button, Card, Empty, Space, Spin } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { usePracticeSessionQuery } from '@/features/exam-taking/hooks/useSessionQueries';
import { isObjectiveSkill } from '../utils/sessionRouting.utils';
import { getSharedListeningAudioUrl } from '../utils/objectiveRunner.utils';
import { ReadingBody } from '../components/runner/ReadingBody';
import { ListeningBody } from '../components/runner/ListeningBody';
import { objectiveRunnerStyles } from '../components/runner/objectiveRunner.styles';
import { ObjectiveRunnerHeaderToolbar } from '../components/runner/ObjectiveRunnerHeaderToolbar';
import { ObjectiveRunnerBottomNavigation } from '../components/runner/ObjectiveRunnerBottomNavigation';
import { useObjectiveSessionRunner } from '../hooks/useObjectiveSessionRunner';

// Re-export ReadingBody and ListeningBody for backward compatibility
export { ReadingBody } from '../components/runner/ReadingBody';
export { ListeningBody } from '../components/runner/ListeningBody';

const ObjectiveRunnerPage = ({ expectedSkill }: { expectedSkill: 'READING' | 'LISTENING' }) => {
    const navigate = useNavigate();
    const { sessionId = '' } = useParams();
    const { data: session, isLoading, isError } = usePracticeSessionQuery(sessionId);

    const sections = useMemo(() => {
        if (!session) return [];
        return session.exam.sections.filter((section) => section.skillType.trim().toUpperCase() === expectedSkill);
    }, [session, expectedSkill]);

    const readingPassages = useMemo(() => {
        return sections.flatMap((section) => section.readingPassages);
    }, [sections]);

    const listeningParts = useMemo(() => {
        return sections.flatMap((section) => section.listeningParts);
    }, [sections]);

    const sharedListeningAudioUrl = useMemo(
        () => getSharedListeningAudioUrl(listeningParts),
        [listeningParts],
    );

    const navigationItems = expectedSkill === 'READING' ? readingPassages : listeningParts;

    const {
        answerMap,
        autosaveLabel,
        activeItemIndex,
        headerSlot,
        listeningAttemptMode,
        audioCurrentTime,
        audioDuration,
        audioProgressPercent,
        mockCountdownLabel,
        highlights,
        timerText,
        audioRef,
        handleAnswerChange,
        handleCreateHighlight,
        handleDeleteHighlight,
        handleNavigationItemChange,
    } = useObjectiveSessionRunner({
        sessionId,
        expectedSkill,
        session,
        sharedListeningAudioUrl,
        navigationItemsCount: navigationItems.length,
    });

    if (isLoading) {
        return (
            <Card style={{ borderRadius: 24, minHeight: 320, display: 'grid', placeItems: 'center' }}>
                <Spin />
            </Card>
        );
    }

    if (isError || !session) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty description="Không tìm thấy session đang làm." image={Empty.PRESENTED_IMAGE_SIMPLE}>
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay về Bài thi của tôi
                    </Button>
                </Empty>
            </Card>
        );
    }

    if (!isObjectiveSkill(session.skillType)) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Alert
                    type="warning"
                    showIcon
                    message="Session này chưa thuộc Reading/Listening objective."
                    description="Runner objective hiện tại chỉ mở cho Reading và Listening."
                />
            </Card>
        );
    }

    if (session.skillType.trim().toUpperCase() !== expectedSkill) {
        navigate(`/app/sessions/${sessionId}/${session.skillType.trim().toUpperCase() === 'LISTENING' ? 'listening' : 'reading'}`, { replace: true });
        return null;
    }

    if (session.status !== 'InProgress') {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Space direction="vertical" size={16}>
                    <Alert
                        type="success"
                        showIcon
                        message="Session này không còn ở trạng thái đang làm."
                        description="Bạn có thể mở trang kết quả để xem điểm số, số câu đúng và thông tin đã nộp."
                    />
                    <Button type="primary" onClick={() => navigate(`/app/sessions/${sessionId}/submit`)}>
                        Xem trang submit
                    </Button>
                </Space>
            </Card>
        );
    }

    const isListeningSession = expectedSkill === 'LISTENING';

    return (
        <>
            {headerSlot ? createPortal(
                <ObjectiveRunnerHeaderToolbar
                    examTitle={session.examTitle}
                    skillType={session.skillType}
                    timerText={timerText}
                    autosaveLabel={autosaveLabel}
                    isListeningSession={isListeningSession}
                    sharedListeningAudioUrl={sharedListeningAudioUrl}
                    listeningAttemptMode={listeningAttemptMode}
                    audioRef={audioRef}
                    audioCurrentTime={audioCurrentTime}
                    audioDuration={audioDuration}
                    audioProgressPercent={audioProgressPercent}
                    mockCountdownLabel={mockCountdownLabel}
                    onBack={() => navigate('/app/my-exams')}
                    onSubmit={() => navigate(`/app/sessions/${sessionId}/submit`)}
                />,
                headerSlot,
            ) : null}

            <div style={{ width: '100%', padding: '8px 8px 46px' }}>
                <style>{objectiveRunnerStyles}</style>

                {expectedSkill === 'READING' ? (
                    <ReadingBody
                        passages={readingPassages}
                        activePassageIndex={activeItemIndex}
                        answerMap={answerMap}
                        onAnswerChange={handleAnswerChange}
                        highlights={highlights}
                        onCreateHighlight={handleCreateHighlight}
                        onDeleteHighlight={handleDeleteHighlight}
                    />
                ) : (
                    <ListeningBody
                        parts={listeningParts}
                        activePartIndex={activeItemIndex}
                        answerMap={answerMap}
                        onAnswerChange={handleAnswerChange}
                        highlights={highlights}
                        onCreateHighlight={handleCreateHighlight}
                        onDeleteHighlight={handleDeleteHighlight}
                    />
                )}

                <ObjectiveRunnerBottomNavigation
                    expectedSkill={expectedSkill}
                    navigationItems={navigationItems}
                    activeItemIndex={activeItemIndex}
                    onItemChange={handleNavigationItemChange}
                />
            </div>
        </>
    );
};

export const ClientReadingSessionPage: FC = () => <ObjectiveRunnerPage expectedSkill="READING" />;
export const ClientListeningSessionPage: FC = () => <ObjectiveRunnerPage expectedSkill="LISTENING" />;

export const ReadingSessionPage = ClientReadingSessionPage;
export const ListeningSessionPage = ClientListeningSessionPage;
