import React from 'react';
import { Collapse, Empty } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { SectionDetailDto } from '@/features/exams/types/exam.types';
import { formatTranscriptRangeLabel, parseListeningTranscriptEnvelope } from '@/shared/lib/listeningTranscript';
import { parseWritingTaskAssetsData } from '@/shared/lib/writingTaskAssets';
import { SKILL_COLORS } from '../../constants/examDetail.constants';
import {
    markdownComponents,
    normalizeReadingPassageMarkdown,
    renderFormattedText,
} from '../../utils/examDetail.utils';
import { QuestionGroupBlock } from './QuestionGroupBlock';

interface ExamDetailSectionViewProps {
    section: SectionDetailDto;
}

export const ExamDetailSectionView: React.FC<ExamDetailSectionViewProps> = ({ section }) => {
    const skill = section.skillType;

    if (skill === 'Reading' || skill === 'READING') {
        const passages = section.readingPassages ?? [];
        if (passages.length === 0) return <Empty description="Chưa có passage" />;
        return (
            <>
                {passages.map((p, pIdx) => (
                    <div key={pIdx} style={{ marginBottom: '16px' }}>
                        <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Reading, margin: '0 0 8px' }}>
                            Passage {p.passageNumber ?? pIdx + 1}: {p.title || ''}
                        </h4>
                        {p.paragraphsData && (
                            <Collapse
                                ghost
                                items={[
                                    {
                                        key: '1',
                                        label: <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Nội dung đoạn văn</span>,
                                        children: (
                                            <div style={{ color: '#475569', fontSize: '1rem', lineHeight: 1.8 }}>
                                                <ReactMarkdown components={markdownComponents}>
                                                    {normalizeReadingPassageMarkdown(p.paragraphsData, p.questionGroups)}
                                                </ReactMarkdown>
                                            </div>
                                        ),
                                    },
                                ]}
                                style={{ marginBottom: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                            />
                        )}
                        {p.questionGroups
                            .slice()
                            .sort((a, b) => {
                                const aStart = a.startQuestion ?? (a.questions[0]?.questionNumber || 0);
                                const bStart = b.startQuestion ?? (b.questions[0]?.questionNumber || 0);
                                return aStart - bStart;
                            })
                            .map((g, gIdx) => (
                                <QuestionGroupBlock key={gIdx} group={g} gIdx={gIdx} skillType={skill} />
                            ))}
                    </div>
                ))}
            </>
        );
    }

    if (skill === 'Listening' || skill === 'LISTENING') {
        const parts = section.listeningParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có listening part" />;
        const sharedAudioUrl = parts.map((part) => (part.audioUrl ?? '').trim()).find(Boolean);
        return (
            <>
                {parts.map((lp, lpIdx) => (
                    <div key={lpIdx} style={{ marginBottom: '16px' }}>
                        {lpIdx === 0 && sharedAudioUrl && (
                            <div
                                style={{
                                    background: '#eef2ff',
                                    borderRadius: '8px',
                                    padding: '10px',
                                    marginBottom: '10px',
                                    border: '1px dashed #6366f1',
                                }}
                            >
                                <SoundOutlined style={{ marginRight: '6px', color: '#3730a3' }} />
                                <audio controls src={sharedAudioUrl} style={{ verticalAlign: 'middle' }} />
                            </div>
                        )}
                        <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Listening, margin: '0 0 8px' }}>
                            Part {lp.partNumber ?? lpIdx + 1}
                        </h4>
                        {lp.contextDescription && (
                            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
                                {renderFormattedText(lp.contextDescription)}
                            </p>
                        )}
                        {(() => {
                            const transcriptData = parseListeningTranscriptEnvelope(lp.transcriptData);
                            const transcriptSegments = transcriptData.segments;
                            if (transcriptSegments.length === 0) {
                                return null;
                            }

                            return (
                                <div
                                    style={{
                                        background: '#f8fafc',
                                        borderRadius: '10px',
                                        padding: '12px',
                                        marginBottom: '10px',
                                        border: '1px solid #cbd5e1',
                                    }}
                                >
                                    <div style={{ fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                        Transcript timestamp cho AI gia sư ({transcriptSegments.length} segments)
                                    </div>
                                    <div style={{ color: '#475569', fontSize: '0.8125rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                        {transcriptSegments.slice(0, 4).map((segment) => (
                                            <div key={`${segment.startTime}-${segment.text.slice(0, 24)}`}>
                                                [{formatTranscriptRangeLabel(segment.startTime, segment.endTime)}]
                                                {segment.targetQuestionNumbers.length > 0
                                                    ? ` Q${segment.targetQuestionNumbers.join('/')}`
                                                    : ''}{' '}
                                                {segment.text}
                                            </div>
                                        ))}
                                        {transcriptSegments.length > 4 ? (
                                            <div style={{ color: '#64748b', marginTop: '4px' }}>
                                                ... và {transcriptSegments.length - 4} segment khác
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })()}
                        {lp.questionGroups
                            .slice()
                            .sort((a, b) => {
                                const aStart = a.startQuestion ?? (a.questions[0]?.questionNumber || 0);
                                const bStart = b.startQuestion ?? (b.questions[0]?.questionNumber || 0);
                                return aStart - bStart;
                            })
                            .map((g, gIdx) => (
                                <QuestionGroupBlock key={gIdx} group={g} gIdx={gIdx} skillType={skill} />
                            ))}
                    </div>
                ))}
            </>
        );
    }

    if (skill === 'Writing' || skill === 'WRITING') {
        const tasks = section.writingTasks ?? [];
        if (tasks.length === 0) return <Empty description="Chưa có writing task" />;
        return (
            <>
                {tasks.map((t, tIdx) => {
                    const writingAssets = parseWritingTaskAssetsData(t.assetsData);

                    return (
                        <div
                            key={tIdx}
                            style={{
                                background: '#fffbeb',
                                borderRadius: '12px',
                                padding: '16px',
                                marginBottom: '12px',
                                border: '1px solid #fde68a',
                            }}
                        >
                            <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Writing, margin: '0 0 8px' }}>
                                Task {t.taskNumber ?? tIdx + 1}
                            </h4>
                            <div style={{ whiteSpace: 'pre-wrap', color: '#475569', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '8px' }}>
                                {renderFormattedText(t.promptText)}
                            </div>
                            <span style={{ fontSize: '0.8125rem', color: '#92400e' }}>Tối thiểu {t.minWords} từ</span>
                            {writingAssets.primaryImageUrl && (
                                <img
                                    src={writingAssets.primaryImageUrl}
                                    alt="Writing asset"
                                    style={{ maxWidth: '100%', marginTop: '10px', borderRadius: '8px' }}
                                />
                            )}
                        </div>
                    );
                })}
            </>
        );
    }

    if (skill === 'Speaking' || skill === 'SPEAKING') {
        const parts = section.speakingParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có speaking part" />;
        return (
            <>
                {parts.map((sp, spIdx) => (
                    <div
                        key={spIdx}
                        style={{
                            background: '#fef2f2',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '12px',
                            border: '1px solid #fecaca',
                        }}
                    >
                        <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Speaking, margin: '0 0 8px' }}>
                            Part {sp.partNumber ?? spIdx + 1}
                        </h4>
                        {sp.description && (
                            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
                                {renderFormattedText(sp.description)}
                            </p>
                        )}
                        {sp.questions.map((sq, sqIdx) => (
                            <div
                                key={sqIdx}
                                style={{
                                    padding: '10px',
                                    background: '#fff',
                                    borderRadius: '8px',
                                    marginBottom: '6px',
                                    border: '1px solid #f1f5f9',
                                }}
                            >
                                <span style={{ fontWeight: 600, color: '#991b1b', marginRight: '6px' }}>Q{sqIdx + 1}.</span>
                                {renderFormattedText(sq.content)}
                                {sq.audioPromptUrl && (
                                    <div style={{ marginTop: '8px' }}>
                                        <audio controls preload="metadata" src={sq.audioPromptUrl} style={{ width: '100%' }} />
                                    </div>
                                )}
                                {sq.cueCardPoints && (
                                    <div
                                        style={{
                                            marginTop: '6px',
                                            padding: '8px',
                                            background: '#fef2f2',
                                            borderRadius: '6px',
                                            fontSize: '0.8125rem',
                                            color: '#991b1b',
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        Cue Card: {renderFormattedText(sq.cueCardPoints)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ))}
            </>
        );
    }

    return <Empty description="Kỹ năng không xác định" />;
};

