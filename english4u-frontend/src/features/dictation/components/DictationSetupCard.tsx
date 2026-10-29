import React, { useState } from 'react';
import { Button, Card, Input, Radio, Segmented, Select, Tag, Typography } from 'antd';
import {
    AudioOutlined,
    BookOutlined,
    CoffeeOutlined,
    EditOutlined,
    FileTextOutlined,
    GlobalOutlined,
    LaptopOutlined,
    RocketOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import { motion } from 'framer-motion';
import type {
    DictationFormat,
    DictationGenerateRequest,
    DictationLevel,
} from '../types/dictation.types';
import { CURATED_VOICES } from '../constants/dictation.constants';
import { AccentBadge } from './AccentBadge';

const { Title, Paragraph, Text } = Typography;

interface DictationSetupCardProps {
    onStart: (request: DictationGenerateRequest, voiceId: string) => void;
    isLoading: boolean;
}

export const DictationSetupCard: React.FC<DictationSetupCardProps> = ({
    onStart,
    isLoading,
}) => {
    const [format, setFormat] = useState<DictationFormat>('sentences');
    const [topicPreset, setTopicPreset] = useState<string>('daily');
    const [customTopic, setCustomTopic] = useState<string>('');
    const [level, setLevel] = useState<DictationLevel>('medium');
    const [count, setCount] = useState<number>(5);
    const [selectedVoiceId, setSelectedVoiceId] = useState<string>('en-US-JennyNeural');

    const handleStart = () => {
        const topic = topicPreset === 'custom' && customTopic.trim() ? customTopic.trim() : topicPreset;
        onStart(
            {
                format,
                topic,
                level,
                count: format === 'paragraph' ? 1 : count,
            },
            selectedVoiceId
        );
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{ maxWidth: 1220, margin: '0 auto', width: '100%' }}
        >
            <Card
                bordered={false}
                style={{
                    borderRadius: 24,
                    boxShadow: '0 12px 36px rgba(15, 23, 42, 0.07)',
                    background: '#ffffff',
                    padding: '8px 12px',
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 14px',
                            borderRadius: 999,
                            background: 'rgba(79, 70, 229, 0.08)',
                            color: '#4f46e5',
                            fontWeight: 700,
                            fontSize: 13,
                            marginBottom: 12,
                        }}
                    >
                        <AudioOutlined /> Dictation Mode (Audio Cloze & Chép Chính Tả)
                    </div>
                    <Title level={2} style={{ margin: 0, fontWeight: 850, color: '#0f172a' }}>
                        Luyện Nghe Chép Chính Tả
                    </Title>
                    <Paragraph style={{ color: '#64748b', fontSize: 15, margin: '8px auto 0', maxWidth: 560 }}>
                        Phương pháp số 1 để xóa bỏ "điểm mù âm thanh", bắt kịp hiện tượng nuốt âm, nối âm và tăng tốc độ phản xạ nghe tiếng Anh.
                    </Paragraph>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* 1. Format Selection */}
                    <div>
                        <Text strong style={{ fontSize: 14, color: '#334155', display: 'block', marginBottom: 10 }}>
                            1. Định dạng bài luyện (Practice Format)
                        </Text>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                            {[
                                {
                                    id: 'sentences' as DictationFormat,
                                    title: 'Từng câu đơn lẻ',
                                    badge: 'Khuyên dùng',
                                    desc: 'Nghe từng câu ngắn (3–8s), gõ và kiểm tra lỗi ngay lập tức.',
                                    icon: <EditOutlined style={{ fontSize: 20, color: '#4f46e5' }} />,
                                },
                                {
                                    id: 'paragraph' as DictationFormat,
                                    title: 'Một đoạn văn',
                                    badge: 'Ngữ cảnh',
                                    desc: 'Nghe mẩu chuyện 4-6 câu liền mạch, bẻ nhỏ từng câu để gõ rồi ghép bài hoàn chỉnh.',
                                    icon: <FileTextOutlined style={{ fontSize: 20, color: '#0ea5e9' }} />,
                                },
                                {
                                    id: 'cloze' as DictationFormat,
                                    title: 'Điền từ khuyết',
                                    badge: 'Nhẹ nhàng',
                                    desc: 'Hiện sẵn 70% nội dung, chỉ cần nghe và điền vào các ô trống bị ẩn.',
                                    icon: <ThunderboltOutlined style={{ fontSize: 20, color: '#f59e0b' }} />,
                                },
                            ].map((item) => {
                                const active = format === item.id;
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setFormat(item.id)}
                                        style={{
                                            padding: '16px',
                                            borderRadius: 16,
                                            border: `2px solid ${active ? '#4f46e5' : '#e2e8f0'}`,
                                            background: active ? 'rgba(79, 70, 229, 0.04)' : '#fafafa',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                {item.icon}
                                                <span style={{ fontWeight: 750, color: '#0f172a', fontSize: 15 }}>{item.title}</span>
                                            </div>
                                            <Tag color={active ? 'blue' : 'default'} style={{ margin: 0, borderRadius: 6, fontWeight: 600 }}>
                                                {item.badge}
                                            </Tag>
                                        </div>
                                        <Text style={{ fontSize: 13, color: '#64748b' }}>{item.desc}</Text>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 2. Quantity (if sentences) */}
                    {format !== 'paragraph' && (
                        <div>
                            <Text strong style={{ fontSize: 14, color: '#334155', display: 'block', marginBottom: 10 }}>
                                2. Số lượng câu
                            </Text>
                            <Segmented
                                value={count}
                                onChange={(val: string | number) => setCount(Number(val))}
                                size="large"
                                options={[
                                    { label: '⚡ 3 câu (Nhanh - 2 phút)', value: 3 },
                                    { label: '🎯 5 câu (Chuẩn - 5 phút)', value: 5 },
                                    { label: '🔥 10 câu (Chuyên sâu)', value: 10 },
                                ]}
                                block
                            />
                        </div>
                    )}

                    {/* 3. Topic Selection */}
                    <div>
                        <Text strong style={{ fontSize: 14, color: '#334155', display: 'block', marginBottom: 10 }}>
                            {format !== 'paragraph' ? '3. Chủ đề luyện tập' : '2. Chủ đề luyện tập'}
                        </Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                            {[
                                { key: 'daily', label: '☕ Đời sống hàng ngày', icon: <CoffeeOutlined /> },
                                { key: 'business', label: '💼 Công việc & Phỏng vấn', icon: <LaptopOutlined /> },
                                { key: 'travel', label: '✈️ Du lịch & Khám phá', icon: <GlobalOutlined /> },
                                { key: 'academic', label: '🎓 Học thuật & Khoa học', icon: <BookOutlined /> },
                                { key: 'custom', label: '✏️ Chủ đề tự nhập...', icon: <EditOutlined /> },
                            ].map((t) => {
                                const isSel = topicPreset === t.key;
                                return (
                                    <Tag.CheckableTag
                                        key={t.key}
                                        checked={isSel}
                                        onChange={() => setTopicPreset(t.key)}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: 999,
                                            fontSize: 14,
                                            fontWeight: 650,
                                            border: `1px solid ${isSel ? '#4f46e5' : '#e2e8f0'}`,
                                            background: isSel ? '#4f46e5' : '#fff',
                                            color: isSel ? '#fff' : '#475569',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {t.label}
                                    </Tag.CheckableTag>
                                );
                            })}
                        </div>

                        {topicPreset === 'custom' && (
                            <Input
                                placeholder="Ví dụ: Coffee culture, Artificial Intelligence, Football, Healthy food..."
                                value={customTopic}
                                onChange={(e) => setCustomTopic(e.target.value)}
                                style={{ borderRadius: 12, padding: '10px 14px', fontSize: 14 }}
                                maxLength={60}
                            />
                        )}
                    </div>

                    {/* 4. Level & Voice */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'flex-start' }}>
                        <div>
                            <Text strong style={{ fontSize: 14, color: '#334155', display: 'block', marginBottom: 10 }}>
                                Độ khó
                            </Text>
                            <Radio.Group
                                value={level}
                                onChange={(e) => setLevel(e.target.value)}
                                size="large"
                                buttonStyle="solid"
                                style={{ width: '100%', display: 'flex', height: 40 }}
                            >
                                <Radio.Button
                                    value="easy"
                                    style={{
                                        flex: 1,
                                        height: 40,
                                        lineHeight: '38px',
                                        textAlign: 'center',
                                        borderRadius: '10px 0 0 10px',
                                        fontWeight: 650,
                                        fontSize: 14,
                                    }}
                                >
                                    Dễ (A2-B1)
                                </Radio.Button>
                                <Radio.Button
                                    value="medium"
                                    style={{
                                        flex: 1,
                                        height: 40,
                                        lineHeight: '38px',
                                        textAlign: 'center',
                                        fontWeight: 650,
                                        fontSize: 14,
                                    }}
                                >
                                    Vừa (B1-B2)
                                </Radio.Button>
                                <Radio.Button
                                    value="hard"
                                    style={{
                                        flex: 1,
                                        height: 40,
                                        lineHeight: '38px',
                                        textAlign: 'center',
                                        borderRadius: '0 10px 10px 0',
                                        fontWeight: 650,
                                        fontSize: 14,
                                    }}
                                >
                                    Khó (B2-C1)
                                </Radio.Button>
                            </Radio.Group>
                        </div>

                        <div>
                            <Text strong style={{ fontSize: 14, color: '#334155', display: 'block', marginBottom: 10 }}>
                                Giọng đọc AI tự nhiên
                            </Text>
                            <Select
                                value={selectedVoiceId}
                                onChange={(val) => setSelectedVoiceId(val)}
                                size="large"
                                style={{ width: '100%', height: 40 }}
                                dropdownStyle={{ borderRadius: 14 }}
                                popupMatchSelectWidth={false}
                                options={[
                                    {
                                        label: (
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                <AccentBadge accent="US" style={{ marginRight: 6 }} /> Giọng Mỹ (United States)
                                            </span>
                                        ),
                                        options: CURATED_VOICES.filter((v) => v.accent === 'US').map((v) => ({
                                            value: v.id,
                                            label: (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AccentBadge accent={v.accent} />
                                                    <span style={{ fontWeight: 650 }}>{v.name}</span>
                                                    <span style={{ color: '#64748b', fontSize: 13 }}>
                                                        ({v.gender === 'female' ? 'Nữ' : 'Nam'}) – {v.description.split('–')[1]?.trim() ?? ''}
                                                    </span>
                                                </div>
                                            ),
                                        })),
                                    },
                                    {
                                        label: (
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                <AccentBadge accent="UK" style={{ marginRight: 6 }} /> Giọng Anh (United Kingdom)
                                            </span>
                                        ),
                                        options: CURATED_VOICES.filter((v) => v.accent === 'UK').map((v) => ({
                                            value: v.id,
                                            label: (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AccentBadge accent={v.accent} />
                                                    <span style={{ fontWeight: 650 }}>{v.name}</span>
                                                    <span style={{ color: '#64748b', fontSize: 13 }}>
                                                        ({v.gender === 'female' ? 'Nữ' : 'Nam'}) – {v.description.split('–')[1]?.trim() ?? ''}
                                                    </span>
                                                </div>
                                            ),
                                        })),
                                    },
                                    {
                                        label: (
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                <AccentBadge accent="AU" style={{ marginRight: 6 }} /> Giọng Úc (Australia)
                                            </span>
                                        ),
                                        options: CURATED_VOICES.filter((v) => v.accent === 'AU').map((v) => ({
                                            value: v.id,
                                            label: (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AccentBadge accent={v.accent} />
                                                    <span style={{ fontWeight: 650 }}>{v.name}</span>
                                                    <span style={{ color: '#64748b', fontSize: 13 }}>
                                                        ({v.gender === 'female' ? 'Nữ' : 'Nam'}) – {v.description.split('–')[1]?.trim() ?? ''}
                                                    </span>
                                                </div>
                                            ),
                                        })),
                                    },
                                    {
                                        label: (
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                <AccentBadge accent="CA" style={{ marginRight: 6 }} /> Giọng Canada
                                            </span>
                                        ),
                                        options: CURATED_VOICES.filter((v) => v.accent === 'CA').map((v) => ({
                                            value: v.id,
                                            label: (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AccentBadge accent={v.accent} />
                                                    <span style={{ fontWeight: 650 }}>{v.name}</span>
                                                    <span style={{ color: '#64748b', fontSize: 13 }}>
                                                        ({v.gender === 'female' ? 'Nữ' : 'Nam'}) – {v.description.split('–')[1]?.trim() ?? ''}
                                                    </span>
                                                </div>
                                            ),
                                        })),
                                    },
                                    {
                                        label: (
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>
                                                <AccentBadge accent="IE" style={{ marginRight: 6 }} /> Giọng Ireland & <AccentBadge accent="IN" style={{ marginRight: 6 }} /> Ấn Độ
                                            </span>
                                        ),
                                        options: CURATED_VOICES.filter((v) => v.accent === 'IE' || v.accent === 'IN').map((v) => ({
                                            value: v.id,
                                            label: (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AccentBadge accent={v.accent} />
                                                    <span style={{ fontWeight: 650 }}>{v.name}</span>
                                                    <span style={{ color: '#64748b', fontSize: 13 }}>
                                                        ({v.gender === 'female' ? 'Nữ' : 'Nam'}) – {v.description.split('–')[1]?.trim() ?? ''}
                                                    </span>
                                                </div>
                                            ),
                                        })),
                                    },
                                ]}
                            />
                        </div>
                    </div>

                    {/* Start Button */}
                    <Button
                        type="primary"
                        size="large"
                        icon={<RocketOutlined />}
                        loading={isLoading}
                        onClick={handleStart}
                        style={{
                            height: 52,
                            borderRadius: 14,
                            fontWeight: 750,
                            fontSize: 16,
                            background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                            border: 'none',
                            boxShadow: '0 8px 24px rgba(79, 70, 229, 0.28)',
                            marginTop: 10,
                        }}
                        block
                    >
                        {isLoading ? 'AI đang tạo bài luyện tập...' : ' Bắt đầu luyện chép chính tả'}
                    </Button>
                </div>
            </Card>
        </motion.div>
    );
};
