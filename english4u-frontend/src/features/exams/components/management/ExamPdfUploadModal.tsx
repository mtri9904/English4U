import React from 'react';
import { Modal, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const { Dragger } = Upload;

interface ExamPdfUploadModalProps {
    open: boolean;
    selectedPdfFile: File | null;
    isPdfGenerationLocked: boolean;
    isPending: boolean;
    onSelectFile: (file: File) => void;
    onCancel: () => void;
    onStartGenerate: () => void;
}

export const ExamPdfUploadModal: React.FC<ExamPdfUploadModalProps> = ({
    open,
    selectedPdfFile,
    isPdfGenerationLocked,
    isPending,
    onSelectFile,
    onCancel,
    onStartGenerate,
}) => {
    return (
        <Modal
            title="Generate đề Reading từ PDF"
            open={open}
            onCancel={onCancel}
            okText="Bắt đầu generate"
            cancelText="Hủy"
            centered= {true}
            onOk={onStartGenerate}
            okButtonProps={{ disabled: !selectedPdfFile || isPending || isPdfGenerationLocked }}
            cancelButtonProps={{ disabled: isPending }}
            destroyOnClose
        >
            <div style={{ color: '#475569', marginBottom: 12 }}>
                {isPdfGenerationLocked
                    ? 'Hệ thống đang generate một file PDF khác. Chỉ có thể upload file mới sau khi tiến trình hiện tại hoàn tất hoặc thất bại.'
                    : 'Upload file PDF đề IELTS Reading, hệ thống sẽ tự tách passage, gọi Gemma và tạo đề mới.'}
            </div>
            <Dragger
                accept=".pdf"
                multiple={false}
                maxCount={1}
                beforeUpload={(file) => {
                    onSelectFile(file);
                    return false;
                }}
                showUploadList={false}
                disabled={isPending || isPdfGenerationLocked}
            >
                <p style={{ marginBottom: 8 }}>
                    <InboxOutlined style={{ fontSize: 30, color: isPdfGenerationLocked ? '#94a3b8' : '#2563eb' }} />
                </p>
                <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                    {isPdfGenerationLocked ? 'Đang khóa upload trong lúc generate' : 'Bấm hoặc kéo file PDF vào đây'}
                </p>
                <p style={{ color: '#64748b', margin: 0 }}>
                    {isPdfGenerationLocked ? 'Hoàn tất hoặc thất bại rồi mới được upload tiếp' : 'Chỉ hỗ trợ định dạng `.pdf`'}
                </p>
            </Dragger>
            {selectedPdfFile ? (
                <div style={{ marginTop: 12, fontSize: '0.82rem', color: '#0f172a' }}>
                    File đã chọn: <strong>{selectedPdfFile.name}</strong>
                </div>
            ) : null}
        </Modal>
    );
};

