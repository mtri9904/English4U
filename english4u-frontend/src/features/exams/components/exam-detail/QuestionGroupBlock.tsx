import React from 'react';
import { Tag } from 'antd';
import ReactMarkdown from 'react-markdown';
import type { QuestionGroupDto } from '@/features/exams/types/exam.types';
import {
    getEffectiveMcqGroupType,
    getQuestionTypeLabel,
    inferQuestionGroupOptionLabelType as inferOptionLabelType,
} from '@/shared/lib/examDisplay';
import { areAllOptionsLabelOnly, getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { TruthValueDefinitionTable } from '@/shared/components/TruthValueDefinitionTable';
import { MATCHING_TYPES, isFlowchartLikeType } from '../../constants/examDetail.constants';
import {
    getSharedGroupOptions,
    markdownComponents,
    normalizeBlockMarkdownText,
    renderFormattedText,
} from '../../utils/examDetail.utils';
import { ChooseNStatementsView } from './ChooseNStatementsView';
import { ClassificationMatchingPreview } from './ClassificationMatchingPreview';
import { ExamDetailGroupContent } from './ExamDetailGroupContent';
import { QuestionItem } from './QuestionItem';
import { SummaryWordBankTable } from './SummaryWordBankTable';

interface QuestionGroupBlockProps {
    group: QuestionGroupDto;
    gIdx: number;
    skillType: string;
}

export const QuestionGroupBlock: React.FC<QuestionGroupBlockProps> = ({ group, gIdx, skillType }) => {
    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
    });
    const displayGroup = { ...group, groupType: effectiveGroupType || group.groupType };
    const usesLegacySharedMultiSelectLayout = effectiveGroupType === 'MCQ_CHOOSE_N';
    const optionLabelType = inferOptionLabelType(group);
    const isSummaryCompletion = displayGroup.groupType === 'SUMMARY_COMPLETION';
    const isClassificationMatching = displayGroup.groupType === 'MATCHING_CLASSIFICATION';
    const isMapLabelling = displayGroup.groupType === 'MAP_LABELLING';

    return (
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.9375rem' }}>Nhóm {gIdx + 1}</span>
                {group.groupType && <Tag color="blue">{getQuestionTypeLabel(effectiveGroupType || group.groupType, skillType)}</Tag>}
                {group.startQuestion != null && group.endQuestion != null && (
                    <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                        Câu {group.startQuestion}–{group.endQuestion}
                    </span>
                )}
            </div>
            {group.instruction && (
                <div style={{ marginBottom: '10px', padding: '10px', background: '#eef2ff', borderRadius: '8px', color: '#3730a3', fontSize: '0.875rem', lineHeight: 1.5 }}>
                    <ReactMarkdown components={markdownComponents}>
                        {normalizeBlockMarkdownText(group.instruction)}
                    </ReactMarkdown>
                </div>
            )}
            <TruthValueDefinitionTable groupType={displayGroup.groupType} />
            <ExamDetailGroupContent group={displayGroup} hideParsedText={usesLegacySharedMultiSelectLayout} />
            {usesLegacySharedMultiSelectLayout && <ChooseNStatementsView group={displayGroup} />}
            {isClassificationMatching && <ClassificationMatchingPreview group={displayGroup} />}
            {isSummaryCompletion && <SummaryWordBankTable group={displayGroup} />}
            {(MATCHING_TYPES.has(displayGroup.groupType || '') || isFlowchartLikeType(displayGroup.groupType)) &&
                !isMapLabelling &&
                !isClassificationMatching &&
                getSharedGroupOptions(group).length > 0 &&
                !areAllOptionsLabelOnly(getSharedGroupOptions(group)) && (
                    <div style={{ background: '#fff', padding: '12px', border: '2px solid #0ea5e9', borderRadius: '12px', marginBottom: '15px' }}>
                        <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '8px', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                            {isFlowchartLikeType(displayGroup.groupType) ? 'Answer Bank' : 'Danh sách lựa chọn (Options):'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                            {getSharedGroupOptions(group).map((opt, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        fontSize: '0.9375rem',
                                        color: '#334155',
                                        padding: displayGroup.groupType === 'MATCHING_VISUALS' ? '10px' : 0,
                                        border: displayGroup.groupType === 'MATCHING_VISUALS' ? '1px solid #e2e8f0' : 'none',
                                        borderRadius: displayGroup.groupType === 'MATCHING_VISUALS' ? '10px' : 0,
                                        background: displayGroup.groupType === 'MATCHING_VISUALS' ? '#f8fafc' : 'transparent',
                                    }}
                                >
                                    <b style={{ color: '#0ea5e9', width: '25px', display: 'inline-block' }}>{getOptionLabel(idx, optionLabelType)}.</b>
                                    {displayGroup.groupType === 'MATCHING_VISUALS' ? (
                                        <div style={{ marginTop: '8px' }}>
                                            {opt.optionText ? (
                                                <img
                                                    src={opt.optionText}
                                                    alt={`Option ${getOptionLabel(idx, optionLabelType)}`}
                                                    style={{
                                                        width: '100%',
                                                        maxHeight: '220px',
                                                        objectFit: 'contain',
                                                        borderRadius: '8px',
                                                        background: '#fff',
                                                        border: '1px solid #e2e8f0',
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    style={{
                                                        height: '120px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#94a3b8',
                                                        border: '1px dashed #cbd5e1',
                                                        borderRadius: '8px',
                                                        background: '#fff',
                                                    }}
                                                >
                                                    Chưa có ảnh
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span> {renderFormattedText(opt.optionText || '')}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            {!usesLegacySharedMultiSelectLayout &&
                !isClassificationMatching &&
                group.questions.map((q, qIdx) => (
                    <QuestionItem
                        key={qIdx}
                        q={q}
                        qIdx={qIdx}
                        groupType={effectiveGroupType || group.groupType}
                        skillType={skillType}
                        optionLabelType={optionLabelType}
                    />
                ))}
        </div>
    );
};

