import React from 'react';
import { Alert, Card, Empty, Input, Space, Tag, Typography } from 'antd';
import { EditOutlined, FileImageOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { PracticeSessionWritingTaskDto } from '../../types/session.types';
import {
    WRITING_SUBMIT_MIN_WORDS,
    countWords,
    markdownComponents,
    normalizeBlockMarkdownText,
    parseWritingAssets,
} from './writingRunner.utils';

const { Title, Text } = Typography;

interface WritingTaskBodyProps {
    task: PracticeSessionWritingTaskDto;
    activeTaskIndex: number;
    value: string;
    onChange: (nextValue: string) => void;
}

export const WritingTaskBody: React.FC<WritingTaskBodyProps> = ({
    task,
    activeTaskIndex,
    value,
    onChange,
}) => {
    const wordCount = countWords(value);
    const imageUrls = parseWritingAssets(task.assetsData);

    return (
        <Card id="runner-active-section" key={task.id} bodyStyle={{ padding: 0, overflow: 'hidden' }} style={{ borderRadius: 22 }}>
            <div className="writing-runner-split-layout">
                <div
                    className="writing-runner-split-pane"
                    style={{
                        padding: 20,
                        borderRight: '1px solid #e2e8f0',
                    }}
                >
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Space wrap>
                            <Tag color="orange" icon={<EditOutlined />}>
                                Task {task.taskNumber ?? activeTaskIndex + 1}
                            </Tag>
                        </Space>

                        <Title level={3} style={{ margin: 0, color: '#92400e' }}>
                            Writing Task {task.taskNumber ?? activeTaskIndex + 1}
                        </Title>

                        <div
                            style={{
                                border: '1px solid #fde68a',
                                borderRadius: 18,
                                padding: 18,
                                background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
                            }}
                        >
                            {task.promptText ? (
                                <ReactMarkdown components={markdownComponents}>
                                    {normalizeBlockMarkdownText(task.promptText)}
                                </ReactMarkdown>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Task này chưa có đề bài." />
                            )}
                        </div>

                        {imageUrls.length > 0 ? (
                            <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                <Space>
                                    <FileImageOutlined style={{ color: '#d97706' }} />
                                    <Text strong>Hình minh họa</Text>
                                </Space>
                                {imageUrls.map((url) => (
                                    <img
                                        key={url}
                                        src={url}
                                        alt="Writing task visual"
                                        style={{
                                            width: '100%',
                                            borderRadius: 16,
                                            border: '1px solid #e2e8f0',
                                            objectFit: 'contain',
                                        }}
                                    />
                                ))}
                            </Space>
                        ) : null}
                    </Space>
                </div>

                <div
                    className="writing-runner-split-pane"
                    style={{
                        padding: 20,
                    }}
                >
                    <Space direction="vertical" size={14} style={{ width: '100%', minHeight: '100%' }}>
                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                            <div>
                                <Title level={4} style={{ margin: 0 }}>
                                    Bài viết của bạn
                                </Title>
                                <Text type="secondary">Viết trực tiếp vào khung bên dưới. Hệ thống tự lưu khi bạn nhập.</Text>
                            </div>
                            <Tag
                                color={wordCount >= WRITING_SUBMIT_MIN_WORDS ? 'green' : 'gold'}
                                style={{ borderRadius: 999, paddingInline: 12 }}
                            >
                                {wordCount} từ
                            </Tag>
                        </Space>

                        <Input.TextArea
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            placeholder="Nhập bài viết của bạn tại đây..."
                            spellCheck={false}
                            style={{
                                minHeight: 560,
                                height: 'calc(100vh - 230px)',
                                resize: 'vertical',
                                borderRadius: 18,
                                padding: 18,
                                fontSize: 16,
                                lineHeight: 1.82,
                                color: '#0f172a',
                                background: '#ffffff',
                            }}
                        />

                        <Alert
                            type="info"
                            showIcon
                            message="Chấm AI sau khi nộp"
                            description="Bấm Hoàn thành để lưu bài và chuyển sang bước submit. Hệ thống sẽ gọi Gemini để chấm Writing."
                        />
                    </Space>
                </div>
            </div>
        </Card>
    );
};

