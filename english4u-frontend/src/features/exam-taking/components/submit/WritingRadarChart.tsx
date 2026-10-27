import React from 'react';
import type { PracticeSessionFeedbackDto } from '../../types/session.types';
import { writingCriteriaLabels } from '../../utils/sessionReview.utils';

export type WritingCorrection = {
    start_index?: number | null;
    end_index?: number | null;
    original_text?: string | null;
    corrected_text?: string | null;
    explanation?: string | null;
    criteria?: string | null;
};

export const parseWritingOverallFeedback = (
    value?: string | null,
): {
    tasks?: Array<{
        task_number?: number;
        feedback?: string;
        detailed_corrections?: WritingCorrection[];
    }>;
} | null => {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as {
            tasks?: Array<{
                task_number?: number;
                feedback?: string;
                detailed_corrections?: WritingCorrection[];
            }>;
        };
    } catch {
        return null;
    }
};

export interface WritingRadarChartProps {
    feedbacks: PracticeSessionFeedbackDto[];
    compact?: boolean;
}

export const WritingRadarChart: React.FC<WritingRadarChartProps> = ({ feedbacks, compact = false }) => {
    const orderedFeedbacks = feedbacks;
    const size = compact ? 260 : 300;
    const center = size / 2;
    const radius = compact ? 72 : 86;
    const labelRadius = compact ? 106 : 122;
    const labelFontSize = compact ? 10 : 12;
    const valueFontSize = compact ? 10 : 11;
    const levels = [0.25, 0.5, 0.75, 1];
    const points = orderedFeedbacks.map((feedback, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
        const valueRadius = (radius * Math.min(9, Math.max(0, feedback.bandScore))) / 9;
        return {
            x: center + valueRadius * Math.cos(angle),
            y: center + valueRadius * Math.sin(angle),
            labelX: center + labelRadius * Math.cos(angle),
            labelY: center + labelRadius * Math.sin(angle),
            label: writingCriteriaLabels[feedback.criteria] ?? feedback.criteria,
            value: feedback.bandScore,
        };
    });

    const gridPolygons = levels.map((level) => {
        const gridPoints = orderedFeedbacks.map((_, index) => {
            const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
            return `${center + radius * level * Math.cos(angle)},${center + radius * level * Math.sin(angle)}`;
        });
        return gridPoints.join(' ');
    });

    return (
        <div style={{ width: '100%', maxWidth: compact ? 260 : 420, margin: '0 auto' }}>
            <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
                {gridPolygons.map((polygon, index) => (
                    <polygon
                        key={polygon}
                        points={polygon}
                        fill="none"
                        stroke={index === gridPolygons.length - 1 ? '#fdba74' : '#fed7aa'}
                        strokeWidth={1}
                    />
                ))}
                {orderedFeedbacks.map((_, index) => {
                    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / orderedFeedbacks.length;
                    return (
                        <line
                            key={index}
                            x1={center}
                            y1={center}
                            x2={center + radius * Math.cos(angle)}
                            y2={center + radius * Math.sin(angle)}
                            stroke="#fed7aa"
                            strokeWidth={1}
                        />
                    );
                })}
                <polygon
                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="rgba(217,119,6,0.24)"
                    stroke="#d97706"
                    strokeWidth={2}
                />
                {points.map((point) => (
                    <g key={point.label}>
                        <circle cx={point.x} cy={point.y} r={4} fill="#d97706" />
                        <text
                            x={point.labelX}
                            y={point.labelY}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={labelFontSize}
                            fontWeight={700}
                            fill="#92400e"
                        >
                            {point.label}
                        </text>
                        <text
                            x={point.labelX}
                            y={point.labelY + 14}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={valueFontSize}
                            fill="#64748b"
                        >
                            {point.value.toFixed(1)}
                        </text>
                    </g>
                ))}
            </svg>
        </div>
    );
};

