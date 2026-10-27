import React from 'react';
import { Button, Card, Col, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { SpeakingPromptEntry } from '../../utils/speakingSession.utils';

const { Paragraph, Text, Title } = Typography;

interface SpeakingPromptSidebarProps {
    promptEntries: SpeakingPromptEntry[];
    activeQuestionId: string;
    lockedPart2QuestionIds: Set<string>;
    uploadingQuestionIds: string[];
    hasPromptResponse: (questionId: string) => boolean;
    hasResolvedTranscriptOrAnalytics: (questionId: string) => boolean;
    isRecording: boolean;
    isPreparingPromptPlayback: boolean;
    isPromptPlaying: boolean;
    hasQueuedAutoRecording: boolean;
    isTransitioning: boolean;
    onSelectPrompt: (questionId: string) => void;
}

export const SpeakingPromptSidebar: React.FC<SpeakingPromptSidebarProps> = ({
    promptEntries,
    activeQuestionId,
    lockedPart2QuestionIds,
    uploadingQuestionIds,
    hasPromptResponse,
    hasResolvedTranscriptOrAnalytics,
    isRecording,
    isPreparingPromptPlayback,
    isPromptPlaying,
    hasQueuedAutoRecording,
    isTransitioning,
    onSelectPrompt,
}) => {
    return (
        <Col xs={24} xl={8} className="speaking-runner-sidebar-col">
            <Card className="speaking-runner-sidebar-card">
                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                    <Title level={5} style={{ margin: 0 }}>
                        Danh sách prompt
                    </Title>
                    <Paragraph style={{ margin: 0, color: '#64748b' }}>
                        Mỗi lượt trả lời sẽ cho examiner nói trước, sau đó hệ thống tự chuyển sang ghi âm. Riêng Part 2 · Prompt 1 chỉ bắt đầu 60 giây chuẩn bị sau khi examiner đọc xong.
                    </Paragraph>

                    <div className="speaking-runner-prompt-list">
                        {promptEntries.map((entry) => {
                            const hasResponse = hasPromptResponse(entry.question.id);
                            const isActive = entry.question.id === activeQuestionId;
                            const isLocked = lockedPart2QuestionIds.has(entry.question.id);
                            const isUploading =
                                uploadingQuestionIds.includes(entry.question.id) &&
                                !hasResolvedTranscriptOrAnalytics(entry.question.id);

                            return (
                                <Button
                                    key={entry.question.id}
                                    block
                                    type={isActive ? 'primary' : 'default'}
                                    disabled={
                                        !isActive ||
                                        isLocked ||
                                        isRecording ||
                                        isPreparingPromptPlayback ||
                                        isPromptPlaying ||
                                        hasQueuedAutoRecording ||
                                        isTransitioning
                                    }
                                    onClick={() => onSelectPrompt(entry.question.id)}
                                    style={{
                                        height: 'auto',
                                        textAlign: 'left',
                                        justifyContent: 'flex-start',
                                        padding: 14,
                                        borderRadius: 16,
                                    }}
                                >
                                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                        <Space wrap>
                                            <Text strong style={{ color: isActive ? '#fff' : '#0f172a' }}>
                                                Part {entry.partNumber ?? '—'} · Prompt {entry.promptIndex}
                                            </Text>
                                            {isUploading ? (
                                                <Tag icon={<LoadingOutlined />} color="processing">
                                                    Uploading
                                                </Tag>
                                            ) : isLocked ? (
                                                <Tag color="default">Chờ prompt trước</Tag>
                                            ) : hasResponse ? (
                                                <Tag icon={<CheckCircleOutlined />} color="success">
                                                    Đã có phản hồi
                                                </Tag>
                                            ) : (
                                                <Tag>Chưa trả lời</Tag>
                                            )}
                                        </Space>
                                        <Text
                                            style={{
                                                color: isActive ? 'rgba(255,255,255,0.88)' : '#475569',
                                                whiteSpace: 'normal',
                                            }}
                                        >
                                            {entry.question.content}
                                        </Text>
                                    </Space>
                                </Button>
                            );
                        })}
                    </div>
                </Space>
            </Card>
        </Col>
    );
};

