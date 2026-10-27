import React from 'react';
import { Alert, Card, Input, Space, Tag, Typography } from 'antd';
import { AudioOutlined } from '@ant-design/icons';
import type { SpeakingPromptEntry } from '../../utils/speakingSession.utils';

const { Paragraph, Text, Title } = Typography;
const { TextArea } = Input;

interface SpeakingPromptDetailsCardProps {
    activePrompt: SpeakingPromptEntry;
    preparationLimitSeconds: number;
    hasPreparationStarted: boolean;
    preparationRemainingSeconds: number;
    activeCueCardPoints: string[];
    activeCueCardDraft: string;
    onDraftChange: (value: string) => void;
}

export const SpeakingPromptDetailsCard: React.FC<SpeakingPromptDetailsCardProps> = ({
    activePrompt,
    preparationLimitSeconds,
    hasPreparationStarted,
    preparationRemainingSeconds,
    activeCueCardPoints,
    activeCueCardDraft,
    onDraftChange,
}) => {
    return (
        <>
            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                <Space wrap>
                    <Tag color="red">Part {activePrompt.partNumber ?? '—'}</Tag>
                    <Tag>{activePrompt.sectionTitle || 'Speaking section'}</Tag>
                    <Tag icon={<AudioOutlined />}>{activePrompt.promptIndex}</Tag>
                </Space>
                <Space wrap>
                    {preparationLimitSeconds > 0 ? (
                        <Tag color={!hasPreparationStarted || preparationRemainingSeconds > 0 ? 'gold' : 'green'}>
                            Prep {preparationRemainingSeconds}s
                        </Tag>
                    ) : null}
                </Space>
            </Space>

            <div>
                <Title level={4} style={{ marginBottom: 8 }}>
                    {activePrompt.question.content}
                </Title>
                {activePrompt.partDescription ? (
                    <Paragraph style={{ marginBottom: 0, color: '#64748b' }}>
                        {activePrompt.partDescription}
                    </Paragraph>
                ) : null}
            </div>

            {preparationLimitSeconds > 0 ? (
                <Alert
                    type={!hasPreparationStarted || preparationRemainingSeconds > 0 ? 'info' : 'success'}
                    showIcon
                    message="Bước 3 · Part 2 preparation"
                    description={
                        !hasPreparationStarted
                            ? 'Bấm “Nghe examiner rồi trả lời” để examiner đọc cue card. Khi examiner đọc xong, hệ thống mới bắt đầu 60 giây chuẩn bị.'
                            : preparationRemainingSeconds > 0
                              ? `Đồng hồ chuẩn bị đang chạy. Bạn còn ${preparationRemainingSeconds} giây để đọc cue card và ghi nháp từ khóa.`
                              : 'Thời gian chuẩn bị đã hết. Bạn có thể bắt đầu ghi âm phần độc thoại bất cứ lúc nào.'
                    }
                />
            ) : null}

            {activeCueCardPoints.length > 0 ? (
                <Card size="small" style={{ borderRadius: 16, background: '#f8fafc' }}>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        <Text strong>Cue card / talking points</Text>
                        {activeCueCardPoints.map((point) => (
                            <Text key={point} style={{ color: '#334155' }}>
                                • {point}
                            </Text>
                        ))}
                    </Space>
                </Card>
            ) : null}

            {activePrompt.partNumber === 2 ? (
                <div>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>
                        Textbox ghi nháp Part 2
                    </Text>
                    <TextArea
                        rows={3}
                        value={activeCueCardDraft}
                        onChange={(event) => onDraftChange(event.target.value)}
                        placeholder="Gõ nhanh từ khóa, ý chính hoặc ví dụ muốn triển khai trong 2 phút nói."
                    />
                </div>
            ) : null}
        </>
    );
};

