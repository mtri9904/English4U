import React from 'react';
import {
    Button,
    Divider,
    Input,
    Modal,
    Select,
    Space,
    Spin,
    Tag,
    Typography,
} from 'antd';
import {
    BulbOutlined,
    LoadingOutlined,
    PlusOutlined,
} from '@ant-design/icons';
import type { AiEnrichWordResponse, FlashcardDeckDto } from '@/features/flashcard/types/flashcard.types';
import { FlashcardAiEnrichedPreview } from './FlashcardAiEnrichedPreview';

const { Text } = Typography;

interface FlashcardQuickAddModalProps {
    open: boolean;
    activeWord: string;
    activeContext: string;
    selectedDeckId: string;
    decks: FlashcardDeckDto[];
    isLoadingDecks: boolean;
    deckOptions: Array<{ label: string; value: string }>;
    newDeckTitle: string;
    isCreatingDeck: boolean;
    isAiLoading: boolean;
    enrichedResult: AiEnrichWordResponse | null;
    currentImageIndex: number;
    isChangingImage: boolean;
    isSaving: boolean;
    onClose: () => void;
    onChangeWord: (val: string) => void;
    onAiAnalyze: (word: string, context?: string) => void;
    onChangeSelectedDeck: (deckId: string) => void;
    onChangeNewDeckTitle: (val: string) => void;
    onQuickCreateDeck: () => void;
    onCycleNextImage: () => void;
    onUpdateMeaningVi: (val: string) => void;
    onPlayAudio: (word: string, audioUrl?: string) => void;
    onSaveCard: () => void;
}

export const FlashcardQuickAddModal: React.FC<FlashcardQuickAddModalProps> = ({
    open,
    activeWord,
    activeContext,
    selectedDeckId,
    decks,
    isLoadingDecks,
    deckOptions,
    newDeckTitle,
    isCreatingDeck,
    isAiLoading,
    enrichedResult,
    currentImageIndex,
    isChangingImage,
    isSaving,
    onClose,
    onChangeWord,
    onAiAnalyze,
    onChangeSelectedDeck,
    onChangeNewDeckTitle,
    onQuickCreateDeck,
    onCycleNextImage,
    onUpdateMeaningVi,
    onPlayAudio,
    onSaveCard,
}) => {
    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: 18,
                        }}
                    >
                        <BulbOutlined />
                    </div>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#0f172a' }}>
                            Thêm nhanh vào Flashcard bằng AI
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                            Tự động tra cứu nghĩa theo ngữ cảnh bài thi, IPA và tạo ảnh 3D
                        </div>
                    </div>
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={null}
            width={650}
            destroyOnClose
        >
            <div style={{ marginTop: 12 }}>
                {/* Word Input */}
                <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ display: 'block', marginBottom: 6, color: '#334155' }}>
                        Từ vựng hoặc cụm từ tiếng Anh:
                    </Text>
                    <Input
                        size="large"
                        value={activeWord}
                        onChange={(e) => onChangeWord(e.target.value)}
                        placeholder="Ví dụ: ubiquitous, ameliorate, environmentally friendly..."
                        suffix={
                            <Button
                                type="primary"
                                icon={<BulbOutlined />}
                                loading={isAiLoading}
                                onClick={() => onAiAnalyze(activeWord, activeContext)}
                                style={{ borderRadius: 8, background: '#4f46e5' }}
                            >
                                AI Phân tích
                            </Button>
                        }
                        onPressEnter={() => onAiAnalyze(activeWord, activeContext)}
                    />
                    {activeContext && (
                        <div
                            style={{
                                marginTop: 8,
                                padding: '6px 12px',
                                background: '#f8fafc',
                                borderRadius: 8,
                                fontSize: '0.8rem',
                                color: '#475569',
                                border: '1px solid #e2e8f0',
                            }}
                        >
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>📌 Ngữ cảnh bài thi:</span>{' '}
                            <em>"{activeContext}"</em>
                        </div>
                    )}
                </div>

                {/* Target Deck Select */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text strong style={{ color: '#334155' }}>
                            Lưu vào bộ thẻ:
                        </Text>
                        {decks.length > 1 && (
                            <Tag color="blue" style={{ borderRadius: 999, fontSize: '0.75rem' }}>
                                Đang có {decks.length} bộ thẻ
                            </Tag>
                        )}
                    </div>
                    <Select
                        size="large"
                        style={{ width: '100%' }}
                        value={selectedDeckId}
                        onChange={onChangeSelectedDeck}
                        loading={isLoadingDecks}
                        options={deckOptions}
                        dropdownRender={(menu) => (
                            <>
                                {menu}
                                <Divider style={{ margin: '8px 0' }} />
                                <Space style={{ padding: '0 8px 6px' }}>
                                    <Input
                                        placeholder="Tên bộ thẻ mới..."
                                        value={newDeckTitle}
                                        onChange={(e) => onChangeNewDeckTitle(e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        style={{ width: 220 }}
                                    />
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        loading={isCreatingDeck}
                                        onClick={onQuickCreateDeck}
                                        style={{ background: '#0284c7' }}
                                    >
                                        Tạo bộ thẻ
                                    </Button>
                                </Space>
                            </>
                        )}
                    />
                </div>

                {/* AI Loading State */}
                {isAiLoading && (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '36px 0',
                            background: '#f8fafc',
                            borderRadius: 16,
                            border: '1px dashed #cbd5e1',
                            marginTop: 12,
                        }}
                    >
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 32, color: '#4f46e5' }} spin />} />
                        <div style={{ marginTop: 12, color: '#4f46e5', fontWeight: 600, fontSize: '0.95rem' }}>
                            AI đang tra cứu phiên âm, dịch nghĩa theo ngữ cảnh và lấy ảnh minh họa...
                        </div>
                    </div>
                )}

                {/* Preview Result Card */}
                {enrichedResult && !isAiLoading && (
                    <FlashcardAiEnrichedPreview
                        enrichedResult={enrichedResult}
                        currentImageIndex={currentImageIndex}
                        isChangingImage={isChangingImage}
                        isSaving={isSaving}
                        onCycleNextImage={onCycleNextImage}
                        onUpdateMeaningVi={onUpdateMeaningVi}
                        onPlayAudio={onPlayAudio}
                        onCancel={onClose}
                        onSave={onSaveCard}
                    />
                )}
            </div>
        </Modal>
    );
};

