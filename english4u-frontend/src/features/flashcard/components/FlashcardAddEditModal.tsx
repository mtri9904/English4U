import React, { useState, useEffect } from 'react';
import {
    Modal,
    Form,
    Row,
    Col,
    Input,
    Button,
    Space,
    App,
} from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import { flashcardService } from '../services/flashcard.service';
import { FlashcardImageCycler } from './FlashcardImageCycler';
import type {
    FlashcardItemDto,
    CreateFlashcardItemRequest,
    UpdateFlashcardItemRequest,
} from '../types/flashcard.types';

interface FlashcardAddEditModalProps {
    isOpen: boolean;
    deckId: string;
    editingCard: FlashcardItemDto | null;
    onClose: () => void;
    onSuccess: () => void;
}

export const FlashcardAddEditModal: React.FC<FlashcardAddEditModalProps> = ({
    isOpen,
    deckId,
    editingCard,
    onClose,
    onSuccess,
}) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isChangingImage, setIsChangingImage] = useState(false);
    const [candidateImages, setCandidateImages] = useState<string[]>([]);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string>('');
    const [enrichedWord, setEnrichedWord] = useState<string>('');

    const currentImageUrl = Form.useWatch('imageUrl', form);

    useEffect(() => {
        if (isOpen) {
            if (editingCard) {
                form.setFieldsValue(editingCard);
                setSelectedImageUrl(editingCard.imageUrl || '');
                setCandidateImages(editingCard.imageUrl ? [editingCard.imageUrl] : []);
                setCurrentImageIndex(0);
                setEnrichedWord(editingCard.word.trim().toLowerCase());
            } else {
                form.resetFields();
                setSelectedImageUrl('');
                setCandidateImages([]);
                setCurrentImageIndex(0);
                setEnrichedWord('');
            }
        }
    }, [isOpen, editingCard, form]);

    const handleAiAutoFill = async () => {
        const word = form.getFieldValue('word');
        if (!word?.trim()) {
            message.warning('Vui lòng nhập từ vựng trước!');
            return;
        }

        try {
            setIsAiLoading(true);
            setSelectedImageUrl('');
            setCandidateImages([]);
            setCurrentImageIndex(0);

            const res = await flashcardService.enrichWord(word.trim());
            setEnrichedWord(word.trim().toLowerCase());

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
            setSelectedImageUrl(res.imageUrl || '');

            const candidates = Array.from(
                new Set([res.imageUrl, ...(res.candidateImages || [])].filter(Boolean) as string[])
            );
            if (candidates.length > 0) {
                setCandidateImages(candidates);
                const idx = candidates.indexOf(res.imageUrl);
                setCurrentImageIndex(idx >= 0 ? idx : 0);
                if (candidates.length > 1) {
                    const nextUrl = candidates[(idx >= 0 ? idx + 1 : 1) % candidates.length];
                    const preload = new window.Image();
                    preload.src = nextUrl;
                }
            } else {
                setCandidateImages(res.imageUrl ? [res.imageUrl] : []);
                setCurrentImageIndex(0);
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
            const currentWord = word.trim().toLowerCase();
            let list = candidateImages;

            if (list.length <= 1 || (enrichedWord && currentWord !== enrichedWord)) {
                const res = await flashcardService.enrichWord(word.trim());
                setEnrichedWord(currentWord);
                const fetched = res.candidateImages?.filter(Boolean) || [];
                const freshList = Array.from(
                    new Set([res.imageUrl, ...fetched].filter(Boolean) as string[])
                );
                if (freshList.length > 0) {
                    list = freshList;
                    setCandidateImages(freshList);
                }
            }

            if (list.length > 1) {
                const current = selectedImageUrl || form.getFieldValue('imageUrl') || '';
                let currentIdx = list.indexOf(current);
                if (currentIdx === -1) {
                    currentIdx = currentImageIndex;
                }
                const nextIdx = (currentIdx + 1) % list.length;
                const nextUrl = list[nextIdx];

                setCurrentImageIndex(nextIdx);
                setSelectedImageUrl(nextUrl);
                form.setFieldValue('imageUrl', nextUrl);

                const subsequentIdx = (nextIdx + 1) % list.length;
                if (subsequentIdx !== nextIdx) {
                    const preload = new window.Image();
                    preload.src = list[subsequentIdx];
                }

                message.success(`Đã đổi sang hình ${nextIdx + 1}/${list.length}!`);
            } else if (list.length === 1) {
                message.info('Chỉ có 1 hình ảnh từ Pixabay cho từ vựng này.');
            } else {
                message.warning('Không tìm thấy thêm ảnh Pixabay cho từ vựng này.');
            }
        } catch {
            message.error('Không thể đổi hình lúc này.');
        } finally {
            setIsChangingImage(false);
        }
    };

    const handleFormSubmit = async (values: any) => {
        try {
            setIsSubmitting(true);
            if (editingCard) {
                await flashcardService.updateCard(editingCard.id, values as UpdateFlashcardItemRequest);
                message.success('Đã cập nhật thẻ từ vựng!');
            } else {
                await flashcardService.createCard({
                    deckId,
                    ...values,
                } as CreateFlashcardItemRequest);
                message.success('Đã thêm thẻ mới vào bộ thẻ!');
            }

            form.resetFields();
            onSuccess();
        } catch {
            message.error('Có lỗi xảy ra khi lưu thẻ.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            title={editingCard ? 'Chỉnh sửa thẻ từ vựng' : 'Thêm thẻ từ vựng mới'}
            open={isOpen}
            onCancel={onClose}
            footer={null}
            width={860}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={handleFormSubmit}>
                <Row gutter={24}>
                    {/* Cột 1: Thông tin từ vựng, ngữ nghĩa & trắc nghiệm */}
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

                    {/* Cột 2: Hình ảnh minh họa & Ví dụ */}
                    <Col xs={24} md={12}>
                        <FlashcardImageCycler
                            imageUrl={selectedImageUrl || currentImageUrl}
                            candidateImages={candidateImages}
                            currentImageIndex={currentImageIndex}
                            isAiLoading={isAiLoading}
                            isChangingImage={isChangingImage}
                            onCycleNextImage={handleCycleNextImage}
                            onChangeImageUrl={(url) => setSelectedImageUrl(url)}
                        />

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
                        <Button onClick={onClose} style={{ borderRadius: 8 }}>
                            Hủy
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={isSubmitting}
                            style={{ borderRadius: 8, fontWeight: 600 }}
                        >
                            {editingCard ? 'Lưu thay đổi' : 'Thêm vào bộ thẻ'}
                        </Button>
                    </Space>
                </div>
            </Form>
        </Modal>
    );
};

