import { palette } from '../../constants/gamification.constants';

export const progressStyles = `
.progress-shell {
    max-width: 1220px;
    margin: 0 auto;
    padding: 6px 0 28px;
    font-family: "Plus Jakarta Sans", "Inter", "Outfit", sans-serif;
    color: ${palette.ink};
}

.progress-skeleton {
    padding: 24px;
}

.skeleton-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-top: 24px;
}

.progress-header {
    margin-bottom: 24px;
}

.header-title {
    font-weight: 800 !important;
    letter-spacing: -0.025em;
    margin-bottom: 6px !important;
}

.header-desc {
    color: ${palette.muted};
    font-size: 0.95rem;
    margin: 0 !important;
}

.stats-row {
    margin-bottom: 24px;
}

.glass-card {
    border: 1px solid ${palette.border} !important;
    background: ${palette.card} !important;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04) !important;
    backdrop-filter: blur(16px);
    border-radius: 16px;
    padding: 20px;
}

.stat-card {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 100%;
}

.stat-icon {
    width: 46px;
    height: 46px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    font-size: 1.25rem;
    flex-shrink: 0;
}

.stat-label {
    display: block;
    font-size: 0.78rem;
    color: ${palette.muted};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.stat-value {
    font-size: 1.5rem;
    font-weight: 800;
    color: ${palette.ink};
    line-height: 1.2;
    margin: 2px 0;
}

.stat-sub {
    display: block;
    font-size: 0.75rem;
    color: ${palette.muted};
}

.section-panel {
    margin-bottom: 28px;
}

.flex-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.section-title-wrap {
    margin-bottom: 4px;
}

.eyebrow {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: ${palette.indigo};
    display: block;
    margin-bottom: 2px;
}

.section-main-title {
    font-weight: 800 !important;
    letter-spacing: -0.02em;
    margin: 0 !important;
    font-size: 1.35rem !important;
}

.panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
}

.panel-title {
    font-weight: 750 !important;
    margin: 0 !important;
    font-size: 1.15rem !important;
}

.chart-wrap {
    margin-top: 10px;
    padding-top: 8px;
}

.skill-analysis-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid ${palette.border};
}

.card-top {
    display: flex;
    align-items: center;
    gap: 16px;
}

.skill-icon-wrap {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    font-size: 1.15rem;
    flex-shrink: 0;
}

.skill-info {
    flex: 1;
    min-width: 0;
}

.skill-name {
    font-weight: 700 !important;
    margin: 0 !important;
    font-size: 1.05rem !important;
}

.skill-attempts {
    font-size: 0.78rem;
    color: ${palette.muted};
}

.skill-scores {
    display: flex;
    align-items: center;
    gap: 12px;
}

.score-item {
    display: flex;
    flex-direction: column;
    align-items: center;
}

.score-val {
    font-size: 1.15rem;
    font-weight: 850;
    color: ${palette.ink};
}

.score-lbl {
    font-size: 0.65rem;
    color: ${palette.muted};
    text-transform: uppercase;
    font-weight: 600;
}

.score-divider {
    width: 1px;
    height: 24px;
    background: #e2e8f0;
}

.skill-extra-metric {
    margin-top: 14px;
}

.metric-tag {
    font-weight: 600;
    border-radius: 6px;
    padding: 2px 8px;
}

.advice-box {
    margin-top: 14px;
    background: #f8fafc;
    border-radius: 10px;
    padding: 12px;
    border: 1px dashed #e2e8f0;
}

.advice-header {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    color: ${palette.indigo};
    margin-bottom: 4px;
}

.advice-text {
    font-size: 0.82rem;
    color: #475569;
    line-height: 1.4;
}

.badge-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 12px;
    text-align: center;
    height: 100%;
    transition: all 0.2s ease;
}

.badge-card.locked {
    opacity: 0.55;
    background: rgba(241, 245, 249, 0.4) !important;
}

.badge-card.unlocked:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 30px rgba(79, 70, 229, 0.08) !important;
}

.badge-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 1.25rem;
    margin-bottom: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.badge-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: ${palette.ink};
    line-height: 1.3;
    margin-bottom: 4px;
}

.badge-desc {
    font-size: 0.68rem;
    color: ${palette.muted};
    line-height: 1.25;
}

.custom-table {
    margin-top: 8px;
}

.custom-table .ant-table-thead > tr > th {
    background: #f8fafc !important;
    color: #475569 !important;
    font-weight: 700 !important;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-bottom: 1px solid #e2e8f0 !important;
}

.custom-table .ant-table-tbody > tr > td {
    padding: 14px 16px !important;
    border-bottom: 1px solid #f1f5f9 !important;
    font-size: 0.88rem;
}

.custom-table .ant-table-row:hover > td {
    background: #f8fafc !important;
}

.table-action-btn {
    border-radius: 8px !important;
    color: ${palette.muted} !important;
    transition: all 0.15s ease;
}

.table-action-btn:hover {
    color: ${palette.indigo} !important;
    background: ${palette.indigo}0d !important;
    transform: scale(1.05);
}
`;

