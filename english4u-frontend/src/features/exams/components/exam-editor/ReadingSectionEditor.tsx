import { useRef, type MutableRefObject } from 'react';
import { Button, Input } from 'antd';
import { BoldOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { TiptapQxEditor, type TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';
import {
    SKILL_COLORS,
    emptyPassage,
    reorderQuestionNumbers,
    EXAM_LIMITS,
    countSectionQuestions,
    getMaxQuestionNumber,
} from './examEditor.helpers';
import { QuestionGroupsEditor } from './QuestionGroupsEditor';
import type { SharedSectionEditorProps } from './sectionEditor.utils';

export interface ReadingSectionEditorProps extends SharedSectionEditorProps {
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    uploading: boolean;
    handleUploadFile: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

export const ReadingSectionEditor = ({
    section,
    sIdx,
    updateSection,
    activeEditorRef,
    uploading,
    handleUploadFile,
}: ReadingSectionEditorProps) => {
    const passages = section.readingPassages ?? [];
    let currentQNum = 1;
    const passageEditorRefs = useRef<Record<number, TiptapQxEditorRef | null>>({});
    const questionCount = countSectionQuestions(section, 'Reading');
    const hasQuestionCapacity = questionCount < EXAM_LIMITS.Reading.questions;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {passages.map((passage, pIdx) => (
                <div key={pIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, color: SKILL_COLORS.Reading }}>Passage {pIdx + 1}</span>
                        {passages.length > 1 && (
                            <Button
                                type="text"
                                danger
                                icon={<MinusCircleOutlined />}
                                size="small"
                                onClick={() => updateSection(sIdx, { readingPassages: passages.filter((_, index) => index !== pIdx) })}
                            />
                        )}
                    </div>
                    <Input
                        value={passage.title ?? ''}
                        placeholder="Tiêu đề Passage"
                        onChange={(event) => {
                            const updatedPassages = [...passages];
                            updatedPassages[pIdx] = { ...passage, title: event.target.value };
                            updateSection(sIdx, { readingPassages: updatedPassages });
                        }}
                        size="large"
                        style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>Nội dung bài đọc (Paragraphs) *</label>
                        <Button
                            size="small"
                            icon={<BoldOutlined />}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                const editorRef = passageEditorRefs.current[pIdx] ?? null;
                                activeEditorRef.current = editorRef;
                                editorRef?.toggleBold();
                            }}
                        >
                            In đậm
                        </Button>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <TiptapQxEditor
                            ref={(instance) => {
                                passageEditorRefs.current[pIdx] = instance;
                            }}
                            value={passage.paragraphsData ?? ''}
                            placeholder="Nội dung chi tiết của bài đọc..."
                            minHeight="260px"
                            enableMarkdownBold
                            onFocus={() => {
                                activeEditorRef.current = passageEditorRefs.current[pIdx] ?? null;
                            }}
                            onChange={(value) => {
                                const updatedPassages = [...passages];
                                updatedPassages[pIdx] = { ...passage, paragraphsData: value };
                                updateSection(sIdx, { readingPassages: updatedPassages });
                            }}
                        />
                    </div>
                    {(() => {
                        const startOfPassage = currentQNum;
                        const editor = (
                            <QuestionGroupsEditor
                                groups={passage.questionGroups}
                                skill="Reading"
                                startQNum={startOfPassage}
                                maxQuestionCount={EXAM_LIMITS.Reading.questions}
                                totalQuestionCount={questionCount}
                                activeEditorRef={activeEditorRef}
                                uploading={uploading}
                                handleUploadFile={handleUploadFile}
                                onUpdate={(groups) => {
                                    const updatedPassages = [...passages];
                                    updatedPassages[pIdx] = { ...passage, questionGroups: groups };

                                    let questionNum = 1;
                                    const reindexedPassages = updatedPassages.map((item) => {
                                        const newGroups = reorderQuestionNumbers(item.questionGroups, questionNum);
                                        questionNum = Math.max(questionNum, getMaxQuestionNumber(newGroups) + 1);
                                        return { ...item, questionGroups: newGroups };
                                    });

                                    updateSection(sIdx, { readingPassages: reindexedPassages });
                                }}
                            />
                        );

                        currentQNum = Math.max(currentQNum, getMaxQuestionNumber(passage.questionGroups) + 1);
                        return editor;
                    })()}
                </div>
            ))}
            {passages.length < EXAM_LIMITS.Reading.passages && hasQuestionCapacity && (
                <Button
                    type="default"
                    icon={<PlusOutlined />}
                    block
                    style={{
                        background: '#f0fdf4',
                        borderColor: SKILL_COLORS.Reading,
                        color: SKILL_COLORS.Reading,
                        fontWeight: 600,
                        height: '38px',
                        borderRadius: '8px',
                        marginTop: '8px',
                    }}
                    onClick={() => {
                        if (passages.length >= EXAM_LIMITS.Reading.passages) return;
                        const updatedPassages = [...passages, { ...emptyPassage(), passageNumber: passages.length + 1 }];
                        updateSection(sIdx, { readingPassages: updatedPassages });
                    }}
                >
                    Thêm Passage mới (Tối đa {EXAM_LIMITS.Reading.passages})
                </Button>
            )}
        </div>
    );
};

