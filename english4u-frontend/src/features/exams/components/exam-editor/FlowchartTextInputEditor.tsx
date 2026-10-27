import React, { useRef, type MutableRefObject } from 'react';
import { Button, InputNumber, Tag } from 'antd';
import { BoldOutlined } from '@ant-design/icons';
import { TiptapQxEditor, type TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';
import type { CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import { AlternativeAnswersInput } from './AlternativeAnswersInput';
import {
    MIN_ANSWER_COUNT,
    MAX_ANSWER_COUNT,
    type FlowchartTextInputLayout,
} from './flowchartCompletion.utils';

interface FlowchartTextInputEditorProps {
    group: CreateQuestionGroupDto;
    groupStartNum: number;
    nextQNum: number;
    textInputLayout: FlowchartTextInputLayout;
    answerCount: number;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    onSyncQuestionsFromTemplate: (nextContent: string) => void;
    onUpdateAnswerCount: (count?: number | null) => void;
    onUpdateQuestionAnswer: (questionIndex: number, value?: string) => void;
}

export const FlowchartTextInputEditor: React.FC<FlowchartTextInputEditorProps> = ({
    group,
    groupStartNum,
    nextQNum,
    textInputLayout,
    answerCount,
    activeEditorRef,
    onSyncQuestionsFromTemplate,
    onUpdateAnswerCount,
    onUpdateQuestionAnswer,
}) => {
    const editorRef = useRef<TiptapQxEditorRef | null>(null);

    return (
        <>
            {textInputLayout === 'template' ? (
                <div style={{ background: '#f8fbff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.8125rem' }}>
                            Template nội dung dưới flowchart
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <Button
                                size="small"
                                type="primary"
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    activeEditorRef.current = editorRef.current;
                                    editorRef.current?.insertQ(nextQNum);
                                }}
                            >
                                Thêm ô trống [Q{nextQNum}]
                            </Button>
                            <Button
                                size="small"
                                icon={<BoldOutlined />}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    activeEditorRef.current = editorRef.current;
                                    editorRef.current?.toggleBold();
                                }}
                            >
                                In đậm
                            </Button>
                        </div>
                    </div>
                    <TiptapQxEditor
                        ref={(instance) => {
                            editorRef.current = instance;
                        }}
                        value={group.contentData ?? ''}
                        placeholder={'Nhập các dòng sentence/note dưới hình và chèn [Qx] vào chỗ trống cần điền.'}
                        minHeight="180px"
                        enableMarkdownBold
                        onFocus={() => {
                            activeEditorRef.current = editorRef.current;
                        }}
                        onChange={onSyncQuestionsFromTemplate}
                    />
                </div>
            ) : (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Số câu question</span>
                        <InputNumber
                            min={MIN_ANSWER_COUNT}
                            max={MAX_ANSWER_COUNT}
                            value={answerCount}
                            size="middle"
                            style={{ width: 110 }}
                            onChange={onUpdateAnswerCount}
                        />
                    </div>
                </div>
            )}

            {/* Answer inputs for each question */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                    Đáp án cho từng ô
                </div>
                {group.questions.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                        {textInputLayout === 'template'
                            ? 'Chèn token [Qx] vào sentence để tạo ô đáp án.'
                            : 'Tăng số câu để bắt đầu nhập đáp án đúng.'}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {group.questions.map((question, questionIndex) => (
                            <div
                                key={question.questionNumber ?? questionIndex}
                                style={{
                                    display: 'flex',
                                    gap: '12px',
                                    alignItems: 'flex-start',
                                    padding: '12px',
                                    border: '1px solid #f1f5f9',
                                    borderRadius: '8px',
                                    background: '#ffffff',
                                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                                }}
                            >
                                <Tag
                                    color="blue"
                                    style={{
                                        margin: 0,
                                        height: '24px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        fontWeight: 600,
                                        fontSize: '12px',
                                    }}
                                >
                                    Q{question.questionNumber ?? groupStartNum + questionIndex}
                                </Tag>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <AlternativeAnswersInput
                                        placeholder="Đáp án đúng"
                                        value={question.correctAnswer ?? ''}
                                        style={{ width: '100%', maxWidth: '360px' }}
                                        onChange={(value) => onUpdateQuestionAnswer(questionIndex, value)}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

