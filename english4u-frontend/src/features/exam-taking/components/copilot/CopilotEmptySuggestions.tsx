import { useMemo } from 'react';
import { Button, Empty, Space } from 'antd';
import { BulbOutlined } from '@ant-design/icons';

interface CopilotEmptySuggestionsProps {
    skillType?: string | null;
    onSendMessage: (suggestion: string) => void;
}

export const CopilotEmptySuggestions = ({
    skillType,
    onSendMessage,
}: CopilotEmptySuggestionsProps) => {
    const promptSuggestions = useMemo(() => {
        const normalizedSkill = skillType?.trim().toUpperCase();

        if (normalizedSkill === 'WRITING') {
            return [
                'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
                'Chỉ ra các điểm mình cần cải thiện nhất để tăng điểm Writing.',
                'Đánh giá bố cục, từ vựng và ngữ pháp của 2 part của bài viết.',
            ];
        }

        if (normalizedSkill === 'READING') {
            return [
                'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
                'Tóm tắt các dạng câu mình làm chưa tốt trong bài Reading này.',
                'Chỉ cách tìm đáp án nhanh hơn cho các câu mình đã làm sai.',
            ];
        }

        if (normalizedSkill === 'LISTENING') {
            return [
                'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
                'Tóm tắt các phần nghe mình làm chưa tốt trong bài này.',
                'Chỉ cách nghe keyword và loại đáp án nhiễu hiệu quả hơn.',
            ];
        }

        return [
            'Giải thích toàn bộ lỗi sai nổi bật trong bài này.',
            'Tóm tắt những phần mình làm chưa tốt trong bài này.',
            'Chỉ ra các điểm quan trọng mình nên cải thiện trong bài này.',
        ];
    }, [skillType]);

    return (
        <div
            style={{
                minHeight: '100%',
                display: 'grid',
                placeItems: 'center',
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: 420,
                    textAlign: 'center',
                }}
            >
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Copilot có thể trả lời xuyên suốt về toàn bộ bài đã làm."
                />
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    {promptSuggestions.map((suggestion) => (
                        <Button
                            key={suggestion}
                            icon={<BulbOutlined />}
                            onClick={() => onSendMessage(suggestion)}
                            block
                            style={{
                                height: 'auto',
                                whiteSpace: 'normal',
                                lineHeight: 1.5,
                                paddingBlock: 10,
                            }}
                        >
                            {suggestion}
                        </Button>
                    ))}
                </Space>
            </div>
        </div>
    );
};

