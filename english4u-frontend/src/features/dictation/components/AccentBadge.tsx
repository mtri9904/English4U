import React from 'react';
import { ACCENT_BADGE_STYLES } from '../constants/dictation.constants';

interface AccentBadgeProps {
    accent: string;
    style?: React.CSSProperties;
}

export const AccentBadge: React.FC<AccentBadgeProps> = ({ accent, style }) => {
    const b = ACCENT_BADGE_STYLES[accent] ?? {
        bg: '#f1f5f9',
        color: '#475569',
        border: '#cbd5e1',
        label: accent,
    };

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 26,
                height: 20,
                padding: '0 5px',
                borderRadius: 5,
                background: b.bg,
                color: b.color,
                border: `1px solid ${b.border}`,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.5,
                lineHeight: '18px',
                ...style,
            }}
        >
            {b.label}
        </span>
    );
};

