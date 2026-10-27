import React from 'react';
import { Row, Col, Typography, Tag } from 'antd';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

export interface SkillAnalyticItem {
    key: string;
    label: string;
    color: string;
    tint: string;
    icon: React.ReactNode;
    attempts: number;
    avgScore: number | null;
    bestScore: number | null;
    extraMetric: string | null;
    advice: string;
}

interface ProgressSkillBreakdownProps {
    skillAnalytics: SkillAnalyticItem[];
}

export const ProgressSkillBreakdown: React.FC<ProgressSkillBreakdownProps> = ({ skillAnalytics }) => {
    return (
        <motion.section
            className="section-panel flex-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
        >
            <div className="section-title-wrap">
                <Text className="eyebrow">Skill breakdown</Text>
                <Title level={3} className="section-main-title">Đánh Giá & Lời Khuyên Theo Kỹ Năng</Title>
            </div>
            <Row gutter={[20, 20]}>
                {skillAnalytics.map((skill) => (
                    <Col xs={24} md={12} key={skill.key}>
                        <div className="skill-analysis-card glass-card">
                            <div className="card-top">
                                <div className="skill-icon-wrap" style={{ color: skill.color, background: skill.tint }}>
                                    {skill.icon}
                                </div>
                                <div className="skill-info">
                                    <Title level={4} className="skill-name">{skill.label}</Title>
                                    <Text className="skill-attempts">{skill.attempts} lần thử</Text>
                                </div>
                                <div className="skill-scores">
                                    <div className="score-item">
                                        <span className="score-val">{skill.avgScore !== null ? skill.avgScore.toFixed(1) : '-'}</span>
                                        <span className="score-lbl">TB Band</span>
                                    </div>
                                    <div className="score-divider" />
                                    <div className="score-item">
                                        <span className="score-val">{skill.bestScore !== null ? skill.bestScore.toFixed(1) : '-'}</span>
                                        <span className="score-lbl">Tốt nhất</span>
                                    </div>
                                </div>
                            </div>

                            {skill.extraMetric && (
                                <div className="skill-extra-metric">
                                    <Tag color="geekblue" className="metric-tag">{skill.extraMetric}</Tag>
                                </div>
                            )}

                            <div className="advice-box">
                                <div className="advice-header">Trợ lý AI khuyên học:</div>
                                <div className="advice-text">{skill.advice}</div>
                            </div>
                        </div>
                    </Col>
                ))}
            </Row>
        </motion.section>
    );
};

