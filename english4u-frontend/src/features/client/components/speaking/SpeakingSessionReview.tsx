import { useState, useMemo, useRef, type FC } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftOutlined, AudioOutlined, ReloadOutlined, SendOutlined, RobotOutlined, BulbOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Divider, Empty, Row, Col, Space, Statistic, Tag, Typography } from 'antd';
import type { PracticeSessionDto, PracticeSessionResultDto, PracticeSessionSpeakingAnalyticsDto } from '../../types/session.types';
import { getSkillLabel } from '../../lib/sessionRouting';
import { countSpokenWords, estimateWordsPerMinute } from '../../lib/speakingPlayback';
import { ReviewCopilotDrawer } from '../ReviewCopilotDrawer';
import { buildSpeakingReviewCopilotContext } from '../../lib/reviewCopilotContext';
import { streamCopilotChat } from '../../api/copilot.api';
import type { CopilotChatMessage, CopilotFocusPayload } from '../../types/copilot.types';

const { Paragraph, Text, Title } = Typography;

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

const formatPercent = (value?: number | null) => (
    value == null ? '—' : `${Math.round(value * 100)}%`
);

const getAudioQualityColor = (label?: string | null) => {
    switch (label) {
        case 'usable':
            return 'success';
        case 'usable_with_warnings':
            return 'warning';
        case 'technical_low_confidence':
        case 'empty':
            return 'error';
        default:
            return 'default';
    }
};

const audioQualityLabelMap: Record<string, string> = {
    usable: 'Âm thanh tốt',
    usable_with_warnings: 'Có tạp âm nhẹ',
    technical_low_confidence: 'Không rõ tiếng',
    empty: 'Không phát hiện giọng nói',
};

const criteriaNameMap: Record<string, string> = {
    'Fluency and Coherence': 'Độ trôi chảy & Mạch lạc',
    'Grammatical Range and Accuracy': 'Sử dụng Ngữ pháp',
    'Lexical Resource': 'Vốn từ vựng',
    'Pronunciation': 'Phát âm',
};

const formatEvidenceItem = (item: string): string | null => {
    const parts = item.split('=');
    if (parts.length < 2) {
        if (item.includes('pauses=')) {
            const pausesMatch = item.match(/pauses=(\d+)/);
            const longPausesMatch = item.match(/long_pauses=(\d+)/);
            const totalPauseMatch = item.match(/total_pause=([\d.]+s?)/);
            const pauses = pausesMatch ? pausesMatch[1] : '0';
            const longPauses = longPausesMatch ? longPausesMatch[1] : '0';
            const totalPause = totalPauseMatch ? totalPauseMatch[1] : '0s';
            return `Ngắt quãng: ${pauses} lần (Dừng dài: ${longPauses}, Tổng dừng: ${totalPause})`;
        }
        return null;
    }

    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();

    switch (key) {
        case 'word_count':
            return `Số từ: ${value}`;
        case 'wpm':
            return `Tốc độ: ${value} từ/phút`;
        case 'speech_ratio':
            return `Tỷ lệ nói: ${value}`;
        case 'sentence_units':
            return `Số câu: ${value}`;
        case 'avg_words_per_unit':
            return `Số từ TB/câu: ${value}`;
        case 'connector_count':
            return `Từ nối đã dùng: ${value}`;
        case 'complex_sentence_ratio':
            return `Tỷ lệ câu phức: ${value}`;
        case 'grammar_complexity_score': {
            const num = parseFloat(value);
            return isNaN(num) ? `Độ phức tạp ngữ pháp: ${value}` : `Độ phức tạp ngữ pháp: ${Math.round(num * 100)}%`;
        }
        case 'tense_marker_variety':
            return `Độ đa dạng thì: ${value}/12`;
        case 'filler_ratio':
            return `Tỷ lệ từ đệm (uh/um): ${value}`;
        case 'subordinate_clause_markers':
            return `Mệnh đề phụ thuộc: ${value}`;
        case 'modal_verbs':
            return `Động từ khuyết thiếu: ${value}`;
        case 'unique_word_ratio':
            return `Từ vựng đa dạng: ${value}`;
        case 'repetition_ratio':
            return `Tỷ lệ lặp từ: ${value}`;
        case 'lexical_density':
            return `Mật độ từ thực (lexical): ${value}`;
        case 'asr_confidence':
            return `Độ chuẩn phát âm: ${value}`;
        case 'low_confidence_word_ratio':
            return `Phát âm chưa chuẩn: ${value}`;
        default:
            return null;
    }
};

