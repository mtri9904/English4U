import React from 'react';
import { Button, Empty, Image, Input, Radio, Upload } from 'antd';
import { CloseOutlined, PictureOutlined } from '@ant-design/icons';
import type { FlowchartAnswerMode, FlowchartAssetData, FlowchartTextInputLayout } from './flowchartCompletion.utils';

interface FlowchartImageUploaderProps {
    isOrderingInformation: boolean;
    assets: FlowchartAssetData;
    answerMode: FlowchartAnswerMode;
    textInputLayout: FlowchartTextInputLayout;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
    onUpdateAssets: (partial: Partial<FlowchartAssetData>) => void;
    onUpdateAnswerMode: (mode: FlowchartAnswerMode) => void;
    onUpdateTextInputLayout: (layout: FlowchartTextInputLayout) => void;
}

export const FlowchartImageUploader: React.FC<FlowchartImageUploaderProps> = ({
    isOrderingInformation,
    assets,
    answerMode,
    textInputLayout,
    uploading = false,
    handleUploadFile,
    onUpdateAssets,
    onUpdateAnswerMode,
    onUpdateTextInputLayout,
}) => {
    return (
        <div style={{ background: '#eff6ff', border: '1px dashed #60a5fa', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ fontWeight: 600, color: '#1d4ed8', marginBottom: '6px', fontSize: '0.8125rem' }}>
                <PictureOutlined /> Hình Flowchart / Diagram
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Upload
                    accept="image/*"
                    maxCount={1}
                    showUploadList={false}
                    disabled={!handleUploadFile}
                    beforeUpload={async (file) => {
                        if (!handleUploadFile) return false;
                        const url = await handleUploadFile(file, 'image');
                        if (url) {
                            onUpdateAssets({ imageUrl: url });
                        }
                        return false;
                    }}
                >
                    <Button
                        size="small"
                        type="primary"
                        icon={<PictureOutlined />}
                        loading={uploading}
                        disabled={!handleUploadFile}
                    >
                        Tải ảnh lên
                    </Button>
                </Upload>
                <Input
                    value={assets.imageUrl}
                    readOnly
                    size="small"
                    placeholder="Chưa có ảnh flowchart"
                    style={{ flex: 1, minWidth: 240, background: '#f8fafc' }}
                    suffix={
                        assets.imageUrl ? (
                            <CloseOutlined
                                style={{ color: '#ef4444', cursor: 'pointer' }}
                                onClick={() => onUpdateAssets({ imageUrl: '' })}
                            />
                        ) : null
                    }
                />
            </div>

            <div style={{ marginTop: '10px', color: '#475569', fontSize: '0.8125rem', lineHeight: 1.6 }}>
                {isOrderingInformation ? (
                    <>Tải ảnh sơ đồ/thứ tự sự kiện và khai báo answer bank A-F bên dưới. Mỗi ô đáp án sẽ lưu một chữ cái tương ứng.</>
                ) : answerMode === 'text_input' && textInputLayout === 'question_count' ? (
                    <>Tải ảnh flowchart, chọn số câu question bên dưới rồi nhập đáp án đúng cho từng Q.</>
                ) : (
                    <>Tải ảnh flowchart, sau đó nhập các dòng mô tả bên dưới giống đề thật và chèn token <strong>[Qx]</strong> vào đúng vị trí cần điền.</>
                )}
            </div>

            {!isOrderingInformation && (
                <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Kiểu trả lời</span>
                        <Radio.Group
                            size="small"
                            value={answerMode}
                            onChange={(event) => onUpdateAnswerMode(event.target.value)}
                        >
                            <Radio.Button value="text_input">Điền từ</Radio.Button>
                            <Radio.Button value="shared_option_bank">Chọn từ answer bank</Radio.Button>
                        </Radio.Group>
                    </div>
                    {answerMode === 'text_input' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Cách nhập</span>
                            <Radio.Group
                                size="small"
                                value={textInputLayout}
                                onChange={(event) => onUpdateTextInputLayout(event.target.value)}
                            >
                                <Radio.Button value="template">Có sentence + [Qx]</Radio.Button>
                                <Radio.Button value="question_count">Chỉ nhập số câu</Radio.Button>
                            </Radio.Group>
                        </div>
                    )}
                </div>
            )}

            {assets.imageUrl ? (
                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                    <Image
                        src={assets.imageUrl}
                        alt="Flowchart"
                        style={{
                            maxWidth: '100%',
                            maxHeight: 320,
                            objectFit: 'contain',
                            borderRadius: '12px',
                            border: '1px solid #dbeafe',
                            cursor: 'zoom-in',
                        }}
                        preview={{
                            mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                        }}
                    />
                </div>
            ) : (
                <div style={{ marginTop: '12px' }}>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="Tải ảnh flowchart lên để xem preview"
                    />
                </div>
            )}
        </div>
    );
};

