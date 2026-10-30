import {
    Card,
    Empty,
    Image,
    Space,
    Tag,
    Typography,
} from 'antd';
import type { HighlightableProps } from '../../constants/highlight.constants';
import type {
    ObjectiveReviewAnswerMap,
    RenderQuestionAction,
} from '../../constants/objectiveRunner.constants';
import type { PracticeSessionReadingPassageDto } from '../../types/session.types';
import {
    formatTemplateText,
    parseAssetImageUrls,
} from '../../utils/objectiveRunner.utils';
import { buildReadingPassageDisplaySegments } from '../../utils/readingPassage.utils';
import {
    HighlightableMarkdown,
    markdownComponents,
} from './highlight/HighlightableMarkdown';
import { GroupBlock } from './question-inputs/GroupBlock';

const { Title } = Typography;

export interface ReadingBodyProps extends HighlightableProps {
    passages: PracticeSessionReadingPassageDto[];
    activePassageIndex: number;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}

export const ReadingBody = ({
    passages,
    activePassageIndex,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
    highlights,
    onCreateHighlight,
    onDeleteHighlight,
}: ReadingBodyProps) => {
    const passage = passages[activePassageIndex];
    const passageAssetImages = parseAssetImageUrls(passage?.assetsData);

    if (!passage) {
        return (
            <Card style={{ borderRadius: 22 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đề này chưa có passage." />
            </Card>
        );
    }

    const passageTextSegments = buildReadingPassageDisplaySegments(passage.paragraphsData);

    return (
        <Card id="runner-active-section" key={passage.id} bodyStyle={{ padding: 0, overflow: 'hidden' }} style={{ borderRadius: 22 }}>
            <div className="runner-split-layout">
                <div
                    className="runner-split-pane"
                    style={{
                        padding: 20,
                        borderRight: '1px solid #e2e8f0',
                    }}
                >
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Title level={4} style={{ margin: 0, color: '#15803d' }}>
                            Passage {passage.passageNumber ?? activePassageIndex + 1}: {passage.title || 'Reading passage'}
                        </Title>

                        {passageAssetImages.length > 0 ? (
                            <div
                                style={{
                                    display: 'grid',
                                    gap: 12,
                                }}
                            >
                                {passageAssetImages.map((imageUrl, index) => (
                                    <div
                                        key={`${passage.id}-asset-${index}`}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 16,
                                            padding: 12,
                                            background: '#fff',
                                        }}
                                    >
                                        <Image
                                            src={imageUrl}
                                            alt={`Passage visual ${index + 1}`}
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: 320,
                                                objectFit: 'contain',
                                                borderRadius: 12,
                                                display: 'block',
                                                margin: '0 auto',
                                                cursor: 'zoom-in',
                                            }}
                                            preview={{
                                                mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {passage.paragraphsData ? (
                            <div
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 16,
                                    padding: 16,
                                    background: '#fff',
                                }}
                            >
                                {passageTextSegments.length > 0 ? (
                                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                        {passageTextSegments.map((segment, segmentIndex) => (
                                            <div
                                                key={`passage-segment-${segmentIndex}`}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: (segment.label || segment.paragraphNumber != null) ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
                                                    gap: (segment.label || segment.paragraphNumber != null) ? 10 : 0,
                                                    alignItems: 'start',
                                                }}
                                            >
                                                {(segment.label || segment.paragraphNumber != null) ? (
                                                    <Tag color="blue" style={{ marginInlineEnd: 0, marginTop: 2, fontWeight: 600 }}>
                                                        {segment.label ?? `Đoạn ${segment.paragraphNumber}`}
                                                    </Tag>
                                                ) : null}
                                                <div
                                                    style={{
                                                        minWidth: 0,
                                                        fontWeight: segment.kind === 'heading' ? 700 : undefined,
                                                        color: segment.kind === 'heading' ? '#0f172a' : undefined,
                                                    }}
                                                >
                                                    <HighlightableMarkdown
                                                        sourceKey={`reading:passage:${passage.id}:segment:${segmentIndex}`}
                                                        text={formatTemplateText(segment.text)}
                                                        components={markdownComponents}
                                                        highlights={highlights}
                                                        onCreateHighlight={onCreateHighlight}
                                                        onDeleteHighlight={onDeleteHighlight}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </Space>
                                ) : (
                                    <HighlightableMarkdown
                                        sourceKey={`reading:passage:${passage.id}:full`}
                                        text={formatTemplateText(passage.paragraphsData)}
                                        components={markdownComponents}
                                        highlights={highlights}
                                        onCreateHighlight={onCreateHighlight}
                                        onDeleteHighlight={onDeleteHighlight}
                                    />
                                )}
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Passage chưa có nội dung." />
                        )}
                    </Space>
                </div>

                <div
                    className="runner-split-pane"
                    style={{
                        padding: 20,
                    }}
                >
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                        {passage.questionGroups.map((group) => (
                            <GroupBlock
                                key={group.id}
                                group={group}
                                skillType="Reading"
                                answerMap={answerMap}
                                onAnswerChange={onAnswerChange}
                                readOnly={readOnly}
                                reviewAnswerMap={reviewAnswerMap}
                                renderQuestionAction={renderQuestionAction}
                                highlights={highlights}
                                onCreateHighlight={onCreateHighlight}
                                onDeleteHighlight={onDeleteHighlight}
                            />
                        ))}
                    </Space>
                </div>
            </div>
        </Card>
    );
};

