import React from 'react';
import { Image } from 'antd';
import ReactMarkdown from 'react-markdown';
import { parseMixedNoteTableData } from '@/shared/lib/mixedNoteTable';
import type { QuestionGroupDto } from '@/features/exams/types/exam.types';
import {
    TABLE_TYPES,
    TABLE_TITLE_PLACEHOLDER,
    isFlowchartLikeType,
} from '../../constants/examDetail.constants';
import {
    markdownComponents,
    normalizeBlockMarkdownText,
    parseMultiSelectContent,
    renderFormattedText,
} from '../../utils/examDetail.utils';

interface ExamDetailGroupContentProps {
    group: QuestionGroupDto;
    hideParsedText?: boolean;
}

export const ExamDetailGroupContent: React.FC<ExamDetailGroupContentProps> = ({
    group,
    hideParsedText = false,
}) => {
    if (!group.contentData && !group.assetsData) return null;

    const parsedContentText = (() => {
        if (!group.contentData) return '';

        if (group.groupType === 'MCQ_MULTIPLE' || group.groupType === 'MCQ_CHOOSE_N') {
            return parseMultiSelectContent(group.contentData).prompt;
        }

        return group.contentData;
    })();

    const assetImageUrl = (() => {
        if (!group.assetsData) return null;

        if (group.groupType === 'MATCHING_VISUALS') {
            return null;
        }

        if (group.groupType === 'MAP_LABELLING' || isFlowchartLikeType(group.groupType)) {
            try {
                const parsed = JSON.parse(group.assetsData);
                if (typeof parsed === 'string') return parsed;
                if (parsed && typeof parsed === 'object') {
                    if (typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string') {
                        return (parsed as { imageUrl: string }).imageUrl;
                    }
                    if (typeof (parsed as { url?: unknown }).url === 'string') {
                        return (parsed as { url: string }).url;
                    }
                }
            } catch {
                return group.assetsData;
            }
        }

        try {
            const parsed = JSON.parse(group.assetsData);
            if (parsed && typeof parsed === 'object') {
                const images = (parsed as { images?: unknown }).images;
                if (Array.isArray(images)) {
                    return images.filter((item): item is string => typeof item === 'string');
                }
            }
        } catch {
            // ignore JSON parse errors
        }

        return group.assetsData;
    })();

    const isDiagramType = group.groupType === 'MAP_LABELLING' || isFlowchartLikeType(group.groupType);
    const hasGroupVisualImage = !!assetImageUrl;
    const isMeaningfulPrompt = (promptText?: string | null) => {
        if (!promptText) return false;
        const words = promptText
            .toLowerCase()
            .replace(/\[q\d+\]/gi, '')
            .replace(/[^a-z\s]/gi, ' ')
            .split(/\s+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 2);
        const stopWords = new Set(['example', 'question', 'questions', 'q']);
        const meaningfulWords = words.filter((w) => !stopWords.has(w));
        return meaningfulWords.length >= 2;
    };
    const effectiveHideParsedText =
        hideParsedText ||
        (isDiagramType && hasGroupVisualImage && !isMeaningfulPrompt(parsedContentText));

    const mixedData = parseMixedNoteTableData(group.contentData);
    if (mixedData) {
        return (
            <div style={{ marginBottom: '15px' }}>
                {assetImageUrl ? (
                    Array.isArray(assetImageUrl) ? (
                        <div style={{ display: 'grid', gap: '12px', marginBottom: '12px' }}>
                            {assetImageUrl.map((url, index) => (
                                <div key={`${url}-${index}`} style={{ textAlign: 'center' }}>
                                    <Image
                                        src={url}
                                        alt={`Question Asset ${index + 1}`}
                                        style={{ maxHeight: '250px', objectFit: 'contain', borderRadius: '4px' }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                            <Image
                                src={assetImageUrl}
                                alt="Question Asset"
                                style={{ maxHeight: '250px', objectFit: 'contain', borderRadius: '4px' }}
                            />
                        </div>
                    )
                ) : null}

                {mixedData.topText && (
                    <div style={{ marginBottom: '12px', fontSize: '0.925rem', lineHeight: 1.6, color: '#334155' }}>
                        {renderFormattedText(mixedData.topText)}
                    </div>
                )}

                {mixedData.tableData.length > 0 && (
                    <div style={{ overflowX: 'auto', marginBottom: mixedData.bottomText ? '12px' : 0 }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', fontSize: '0.875rem' }}>
                            <tbody>
                                {mixedData.tableData.map((row, rIdx) => (
                                    <tr key={rIdx} style={{ background: rIdx === 0 ? '#f8fafc' : '#fff' }}>
                                        {Array.isArray(row) &&
                                            row.map((cell, cIdx: number) => (
                                                <td
                                                    key={cIdx}
                                                    style={{
                                                        border: '1px solid #cbd5e1',
                                                        padding: '10px',
                                                        fontWeight: rIdx === 0 ? 600 : 400,
                                                    }}
                                                >
                                                    {renderFormattedText(typeof cell === 'string' ? cell : '')}
                                                </td>
                                            ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {mixedData.bottomText && (
                    <div style={{ marginTop: '12px', fontSize: '0.925rem', lineHeight: 1.6, color: '#334155' }}>
                        {renderFormattedText(mixedData.bottomText)}
                    </div>
                )}
            </div>
        );
    }

    if (TABLE_TYPES.has(group.groupType || '')) {
        try {
            const parsedData = JSON.parse(group.contentData || '[]');
            const tableData = Array.isArray(parsedData)
                ? parsedData
                : parsedData && typeof parsedData === 'object' && Array.isArray((parsedData as { rows?: unknown }).rows)
                  ? (parsedData as { rows: unknown[] }).rows
                  : [];
            const tableTitle =
                parsedData &&
                typeof parsedData === 'object' &&
                !Array.isArray(parsedData) &&
                typeof (parsedData as { title?: unknown }).title === 'string'
                    ? (parsedData as { title: string }).title.trim()
                    : '';
            const normalizedTableTitle = tableTitle === TABLE_TITLE_PLACEHOLDER ? '' : tableTitle;

            if (Array.isArray(tableData) && tableData.length > 0) {
                return (
                    <div style={{ overflowX: 'auto', marginBottom: '15px' }}>
                        {normalizedTableTitle && (
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: '8px' }}>
                                {renderFormattedText(normalizedTableTitle)}
                            </div>
                        )}
                        <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', fontSize: '0.875rem' }}>
                            <tbody>
                                {tableData.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                        {Array.isArray(row) &&
                                            row.map((cell, cIdx: number) => (
                                                <td key={cIdx} style={{ border: '1px solid #cbd5e1', padding: '10px' }}>
                                                    {renderFormattedText(typeof cell === 'string' ? cell : '')}
                                                </td>
                                            ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
        } catch {}
    }

    return (
        <div style={{ marginBottom: '15px' }}>
            {assetImageUrl ? (
                Array.isArray(assetImageUrl) ? (
                    <div style={{ display: 'grid', gap: '12px', marginBottom: '12px' }}>
                        {assetImageUrl.map((url, index) => (
                            <div key={`${url}-${index}`} style={{ textAlign: 'center' }}>
                                <Image
                                    src={url}
                                    alt={`Question Asset ${index + 1}`}
                                    style={{
                                        maxHeight: '320px',
                                        maxWidth: '100%',
                                        objectFit: 'contain',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        cursor: 'zoom-in',
                                    }}
                                    preview={{
                                        mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ marginBottom: '12px', textAlign: 'center' }}>
                        <Image
                            src={assetImageUrl}
                            alt="Question Asset"
                            style={{
                                maxHeight: '620px',
                                maxWidth: '100%',
                                objectFit: 'contain',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                cursor: 'zoom-in',
                            }}
                            preview={{
                                mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                            }}
                        />
                    </div>
                )
            ) : null}
            {parsedContentText && !effectiveHideParsedText && (
                <div
                    style={{
                        background: '#fff',
                        border: '1px solid #e2e8f0',
                        padding: '16px',
                        borderRadius: '12px',
                        fontSize: '0.9375rem',
                        lineHeight: 1.6,
                    }}
                >
                    {(() => {
                        const isTableLine = (line: string) => {
                            const trimmed = line.trim();
                            return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
                        };

                        const lines = parsedContentText.split(/\r?\n/);
                        const hasTable = lines.some(isTableLine);
                        if (!hasTable) {
                            return (
                                <ReactMarkdown components={markdownComponents}>
                                    {normalizeBlockMarkdownText(parsedContentText)}
                                </ReactMarkdown>
                            );
                        }

                        const blocks: Array<{ type: 'text'; text: string } | { type: 'table'; rows: string[][] }> = [];
                        let currentTableRows: string[][] = [];
                        let currentTextLines: string[] = [];

                        const flushText = () => {
                            if (currentTextLines.length > 0) {
                                blocks.push({ type: 'text', text: currentTextLines.join('\n') });
                                currentTextLines = [];
                            }
                        };

                        const flushTable = () => {
                            if (currentTableRows.length > 0) {
                                blocks.push({ type: 'table', rows: currentTableRows });
                                currentTableRows = [];
                            }
                        };

                        lines.forEach((line) => {
                            if (isTableLine(line)) {
                                flushText();
                                const trimmed = line.trim();
                                if (!/^\|[\s\-:|]+\|$/.test(trimmed)) {
                                    const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim().replace(/\\\|/g, '|'));
                                    currentTableRows.push(cells);
                                }
                            } else {
                                flushTable();
                                currentTextLines.push(line);
                            }
                        });
                        flushText();
                        flushTable();

                        return (
                            <div>
                                {blocks.map((block, bIdx) => {
                                    if (block.type === 'table') {
                                        return (
                                            <div key={`table-${bIdx}`} style={{ overflowX: 'auto', margin: '14px 0' }}>
                                                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.875rem' }}>
                                                    <tbody>
                                                        {block.rows.map((row, rIdx) => (
                                                            <tr key={`tr-${rIdx}`} style={{ background: rIdx === 0 ? '#f8fafc' : '#fff' }}>
                                                                {row.map((cell, cIdx) => (
                                                                    <td
                                                                        key={`td-${rIdx}-${cIdx}`}
                                                                        style={{
                                                                            border: '1px solid #cbd5e1',
                                                                            padding: '8px 12px',
                                                                            fontWeight: rIdx === 0 ? 600 : 400,
                                                                        }}
                                                                    >
                                                                        {renderFormattedText(cell)}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    }
                                    if (!block.text.trim()) return null;
                                    return (
                                        <ReactMarkdown key={`text-${bIdx}`} components={markdownComponents}>
                                            {normalizeBlockMarkdownText(block.text)}
                                        </ReactMarkdown>
                                    );
                                })}
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
};

