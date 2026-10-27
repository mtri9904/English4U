import { Input, Select } from 'antd';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../../../types/session.types';
import {
    getQuestionInputType,
    getReviewAnswerBackground,
    getReviewAnswerBorderColor,
    getSharedSelectOptions,
} from '../../../utils/objectiveRunner.utils';

export interface InlineAnswerControlProps {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswer?: PracticeSessionAnswerDto;
}

export const InlineAnswerControl = ({
    group,
    question,
    value,
    onChange,
    readOnly = false,
    reviewAnswer,
}: InlineAnswerControlProps) => {
    const inputType = getQuestionInputType(group);
    const reviewStyle = readOnly ? {
        borderColor: getReviewAnswerBorderColor(reviewAnswer),
        background: getReviewAnswerBackground(reviewAnswer),
        color: '#0f172a',
        fontWeight: 500,
        textTransform: 'none' as const,
    } : undefined;

    if (inputType === 'shared-select') {
        return (
            <Select
                allowClear
                disabled={readOnly}
                value={value || undefined}
                placeholder={`Q${question.questionNumber ?? ''}`}
                popupMatchSelectWidth={false}
                optionLabelProp="value"
                style={{ minWidth: 112, width: 112, ...reviewStyle }}
                options={getSharedSelectOptions(group)}
                onChange={(nextValue) => onChange(nextValue ?? '')}
            />
        );
    }

    const displayValue = value || `Q${question.questionNumber ?? ''}`;
    const width = Math.max(108, Math.min(180, (displayValue.length + 2) * 10));

    return (
        <Input
            value={value}
            readOnly={readOnly}
            placeholder={`Q${question.questionNumber ?? ''}`}
            onChange={(event) => onChange(event.target.value)}
            style={{ width, ...reviewStyle }}
        />
    );
};

