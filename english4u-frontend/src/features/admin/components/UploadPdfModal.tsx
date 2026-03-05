import { useState, useRef } from 'react';
import { Modal, Button, message } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudUploadOutlined, FileTextOutlined } from '@ant-design/icons';
import { streamGenerateExam } from '../api/streamGenerate';
import { useGenerationStore } from '../stores/useGenerationStore';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const UploadPdfModal = ({ open, onClose }: Props) => {
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const generationStatus = useGenerationStore((s) => s.status);

    const handleFile = (file: File) => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            message.error('Chỉ chấp nhận file PDF!');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            message.error('File PDF tối đa 20MB!');
            return;
        }
        setSelectedFile(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const handleUpload = () => {
        if (!selectedFile) return;
        if (generationStatus === 'uploading' || generationStatus === 'processing') {
            message.warning('Đang có một đề thi đang được tạo, vui lòng chờ!');
            return;
        }

        streamGenerateExam(selectedFile);

        setSelectedFile(null);
        onClose();
    };

    const handleClose = () => {
        setSelectedFile(null);
        onClose();
    };

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <CloudUploadOutlined style={{ color: '#fff', fontSize: 18 }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>Generate Exam từ PDF</span>
                </div>
            }
            footer={null}
            width={520}
            styles={{ body: { padding: '24px' } }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6 }}>
                    Upload file PDF chứa nội dung đề thi, bài đọc, hoặc tài liệu học. AI sẽ tự động tạo đề thi hoàn chỉnh từ nội dung.
                </p>

                <AnimatePresence mode="wait">
                    <motion.div
                        key="idle"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                    >
                        <div
                            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragOver ? '#0ea5e9' : selectedFile ? '#10b981' : '#e2e8f0'}`,
                                borderRadius: '16px',
                                padding: '40px 24px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                background: dragOver ? '#f0f9ff' : selectedFile ? '#f0fdf4' : '#fafafa',
                                transition: 'all 0.2s ease',
                            }}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                hidden
                                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                            />
                            <motion.div
                                animate={{ y: dragOver ? -4 : 0 }}
                                transition={{ type: 'spring', stiffness: 300 }}
                            >
                                {selectedFile ? (
                                    <>
                                        <FileTextOutlined style={{ fontSize: 48, color: '#10b981' }} />
                                        <p style={{ margin: '12px 0 4px', fontWeight: 700, color: '#0f172a' }}>
                                            {selectedFile.name}
                                        </p>
                                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.8125rem' }}>
                                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB — Click để đổi file
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <CloudUploadOutlined style={{ fontSize: 48, color: '#94a3b8' }} />
                                        <p style={{ margin: '12px 0 4px', fontWeight: 600, color: '#334155' }}>
                                            Kéo thả file PDF vào đây
                                        </p>
                                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8125rem' }}>
                                            hoặc click để chọn file · Tối đa 20MB
                                        </p>
                                    </>
                                )}
                            </motion.div>
                        </div>

                        {selectedFile && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{ marginTop: '16px', display: 'flex', gap: '10px' }}
                            >
                                <Button block onClick={handleClose}>Hủy</Button>
                                <Button
                                    block
                                    type="primary"
                                    onClick={handleUpload}
                                    style={{
                                        background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                                        border: 'none',
                                        fontWeight: 600,
                                    }}
                                >
                                    🤖 Generate với AI
                                </Button>
                            </motion.div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {!selectedFile && (
                    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.8125rem', color: '#334155' }}>💡 AI sẽ tự động tạo:</p>
                        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8125rem', color: '#64748b', lineHeight: 2 }}>
                            <li>Câu hỏi MCQ trắc nghiệm</li>
                            <li>Câu hỏi True/False/Not Given</li>
                            <li>Câu hỏi FILL_BLANK điền vào chỗ trống</li>
                            <li>Câu hỏi Matching Heading</li>
                            <li>Đáp án và giải thích tự động</li>
                        </ul>
                    </div>
                )}

                {(generationStatus === 'uploading' || generationStatus === 'processing') && (
                    <div style={{
                        background: '#eff6ff',
                        borderRadius: 10,
                        padding: '10px 14px',
                        fontSize: '0.8125rem',
                        color: '#3b82f6',
                        fontWeight: 500,
                        textAlign: 'center',
                    }}>
                        ⚡ Đang có đề thi đang được tạo. Xem tiến độ ở góc dưới phải.
                    </div>
                )}
            </div>
        </Modal>
    );
};
