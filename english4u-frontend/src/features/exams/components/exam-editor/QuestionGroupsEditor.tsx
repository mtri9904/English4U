import { useRef, type MutableRefObject } from 'react';
import { Button, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';
import type { CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import { QUESTION_TYPES } from '@/features/exams/components/questionTypes';
import {
    emptyGroup,
    getOptionsForType,
    GROUP_TYPE_OPTIONS,
} from './examEditor.helpers';
import { QuestionGroupCard } from './QuestionGroupCard';
import {
    AlternativeAnswersInput,
    type AlternativeAnswersInputProps,
    splitCorrectAnswers,
    joinCorrectAnswers,
} from './AlternativeAnswersInput';

export {
    AlternativeAnswersInput,
    type AlternativeAnswersInputProps,
    splitCorrectAnswers,
    joinCorrectAnswers,
};

export interface QuestionGroupsEditorProps {
    groups: CreateQuestionGroupDto[];
    skill: 'Reading' | 'Listening';
    onUpdate: (groups: CreateQuestionGroupDto[]) => void;
    startQNum?: number;
    maxQuestionCount?: number;
    totalQuestionCount?: number;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

export const QuestionGroupsEditor = ({
    groups,
    skill,
    onUpdate,
    startQNum = 1,
    maxQuestionCount,
    totalQuestionCount = 0,
    activeEditorRef,
    uploading = false,
    handleUploadFile,
}: QuestionGroupsEditorProps) => {
    const typeOptions = GROUP_TYPE_OPTIONS[skill] ?? [];
    let runningQNum = startQNum;
    const instructionEditorRefs = useRef<Record<number, TiptapQxEditorRef | null>>({});
    const templateEditorRefs = useRef<Record<number, TiptapQxEditorRef | null>>({});
    const shortAnswerEditorRefs = useRef<Record<string, TiptapQxEditorRef | null>>({});

    const canAddQuestion = maxQuestionCount == null || totalQuestionCount < maxQuestionCount;

    const warnQuestionLimit = () => {
        if (maxQuestionCount != null) {
            message.warning(`${skill} chỉ được tối đa ${maxQuestionCount} câu.`);
        }
    };

    const wouldExceedQuestionLimit = (currentGroupQuestionCount: number, nextGroupQuestionCount: number) =>
        maxQuestionCount != null
        && totalQuestionCount - currentGroupQuestionCount + nextGroupQuestionCount > maxQuestionCount;

    const getSkillOptionsForType = (groupType?: string) => getOptionsForType(groupType, skill);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {groups.map((group, groupIdx) => {
                const groupStartNum = runningQNum;
                runningQNum += group.questions.length;

                return (
                    <QuestionGroupCard
                        key={groupIdx}
                        group={group}
                        groupIdx={groupIdx}
                        groups={groups}
                        groupStartNum={groupStartNum}
                        skill={skill}
                        typeOptions={typeOptions}
                        canAddQuestion={canAddQuestion}
                        warnQuestionLimit={warnQuestionLimit}
                        wouldExceedQuestionLimit={wouldExceedQuestionLimit}
                        onUpdateGroups={onUpdate}
                        activeEditorRef={activeEditorRef}
                        instructionEditorRefs={instructionEditorRefs}
                        templateEditorRefs={templateEditorRefs}
                        shortAnswerEditorRefs={shortAnswerEditorRefs}
                        uploading={uploading}
                        handleUploadFile={handleUploadFile}
                        getSkillOptionsForType={getSkillOptionsForType}
                    />
                );
            })}

            <Button
                type="default"
                icon={<PlusOutlined />}
                block
                disabled={!canAddQuestion}
                style={{
                    background: '#f1f5f9',
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    fontWeight: 700,
                    height: '40px',
                    borderRadius: '10px',
                    marginTop: '4px',
                    borderStyle: 'dashed',
                    borderWidth: '2px',
                }}
                onClick={() => {
                    if (!canAddQuestion) {
                        warnQuestionLimit();
                        return;
                    }

                    onUpdate([...groups, emptyGroup(QUESTION_TYPES.MCQ_SINGLE, skill)]);
                }}
            >
                THÊM NHÓM CÂU HỎI MỚI (PHẦN NÀY)
            </Button>
        </div>
    );
};
