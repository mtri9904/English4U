import React, { useState } from 'react';
import {
    Card,
    Button,
    Modal,
    Input,
    Form,
    Tag,
    Space,
    Typography,
    Row,
    Col,
    message,
    Popconfirm,
    Empty,
    Spin,
    Select,
} from 'antd';
import {
    PlusOutlined,
    ThunderboltOutlined,
    BookOutlined,
    FireOutlined,
    DeleteOutlined,
    PlayCircleOutlined,
    BulbOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { PageLoadingState, PageErrorState } from '@/components';
import { useQueryClient } from '@tanstack/react-query';
import {
    useFlashcardDecksQuery,
    flashcardKeys,
} from '../hooks/useFlashcardQueries';
import { flashcardService as flashcardApi } from '../services/flashcard.service';
import type { CreateDeckRequest, AiEnrichWordResponse } from '../types/flashcard.types';

const { Title, Text, Paragraph } = Typography;

import { DECK_COLORS } from '../constants/flashcard.constants';
export const FlashcardDeckListPage: React.FC = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: decks = [], isLoading, isError, refetch } = useFlashcardDecksQuery();

    // Modals
    const [isCreateDeckOpen, setIsCreateDeckOpen] = useState(false);
    const [isAiQuickAddOpen, setIsAiQuickAddOpen] = useState(false);
    const [createDeckForm] = Form.useForm();
    const [aiQuickAddForm] = Form.useForm();

    // AI Enrichment state
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [enrichedResult, setEnrichedResult] = useState<AiEnrichWordResponse | null>(null);

    const totalCards = decks.reduce((sum, d) => sum + d.totalCards, 0);
    const totalDue = decks.reduce((sum, d) => sum + d.dueCards, 0);

    const playAudio = (text: string, audioUrl?: string) => {
        if (audioUrl) {
            try {
                const audio = new Audio(audioUrl);
                audio.play().catch(() => playSpeech(text));
                return;
            } catch {
                // fallback
            }
        }
        playSpeech(text);
    };

    const playSpeech = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    };

    const handleCreateDeck = async (values: CreateDeckRequest) => {
        try {
            await flashcardApi.createDeck(values);
            message.success('Tạo bộ thẻ mới thành công!');
            setIsCreateDeckOpen(false);
            createDeckForm.resetFields();
            queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
        } catch {
            message.error('Không thể tạo bộ thẻ. Vui lòng thử lại.');
        }
    };

    const handleDeleteDeck = async (deckId: string) => {
        try {
            await flashcardApi.deleteDeck(deckId);
            message.success('Đã xóa bộ thẻ.');
            queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
        } catch {
            message.error('Không thể xóa bộ thẻ.');
        }
    };

    const handleAiAnalyze = async () => {
        const word = aiQuickAddForm.getFieldValue('word');
        if (!word?.trim()) {
            message.warning('Vui lòng nhập từ vựng trước khi phân tích!');
            return;
        }

        try {
            setIsAiLoading(true);
            const res = await flashcardApi.enrichWord(word.trim());
            setEnrichedResult(res);
            message.success('Đã tìm phiên âm, nghĩa tiếng Việt và ảnh thành công!');
        } catch {
            message.error('Không thể tra cứu thông tin từ vựng. Vui lòng thử lại.');
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleSaveAiWord = async () => {
        if (!enrichedResult) return;
        const deckId = aiQuickAddForm.getFieldValue('deckId');
        if (!deckId) {
            message.warning('Vui lòng chọn bộ thẻ muốn lưu vào!');
            return;
        }

        try {
            await flashcardApi.createCard({
                deckId,
                word: enrichedResult.word,
                meaningVi: enrichedResult.meaningVi,
                phonetic: enrichedResult.phonetic,
                partOfSpeech: enrichedResult.partOfSpeech,
                definitionEn: enrichedResult.definitionEn,
                exampleSentence: enrichedResult.exampleSentence,
                exampleSentenceVi: enrichedResult.exampleSentenceVi,
                collocations: enrichedResult.collocations,
                imageUrl: enrichedResult.imageUrl,
                audioUrl: enrichedResult.audioUrl,
                quizDistractors: enrichedResult.quizDistractors,
            });

            message.success(`Đã thêm từ "${enrichedResult.word}" vào bộ thẻ!`);
            setIsAiQuickAddOpen(false);
            setEnrichedResult(null);
            aiQuickAddForm.resetFields();
            queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
        } catch {
            message.error('Không thể lưu từ vào bộ thẻ.');
        }
    };

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 16px 40px' }}>
            {/* Header Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #38bdf8 100%)',
                borderRadius: 20,
                padding: '36px 32px',
                color: '#fff',
                marginBottom: 32,
                boxShadow: '0 12px 36px rgba(37,99,235,0.2)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)', padding: '6px 14px', borderRadius: 999, fontSize: '0.825rem', fontWeight: 600, marginBottom: 12 }}>
                        <ThunderboltOutlined style={{ color: '#fef08a' }} />
                        Smart Spaced Repetition (SM-2) & AI Visual Memory
                    </div>
                    <Title level={2} style={{ color: '#fff', margin: '0 0 10px', fontWeight: 800 }}>
                        Sổ Thẻ Từ Vựng Thông Minh — English4U
                    </Title>
                    <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1rem', maxWidth: 650, margin: '0 0 24px', lineHeight: 1.6 }}>
                        Ghi nhớ từ vựng IELTS đỉnh cao qua hình ảnh minh họa 3D tự động, phiên âm IPA, luyện viết câu có AI chấm điểm và thuật toán lặp lại ngắt quãng chống quên.
                    </Paragraph>

                    <Space wrap size="middle">
                        <Button
                            type="primary"
                            size="large"
                            icon={<BulbOutlined />}
                            onClick={() => setIsAiQuickAddOpen(true)}
                            style={{ background: '#fff', color: '#1d4ed8', fontWeight: 700, borderColor: '#fff', height: 44, borderRadius: 12 }}
                        >
                            Thêm từ nhanh bằng AI
                        </Button>
                        <Button
                            ghost
                            size="large"
                            icon={<PlusOutlined />}
                            onClick={() => setIsCreateDeckOpen(true)}
                            style={{ fontWeight: 600, height: 44, borderRadius: 12 }}
                        >
                            Tạo bộ thẻ mới
                        </Button>
                    </Space>
                </div>

                {/* Stat pills inside banner */}
                <div style={{
                    marginTop: 28,
                    paddingTop: 20,
                    borderTop: '1px solid rgba(255,255,255,0.2)',
                    display: 'flex',
                    gap: 32,
                    flexWrap: 'wrap'
                }}>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>Tổng số bộ thẻ</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{decks.length}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>Tổng từ vựng đang học</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{totalCards}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>Thẻ cần ôn hôm nay</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalDue > 0 ? '#fde047' : '#fff' }}>
                            {totalDue} {totalDue > 0 && <FireOutlined />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Decks Grid */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                    Danh sách bộ thẻ ({decks.length})
                </Title>
            </div>

            {isLoading ? (
                <PageLoadingState type="spin" tip="Đang nạp các bộ thẻ từ vựng..." />
            ) : isError ? (
                <PageErrorState
                    title="Không thể tải danh sách bộ thẻ"
                    onRetry={() => refetch()}
                />
            ) : decks.length === 0 ? (
                <Card style={{ borderRadius: 16, textAlign: 'center', padding: '40px 20px' }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Bạn chưa có bộ thẻ từ vựng nào. Hãy tạo ngay một bộ thẻ hoặc dùng AI để thêm từ nhé!"
                    >
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateDeckOpen(true)}>
                            Tạo bộ thẻ đầu tiên
                        </Button>
                    </Empty>
                </Card>
            ) : (
                <Row gutter={[20, 20]}>
                    {decks.map((deck) => (
                        <Col xs={24} sm={12} lg={8} key={deck.id}>
                            <Card
                                hoverable
                                style={{
                                    borderRadius: 16,
                                    overflow: 'hidden',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.03)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%'
                                }}
                                bodyStyle={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 20 }}
                            >
                                {/* Color Top Line */}
                                <div style={{ height: 6, background: deck.color, margin: '-20px -20px 16px -20px' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 10,
                                            background: `${deck.color}15`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: deck.color,
                                            fontSize: 18
                                        }}>
                                            <BookOutlined />
                                        </div>
                                        <Title level={4} style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                                            {deck.title}
                                        </Title>
                                    </div>
                                    {deck.dueCards > 0 && (
                                        <Tag color="red" style={{ borderRadius: 999, fontWeight: 600 }}>
                                            {deck.dueCards} cần ôn
                                        </Tag>
                                    )}
                                </div>

                                <Paragraph style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.5, flex: 1, margin: '8px 0 16px' }} ellipsis={{ rows: 2 }}>
                                    {deck.description || 'Chưa có mô tả cho bộ thẻ này.'}
                                </Paragraph>

                                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Tổng số từ:</span>
                                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{deck.totalCards} thẻ</span>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                                    <Button
                                        type="primary"
                                        icon={<PlayCircleOutlined />}
                                        onClick={() => navigate(`/app/flashcards/${deck.id}/study`)}
                                        style={{ flex: 1, borderRadius: 10, fontWeight: 600, background: deck.color, borderColor: deck.color }}
                                        disabled={deck.totalCards === 0}
                                    >
                                        Học ngay
                                    </Button>
                                    <Button
                                        onClick={() => navigate(`/app/flashcards/${deck.id}`)}
                                        style={{ borderRadius: 10, fontWeight: 600 }}
                                    >
                                        Chi tiết
                                    </Button>
                                    <Popconfirm
                                        title="Xóa bộ thẻ?"
                                        description="Hành động này sẽ xóa toàn bộ các thẻ từ vựng bên trong."
                                        onConfirm={() => handleDeleteDeck(deck.id)}
                                        okText="Xóa"
                                        cancelText="Hủy"
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button danger icon={<DeleteOutlined />} style={{ borderRadius: 10 }} />
                                    </Popconfirm>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}

            {/* Modal: Create Deck */}
            <Modal
                title="Tạo bộ thẻ từ vựng mới"
                open={isCreateDeckOpen}
                onCancel={() => setIsCreateDeckOpen(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={createDeckForm}
                    layout="vertical"
                    onFinish={handleCreateDeck}
                    initialValues={{ color: '#2563eb', isPublic: false }}
                >
                    <Form.Item
                        name="title"
                        label="Tiêu đề bộ thẻ"
                        rules={[{ required: true, message: 'Vui lòng nhập tên bộ thẻ!' }]}
                    >
                        <Input placeholder="Ví dụ: Cambridge 19 Reading Test 1, IELTS Writing Task 2..." />
                    </Form.Item>

                    <Form.Item name="description" label="Mô tả">
                        <Input.TextArea rows={3} placeholder="Mô tả ngắn gọn mục tiêu của bộ từ vựng này..." />
                    </Form.Item>

                    <Form.Item name="color" label="Màu sắc chủ đạo">
                        <Select options={DECK_COLORS} />
                    </Form.Item>

                    <div style={{ textAlign: 'right', marginTop: 16 }}>
                        <Space>
                            <Button onClick={() => setIsCreateDeckOpen(false)}>Hủy</Button>
                            <Button type="primary" htmlType="submit">
                                Tạo bộ thẻ
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>

            {/* Modal: AI Quick Add Word */}
            <Modal
                title={
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1d4ed8' }}>
                        <BulbOutlined /> Thêm từ vựng siêu tốc (Tự động phiên âm, nghĩa tiếng Việt & ảnh 0.1s)
                    </span>
                }
                open={isAiQuickAddOpen}
                onCancel={() => {
                    setIsAiQuickAddOpen(false);
                    setEnrichedResult(null);
                }}
                footer={null}
                width={650}
                destroyOnClose
            >
                <Form form={aiQuickAddForm} layout="vertical">
                    <Form.Item
                        name="word"
                        label="Nhập từ vựng hoặc cụm từ tiếng Anh"
                        rules={[{ required: true, message: 'Vui lòng nhập từ vựng!' }]}
                    >
                        <Input
                            size="large"
                            placeholder="Ví dụ: ubiquitous, ameliorate, spill the beans..."
                            suffix={
                                <Button
                                    type="primary"
                                    icon={<BulbOutlined />}
                                    loading={isAiLoading}
                                    onClick={handleAiAnalyze}
                                    style={{ borderRadius: 8 }}
                                >
                                    AI Phân tích
                                </Button>
                            }
                            onPressEnter={handleAiAnalyze}
                        />
                    </Form.Item>

                    <Form.Item
                        name="deckId"
                        label="Lưu vào bộ thẻ"
                        rules={[{ required: true, message: 'Vui lòng chọn bộ thẻ!' }]}
                        initialValue={decks[0]?.id}
                    >
                        <Select
                            placeholder="Chọn bộ thẻ..."
                            options={decks.map((d) => ({ label: `${d.title} (${d.totalCards} từ)`, value: d.id }))}
                        />
                    </Form.Item>

                    {/* AI Preview Result */}
                    {isAiLoading && (
                        <div style={{ textAlign: 'center', padding: '30px 0' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: 12, color: '#2563eb', fontWeight: 600 }}>
                                AI đang tra cứu phiên âm, dịch nghĩa và vẽ ảnh minh họa 3D...
                            </div>
                        </div>
                    )}

                    {enrichedResult && !isAiLoading && (
                        <Card
                            style={{
                                marginTop: 16,
                                borderRadius: 16,
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                overflow: 'hidden'
                            }}
                        >
                            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                                {/* 3D Image preview */}
                                {enrichedResult.imageUrl && (
                                    <img
                                        src={enrichedResult.imageUrl}
                                        alt={enrichedResult.word}
                                        style={{
                                            width: 140,
                                            height: 105,
                                            borderRadius: 12,
                                            objectFit: 'cover',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                        }}
                                    />
                                )}
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <Text strong style={{ fontSize: '1.25rem', color: '#0f172a' }}>
                                            {enrichedResult.word}
                                        </Text>
                                        <Tag color="blue">{enrichedResult.partOfSpeech}</Tag>
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<SoundOutlined />}
                                            onClick={() => playAudio(enrichedResult.word, enrichedResult.audioUrl)}
                                        />
                                    </div>
                                    <div style={{ color: '#64748b', fontStyle: 'italic', marginBottom: 6 }}>
                                        {enrichedResult.phonetic}
                                    </div>
                                    <div style={{ margin: '6px 0 10px' }}>
                                        <Text strong style={{ color: '#16a34a', display: 'block', fontSize: '0.85rem', marginBottom: 2 }}>
                                            👉 Nghĩa tiếng Việt:
                                        </Text>
                                        <Input
                                            value={enrichedResult.meaningVi}
                                            onChange={(e) => setEnrichedResult({ ...enrichedResult, meaningVi: e.target.value })}
                                            placeholder="Nghĩa tiếng Việt..."
                                            style={{ borderRadius: 8, fontWeight: 600, color: '#15803d' }}
                                        />
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: 4 }}>
                                        <strong>Ví dụ:</strong> {enrichedResult.exampleSentence}
                                    </div>
                                    {enrichedResult.collocations && (
                                        <div style={{ fontSize: '0.8rem', color: '#9333ea', marginBottom: 4 }}>
                                            <strong>Collocations:</strong> {enrichedResult.collocations}
                                        </div>
                                    )}
                                    {enrichedResult.quizDistractors && (
                                        <div style={{ fontSize: '0.8rem', color: '#d97706', marginTop: 4 }}>
                                            <strong>🎯 Đáp án trắc nghiệm nhiễu (Quiz):</strong>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                                {enrichedResult.quizDistractors.split('|').map((d, idx) => (
                                                    <Tag key={idx} color="orange" style={{ borderRadius: 6, fontSize: '0.75rem' }}>
                                                        {d.trim()}
                                                    </Tag>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginTop: 16, textAlign: 'right' }}>
                                <Button
                                    type="primary"
                                    size="large"
                                    icon={<PlusOutlined />}
                                    onClick={handleSaveAiWord}
                                    style={{ borderRadius: 10, fontWeight: 700 }}
                                >
                                    Lưu ngay vào bộ thẻ
                                </Button>
                            </div>
                        </Card>
                    )}
                </Form>
            </Modal>
        </div>
    );
};
