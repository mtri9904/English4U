import React from 'react';
import { pdfGenerationJobStore } from '../pdfGenerationJob.store';
import type { getStatusTone } from './pdfProgress.utils';

export interface PdfGenerationCollapsedChipProps {
    progressPercent: number;
    statusTone: ReturnType<typeof getStatusTone>;
}

export const PdfGenerationCollapsedChip: React.FC<PdfGenerationCollapsedChipProps> = ({
    progressPercent,
    statusTone,
}) => {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => pdfGenerationJobStore.setCollapsed(false)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pdfGenerationJobStore.setCollapsed(false);
                }
            }}
            style={{
                position: 'fixed',
                right: 20,
                bottom: 20,
                width: 84,
                height: 84,
                zIndex: 1200,
                borderRadius: 28,
                border: `1px solid ${statusTone.border}`,
                background: statusTone.chipBg,
                boxShadow: statusTone.shadow,
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                userSelect: 'none',
            }}
        >
            <div style={{ fontSize: '1.45rem', lineHeight: 1, fontWeight: 900 }}>
                {progressPercent}%
            </div>
            <div
                style={{
                    width: 26,
                    height: 4,
                    borderRadius: 999,
                    marginTop: 10,
                    background: 'rgba(255, 255, 255, 0.55)',
                }}
            />
        </div>
    );
};

