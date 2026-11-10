import React from 'react';
import {
    CustomerServiceOutlined,
    AudioOutlined,
    ReadOutlined,
    EditOutlined,
    FormOutlined,
    BookOutlined,
} from '@ant-design/icons';
import { Badge } from '../Badge/Badge';

export interface SkillTagProps {
    skill: 'listening' | 'speaking' | 'reading' | 'writing' | 'grammar' | 'vocabulary';
}

const skillConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    listening: { label: 'Listening', icon: <CustomerServiceOutlined /> },
    speaking: { label: 'Speaking', icon: <AudioOutlined /> },
    reading: { label: 'Reading', icon: <ReadOutlined /> },
    writing: { label: 'Writing', icon: <EditOutlined /> },
    grammar: { label: 'Grammar', icon: <FormOutlined /> },
    vocabulary: { label: 'Vocabulary', icon: <BookOutlined /> },
};

export function SkillTag({ skill }: SkillTagProps) {
    const config = skillConfig[skill];
    if (!config) {
        return <Badge variant="neutral">{skill}</Badge>;
    }
    return (
        <Badge variant="neutral">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {config.icon}
                <span>{config.label}</span>
            </span>
        </Badge>
    );
}
