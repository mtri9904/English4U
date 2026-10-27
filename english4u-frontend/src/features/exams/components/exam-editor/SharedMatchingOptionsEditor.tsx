import React from 'react';
import { Button, Input, Upload } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { CreateQuestionDto, CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { getCleanPastedInputValue } from '@/shared/utils/input';
import { emptyOption } from './examEditor.helpers';
import { FIXED_OPTION_MATCHING_TYPES } from './questionGroupEditor.utils';

interface SharedMatchingOptionsEditorProps {
    group: CreateQuestionGroupDto;
    sharedQuestionOptions: CreateQuestionDto['options'];
    isSummaryType: boolean;
    isVisualMatchingType: boolean;
    isClassificationMatchingType: boolean;
    groupType: string;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
    onUpdateOptions: (newOptions: CreateQuestionDto['options']) => void;
}

export const SharedMatchingOptionsEditor: React.FC<SharedMatchingOptionsEditorProps> = ({
    group,
    sharedQuestionOptions,
    isSummaryType,
    isVisualMatchingType,
    isClassificationMatchingType,
    groupType,
    handleUploadFile,
    onUpdateOptions,
}) => {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '8px' }}>
            <div style={{ fontWeight: 600, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                <span>{isSummaryType ? 'DANH SÁCH TỪ VỰNG (BOX)' : 'DANH SÁCH OPTIONS CHUNG'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sharedQuestionOptions.map((option, optionIdx) => (
                    <div
                        key={optionIdx}
                        style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center',
                            padding: isVisualMatchingType ? '10px' : 0,
                            border: isVisualMatchingType ? '1px solid #e2e8f0' : 'none',
                            borderRadius: isVisualMatchingType ? '10px' : 0,
                            background: isVisualMatchingType ? '#f8fafc' : 'transparent',
                        }}
                    >
                        <b style={{ color: '#0ea5e9', width: '25px', textAlign: 'center', fontSize: '0.75rem' }}>
                            {getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}
                        </b>
                        {isVisualMatchingType ? (
                            <>
                                <div
                                    style={{
                                        width: 120,
                                        height: 90,
                                        borderRadius: '8px',
                                        border: '1px dashed #cbd5e1',
                                        background: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                    }}
                                >
                                    {option.optionText ? (
                                        <img
                                            src={option.optionText}
                                            alt={`Option ${getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}`}
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '0 8px' }}>
                                            Chưa có ảnh
                                        </span>
                                    )}
                                </div>
                                {handleUploadFile ? (
                                    <Upload
                                        accept="image/*"
                                        showUploadList={false}
                                        beforeUpload={async (file) => {
                                            const url = await handleUploadFile(file, 'image');
                                            if (!url) return false;

                                            const newOptions = [...sharedQuestionOptions];
                                            newOptions[optionIdx] = { ...option, optionText: url };
                                            onUpdateOptions(newOptions);
                                            return false;
                                        }}
                                    >
                                        <Button size="small">Upload ảnh</Button>
                                    </Upload>
                                ) : null}
                                {option.optionText ? (
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            const newOptions = [...sharedQuestionOptions];
                                            newOptions[optionIdx] = { ...option, optionText: '' };
                                            onUpdateOptions(newOptions);
                                        }}
                                    >
                                        Xóa ảnh
                                    </Button>
                                ) : null}
                            </>
                        ) : (
                            <Input
                                size="small"
                                value={option.optionText}
                                placeholder="Nội dung..."
                                title="Nội dung lựa chọn"
                                style={{ flex: 1 }}
                                onPaste={(event) => {
                                    const nextValue = getCleanPastedInputValue(event, option.optionText ?? '');
                                    if (nextValue === null) return;
                                    const newOptions = [...sharedQuestionOptions];
                                    newOptions[optionIdx] = { ...option, optionText: nextValue };
                                    onUpdateOptions(newOptions);
                                }}
                                onChange={(event) => {
                                    const newOptions = [...sharedQuestionOptions];
                                    newOptions[optionIdx] = { ...option, optionText: event.target.value };
                                    onUpdateOptions(newOptions);
                                }}
                            />
                        )}
                        <Button
                            type="text"
                            danger
                            icon={<MinusCircleOutlined />}
                            size="small"
                            disabled={isClassificationMatchingType && sharedQuestionOptions.length <= 2}
                            onClick={() => {
                                const newOptions = sharedQuestionOptions.filter((_, index) => index !== optionIdx);
                                onUpdateOptions(newOptions);
                            }}
                        />
                    </div>
                ))}
                <Button
                    type="default"
                    size="small"
                    icon={<PlusOutlined />}
                    block
                    disabled={FIXED_OPTION_MATCHING_TYPES.has(groupType)}
                    style={{
                        background: '#f0f9ff',
                        borderColor: '#bae6fd',
                        color: '#0369a1',
                        fontWeight: 600,
                        height: '32px',
                        borderRadius: '6px',
                    }}
                    onClick={() => {
                        const newOptions = [...sharedQuestionOptions, emptyOption(sharedQuestionOptions.length)];
                        onUpdateOptions(newOptions);
                    }}
                >
                    {isClassificationMatchingType ? 'Dạng này dùng cố định 2 cột A/B' : 'Thêm lựa chọn mới vào Box'}
                </Button>
            </div>
        </div>
    );
};

