import type { FC } from 'react';
import { ArrowLeftOutlined, AudioOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Row, Col, Space, Statistic, Tag, Typography } from 'antd';
import type { PracticeSessionDto, PracticeSessionResultDto, PracticeSessionSpeakingAnalyticsDto } from '../../types/session.types';
import { getSkillLabel } from '../../lib/sessionRouting';
import { countSpokenWords, estimateWordsPerMinute } from '../../lib/speakingPlayback';

const { Paragraph, Text, Title } = Typography;

interface SpeakingSessionReviewProps {
    session: PracticeSessionDto;
    result: PracticeSessionResultDto | null;
    canSubmitNow: boolean;
    submitLoading: boolean;
    onSubmit: () => void;
    onBackToRunner: () => void;
    onBackToLibrary: () => void;
}

const formatSeconds = (value?: number | null) => {
    if (value == null) {
        return 'Không giới hạn';
    }

    const total = Math.max(0, value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const statusColorMap: Record<string, string> = {
    NotStarted: 'default',
    InProgress: 'processing',
    Submitted: 'warning',
    Completed: 'success',
    Abandoned: 'error',
};

const speakingPaceLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['paceLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu pace',
    slow: 'Pace chậm',
    balanced: 'Pace cân bằng',
    fast: 'Pace nhanh',
    very_fast: 'Pace quá nhanh',
};

const speakingCoverageLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['coverageLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu độ dài',
    too_short: 'Câu trả lời quá ngắn',
    on_target: 'Độ dài đạt mục tiêu',
    exceeds_target: 'Thời lượng vượt mục tiêu',
};

const getAnalyticsTagColor = (label?: string | null) => {
    switch (label) {
        case 'balanced':
        case 'on_target':
            return 'success';
        case 'fast':
            return 'processing';
        case 'slow':
        case 'too_short':
        case 'very_fast':
        case 'exceeds_target':
            return 'warning';
        default:
            return 'default';
    }
};

const getSpeakingPromptEntries = (session: PracticeSessionDto) => (
    session.exam.sections.flatMap((section) =>
        section.speakingParts.flatMap((part) =>
            [...part.questions]
                .sort((left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0))
                .map((question, index) => ({
                    sectionTitle: section.title,
                    partId: part.id,
                    partNumber: part.partNumber,
                    partDescription: part.description,
                    question,
                    promptIndex: index + 1,
                })),
        ),
    )
);

export const SpeakingSessionReview: FC<SpeakingSessionReviewProps> = ({
    session,
    result,
    canSubmitNow,
    submitLoading,
    onSubmit,
    onBackToRunner,
    onBackToLibrary,
}) => {
    const promptEntries = getSpeakingPromptEntries(session);
    const speakingAnswers = new Map(
        session.answers
            .filter((answer) => !!answer.speakingQuestionId)
            .map((answer) => [answer.speakingQuestionId!, answer]),
    );

    return (
        <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card
                style={{
                    borderRadius: 24,
                    border: '1px solid #dbeafe',
                    background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 55%, #f8fafc 100%)',
                }}
            >
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Space wrap>
                            <Button icon={<ArrowLeftOutlined />} onClick={onBackToRunner}>
                                Quay lại runner
                            </Button>
                            <Tag color="red">{getSkillLabel(session.skillType)}</Tag>
                            <Tag color={statusColorMap[session.status] || 'default'}>{session.status}</Tag>
                            <Tag>{formatSeconds(session.timeRemaining)}</Tag>
                        </Space>
                        <Space wrap>
                            <Button onClick={onBackToLibrary}>Bài thi của tôi</Button>
                            <Button
                                type="primary"
                                icon={canSubmitNow && session.status !== 'InProgress' ? <ReloadOutlined /> : <SendOutlined />}
                                loading={submitLoading}
                                onClick={onSubmit}
                                disabled={!canSubmitNow}
                            >
                                {canSubmitNow ? (session.status !== 'InProgress' ? 'Chấm lại Speaking' : 'Nộp bài Speaking') : 'Đã khóa nộp'}
                            </Button>
                        </Space>
                    </Space>

                    <div>
                        <Title level={3} style={{ marginBottom: 8 }}>
                            {session.examTitle}
                        </Title>
                        <Paragraph style={{ margin: 0, color: '#475569' }}>
                            Review này tổng hợp các prompt đã trả lời, audio đã lưu và feedback Speaking nếu backend AI đã chấm xong.
                        </Paragraph>
                    </div>

                    <Row gutter={[16, 16]}>
                        <Col xs={12} md={6}>
                            <Statistic title="Prompt" value={`${result?.answeredQuestions ?? 0}/${promptEntries.length}`} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title="Band Speaking" value={result?.speakingScore != null ? result.speakingScore.toFixed(1) : '—'} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title="Trạng thái" value={session.status} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title="Thời gian còn lại" value={formatSeconds(session.timeRemaining)} />
                        </Col>
                    </Row>

                    <Alert
                        type={canSubmitNow ? 'warning' : result?.speakingScore != null ? 'success' : 'info'}
                        showIcon
                        message={
                            canSubmitNow
                                ? 'Session speaking chưa khóa'
                                : result?.speakingScore != null
                                    ? 'Đã có band Speaking'
                                    : 'Speaking đã nộp'
                        }
                        description={
                            canSubmitNow
                                ? 'Bạn vẫn có thể quay lại runner để kiểm tra audio, ghi chú hoặc ghi lại prompt trước khi nộp.'
                                : result?.speakingScore != null
                                    ? 'Band Speaking và feedback theo tiêu chí đã được trả về từ backend.'
                                    : 'Bài đã được lưu. Nếu AI chưa trả band, bạn có thể bấm chấm lại Speaking.'
                        }
                    />

                    {result?.overallFeedback ? (
                        <Alert
                            type="info"
                            showIcon
                            message="Overall feedback theo Part"
                            description={<Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{result.overallFeedback}</Paragraph>}
                        />
                    ) : null}
                </Space>
            </Card>

            {promptEntries.length === 0 ? (
                <Card style={{ borderRadius: 24 }}>
                    <Empty description="Session này chưa có speaking prompt." />
                </Card>
            ) : promptEntries.map((entry) => {
                const answer = speakingAnswers.get(entry.question.id);
                const hasSavedAudio = !!answer?.audioUrl;
                const hasNotes = !!answer?.answerText?.trim();
                const responseText = answer?.transcriptText || answer?.answerText || null;
                const speakingAnalytics = answer?.speakingAnalytics ?? null;
                const wordCount = speakingAnalytics?.wordCount ?? countSpokenWords(responseText);
                const estimatedWpm = speakingAnalytics?.wordsPerMinute ?? estimateWordsPerMinute(responseText, answer?.durationSeconds);

                return (
                    <Card key={entry.question.id} style={{ borderRadius: 20 }}>
                        <Space direction="vertical" size={14} style={{ width: '100%' }}>
                            <Space wrap>
                                <Tag color="red">Part {entry.partNumber ?? '—'}</Tag>
                                <Tag>Prompt {entry.promptIndex}</Tag>
                                <Tag color={hasSavedAudio ? 'success' : 'default'}>{hasSavedAudio ? 'Đã có audio' : 'Chưa có audio'}</Tag>
                                <Tag color={hasNotes ? 'processing' : 'default'}>{hasNotes ? 'Có ghi chú/transcript' : 'Chưa có ghi chú'}</Tag>
                                <Tag color={entry.question.audioPromptUrl ? 'blue' : 'default'}>{entry.question.audioPromptUrl ? 'Có prompt audio' : 'Prompt dùng fallback voice'}</Tag>
                                {answer?.scoreEarned ? <Tag color="purple">Band {answer.scoreEarned.toFixed(1)}</Tag> : null}
                            </Space>

                            <div>
                                <Title level={5} style={{ marginBottom: 6 }}>
                                    {entry.sectionTitle || `Speaking Part ${entry.partNumber ?? ''}`}
                                </Title>
                                {entry.partDescription ? (
                                    <Paragraph style={{ marginBottom: 8, color: '#475569' }}>{entry.partDescription}</Paragraph>
                                ) : null}
                                <Paragraph style={{ margin: 0 }}>{entry.question.content}</Paragraph>
                            </div>

                            {entry.question.cueCardPoints ? (
                                <Alert
                                    type="info"
                                    showIcon
                                    message="Cue card notes"
                                    description={<Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{entry.question.cueCardPoints}</Paragraph>}
                                />
                            ) : null}

                            {answer?.audioUrl ? (
                                <div>
                                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                                        Bản ghi đã lưu
                                    </Text>
                                    <audio controls preload="metadata" src={answer.audioUrl} style={{ width: '100%' }} />
                                    <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                                        <AudioOutlined /> {answer.durationSeconds != null ? `${answer.durationSeconds.toFixed(1)} giây` : 'Không có duration'}
                                    </Text>
                                </div>
                            ) : null}

                            <Row gutter={[12, 12]}>
                                <Col xs={12} md={8}>
                                    <Statistic title="Duration" value={answer?.durationSeconds != null ? `${answer.durationSeconds.toFixed(1)}s` : '—'} />
                                </Col>
                                <Col xs={12} md={8}>
                                    <Statistic title="Từ đã nhận diện" value={wordCount || '—'} />
                                </Col>
                                <Col xs={12} md={8}>
                                    <Statistic title="Ước tính WPM" value={estimatedWpm ?? '—'} />
                                </Col>
                            </Row>

                            {speakingAnalytics ? (
                                <Card size="small" style={{ borderRadius: 16, background: '#fffbeb' }}>
                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                        <Space wrap>
                                            <Text strong>Fluency analytics</Text>
                                            {speakingAnalytics.estimatedFluencyBand != null ? (
                                                <Tag color="gold">Fluency ~ {speakingAnalytics.estimatedFluencyBand.toFixed(1)}</Tag>
                                            ) : null}
                                            <Tag color={getAnalyticsTagColor(speakingAnalytics.paceLabel)}>
                                                {speakingPaceLabelMap[speakingAnalytics.paceLabel]}
                                            </Tag>
                                            <Tag color={getAnalyticsTagColor(speakingAnalytics.coverageLabel)}>
                                                {speakingCoverageLabelMap[speakingAnalytics.coverageLabel]}
                                            </Tag>
                                        </Space>
                                        <Paragraph style={{ margin: 0, color: '#475569' }}>
                                            {speakingAnalytics.targetDurationSeconds != null
                                                ? `Mục tiêu phần này khoảng ${speakingAnalytics.targetDurationSeconds} giây. Coverage hiện tại ${speakingAnalytics.coverageRatio != null ? `${Math.round(speakingAnalytics.coverageRatio * 100)}%` : '—'}.`
                                                : 'Chưa có target duration cho prompt này.'}
                                        </Paragraph>
                                    </Space>
                                </Card>
                            ) : null}

                            {answer?.answerText ? (
                                <Card size="small" style={{ borderRadius: 16, background: '#f8fafc' }}>
                                    <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                        Ghi chú / transcript
                                    </Text>
                                    <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{answer.answerText}</Paragraph>
                                </Card>
                            ) : null}

                            {answer?.transcriptText ? (
                                <Card size="small" style={{ borderRadius: 16, background: '#eefbf3' }}>
                                    <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                        Transcript tự động
                                    </Text>
                                    <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{answer.transcriptText}</Paragraph>
                                </Card>
                            ) : null}

                            {(answer?.feedbacks?.length ?? 0) > 0 ? (
                                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                    <Text strong>Feedback 4 tiêu chí</Text>
                                    {answer!.feedbacks!.map((feedback) => (
                                        <Card key={`${entry.question.id}-${feedback.criteria}`} size="small" style={{ borderRadius: 14 }}>
                                            <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                                <Space wrap>
                                                    <Tag color="purple">{feedback.criteria}</Tag>
                                                    <Tag>Band {feedback.bandScore.toFixed(1)}</Tag>
                                                </Space>
                                                {feedback.comment ? <Paragraph style={{ margin: 0 }}>{feedback.comment}</Paragraph> : null}
                                                {feedback.improvements ? (
                                                    <Paragraph style={{ margin: 0, color: '#475569' }}>
                                                        Gợi ý: {feedback.improvements}
                                                    </Paragraph>
                                                ) : null}
                                            </Space>
                                        </Card>
                                    ))}
                                </Space>
                            ) : null}
                        </Space>
                    </Card>
                );
            })}
        </Space>
    );
};
