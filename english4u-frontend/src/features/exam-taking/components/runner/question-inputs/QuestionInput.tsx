import { Input, Radio, Select } from 'antd';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../../../types/session.types';
import {
    getGroupOptionLabelType,
    getQuestionInputType,
    getReviewAnswerBackground,
    getReviewAnswerBorderColor,
    getSharedOptions,
    getSharedSelectOptions,
} from '../../../utils/objectiveRunner.utils';

export const renderSelectableOptionContent = ({
    label,
    text,
    imageUrl,
}: {
    label: string;
    text?: string | null;
    imageUrl?: string | null;
}) => (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 8 }}>
        <span>
            <b>{label}.</b>{text?.trim() ? ` ${text}` : ''}
        </span>
        {imageUrl ? (
            <img
                src={imageUrl}
                alt={`Option ${label}`}
                style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: 220,
                    maxHeight: 160,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1px solid #dbeafe',
                }}
            />
        ) : null}
    </span>
);

export interface QuestionInputProps {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswer?: PracticeSessionAnswerDto;
}

export const QuestionInput = ({
    group,
    question,
    value,
    onChange,
    readOnly = false,
    reviewAnswer,
}: QuestionInputProps) => {
    const inputType = getQuestionInputType(group);
    const groupType = (group.groupType ?? '').toUpperCase();
    const sharedOptions = getSharedOptions(group);
    const optionLabelType = getGroupOptionLabelType(group);
    const reviewBorderColor = getReviewAnswerBorderColor(reviewAnswer);
    const reviewBackground = getReviewAnswerBackground(reviewAnswer);

    if (inputType === 'shared-select') {
        return (
            <Select
                allowClear
                disabled={readOnly}
                placeholder="Chọn đáp án"
                optionLabelProp="value"
                style={{ width: '100%' }}
                value={value || undefined}
                options={getSharedSelectOptions(group)}
                onChange={(nextValue) => onChange(nextValue ?? '')}
            />
        );
    }

    if (inputType === 'single-choice') {
        const usesOptionTextValue = groupType === 'TFNG' || groupType === 'YNNG';
        const optionsToRender = question.options.length > 0 ? question.options : sharedOptions;

        return (
            <Radio.Group
                disabled={readOnly}
                style={{ display: 'grid', gap: 8 }}
                value={value || undefined}
                onChange={(event) => onChange(event.target.value)}
            >
                {optionsToRender.map((option, index) => {
                    const optionValue = usesOptionTextValue ? option.optionText : getOptionLabel(index, optionLabelType);
                    return (
                        <Radio key={option.id} value={optionValue}>
                            {usesOptionTextValue
                                ? option.optionText
                                : renderSelectableOptionContent({
                                    label: optionValue,
                                    text: option.optionText,
                                    imageUrl: option.imageUrl,
                                })}
                        </Radio>
                    );
                })}
            </Radio.Group>
        );
    }

    return (
        <Input
            value={value}
            readOnly={readOnly}
            placeholder="Nhập đáp án"
            onChange={(event) => onChange(event.target.value)}
            style={readOnly ? { borderColor: reviewBorderColor, background: reviewBackground, fontWeight: 500, textTransform: 'none' } : undefined}
        />
    );
};

