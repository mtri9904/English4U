import React from 'react';
import { Alert, Button, Card, Col, Divider, Row, Space, Statistic, Tag, Typography } from 'antd';
import { AudioOutlined, RobotOutlined } from '@ant-design/icons';
import type { PracticeSessionAnswerDto } from '../../types/session.types';
import type { CopilotFocusPayload } from '../../types/copilot.types';
import { countSpokenWords, estimateWordsPerMinute } from '../../utils/speakingPlayback.utils';
import {
    audioQualityLabelMap,
    criteriaNameMap,
    formatEvidenceItem,
    formatPercent,
    getAnalyticsTagColor,
    getAudioQualityColor,
    getLowConfidenceWords,
    speakingCoverageLabelMap,
    speakingPaceLabelMap,
    type SpeakingPromptEntry,
} from './speakingSessionReview.utils';

const { Paragraph, Text, Title } = Typography;

interface SpeakingPromptCardProps {
    entry: SpeakingPromptEntry;
    answer?: PracticeSessionAnswerDto;
    hasSpeakingScore: boolean;
    onFocusCopilot: (focus: CopilotFocusPayload) => void;
}

export const SpeakingPromptCard: React.FC<SpeakingPromptCardProps> = ({
    entry,
    answer,
    hasSpeakingScore,
    onFocusCopilot,
}) => {
    const hasSavedAudio = !!answer?.audioUrl;
    const hasNotes = !!answer?.answerText?.trim();
    const responseText = answer?.transcriptText || answer?.answerText || null;
    const speakingAnalytics = answer?.speakingAnalytics ?? null;
    const wordCount = speakingAnalytics?.wordCount ?? countSpokenWords(responseText);
    const estimatedWpm = speakingAnalytics?.wordsPerMinute ?? estimateWordsPerMinute(responseText, answer?.durationSeconds);
    const lowConfidenceWords = getLowConfidenceWords(speakingAnalytics);

    return (
        <Card style={{ borderRadius: 20 }}>
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Space wrap style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space wrap>
                        <Tag color="red">Part {entry.partNumber ?? '—'}</Tag>
                        <Tag>Prompt {entry.promptIndex}</Tag>
                        <Tag color={hasSavedAudio ? 'success' : 'default'}>{hasSavedAudio ? 'Đã có audio' : 'Chưa có audio'}</Tag>
                        <Tag color={hasNotes ? 'processing' : 'default'}>{hasNotes ? 'Có ghi chú/transcript' : 'Chưa có ghi chú'}</Tag>
                        <Tag color={entry.question.audioPromptUrl ? 'blue' : 'default'}>
                            {entry.question.audioPromptUrl ? 'Có prompt audio' : 'Prompt dùng fallback voice'}
                        </Tag>
                        {answer?.scoreEarned ? <Tag color="purple">Band {answer.scoreEarned.toFixed(1)}</Tag> : null}
                    </Space>
                    {hasSpeakingScore ? (
                        <Button
                            type="default"
                            icon={<RobotOutlined style={{ color: '#8b5cf6' }} />}
                            size="small"
                            onClick={() => {
                                const focusPayload: CopilotFocusPayload = {
                                    label: `Part ${entry.partNumber ?? ''} Q${entry.promptIndex}`,
                                    text: `Câu hỏi Speaking: "${entry.question.content}"\n\nPhản hồi nháp/ghi chú: "${responseText || 'Chưa trả lời.'}"`,
                                    questionNumber: entry.promptIndex,
                                    images: [],
                                };
                                onFocusCopilot(focusPayload);
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
                            boxShadow: '0 4px 15px rgba(168, 85, 247, 0.04)',
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
};

