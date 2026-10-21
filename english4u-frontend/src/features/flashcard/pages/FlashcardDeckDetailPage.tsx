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
} from 'antd';
import {
    ArrowLeftOutlined,
    PlusOutlined,
    PlayCircleOutlined,
    SoundOutlined,
    DeleteOutlined,
    EditOutlined,
    BulbOutlined,
    SearchOutlined,
    CheckCircleOutlined,
    ReloadOutlined,
    PictureOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    useFlashcardDeckDetailQuery,
    useDeckCardsQuery,
    flashcardApi,
    flashcardKeys,
} from '../api/flashcard.api';
import type {
    FlashcardItemDto,
    CreateFlashcardItemRequest,
    UpdateFlashcardItemRequest,
} from '../types/flashcard.types';


const { Title, Text, Paragraph } = Typography;

export const FlashcardDeckDetailPage: React.FC = () => {
    const { deckId = '' } = useParams<{ deckId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: deck, isLoading: isDeckLoading } = useFlashcardDeckDetailQuery(deckId);
    const { data: cards = [], isLoading: isCardsLoading } = useDeckCardsQuery(deckId);

    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingCard, setEditingCard] = useState<FlashcardItemDto | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [candidateImages, setCandidateImages] = useState<string[]>([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isChangingImage, setIsChangingImage] = useState(false);
    const [form] = Form.useForm();
    const currentImageUrl = Form.useWatch('imageUrl', form);

    const fetchWikimediaImages = async (word: string): Promise<string[]> => {
        try {
            const cleanWord = encodeURIComponent(word.trim());
            const urls: string[] = [];

            // 1. Check Wikipedia official article lead image
            try {
                const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${cleanWord}`);
                if (wikiRes.ok) {
                    const wikiData = await wikiRes.json();
                    const src = wikiData?.thumbnail?.source;
                    if (src && !urls.includes(src)) {
                        urls.push(src);
                    }
                }
            } catch {
                // ignore
            }

            // 2. Filtered Wikimedia Commons search (exclude scans, stamps, pdfs)
            const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${cleanWord}+filetype:bitmap+-svg+-scan+-pdf+-document+-stamp+-coin&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*&gsrlimit=6`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.query?.pages) {
                    for (const pageId in data.query.pages) {
                        const imgInfo = data.query.pages[pageId]?.imageinfo?.[0];
                        const thumb = imgInfo?.thumburl || imgInfo?.url;
                        if (thumb && !urls.includes(thumb)) {
                            urls.push(thumb);
                        }
                    }
                }
            }

            return urls;
        } catch {
            return [];
        }
    };

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

    const filteredCards = cards.filter((card) =>
        card.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.meaningVi.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAiAutoFill = async () => {
        const word = form.getFieldValue('word');
        if (!word?.trim()) {
            message.warning('Vui lòng nhập từ vựng trước!');
            return;
        }

        try {
            setIsAiLoading(true);
            const res = await flashcardApi.enrichWord(word.trim());
            form.setFieldsValue({
                phonetic: res.phonetic,
                partOfSpeech: res.partOfSpeech,
                meaningVi: res.meaningVi,
                definitionEn: res.definitionEn,
                exampleSentence: res.exampleSentence,
                exampleSentenceVi: res.exampleSentenceVi,
                collocations: res.collocations,
                imageUrl: res.imageUrl,
                audioUrl: res.audioUrl,
                quizDistractors: res.quizDistractors,
            });

            // Candidate images for instant "Đổi hình khác"
            if (res.candidateImages && res.candidateImages.length > 0) {
                setCandidateImages(res.candidateImages);
                const idx = res.candidateImages.indexOf(res.imageUrl);
                setCurrentImageIndex(idx >= 0 ? idx : 0);
            } else {
                fetchWikimediaImages(word.trim()).then((images) => {
                    if (images.length > 0) {
                        const list = res.imageUrl && !images.includes(res.imageUrl)
                            ? [res.imageUrl, ...images]
                            : images;
                        setCandidateImages(list);
                        const idx = list.indexOf(res.imageUrl);
                        setCurrentImageIndex(idx >= 0 ? idx : 0);
                    }
                });
            }

            const modelNotice = res.modelUsed ? ` (${res.modelUsed})` : '';
            message.success(`Đã tự động điền đầy đủ từ vựng & câu hỏi trắc nghiệm bằng AI${modelNotice}!`);
        } catch {
            message.error('Không thể gọi dịch vụ tự động. Vui lòng thử lại hoặc tự nhập thông tin.');
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleCycleNextImage = async () => {
        const word = form.getFieldValue('word');
        if (!word?.trim()) {
            message.warning('Vui lòng nhập từ vựng trước!');
            return;
        }

        try {
            setIsChangingImage(true);
            let list = candidateImages;
            if (list.length <= 1) {
                const more = await fetchWikimediaImages(word.trim());
                const currentImg = form.getFieldValue('imageUrl');
                const combined = Array.from(new Set([currentImg, ...list, ...more].filter(Boolean) as string[]));
                if (combined.length > 1) {
                    list = combined;
                    setCandidateImages(list);
                }
            }

            if (list.length > 1) {
                const nextIdx = (currentImageIndex + 1) % list.length;
                setCurrentImageIndex(nextIdx);
                form.setFieldValue('imageUrl', list[nextIdx]);
                message.success(`Đã đổi sang hình ${nextIdx + 1}/${list.length}!`);
            } else if (list.length === 1) {
                message.info('Chỉ có 1 hình ảnh phù hợp cho từ vựng này.');
            } else {
                message.warning('Không tìm thấy thêm ảnh cho từ vựng này.');
            }
        } catch {
            message.error('Không thể đổi hình lúc này.');
        } finally {
            setIsChangingImage(false);
        }
    };

    const handleFormSubmit = async (values: any) => {
        try {
            if (editingCard) {
                await flashcardApi.updateCard(editingCard.id, values as UpdateFlashcardItemRequest);
                message.success('Đã cập nhật thẻ từ vựng!');
            } else {
                await flashcardApi.createCard({
                    deckId,
                    ...values,
                } as CreateFlashcardItemRequest);
                message.success('Đã thêm thẻ mới vào bộ thẻ!');
            }

            setIsAddModalOpen(false);
            setEditingCard(null);
            form.resetFields();
            queryClient.invalidateQueries({ queryKey: flashcardKeys.deckCards(deckId) });
            queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
        } catch {
            message.error('Có lỗi xảy ra khi lưu thẻ.');
        }
    };

    const handleDeleteCard = async (cardId: string) => {
        try {
            await flashcardApi.deleteCard(cardId);
            message.success('Đã xóa thẻ.');
            queryClient.invalidateQueries({ queryKey: flashcardKeys.deckCards(deckId) });
            queryClient.invalidateQueries({ queryKey: flashcardKeys.allDecks });
        } catch {
            message.error('Không thể xóa thẻ.');
        }
    };

    const openEditModal = (card: FlashcardItemDto) => {
        setEditingCard(card);
        form.setFieldsValue(card);
        setCandidateImages(card.imageUrl ? [card.imageUrl] : []);
        setCurrentImageIndex(0);
        setIsAddModalOpen(true);
    };

    if (isDeckLoading || isCardsLoading) {
        return (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 12, color: '#64748b' }}>Đang nạp chi tiết bộ thẻ...</div>
            </div>
        );
    }

    if (!deck) {
        return (
            <Card style={{ margin: 24, textAlign: 'center' }}>
                <Empty description="Không tìm thấy bộ thẻ." />
                <Button onClick={() => navigate('/app/flashcards')}>Quay lại danh sách</Button>
            </Card>
        );
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 16px 40px' }}>
            {/* Navigation & Header */}
            <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/app/flashcards')}
                style={{ marginBottom: 16, paddingLeft: 0, color: '#475569', fontWeight: 600 }}
            >
                Quay lại danh sách bộ thẻ
            </Button>

            <div style={{
                background: '#fff',
                borderRadius: 20,
                padding: '28px 32px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 8px 24px rgba(15,23,42,0.04)',
                marginBottom: 28,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 20
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Title level={2} style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>
                            {deck.title}
                        </Title>
                        <Tag color="blue" style={{ borderRadius: 999 }}>{cards.length} từ</Tag>
                        {deck.dueCards > 0 && <Tag color="red" style={{ borderRadius: 999 }}>{deck.dueCards} cần ôn</Tag>}
                    </div>
                    <Paragraph style={{ color: '#64748b', margin: 0, maxWidth: 600 }}>
                        {deck.description || 'Bộ sưu tập từ vựng cá nhân.'}
                    </Paragraph>
                </div>

                <Space size="middle">
                    <Button
                        type="primary"
                        size="large"
                        icon={<PlayCircleOutlined />}
                        onClick={() => navigate(`/app/flashcards/${deck.id}/study`)}
                        style={{ height: 44, borderRadius: 12, fontWeight: 700, background: deck.color, borderColor: deck.color }}
                        disabled={cards.length === 0}
                    >
                        Bắt đầu học ({cards.length})
                    </Button>
                    <Button
                        size="large"
                        icon={<PlusOutlined />}
                        onClick={() => {
                            setEditingCard(null);
                            form.resetFields();
                            setCandidateImages([]);
                            setCurrentImageIndex(0);
                            setIsAddModalOpen(true);
                        }}
                        style={{ height: 44, borderRadius: 12, fontWeight: 600 }}
                    >
                        Thêm từ mới
                    </Button>
                </Space>
            </div>

            {/* Search Bar */}
            <div style={{ marginBottom: 20 }}>
                <Input
                    size="large"
                    placeholder="Tìm kiếm từ vựng hoặc nghĩa tiếng Việt..."
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    allowClear
                    style={{ borderRadius: 12, maxWidth: 450 }}
                />
            </div>

            {/* Cards List */}
            {filteredCards.length === 0 ? (
                <Card style={{ borderRadius: 16, textAlign: 'center', padding: '40px 20px' }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={cards.length === 0 ? "Bộ thẻ này chưa có từ vựng nào." : "Không tìm thấy từ vựng khớp với tìm kiếm."}
                    >
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => {
                                setEditingCard(null);
                                form.resetFields();
                                setIsAddModalOpen(true);
                            }}
                        >
                            Thêm từ đầu tiên
                        </Button>
                    </Empty>
                </Card>
            ) : (
                <Row gutter={[16, 16]}>
                    {filteredCards.map((card) => (
                        <Col xs={24} md={12} key={card.id} style={{ display: 'flex' }}>
                            <Card
                                hoverable
                                onClick={() => navigate(`/app/flashcards/${deckId}/study?cardId=${card.id}`)}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: 16,
                                    border: '1.5px solid #e2e8f0',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.02)',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    transition: 'all 0.2s ease',
                                }}
                                bodyStyle={{
                                    padding: 18,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    flex: 1,
                                }}
                            >
                                <div style={{ display: 'flex', gap: 16, height: '100%', flex: 1 }}>
                                    {/* 3D Image */}
                                    {card.imageUrl ? (
                                        <img
                                            src={card.imageUrl}
                                            alt={card.word}
                                            style={{
                                                width: 105,
                                                height: 105,
                                                borderRadius: 14,
                                                objectFit: 'cover',
                                                flexShrink: 0,
                                                border: '1px solid #e2e8f0'
                                            }}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div style={{
                                            width: 105,
                                            height: 105,
                                            borderRadius: 14,
                                            background: '#f1f5f9',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            color: '#94a3b8'
                                        }}>
                                            No Image
                                        </div>
                                    )}

                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Text strong style={{ fontSize: '1.2rem', color: '#0f172a' }}>
                                                    {card.word}
                                                </Text>
                                                {card.partOfSpeech && <Tag color="blue">{card.partOfSpeech}</Tag>}
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<SoundOutlined />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        playAudio(card.word, card.audioUrl);
                                                    }}
                                                />
                                            </div>

                                            <Space size="small" onClick={(e) => e.stopPropagation()}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<EditOutlined />}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEditModal(card);
                                                    }}
                                                />
                                                <Popconfirm
                                                    title="Xóa từ vựng này?"
                                                    onConfirm={(e) => {
                                                        e?.stopPropagation();
                                                        handleDeleteCard(card.id);
                                                    }}
                                                    onCancel={(e) => e?.stopPropagation()}
                                                    okText="Xóa"
                                                    cancelText="Hủy"
                                                    okButtonProps={{ danger: true }}
                                                >
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </Popconfirm>
                                            </Space>
                                        </div>

                                        {card.phonetic && (
                                            <div style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic', marginBottom: 4 }}>
                                                {card.phonetic}
                                            </div>
                                        )}

                                        <div
                                            style={{
                                                fontWeight: 600,
                                                color: '#15803d',
                                                fontSize: '0.95rem',
                                                marginBottom: 6,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                                lineHeight: 1.4,
                                            }}
                                            title={card.meaningVi}
                                        >
                                            {card.meaningVi}
                                        </div>

                                        {card.exampleSentence && (
                                            <div
                                                style={{
                                                    fontSize: '0.825rem',
                                                    color: '#475569',
                                                    lineHeight: 1.4,
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                    marginBottom: 8,
                                                }}
                                                title={card.exampleSentence}
                                            >
                                                <strong>Ex:</strong> {card.exampleSentence}
                                            </div>
                                        )}

                                        {/* Status Pill & Click-to-study hint (Pinned at bottom) */}
                                        <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            {card.repetitions >= 3 ? (
                                                <Tag color="green" icon={<CheckCircleOutlined />}>Đã thuộc tốt ({card.repetitions} lần)</Tag>
                                            ) : (
                                                <Tag color="default">Đang ghi nhớ ({card.repetitions}/3)</Tag>
                                            )}
                                            <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 600 }}>
                                                Học từ này →
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}

            {/* Modal: Add/Edit Card */}
            <Modal
                title={editingCard ? "Chỉnh sửa thẻ từ vựng" : "Thêm thẻ từ vựng mới"}
                open={isAddModalOpen}
                onCancel={() => {
                    setIsAddModalOpen(false);
                    setEditingCard(null);
                }}
                footer={null}
                width={860}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFormSubmit}
                >
                    <Row gutter={24}>
                        {/* Cột 1: Thông tin từ vựng, ngữ nghĩa & đáp án trắc nghiệm */}
                        <Col xs={24} md={12}>
                            <Row gutter={10}>
                                <Col span={15}>
                                    <Form.Item
                                        name="word"
                                        label="Từ vựng (Word / Phrase)"
                                        rules={[{ required: true, message: 'Vui lòng nhập từ vựng!' }]}
                                        style={{ marginBottom: 12 }}
                                    >
                                        <Input placeholder="Ví dụ: resilient, apartment..." />
                                    </Form.Item>
                                </Col>
                                <Col span={9} style={{ display: 'flex', alignItems: 'flex-end', marginBottom: 12 }}>
                                    <Button
                                        type="primary"
                                        icon={<BulbOutlined />}
                                        loading={isAiLoading}
                                        onClick={handleAiAutoFill}
                                        style={{ width: '100%', background: '#2563eb', fontWeight: 600 }}
                                    >
                                        AI Tự điền
                                    </Button>
                                </Col>
                            </Row>

                            <Row gutter={10}>
                                <Col span={12}>
                                    <Form.Item name="phonetic" label="Phiên âm IPA" style={{ marginBottom: 12 }}>
                                        <Input placeholder="/rɪˈzɪl.jənt/" />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item name="partOfSpeech" label="Từ loại" style={{ marginBottom: 12 }}>
                                        <Input placeholder="noun, verb, adj..." />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                name="meaningVi"
                                label="Nghĩa tiếng Việt"
                                rules={[{ required: true, message: 'Vui lòng nhập nghĩa tiếng Việt!' }]}
                                style={{ marginBottom: 12 }}
                            >
                                <Input placeholder="kiên cường, có khả năng phục hồi..." />
                            </Form.Item>

                            <Form.Item name="definitionEn" label="Định nghĩa tiếng Anh (tùy chọn)" style={{ marginBottom: 12 }}>
                                <Input placeholder="English definition..." />
                            </Form.Item>

                            <Form.Item
                                name="quizDistractors"
                                label="5 phương án gây nhiễu cho Trắc nghiệm (cách nhau bởi dấu |)"
                                tooltip="Do AI tự động sinh cùng từ loại để tạo câu hỏi trắc nghiệm thử thách."
                                style={{ marginBottom: 12 }}
                            >
                                <Input placeholder="phương án 1 | phương án 2 | phương án 3 | phương án 4 | phương án 5" />
                            </Form.Item>
                        </Col>

                        {/* Cột 2: Hình ảnh minh họa trực quan & Ngữ cảnh */}
                        <Col xs={24} md={12}>
                            {/* Khối xem trực tiếp hình ảnh & Đổi hình */}
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>
                                        Hình ảnh minh họa trực quan
                                    </span>
                                    {candidateImages.length > 1 && (
                                        <Tag color="blue" style={{ borderRadius: 6, margin: 0, fontSize: '0.75rem' }}>
                                            Ảnh {currentImageIndex + 1}/{candidateImages.length}
                                        </Tag>
                                    )}
                                </div>

                                <div style={{
                                    height: 165,
                                    borderRadius: 14,
                                    background: '#f8fafc',
                                    border: currentImageUrl ? '1px solid #e2e8f0' : '2px dashed #cbd5e1',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: currentImageUrl ? '0 4px 12px rgba(0,0,0,0.06)' : 'none'
                                }}>
                                    {currentImageUrl ? (
                                        <>
                                            <img
                                                src={currentImageUrl}
                                                alt="Hình minh họa"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => {
                                                    (e.target as any).src = "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=500&q=80";
                                                }}
                                            />
                                            <Button
                                                size="small"
                                                type="primary"
                                                icon={<ReloadOutlined />}
                                                loading={isChangingImage}
                                                onClick={handleCycleNextImage}
                                                style={{
                                                    position: 'absolute',
                                                    bottom: 8,
                                                    right: 8,
                                                    background: 'rgba(15, 23, 42, 0.85)',
                                                    backdropFilter: 'blur(4px)',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    fontWeight: 600,
                                                    fontSize: '0.78rem'
                                                }}
                                            >
                                                Đổi hình khác
                                            </Button>
                                        </>
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '12px' }}>
                                            <PictureOutlined style={{ fontSize: 32, marginBottom: 4 }} />
                                            <div style={{ fontSize: '0.8rem' }}>Chưa có hình ảnh minh họa</div>
                                            <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>Bấm "AI Tự điền" hoặc dán URL ảnh bên dưới</div>
                                        </div>
                                    )}
                                </div>

                                <Form.Item name="imageUrl" style={{ marginTop: 8, marginBottom: 12 }}>
                                    <Input
                                        size="small"
                                        placeholder="Link URL ảnh (https://...)"
                                        style={{ borderRadius: 8, fontSize: '0.8rem', color: '#64748b' }}
                                    />
                                </Form.Item>
                            </div>

                            <Form.Item name="exampleSentence" label="Câu ví dụ thực tế (IELTS Style)" style={{ marginBottom: 12 }}>
                                <Input.TextArea rows={2} placeholder="Children are remarkably resilient..." style={{ borderRadius: 8 }} />
                            </Form.Item>

                            <Form.Item name="exampleSentenceVi" label="Dịch câu ví dụ" style={{ marginBottom: 12 }}>
                                <Input placeholder="Dịch nghĩa câu ví dụ..." style={{ borderRadius: 8 }} />
                            </Form.Item>

                            <Form.Item name="collocations" label="Collocations thường gặp" style={{ marginBottom: 12 }}>
                                <Input placeholder="resilient economy, highly resilient..." style={{ borderRadius: 8 }} />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="audioUrl" hidden>
                        <Input />
                    </Form.Item>

                    <div style={{ textAlign: 'right', marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                        <Space>
                            <Button onClick={() => setIsAddModalOpen(false)} style={{ borderRadius: 8 }}>Hủy</Button>
                            <Button type="primary" htmlType="submit" style={{ borderRadius: 8, fontWeight: 600 }}>
                                {editingCard ? "Lưu thay đổi" : "Thêm vào bộ thẻ"}
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};
