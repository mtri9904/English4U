import React, { useState } from 'react';
import {
    Card,
    Button,
    Input,
    Tag,
    Space,
    Typography,
    Row,
    Col,
    Empty,
    Spin,
    App,
} from 'antd';
import {
    ArrowLeftOutlined,
    PlusOutlined,
    PlayCircleOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    useFlashcardDeckDetailQuery,
    useDeckCardsQuery,
    useDeleteCardMutation,
    flashcardQueryKeys,
} from '../hooks/useFlashcardQueries';
import { FlashcardCardItem } from '../components/FlashcardCardItem';
import { FlashcardAddEditModal } from '../components/FlashcardAddEditModal';
import { ROUTE_PATHS } from '@/constants/route-paths';
import type { FlashcardItemDto } from '../types/flashcard.types';

const { Title, Paragraph } = Typography;

export const FlashcardDeckDetailPage: React.FC = () => {
    const { deckId = '' } = useParams<{ deckId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message } = App.useApp();

    const { data: deck, isLoading: isDeckLoading } = useFlashcardDeckDetailQuery(deckId);
    const { data: cards = [], isLoading: isCardsLoading } = useDeckCardsQuery(deckId);
    const deleteCardMutation = useDeleteCardMutation(deckId);

    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingCard, setEditingCard] = useState<FlashcardItemDto | null>(null);

    const filteredCards = cards.filter(
        (card) =>
            card.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
            card.meaningVi.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDeleteCard = async (cardId: string) => {
        try {
            await deleteCardMutation.mutateAsync(cardId);
            message.success('Đã xóa thẻ từ vựng.');
        } catch {
            message.error('Không thể xóa thẻ.');
        }
    };

    const handleOpenAddModal = () => {
        setEditingCard(null);
        setIsAddModalOpen(true);
    };

    const handleOpenEditModal = (card: FlashcardItemDto) => {
        setEditingCard(card);
        setIsAddModalOpen(true);
    };

    const handleModalSuccess = () => {
        setIsAddModalOpen(false);
        setEditingCard(null);
        queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.deckCards(deckId) });
        queryClient.invalidateQueries({ queryKey: flashcardQueryKeys.decks() });
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
                <Button onClick={() => navigate(ROUTE_PATHS.FLASHCARDS_ROOT)}>
                    Quay lại danh sách
                </Button>
            </Card>
        );
    }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 16px 40px' }}>
            {/* Navigation back */}
            <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(ROUTE_PATHS.FLASHCARDS_ROOT)}
                style={{ marginBottom: 16, paddingLeft: 0, color: '#475569', fontWeight: 600 }}
            >
                Quay lại danh sách bộ thẻ
            </Button>

            {/* Deck Header Banner */}
            <div
                style={{
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
                    gap: 20,
                }}
            >
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Title level={2} style={{ margin: 0, fontWeight: 800, color: '#0f172a' }}>
                            {deck.title}
                        </Title>
                        <Tag color="blue" style={{ borderRadius: 999 }}>
                            {cards.length} từ
                        </Tag>
                        {deck.dueCards > 0 && (
                            <Tag color="red" style={{ borderRadius: 999 }}>
                                {deck.dueCards} cần ôn
                            </Tag>
                        )}
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
                        style={{
                            height: 44,
                            borderRadius: 12,
                            fontWeight: 700,
                            background: deck.color,
                            borderColor: deck.color,
                        }}
                        disabled={cards.length === 0}
                    >
                        Bắt đầu học ({cards.length})
                    </Button>
                    <Button
                        size="large"
                        icon={<PlusOutlined />}
                        onClick={handleOpenAddModal}
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

            {/* Cards Grid */}
            {filteredCards.length === 0 ? (
                <Card style={{ borderRadius: 16, textAlign: 'center', padding: '40px 20px' }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            cards.length === 0
                                ? 'Bộ thẻ này chưa có từ vựng nào.'
                                : 'Không tìm thấy từ vựng khớp với tìm kiếm.'
                        }
                    >
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddModal}>
                            Thêm từ đầu tiên
                        </Button>
                    </Empty>
                </Card>
            ) : (
                <Row gutter={[16, 16]}>
                    {filteredCards.map((card) => (
                        <Col xs={24} md={12} key={card.id} style={{ display: 'flex' }}>
                            <FlashcardCardItem
                                card={card}
                                deckId={deckId}
                                onEdit={handleOpenEditModal}
                                onDelete={handleDeleteCard}
                            />
                        </Col>
                    ))}
                </Row>
            )}

            {/* Modal: Add or Edit Card */}
            <FlashcardAddEditModal
                isOpen={isAddModalOpen}
                deckId={deckId}
                editingCard={editingCard}
                onClose={() => {
                    setIsAddModalOpen(false);
                    setEditingCard(null);
                }}
                onSuccess={handleModalSuccess}
            />
        </div>
    );
};