const getLowConfidenceWords = (speakingAnalytics?: PracticeSessionSpeakingAnalyticsDto | null) => (
    (speakingAnalytics?.wordTimestamps ?? [])
        .filter((word) => word.probability != null && word.probability < 0.65)
        .slice(0, 8)
);

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
    headerSlot,
    onSubmit,
    onBackToRunner,
    onBackToLibrary,
}) => {
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [copilotMessages, setCopilotMessages] = useState<CopilotChatMessage[]>([]);
    const [copilotDraftMessage, setCopilotDraftMessage] = useState('');
    const [copilotStreamingMessageId, setCopilotStreamingMessageId] = useState<string | null>(null);
    const [copilotErrorMessage, setCopilotErrorMessage] = useState<string | null>(null);
    const [copilotFocuses, setCopilotFocuses] = useState<CopilotFocusPayload[]>([]);
    const [copilotComposerFocusSignal, setCopilotComposerFocusSignal] = useState(0);
    const [copilotReservedWidth, setCopilotReservedWidth] = useState(0);

    const copilotAbortRef = useRef<AbortController | null>(null);

    const promptEntries = getSpeakingPromptEntries(session);
    const isRescoreMode = session.status !== 'InProgress';
    const speakingAnswers = new Map(
        session.answers
            .filter((answer) => !!answer.speakingQuestionId)
            .map((answer) => [answer.speakingQuestionId!, answer]),
    );

    const baseContext = useMemo(() => {
        if (!session) return null;
        return buildSpeakingReviewCopilotContext({ session });
    }, [session]);

    const stopCopilotStream = () => {
        copilotAbortRef.current?.abort();
        copilotAbortRef.current = null;
        setCopilotStreamingMessageId(null);
    };

    const handleSendCopilotMessage = async (textToSend: string) => {
        if (!textToSend.trim() || !baseContext || !!copilotStreamingMessageId) return;

        const assistantMessageId = `model-${Date.now()}`;
        const userMsg: CopilotChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: textToSend,
            createdAt: Date.now()
        };

        const updatedHistory = [...copilotMessages, userMsg];
        setCopilotMessages(updatedHistory);
        setCopilotDraftMessage('');
        setCopilotErrorMessage(null);

        const controller = new AbortController();
        copilotAbortRef.current = controller;
        setCopilotStreamingMessageId(assistantMessageId);

        let outgoingUserMessage = textToSend.trim();
        if (copilotFocuses.length > 0) {
            const focusContext = copilotFocuses.map(f => `[Focus: ${f.label}]\n${f.text}`).join('\n\n');
            outgoingUserMessage = `Ngữ cảnh câu hỏi đang focus:\n${focusContext}\n\nCâu hỏi: ${outgoingUserMessage}`;
        }

        try {
            const apiHistory = copilotMessages.map(m => ({
                role: m.role,
                content: m.content
            }));

            setCopilotMessages(prev => [
                ...prev,
                {
                    id: assistantMessageId,
                    role: 'model',
                    content: '',
                    createdAt: Date.now()
                }
            ]);

            await streamCopilotChat({
                payload: {
                    context: baseContext,
                    userMessage: outgoingUserMessage,
                    chatHistory: apiHistory
                },
                signal: controller.signal,
                onEvent: (event) => {
                    if (event.event === 'chunk') {
                        const delta = String(event.data?.text || '');
                        setCopilotMessages(prev => prev.map(msg =>
                            msg.id === assistantMessageId
                                ? { ...msg, content: msg.content + delta }
                                : msg
                        ));
                    } else if (event.event === 'error') {
                        const errorMsg = String(event.data?.message || 'Lỗi từ AI Copilot');
                        setCopilotErrorMessage(errorMsg);
                    }
                }
            });
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setCopilotErrorMessage(err.message || 'Lỗi kết nối đến Gia Sư AI.');
            }
        } finally {
            setCopilotStreamingMessageId(null);
            copilotAbortRef.current = null;
        }
    };

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
                        onClick={() => setCopilotOpen(prev => !prev)}
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
                            <span>AI gia sư</span>
                        </Space>
                    </Button>
                </div>,
                headerSlot,
            ) : null}

            <div
                style={{
                    width: '100%',
                    paddingRight: copilotOpen ? copilotReservedWidth : 0,
                    transition: 'padding-right 0.2s ease'
                }}
            >
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
                                        icon={canSubmitNow && isRescoreMode ? <ReloadOutlined /> : <SendOutlined />}
                                        loading={submitLoading}
                                        onClick={onSubmit}
                                        disabled={!canSubmitNow}
                                    >
                                        {canSubmitNow ? (isRescoreMode ? 'Chấm lại Speaking' : 'Nộp bài Speaking') : 'Đã khóa nộp'}
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
                                type={session.status === 'InProgress' ? 'warning' : result?.speakingScore != null ? 'success' : 'info'}
                                showIcon
                                message={
                                    session.status === 'InProgress'
                                        ? 'Session speaking chưa khóa'
                                        : result?.speakingScore != null
                                            ? 'Đã có band Speaking'
                                            : 'Speaking đã nộp'
                                }
                                description={
                                    session.status === 'InProgress'
                                        ? 'Bạn vẫn có thể quay lại runner để kiểm tra audio, ghi chú hoặc ghi lại prompt trước khi nộp.'
                                        : result?.speakingScore != null
                                            ? 'Band Speaking và feedback theo tiêu chí đã được trả về từ backend. Bạn có thể bấm chấm lại Speaking để cập nhật scoring theo pipeline mới.'
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
                        const lowConfidenceWords = getLowConfidenceWords(speakingAnalytics);

                        return (
                            <Card key={entry.question.id} style={{ borderRadius: 20 }}>
                                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                                    <Space wrap style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Space wrap>
                                            <Tag color="red">Part {entry.partNumber ?? '—'}</Tag>
                                            <Tag>Prompt {entry.promptIndex}</Tag>
                                            <Tag color={hasSavedAudio ? 'success' : 'default'}>{hasSavedAudio ? 'Đã có audio' : 'Chưa có audio'}</Tag>
                                            <Tag color={hasNotes ? 'processing' : 'default'}>{hasNotes ? 'Có ghi chú/transcript' : 'Chưa có ghi chú'}</Tag>
                                            <Tag color={entry.question.audioPromptUrl ? 'blue' : 'default'}>{entry.question.audioPromptUrl ? 'Có prompt audio' : 'Prompt dùng fallback voice'}</Tag>
                                            {answer?.scoreEarned ? <Tag color="purple">Band {answer.scoreEarned.toFixed(1)}</Tag> : null}
                                        </Space>
                                        {result?.speakingScore != null ? (
                                            <Button
                                                type="default"
                                                icon={<RobotOutlined style={{ color: '#8b5cf6' }} />}
                                                size="small"
                                                onClick={() => {
                                                    const focusPayload: CopilotFocusPayload = {
                                                        label: `Part ${entry.partNumber ?? ''} Q${entry.promptIndex}`,
                                                        text: `Câu hỏi Speaking: "${entry.question.content}"\n\nPhản hồi nháp/ghi chú: "${responseText || 'Chưa trả lời.'}"`,
                                                        questionNumber: entry.promptIndex,
                                                        images: []
                                                    };
                                                    setCopilotFocuses([focusPayload]);
                                                    setCopilotOpen(true);
                                                    setCopilotComposerFocusSignal(prev => prev + 1);
                                                }}
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
                                                Gia sư AI
                                            </Button>
                                        ) : null}
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
                                            <Statistic title="Thời lượng ghi âm" value={answer?.durationSeconds != null ? `${answer.durationSeconds.toFixed(1)}s` : '—'} />
                                        </Col>
                                        <Col xs={12} md={8}>
                                            <Statistic title="Tổng số từ phát âm" value={wordCount || '—'} />
                                        </Col>
                                        <Col xs={12} md={8}>
                                            <Statistic title="Tốc độ nói (WPM)" value={estimatedWpm ?? '—'} />
                                        </Col>
                                    </Row>

                                    {speakingAnalytics ? (
                                        <Card 
                                            size="small" 
                                            style={{ 
                                                borderRadius: 16, 
                                                background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                                                border: '1px solid #e9d5ff',
                                                boxShadow: '0 4px 15px rgba(168, 85, 247, 0.04)'
                                            }}
                                        >
                                            <Space direction="vertical" size={12} style={{ width: '100%', padding: '4px' }}>
                                                <div>
                                                    <Text strong style={{ color: '#7e22ce', fontSize: '0.92rem', display: 'block', marginBottom: 10 }}>
                                                        Phân Tích Chi Tiết Phát Âm & Độ Trôi Chảy từ AI
                                                    </Text>
                                                    <Row gutter={[16, 12]}>
                                                        <Col xs={24} sm={12}>
                                                            <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                                                <div>
                                                                    <Text type="secondary" style={{ fontSize: '0.78rem' }}>Chất lượng ghi âm: </Text>
                                                                    <Tag color={getAudioQualityColor(speakingAnalytics.audioQualityLabel)} style={{ borderRadius: 6 }}>
                                                                        {audioQualityLabelMap[speakingAnalytics.audioQualityLabel ?? ''] || speakingAnalytics.audioQualityLabel || '—'}
                                                                    </Tag>
                                                                </div>
                                                                {speakingAnalytics.meanWordConfidence != null ? (
                                                                    <div>
                                                                        <Text type="secondary" style={{ fontSize: '0.78rem' }}>Độ rõ ràng của phát âm: </Text>
                                                                        <Text strong style={{ color: '#111827' }}>{formatPercent(speakingAnalytics.meanWordConfidence)}</Text>
                                                                    </div>
                                                                ) : null}
                                                                {speakingAnalytics.speechRatio != null ? (
                                                                    <div>
                                                                        <Text type="secondary" style={{ fontSize: '0.78rem' }}>Tỷ lệ nói liên tục: </Text>
                                                                        <Text strong style={{ color: '#111827' }}>{formatPercent(speakingAnalytics.speechRatio)}</Text>
                                                                    </div>
                                                                ) : null}
                                                            </Space>
                                                        </Col>
                                                        <Col xs={24} sm={12}>
                                                            <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                                                <div>
                                                                    <Text type="secondary" style={{ fontSize: '0.78rem' }}>Tốc độ nói: </Text>
                                                                    <Tag color={getAnalyticsTagColor(speakingAnalytics.paceLabel)} style={{ borderRadius: 6 }}>
                                                                        {speakingAnalytics.paceLabel ? speakingPaceLabelMap[speakingAnalytics.paceLabel] : 'Chưa rõ'}
                                                                    </Tag>
                                                                </div>
                                                                <div>
                                                                    <Text type="secondary" style={{ fontSize: '0.78rem' }}>Độ dài câu trả lời: </Text>
                                                                    <Tag color={getAnalyticsTagColor(speakingAnalytics.coverageLabel)} style={{ borderRadius: 6 }}>
                                                                        {speakingAnalytics.coverageLabel ? speakingCoverageLabelMap[speakingAnalytics.coverageLabel] : 'Chưa rõ'}
                                                                    </Tag>
                                                                </div>
                                                                {speakingAnalytics.estimatedFluencyBand != null ? (
                                                                    <div>
                                                                        <Text type="secondary" style={{ fontSize: '0.78rem' }}>Điểm trôi chảy ước tính: </Text>
                                                                        <Tag color="purple" style={{ borderRadius: 6, fontWeight: 700 }}>Band {speakingAnalytics.estimatedFluencyBand.toFixed(1)}</Tag>
                                                                    </div>
                                                                ) : null}
                                                            </Space>
                                                        </Col>
                                                    </Row>
                                                </div>

                                                <Divider style={{ margin: '6px 0', borderColor: '#e9d5ff' }} />

                                                <div>
                                                    <Text type="secondary" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
                                                        Nhịp điệu nói & Ngắt quãng:
                                                    </Text>
                                                    <Paragraph style={{ margin: 0, color: '#475569', fontSize: '0.82rem', lineHeight: 1.45 }}>
                                                        {speakingAnalytics.targetDurationSeconds != null
                                                            ? `Độ dài mục tiêu là khoảng ${speakingAnalytics.targetDurationSeconds} giây (Bài của bạn đã đạt ${speakingAnalytics.coverageRatio != null ? `${Math.round(speakingAnalytics.coverageRatio * 100)}%` : '—'} mục tiêu).`
                                                            : 'Chưa xác định thời lượng mục tiêu.'}
                                                        {speakingAnalytics.pauseCount != null || speakingAnalytics.totalPauseSeconds != null ? (
                                                            <span>
                                                                {` Đo được tổng cộng ${speakingAnalytics.pauseCount ?? 0} lần ngắt quãng`}
                                                                {speakingAnalytics.longPauseCount != null && speakingAnalytics.longPauseCount > 0 ? ` (trong đó có ${speakingAnalytics.longPauseCount} lần ngắt quãng dài hơn 2 giây)` : ''}
                                                                {speakingAnalytics.totalPauseSeconds != null ? `, tổng thời gian dừng là ${speakingAnalytics.totalPauseSeconds.toFixed(1)} giây.` : '.'}
                                                            </span>
                                                        ) : null}
                                                    </Paragraph>
                                                </div>

                                                {(() => {
                                                    const filteredWarnings = (speakingAnalytics.audioQualityWarnings ?? [])
                                                        .filter((w) => !w.toLowerCase().includes('ffmpeg') && !w.toLowerCase().includes('pyav'));
                                                    if (filteredWarnings.length === 0) return null;
                                                    return (
                                                        <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px', border: '1px solid #fde68a' }}>
                                                            <Text strong style={{ color: '#b45309', fontSize: '0.78rem', display: 'block', marginBottom: 2 }}>Lưu ý chất lượng âm thanh:</Text>
                                                            <Text style={{ color: '#78350f', fontSize: '0.8rem' }}>{filteredWarnings.join('; ')}</Text>
                                                        </div>
                                                    );
                                                })()}

                                                {lowConfidenceWords.length > 0 ? (
                                                    <div>
                                                        <Text type="secondary" style={{ fontSize: '0.8rem', display: 'block', marginBottom: 6 }}>
                                                            Từ phát âm chưa chuẩn (cần lưu ý cải thiện):
                                                        </Text>
                                                        <Space wrap size={[6, 6]}>
                                                            {lowConfidenceWords.map((word, index) => (
                                                                <Tag key={`${entry.question.id}-low-${index}`} color="warning" style={{ borderRadius: 6, fontSize: '0.78rem' }}>
                                                                    <Text strong>{word.word}</Text>
                                                                    {word.start != null ? ` (giây thứ ${word.start.toFixed(1)})` : ''}
                                                                </Tag>
                                                            ))}
                                                        </Space>
                                                    </div>
                                                ) : null}
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
                                                            <Tag color="purple">{criteriaNameMap[feedback.criteria] || feedback.criteria}</Tag>
                                                            <Tag>Band {feedback.bandScore.toFixed(1)}</Tag>
                                                            {feedback.confidenceScore != null ? (
                                                                <Tag color={feedback.confidenceScore >= 0.7 ? 'green' : feedback.confidenceScore >= 0.5 ? 'gold' : 'orange'}>
                                                                    Độ tin cậy: {formatPercent(feedback.confidenceScore)}
                                                                </Tag>
                                                            ) : null}
                                                        </Space>
                                                        {feedback.comment ? <Paragraph style={{ margin: 0 }}>{feedback.comment}</Paragraph> : null}
                                                        {(feedback.evidence?.length ?? 0) > 0 ? (
                                                            <Space wrap size={[4, 4]}>
                                                                {feedback.evidence!
                                                                    .map((item) => {
                                                                        const formatted = formatEvidenceItem(item);
                                                                        if (!formatted) return null;
                                                                        return (
                                                                            <Tag
                                                                                key={`${entry.question.id}-${feedback.criteria}-${item}`}
                                                                                style={{ maxWidth: '100%', whiteSpace: 'normal', borderRadius: 6 }}
                                                                            >
                                                                                {formatted}
                                                                            </Tag>
                                                                        );
                                                                    })
                                                                    .filter(Boolean)}
                                                            </Space>
                                                        ) : null}
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
                onRemoveFocus={(focusToRemove) => setCopilotFocuses((current) => current.filter((focus) => (
                    focus.label !== focusToRemove.label
                )))}
                onClearSelection={() => { }}
                selectionChipLabel=""
                onReservedWidthChange={setCopilotReservedWidth}
            />
        </>
    );
};
