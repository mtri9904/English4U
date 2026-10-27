import {
    Card,
    Empty,
    Space,
    Typography,
} from 'antd';
import type { HighlightableProps } from '../../constants/highlight.constants';
import type {
    ObjectiveReviewAnswerMap,
    RenderQuestionAction,
} from '../../constants/objectiveRunner.constants';
import type { PracticeSessionListeningPartDto } from '../../types/session.types';
import { formatTemplateText } from '../../utils/objectiveRunner.utils';
import {
    compactMarkdownComponents,
    HighlightableMarkdown,
} from './highlight/HighlightableMarkdown';
import { GroupBlock } from './question-inputs/GroupBlock';

const { Title } = Typography;

export interface ListeningBodyProps extends HighlightableProps {
    parts: PracticeSessionListeningPartDto[];
    activePartIndex: number;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}

export const ListeningBody = ({
    parts,
    activePartIndex,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
    highlights,
    onCreateHighlight,
    onDeleteHighlight,
}: ListeningBodyProps) => {
    const part = parts[activePartIndex];

    if (!part) {
        return (
            <Card style={{ borderRadius: 22 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đề này chưa có part listening." />
            </Card>
        );
    }

    return (
        <Card
            id="runner-active-section"
            key={part.id}
            bodyStyle={{ padding: 20 }}
            style={{ borderRadius: 22 }}
        >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                    }}
                >
                    <Title level={4} style={{ margin: 0, color: '#2563eb' }}>
                        Part {part.partNumber ?? activePartIndex + 1}
                    </Title>
                </div>

                {part.contextDescription ? (
                    <div
                        style={{
                            border: '1px solid #dbeafe',
                            borderRadius: 16,
                            padding: 16,
                            background: '#f8fbff',
                        }}
                    >
                        <HighlightableMarkdown
                            sourceKey={`listening:part:${part.id}:context`}
                            text={formatTemplateText(part.contextDescription)}
                            components={compactMarkdownComponents}
                            highlights={highlights}
                            onCreateHighlight={onCreateHighlight}
                            onDeleteHighlight={onDeleteHighlight}
                        />
                    </div>
                ) : null}

                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                    {part.questionGroups.map((group) => (
                        <GroupBlock
                            key={group.id}
                            group={group}
                            skillType="Listening"
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
            </Space>
        </Card>
    );
};

