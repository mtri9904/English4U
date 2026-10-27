import React from 'react';
import { Empty, Tag, Typography } from 'antd';
import { motion } from 'framer-motion';
import {
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
} from 'recharts';
import { cardMotion, palette } from '../../constants/client.constants';
import { fadeIn, formatBand } from '../../utils/client.utils';

const { Title, Text } = Typography;

export interface SkillRowItem {
    skill: string;
    label: string;
    color: string;
    averageBand: number | null;
}

export interface DashboardRadarCardProps {
    scoredBands: number[];
    radarData: Array<{ skill: string; band: number }>;
    skillRows: SkillRowItem[];
}

export const DashboardRadarCard: React.FC<DashboardRadarCardProps> = ({
    scoredBands,
    radarData,
    skillRows,
}) => {
    return (
        <motion.div className="bento-card bento-radar glass-card" {...fadeIn(0.1)} {...cardMotion}>
            <div className="card-head">
                <div>
                    <Text className="eyebrow">Skill Balance</Text>
                    <Title level={3} className="card-title">
                        Radar 4 kỹ năng
                    </Title>
                </div>
                <Tag className="soft-pill">Band / 9.0</Tag>
            </div>

            {scoredBands.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa đủ dữ liệu kỹ năng." />
            ) : (
                <div className="radar-wrap">
                    <ResponsiveContainer width="100%" height={360}>
                        <RadarChart data={radarData} outerRadius="72%">
                            <PolarGrid stroke="rgba(100, 116, 139, 0.22)" />
                            <PolarAngleAxis
                                dataKey="skill"
                                tick={{ fill: palette.ink, fontSize: 13, fontWeight: 700 }}
                            />
                            <PolarRadiusAxis
                                domain={[0, 9]}
                                tickCount={5}
                                tick={{ fill: palette.muted, fontSize: 11 }}
                            />
                            <Radar
                                name="Band"
                                dataKey="band"
                                stroke={palette.indigo}
                                fill={palette.indigo}
                                fillOpacity={0.2}
                                strokeWidth={3}
                                isAnimationActive
                                animationDuration={900}
                            />
                            <Tooltip />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            )}

            <div className="skill-mini-grid">
                {skillRows.map((skill) => (
                    <div key={skill.skill} className="skill-mini">
                        <span className="skill-dot" style={{ background: skill.color }} />
                        <span>{skill.label}</span>
                        <strong>{formatBand(skill.averageBand)}</strong>
                    </div>
                ))}
            </div>
        </motion.div>
    );
};

