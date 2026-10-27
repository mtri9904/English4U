import { Button, Input } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
    SKILL_COLORS,
    emptySpeakingPart,
    emptySpeakingQuestion,
    EXAM_LIMITS,
} from './examEditor.helpers';
import { getCleanPastedInputValue, type SharedSectionEditorProps } from './sectionEditor.utils';

export interface SpeakingSectionEditorProps extends SharedSectionEditorProps {}

export const SpeakingSectionEditor = ({
    section,
    sIdx,
    updateSection,
}: SpeakingSectionEditorProps) => {
    const parts = section.speakingParts ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {parts.map((part, partIdx) => (
                <div key={partIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, color: SKILL_COLORS.Speaking }}>Part {part.partNumber ?? partIdx + 1}</span>
                        {parts.length > 1 && (
                            <Button
                                type="text"
                                danger
                                icon={<MinusCircleOutlined />}
                                size="small"
                                onClick={() => updateSection(sIdx, { speakingParts: parts.filter((_, index) => index !== partIdx) })}
                            />
                        )}
                    </div>
                    {part.questions.map((question, questionIdx) => (
                        <div key={questionIdx} style={{ padding: '10px', background: '#fef2f2', borderRadius: '8px', marginBottom: '8px', border: '1px solid #fecaca' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#991b1b' }}>Q{questionIdx + 1}</span>
                                {part.questions.length > 1 && (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<MinusCircleOutlined />}
                                        size="small"
                                        onClick={() => {
                                            const updatedParts = [...parts];
                                            updatedParts[partIdx] = {
                                                ...part,
                                                questions: part.questions.filter((_, index) => index !== questionIdx),
                                            };
                                            updateSection(sIdx, { speakingParts: updatedParts });
                                        }}
                                    />
                                )}
                            </div>
                            <Input.TextArea
                                value={question.content}
                                placeholder="Câu hỏi Speaking..."
                                autoSize={{ minRows: 2, maxRows: 5 }}
                                onPaste={(event) => {
                                    const nextValue = getCleanPastedInputValue(event, question.content ?? '');
                                    if (nextValue === null) return;

                                    const updatedParts = [...parts];
                                    const updatedQuestions = [...part.questions];
                                    updatedQuestions[questionIdx] = { ...question, content: nextValue };
                                    updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                    updateSection(sIdx, { speakingParts: updatedParts });
                                }}
                                onChange={(event) => {
                                    const updatedParts = [...parts];
                                    const updatedQuestions = [...part.questions];
                                    updatedQuestions[questionIdx] = { ...question, content: event.target.value };
                                    updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                    updateSection(sIdx, { speakingParts: updatedParts });
                                }}
                            />
                            {part.partNumber === 2 && questionIdx === 0 && (
                                <Input.TextArea
                                    value={question.cueCardPoints ?? ''}
                                    placeholder="Cue Card gợi ý..."
                                    autoSize={{ minRows: 2, maxRows: 5 }}
                                    style={{ marginTop: '6px' }}
                                    onPaste={(event) => {
                                        const nextValue = getCleanPastedInputValue(event, question.cueCardPoints ?? '');
                                        if (nextValue === null) return;

                                        const updatedParts = [...parts];
                                        const updatedQuestions = [...part.questions];
                                        updatedQuestions[questionIdx] = { ...question, cueCardPoints: nextValue };
                                        updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                        updateSection(sIdx, { speakingParts: updatedParts });
                                    }}
                                    onChange={(event) => {
                                        const updatedParts = [...parts];
                                        const updatedQuestions = [...part.questions];
                                        updatedQuestions[questionIdx] = { ...question, cueCardPoints: event.target.value };
                                        updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                        updateSection(sIdx, { speakingParts: updatedParts });
                                    }}
                                />
                            )}
                        </div>
                    ))}
                    <Button
                        type="default"
                        size="small"
                        icon={<PlusOutlined />}
                        block
                        style={{
                            background: '#fef2f2',
                            borderColor: '#fecaca',
                            color: '#ef4444',
                            fontWeight: 600,
                            height: '32px',
                            borderRadius: '6px',
                        }}
                        onClick={() => {
                            const updatedParts = [...parts];
                            updatedParts[partIdx] = {
                                ...part,
                                questions: [
                                    ...part.questions,
                                    { ...emptySpeakingQuestion(), orderIndex: part.questions.length },
                                ],
                            };
                            updateSection(sIdx, { speakingParts: updatedParts });
                        }}
                    >
                        Thêm câu hỏi Speaking
                    </Button>
                </div>
            ))}
            {parts.length < EXAM_LIMITS.Speaking.parts && (
                <Button
                    type="default"
                    icon={<PlusOutlined />}
                    block
                    style={{
                        background: '#fef2f2',
                        borderColor: SKILL_COLORS.Speaking,
                        color: SKILL_COLORS.Speaking,
                        fontWeight: 600,
                        height: '38px',
                        borderRadius: '8px',
                        marginTop: '12px',
                    }}
                    onClick={() => {
                        if (parts.length >= EXAM_LIMITS.Speaking.parts) return;
                        updateSection(sIdx, { speakingParts: [...parts, emptySpeakingPart(parts.length + 1)] });
                    }}
                >
                    Thêm Speaking Part (Tối đa {EXAM_LIMITS.Speaking.parts})
                </Button>
            )}
        </div>
    );
};

