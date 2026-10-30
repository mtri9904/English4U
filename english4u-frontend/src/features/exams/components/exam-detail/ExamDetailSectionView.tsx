import React from 'react';
import { Collapse, Empty } from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import type { SectionDetailDto } from '@/features/exams/types/exam.types';
import { formatTranscriptRangeLabel, parseListeningTranscriptEnvelope } from '@/shared/lib/listeningTranscript';
import { parseWritingTaskAssetsData } from '@/shared/lib/writingTaskAssets';
import { TiptapQxEditor } from '@/features/exams/components/TiptapQxEditor';
import { SKILL_COLORS } from '../../constants/examDetail.constants';
import {
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {passages.map((p, pIdx) => (
                    <div
                        key={pIdx}
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            padding: '20px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                            <span
                                style={{
                                    fontWeight: 700,
                                    color: SKILL_COLORS.Reading,
                                    fontSize: '0.9375rem',
                                    background: '#ecfdf5',
                                    border: '1px solid #a7f3d0',
                                    padding: '3px 12px',
                                    borderRadius: '6px',
                                }}
                            >
                                Passage {p.passageNumber ?? pIdx + 1}
                            </span>
                            {p.title && (
                                <span style={{ fontWeight: 700, fontSize: '1.125rem', color: '#0f172a' }}>
                                    {p.title}
                                </span>
                            )}
                        </div>

                        {p.paragraphsData && (
                            <Collapse
                                defaultActiveKey={['1']}
                                style={{
                                    marginBottom: '16px',
                                    background: '#fff',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                }}
                                items={[
                                    {
                                        key: '1',
                                        label: (
                                            <span style={{ color: '#0ea5e9', fontWeight: 600, fontSize: '0.9375rem' }}>
                                                Nội dung bài đọc (Paragraphs)
                                            </span>
                                        ),
                                        children: (
                                            <div style={{ color: '#334155', fontSize: '14px', lineHeight: 1.6 }}>
                                                <TiptapQxEditor
                                                    value={p.paragraphsData}
                                                    enableMarkdownBold
                                                    editable={false}
                                                    borderless
                                                    minHeight="60px"
                                                    style={{ padding: '4px 0' }}
                                                />
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                    </div>
                ))}
            </div>
        );
    }

    if (skill === 'Listening' || skill === 'LISTENING') {
        const parts = section.listeningParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có listening part" />;
        const sharedAudioUrl = parts.map((part) => (part.audioUrl ?? '').trim()).find(Boolean);
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {sharedAudioUrl && (
                    <div
                        style={{
                            padding: '14px 18px',
                            background: '#eef2ff',
                            borderRadius: '12px',
                            border: '1px dashed #6366f1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                        }}
                    >
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3730a3', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <SoundOutlined /> Audio chung cho toàn bài Listening
                        </div>
                        <audio controls src={sharedAudioUrl} style={{ height: '36px' }} />
                    </div>
                )}
                {parts.map((lp, lpIdx) => (
                    <div
                        key={lpIdx}
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            padding: '20px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <span
                                style={{
                                    fontWeight: 700,
                                    color: SKILL_COLORS.Listening,
                                    fontSize: '0.9375rem',
                                    background: '#eef2ff',
                                    border: '1px solid #c7d2fe',
                                    padding: '3px 12px',
                                    borderRadius: '6px',
                                }}
                            >
                                Part {lp.partNumber ?? lpIdx + 1}
                            </span>
                            {lp.audioUrl && lp.audioUrl !== sharedAudioUrl && (
                                <audio controls src={lp.audioUrl} style={{ height: '32px' }} />
                            )}
                        </div>

                        {lp.contextDescription && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', marginBottom: '6px' }}>
                                    Mô tả ngữ cảnh
                                </div>
                                <div
                                    style={{
                                        background: '#f8fafc',
                                        borderRadius: '8px',
                                        padding: '12px 16px',
                                        border: '1px solid #e2e8f0',
                                        color: '#475569',
                                        fontSize: '0.875rem',
                                        lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {renderFormattedText(lp.contextDescription)}
                                </div>
                            </div>
                        )}

                        {(() => {
                            const transcriptData = parseListeningTranscriptEnvelope(lp.transcriptData);
                            const transcriptSegments = transcriptData.segments;
                            if (transcriptSegments.length === 0) {
                                return null;
                            }

                            return (
                                <Collapse
                                    defaultActiveKey={[]}
                                    style={{
                                        marginBottom: '16px',
                                        background: '#f8fafc',
                                        borderRadius: '10px',
                                        border: '1px solid #cbd5e1',
                                    }}
                                    items={[
                                        {
                                            key: 'transcript',
                                            label: (
                                                <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.875rem' }}>
                                                    Transcript timestamp cho AI gia sư ({transcriptSegments.length} segments)
                                                </span>
                                            ),
                                            children: (
                                                <div
                                                    style={{
                                                        maxHeight: '260px',
                                                        overflowY: 'auto',
                                                        paddingRight: '6px',
                                                        color: '#475569',
                                                        fontSize: '0.8125rem',
                                                        lineHeight: 1.7,
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '6px',
                                                    }}
                                                >
                                                    {transcriptSegments.map((segment, sIdx) => (
                                                        <div
                                                            key={`${segment.startTime}-${sIdx}`}
                                                            style={{
                                                                padding: '6px 10px',
                                                                borderRadius: '6px',
                                                                background: '#ffffff',
                                                                border: '1px solid #e2e8f0',
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: '8px',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    fontFamily: 'monospace',
                                                                    fontWeight: 700,
                                                                    color: '#4f46e5',
                                                                    background: '#eef2ff',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.75rem',
                                                                    whiteSpace: 'nowrap',
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {formatTranscriptRangeLabel(segment.startTime, segment.endTime)}
                                                            </span>
                                                            {segment.targetQuestionNumbers.length > 0 ? (
                                                                <span
                                                                    style={{
                                                                        fontWeight: 700,
                                                                        color: '#059669',
                                                                        background: '#ecfdf5',
                                                                        padding: '2px 6px',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.75rem',
                                                                        whiteSpace: 'nowrap',
                                                                        flexShrink: 0,
                                                                    }}
                                                                >
                                                                    Q{segment.targetQuestionNumbers.join('/')}
                                                                </span>
                                                            ) : null}
                                                            <span style={{ flex: 1, wordBreak: 'break-word' }}>
                                                                {segment.text}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ),
                                        },
                                    ]}
                                />
                            );
                        })()}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                    </div>
                ))}
            </div>
        );
    }

    if (skill === 'Writing' || skill === 'WRITING') {
        const tasks = section.writingTasks ?? [];
        if (tasks.length === 0) return <Empty description="Chưa có writing task" />;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {tasks.map((t, tIdx) => {
                    const writingAssets = parseWritingTaskAssetsData(t.assetsData);

                    return (
                        <div
                            key={tIdx}
                            style={{
                                background: '#fff',
                                borderRadius: '12px',
                                padding: '20px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <span
                                    style={{
                                        fontWeight: 700,
                                        color: SKILL_COLORS.Writing,
                                        fontSize: '0.9375rem',
                                        background: '#fffbeb',
                                        border: '1px solid #fde68a',
                                        padding: '3px 12px',
                                        borderRadius: '6px',
                                    }}
                                >
                                    Task {t.taskNumber ?? tIdx + 1}
                                </span>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>
                                    Tối thiểu {t.minWords} từ
                                </span>
                            </div>

                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', marginBottom: '6px' }}>
                                    Đề bài Writing
                                </div>
                                <div
                                    style={{
                                        background: '#f8fafc',
                                        borderRadius: '10px',
                                        padding: '16px 20px',
                                        border: '1px solid #e2e8f0',
                                        color: '#334155',
                                        fontSize: '0.9375rem',
                                        lineHeight: 1.7,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {renderFormattedText(t.promptText)}
                                </div>
                            </div>

                            {writingAssets.primaryImageUrl && (
                                <div style={{ marginTop: '14px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', marginBottom: '6px' }}>
                                        Hình ảnh đính kèm:
                                    </div>
                                    <img
                                        src={writingAssets.primaryImageUrl}
                                        alt="Writing asset"
                                        style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    if (skill === 'Speaking' || skill === 'SPEAKING') {
        const parts = section.speakingParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có speaking part" />;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {parts.map((sp, spIdx) => (
                    <div
                        key={spIdx}
                        style={{
                            background: '#fff',
                            borderRadius: '12px',
                            padding: '20px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        }}
                    >
                        <div style={{ marginBottom: '14px' }}>
                            <span
                                style={{
                                    fontWeight: 700,
                                    color: SKILL_COLORS.Speaking,
                                    fontSize: '0.9375rem',
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    padding: '3px 12px',
                                    borderRadius: '6px',
                                }}
                            >
                                Part {sp.partNumber ?? spIdx + 1}
                            </span>
                        </div>

                        {sp.description && (
                            <div style={{ marginBottom: '14px' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', marginBottom: '6px' }}>
                                    Mô tả phần thi
                                </div>
                                <div
                                    style={{
                                        background: '#f8fafc',
                                        borderRadius: '8px',
                                        padding: '12px 16px',
                                        border: '1px solid #e2e8f0',
                                        color: '#475569',
                                        fontSize: '0.875rem',
                                        lineHeight: 1.6,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {renderFormattedText(sp.description)}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {sp.questions.map((sq, sqIdx) => (
                                <div
                                    key={sqIdx}
                                    style={{
                                        padding: '12px 16px',
                                        background: '#f8fafc',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                        <span style={{ fontWeight: 700, color: '#991b1b', whiteSpace: 'nowrap' }}>
                                            Q{sqIdx + 1}.
                                        </span>
                                        <div style={{ flex: 1, color: '#334155', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                                            {renderFormattedText(sq.content)}
                                        </div>
                                    </div>
                                    {sq.audioPromptUrl && (
                                        <div style={{ marginTop: '10px' }}>
                                            <audio controls preload="metadata" src={sq.audioPromptUrl} style={{ width: '100%', height: '36px' }} />
                                        </div>
                                    )}
                                    {sq.cueCardPoints && (
                                        <div
                                            style={{
                                                marginTop: '8px',
                                                padding: '10px 14px',
                                                background: '#fff',
                                                borderRadius: '6px',
                                                fontSize: '0.875rem',
                                                color: '#991b1b',
                                                border: '1px solid #fecaca',
                                                whiteSpace: 'pre-wrap',
                                            }}
                                        >
                                            <span style={{ fontWeight: 600 }}>Cue Card Points:</span>
                                            <div style={{ marginTop: '4px' }}>{renderFormattedText(sq.cueCardPoints)}</div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return <Empty description="Kỹ năng không xác định" />;
};
