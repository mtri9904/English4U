import React, { type MutableRefObject } from 'react';
import { Button, Input, Radio, Upload } from 'antd';
import { MinusCircleOutlined, PlusOutlined, BoldOutlined } from '@ant-design/icons';
import type { CreateQuestionDto, CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import {
    QUESTION_TYPES,
    SINGLE_CHOICE_TYPES,
    MULTI_CHOICE_TYPES,
    MATCHING_TYPES,
    FILL_TYPES,
} from '@/features/exams/components/questionTypes';
import { TiptapQxEditor, type TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { getCleanPastedInputValue } from '@/shared/utils/input';
import { emptyOption } from './examEditor.helpers';
import { AlternativeAnswersInput } from './AlternativeAnswersInput';
import {
    getListeningMcqOptionInputMode,
    setListeningMcqOptionInputMode,
    hasQuestionToken,
    normalizeSingleQuestionToken,
} from '../../utils/examEditor.utils';

export interface SingleQuestionEditorProps {
    question: CreateQuestionDto;
    questionIdx: number;
    group: CreateQuestionGroupDto;
    groupIdx: number;
    groupStartNum: number;
    skill: 'Reading' | 'Listening';
    onUpdateQuestion: (partial: Partial<CreateQuestionDto>) => void;
    onDeleteQuestion: () => void;
    onUpdateGroupAssets: (newAssetsData: string) => void;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    shortAnswerEditorRefs: MutableRefObject<Record<string, TiptapQxEditorRef | null>>;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

export const SingleQuestionEditor: React.FC<SingleQuestionEditorProps> = ({
    question,
    questionIdx,
    group,
    groupIdx,
    groupStartNum,
    skill,
    onUpdateQuestion,
    onDeleteQuestion,
    onUpdateGroupAssets,
    activeEditorRef,
    shortAnswerEditorRefs,
    uploading = false,
    handleUploadFile,
}) => {
    const groupType = group.groupType ?? '';
    const hasOptions =
        SINGLE_CHOICE_TYPES.has(groupType) ||
        MULTI_CHOICE_TYPES.has(groupType) ||
        MATCHING_TYPES.has(groupType);
    const isFillType = FILL_TYPES.has(groupType) || groupType === QUESTION_TYPES.SUMMARY_COMPLETION;
    const isTFNGType = groupType === QUESTION_TYPES.TFNG || groupType === QUESTION_TYPES.YNNG;
    const isShortAnswerTemplateType = groupType === QUESTION_TYPES.SHORT_ANSWER;
    const supportsOptionImageUpload =
        skill === 'Listening' && groupType === QUESTION_TYPES.MCQ_SINGLE && !isTFNGType;
    const displayQuestionNumber = question.questionNumber ?? groupStartNum + questionIdx;
    const optionInputMode = supportsOptionImageUpload
        ? getListeningMcqOptionInputMode(group.assetsData, String(displayQuestionNumber))
        : 'text';
    const shortAnswerEditorKey = `${groupIdx}-${questionIdx}-${displayQuestionNumber}`;

    return (
        <div
            style={{
                padding: '10px',
                background: '#fff',
                borderRadius: '8px',
                marginBottom: '6px',
                border: '1px solid #f1f5f9',
            }}
        >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', minWidth: 45 }}>
                    Câu {displayQuestionNumber}
                </span>
                {supportsOptionImageUpload && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '4px 10px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                        }}
                    >
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Kiểu đáp án:</span>
                        <Radio.Group
                            size="small"
                            value={optionInputMode}
                            onChange={(event) => {
                                const nextMode = event.target.value as 'text' | 'image';
                                const nextAssets = setListeningMcqOptionInputMode(
                                    group.assetsData,
                                    String(displayQuestionNumber),
                                    nextMode,
                                );
                                onUpdateGroupAssets(nextAssets ?? '');
                            }}
                        >
                            <Radio.Button value="text">Text</Radio.Button>
                            <Radio.Button value="image">Image</Radio.Button>
                        </Radio.Group>
                    </div>
                )}
                {group.questions.length > 1 && (
                    <Button
                        type="text"
                        danger
                        icon={<MinusCircleOutlined />}
                        size="small"
                        onClick={onDeleteQuestion}
                    />
                )}
            </div>
            {isShortAnswerTemplateType ? (
                <div style={{ marginBottom: '8px' }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 8,
                            alignItems: 'center',
                            marginBottom: 6,
                        }}
                    >
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                            Câu hỏi có ô trả lời inline
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <Button
                                size="small"
                                type={hasQuestionToken(question.content) ? 'default' : 'primary'}
                                disabled={hasQuestionToken(question.content)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    shortAnswerEditorRefs.current[shortAnswerEditorKey]?.insertQ(displayQuestionNumber);
                                }}
                            >
                                {hasQuestionToken(question.content)
                                    ? `Đã có [Q${displayQuestionNumber}]`
                                    : `Thêm [Q${displayQuestionNumber}]`}
                            </Button>
                            <Button
                                size="small"
                                icon={<BoldOutlined />}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    shortAnswerEditorRefs.current[shortAnswerEditorKey]?.toggleBold();
                                }}
                            >
                                In đậm
                            </Button>
                        </div>
                    </div>
                    <TiptapQxEditor
                        ref={(instance) => {
                            shortAnswerEditorRefs.current[shortAnswerEditorKey] = instance;
                        }}
                        value={question.content ?? ''}
                        placeholder={`Nhập câu hỏi và chèn [Q${displayQuestionNumber}] đúng vị trí cần điền.`}
                        minHeight="72px"
                        enableMarkdownBold
                        onFocus={() => {
                            activeEditorRef.current = shortAnswerEditorRefs.current[shortAnswerEditorKey] ?? null;
                        }}
                        onChange={(value) =>
                            onUpdateQuestion({
                                content: normalizeSingleQuestionToken(value, displayQuestionNumber),
                            })
                        }
                    />
                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#64748b' }}>
                        Mỗi câu chỉ có 1 token [Qx]. Muốn đổi vị trí thì xóa token cũ rồi thêm lại ở vị trí mới.
                    </div>
                </div>
            ) : (
                <Input.TextArea
                    value={question.content ?? ''}
                    placeholder={isFillType ? 'Nội dung câu hỏi' : 'Nội dung câu hỏi'}
                    title="Nhập nội dung câu hỏi"
                    autoSize={{ minRows: 2, maxRows: 5 }}
                    size="middle"
                    style={{ marginBottom: '8px' }}
                    onPaste={(event) => {
                        const nextValue = getCleanPastedInputValue(event, question.content ?? '');
                        if (nextValue === null) return;
                        onUpdateQuestion({ content: nextValue });
                    }}
                    onChange={(event) => onUpdateQuestion({ content: event.target.value })}
                />
            )}

            {isFillType && (
                <AlternativeAnswersInput
                    placeholder="Đáp án đúng"
                    value={question.correctAnswer ?? ''}
                    style={{ marginBottom: '6px' }}
                    onChange={(value) => onUpdateQuestion({ correctAnswer: value })}
                />
            )}

            {hasOptions && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {question.options.map((option, optionIdx) => (
                        <div
                            key={optionIdx}
                            style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: supportsOptionImageUpload ? 'flex-start' : 'center',
                                padding: supportsOptionImageUpload ? '8px' : 0,
                                border: supportsOptionImageUpload ? '1px solid #e2e8f0' : 'none',
                                borderRadius: supportsOptionImageUpload ? '10px' : 0,
                                background: supportsOptionImageUpload ? '#f8fafc' : 'transparent',
                            }}
                        >
                            <input
                                type="checkbox"
                                style={{ marginTop: supportsOptionImageUpload ? '8px' : 0 }}
                                checked={option.isCorrect}
                                onChange={(event) => {
                                    const isChecked = event.target.checked;
                                    let options = [...question.options];

                                    if (SINGLE_CHOICE_TYPES.has(groupType)) {
                                        options = options.map((item, index) => ({
                                            ...item,
                                            isCorrect: index === optionIdx ? isChecked : false,
                                        }));
                                    } else {
                                        options[optionIdx] = { ...option, isCorrect: isChecked };
                                    }

                                    onUpdateQuestion({ options });
                                }}
                            />
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {!supportsOptionImageUpload || optionInputMode === 'text' ? (
                                    <Input
                                        value={option.optionText}
                                        disabled={isTFNGType}
                                        placeholder={
                                            isTFNGType
                                                ? option.optionText
                                                : `Lựa chọn ${getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}`
                                        }
                                        title={
                                            isTFNGType
                                                ? 'Giá trị cố định cho dạng TF/NG hoặc Y/N/NG'
                                                : 'Nhập nội dung lựa chọn'
                                        }
                                        size="small"
                                        style={{ flex: 1 }}
                                        onPaste={(event) => {
                                            const nextValue = getCleanPastedInputValue(event, option.optionText ?? '');
                                            if (nextValue === null) return;
                                            const options = [...question.options];
                                            options[optionIdx] = { ...option, optionText: nextValue };
                                            onUpdateQuestion({ options });
                                        }}
                                        onChange={(event) => {
                                            const options = [...question.options];
                                            options[optionIdx] = { ...option, optionText: event.target.value };
                                            onUpdateQuestion({ options });
                                        }}
                                    />
                                ) : null}
                                {supportsOptionImageUpload && optionInputMode === 'image' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div
                                            style={{
                                                width: 140,
                                                height: 100,
                                                borderRadius: '8px',
                                                border: '1px dashed #cbd5e1',
                                                background: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {option.imageUrl ? (
                                                <img
                                                    src={option.imageUrl}
                                                    alt={`Option ${getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}`}
                                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                />
                                            ) : (
                                                <span
                                                    style={{
                                                        fontSize: '11px',
                                                        color: '#94a3b8',
                                                        textAlign: 'center',
                                                        padding: '0 8px',
                                                    }}
                                                >
                                                    Chưa có ảnh
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {handleUploadFile ? (
                                                <Upload
                                                    accept="image/*"
                                                    showUploadList={false}
                                                    beforeUpload={async (file) => {
                                                        const url = await handleUploadFile(file, 'image');
                                                        if (!url) return false;

                                                        const options = [...question.options];
                                                        options[optionIdx] = { ...option, imageUrl: url };
                                                        onUpdateQuestion({ options });
                                                        return false;
                                                    }}
                                                >
                                                    <Button size="small" loading={uploading}>
                                                        Upload ảnh
                                                    </Button>
                                                </Upload>
                                            ) : null}
                                            {option.imageUrl ? (
                                                <Button
                                                    size="small"
                                                    onClick={() => {
                                                        const options = [...question.options];
                                                        options[optionIdx] = { ...option, imageUrl: '' };
                                                        onUpdateQuestion({ options });
                                                    }}
                                                >
                                                    Xóa ảnh
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {!isTFNGType && question.options.length > 1 && (
                                <Button
                                    type="text"
                                    danger
                                    icon={<MinusCircleOutlined />}
                                    size="small"
                                    style={{ marginTop: supportsOptionImageUpload ? '4px' : 0 }}
                                    onClick={() =>
                                        onUpdateQuestion({
                                            options: question.options.filter((_, index) => index !== optionIdx),
                                        })
                                    }
                                />
                            )}
                        </div>
                    ))}
                    {!isTFNGType && (
                        <Button
                            type="default"
                            size="small"
                            icon={<PlusOutlined />}
                            style={{
                                marginTop: '4px',
                                background: '#f0fdf4',
                                borderColor: '#bbf7d0',
                                color: '#166534',
                                fontWeight: 600,
                                width: '100%',
                            }}
                            onClick={() =>
                                onUpdateQuestion({
                                    options: [...question.options, emptyOption(question.options.length)],
                                })
                            }
                        >
                            Thêm lựa chọn
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

