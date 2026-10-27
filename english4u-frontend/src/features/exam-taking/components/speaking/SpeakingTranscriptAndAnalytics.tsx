import React from 'react';
import { Alert, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import type { PracticeSessionAnswerDto, PracticeSessionSpeakingAnalyticsDto } from '../../types/session.types';
import { speakingCoverageLabelMap, speakingPaceLabelMap } from '../../constants/speakingSession.constants';
import { getAnalyticsTagColor } from '../../utils/speakingSession.utils';

const { Paragraph: TypoParagraph, Text } = Typography;

interface SpeakingTranscriptAndAnalyticsProps {
    isExaminerLeadingActivePrompt: boolean;
    isUploadingActivePrompt: boolean;
    activeTranscriptText: string;
    activeSpeakingAnalytics?: PracticeSessionSpeakingAnalyticsDto | null;
    activeSavedAnswer?: PracticeSessionAnswerDto | null;
    activeQuestionId: string;
}

export const SpeakingTranscriptAndAnalytics: React.FC<SpeakingTranscriptAndAnalyticsProps> = ({
    isExaminerLeadingActivePrompt,
    isUploadingActivePrompt,
    activeTranscriptText,
    activeSpeakingAnalytics,
    activeSavedAnswer,
    activeQuestionId,
}) => {
    return (
        <>
            {isExaminerLeadingActivePrompt ? (
                <Alert
                    type="info"
                    showIcon
                    message="Examiner đang đọc prompt"
                    description="Khi prompt kết thúc, microphone sẽ tự bật để bạn trả lời câu này."
                />
            ) : null}

            {isUploadingActivePrompt ? (
                <Alert
                    type="info"
                    showIcon
                    message="Đang tạo transcript cho câu trả lời"
                    description="Bản ghi vừa xong đang được lưu và nhận diện lời nói để hiện transcript cho câu này."
                />
            ) : null}

            <div>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    Transcript cho prompt này
                </Text>
                <Card size="small" style={{ borderRadius: 16, background: activeTranscriptText ? '#eefbf3' : '#f8fafc' }}>
                    <TypoParagraph style={{ whiteSpace: 'pre-wrap', margin: 0, color: activeTranscriptText ? '#0f172a' : '#64748b' }}>
                        {activeTranscriptText || 'Transcript sẽ xuất hiện ở đây ngay sau khi bạn dừng ghi âm và hệ thống nhận diện xong.'}
                    </TypoParagraph>
                </Card>
            </div>

            {activeSpeakingAnalytics ? (
                <Card size="small" style={{ borderRadius: 16, background: '#fffbeb' }}>
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <Space wrap>
                            <Text strong>Speaking analytics từ backend</Text>
                            {activeSpeakingAnalytics.estimatedFluencyBand != null ? (
                                <Tag color="gold">Fluency ~ {activeSpeakingAnalytics.estimatedFluencyBand.toFixed(1)}</Tag>
                            ) : null}
                            <Tag color={getAnalyticsTagColor(activeSpeakingAnalytics.paceLabel)}>
                                {speakingPaceLabelMap[activeSpeakingAnalytics.paceLabel]}
                            </Tag>
                            <Tag color={getAnalyticsTagColor(activeSpeakingAnalytics.coverageLabel)}>
                                {speakingCoverageLabelMap[activeSpeakingAnalytics.coverageLabel]}
                            </Tag>
                        </Space>
                        <Row gutter={[12, 12]}>
                            <Col xs={12} md={6}>
                                <Statistic title="Word count" value={activeSpeakingAnalytics.wordCount} />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic title="WPM" value={activeSpeakingAnalytics.wordsPerMinute ?? '—'} />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Coverage"
                                    value={
                                        activeSpeakingAnalytics.coverageRatio != null
                                            ? `${Math.round(activeSpeakingAnalytics.coverageRatio * 100)}%`
                                            : '—'
                                    }
                                />
                            </Col>
                            <Col xs={12} md={6}>
                                <Statistic
                                    title="Target"
                                    value={
                                        activeSpeakingAnalytics.targetDurationSeconds != null
                                            ? `${activeSpeakingAnalytics.targetDurationSeconds}s`
                                            : '—'
                                    }
                                />
                            </Col>
                        </Row>
                    </Space>
                </Card>
            ) : null}

            {(activeSavedAnswer?.feedbacks?.length ?? 0) > 0 ? (
                <Card size="small" style={{ borderRadius: 16 }}>
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <Text strong>Feedback Speaking hiện có</Text>
                        {activeSavedAnswer!.feedbacks!.map((feedback) => (
                            <Alert
                                key={`${activeQuestionId}-${feedback.criteria}`}
                                type="info"
                                showIcon
                                message={`${feedback.criteria} · Band ${feedback.bandScore.toFixed(1)}`}
                                description={feedback.comment || feedback.improvements || 'Chưa có nhận xét chi tiết.'}
                            />
                        ))}
                    </Space>
                </Card>
            ) : null}
        </>
    );
};

