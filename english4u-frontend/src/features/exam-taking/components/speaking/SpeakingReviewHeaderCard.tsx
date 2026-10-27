import React from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import type { PracticeSessionDto, PracticeSessionResultDto } from '../../types/session.types';
import { getSkillLabel } from '../../utils/sessionRouting.utils';
import { formatSeconds, statusColorMap } from './speakingSessionReview.utils';

const { Paragraph, Title } = Typography;

interface SpeakingReviewHeaderCardProps {
    session: PracticeSessionDto;
    result: PracticeSessionResultDto | null;
    promptCount: number;
    canSubmitNow: boolean;
    submitLoading: boolean;
    isRescoreMode: boolean;
    onSubmit: () => void;
    onBackToRunner: () => void;
    onBackToLibrary: () => void;
}

export const SpeakingReviewHeaderCard: React.FC<SpeakingReviewHeaderCardProps> = ({
    session,
    result,
    promptCount,
    canSubmitNow,
    submitLoading,
    isRescoreMode,
    onSubmit,
    onBackToRunner,
    onBackToLibrary,
}) => {
    return (
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
                        <Statistic title="Prompt" value={`${result?.answeredQuestions ?? 0}/${promptCount}`} />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="Band Speaking"
                            value={result?.speakingScore != null ? result.speakingScore.toFixed(1) : '—'}
                        />
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
    );
};

