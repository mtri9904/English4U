import { palette } from '../../constants/client.constants';

export const dashboardStyles = `
.dashboard-shell {
    min-height: 100%;
    max-width: 1220px;
    margin: 0 auto;
    padding: 6px 0 28px;
    color: ${palette.ink};
    font-family: "Plus Jakarta Sans", "Inter", "Outfit", sans-serif;
}

.dashboard-shell::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
        linear-gradient(135deg, rgba(79, 70, 229, 0.08), transparent 34%),
        linear-gradient(315deg, rgba(22, 163, 74, 0.08), transparent 30%),
        ${palette.bg};
}

.glass-card {
    border: 1px solid ${palette.border};
    background: ${palette.card};
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
    backdrop-filter: blur(18px);
}

.dashboard-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 18px;
    border-radius: 28px;
    padding: 22px;
    margin-bottom: 16px;
}

.hero-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
    gap: 18px;
}

.hero-copy,
.hero-action,
.band-panel {
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.68);
    border: 1px solid rgba(226, 232, 240, 0.72);
    padding: 18px;
}

.hero-copy {
    min-height: 230px;
}

.hero-avatar {
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.22);
}

.eyebrow {
    color: ${palette.muted};
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
}

.hero-title,
.card-title,
.focus-title {
    color: ${palette.ink} !important;
    margin: 0 !important;
    font-weight: 850 !important;
    letter-spacing: 0;
}

.hero-title {
    font-size: 30px !important;
    line-height: 1.12 !important;
}

.hero-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 18px 0 12px;
}

.streak-pill,
.soft-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 5px 10px;
    margin: 0;
    font-weight: 750;
}

.streak-pill {
    color: #9a3412;
    border-color: rgba(249, 115, 22, 0.22);
    background: rgba(255, 237, 213, 0.82);
}

.streak-pill-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1;
}

.soft-pill {
    color: ${palette.ink};
    border-color: rgba(148, 163, 184, 0.22);
    background: rgba(255, 255, 255, 0.72);
}

.hero-desc,
.focus-note {
    color: ${palette.muted};
    margin: 0;
}

.hero-action {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 16px;
}

.focus-title {
    font-size: 20px !important;
    line-height: 1.25 !important;
}

.band-panel {
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.band-number {
    font-size: 76px;
    line-height: 1;
    font-weight: 900;
    color: ${palette.indigo};
    margin: 12px 0 16px;
}

.band-footer {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: ${palette.muted};
    font-size: 13px;
    margin-top: 8px;
}

.summary-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 16px;
}

.summary-card {
    display: flex;
    gap: 14px;
    align-items: center;
    border-radius: 22px;
    padding: 16px;
}

.summary-icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    font-size: 20px;
    flex: 0 0 46px;
}

.summary-label,
.summary-detail {
    color: ${palette.muted};
    font-size: 13px;
}

.summary-value {
    color: ${palette.ink};
    font-size: 24px;
    font-weight: 900;
    line-height: 1.1;
}

.bento-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 16px;
}

.bento-card {
    border-radius: 28px;
    padding: 18px;
    min-height: 230px;
    overflow: hidden;
}

.bento-radar {
    grid-column: span 7;
    grid-row: span 2;
    min-height: 560px;
}

.bento-planner,
.bento-fluency {
    grid-column: span 5;
}

.bento-vocab {
    grid-column: span 3;
}

.bento-recent {
    grid-column: span 6;
}

.bento-leaderboard {
    grid-column: span 3;
}

.card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
}

.card-head.compact {
    margin-bottom: 12px;
}

.radar-wrap {
    min-height: 370px;
}

.skill-mini-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.skill-mini {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 16px;
    background: rgba(248, 250, 252, 0.82);
    color: ${palette.ink};
    font-size: 13px;
}

.skill-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
}

.planner-list,
.recent-list,
.leader-list {
    display: grid;
    gap: 10px;
}

.planner-item,
.recent-item {
    width: 100%;
    border: 1px solid rgba(226, 232, 240, 0.85);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.68);
    color: ${palette.ink};
    cursor: pointer;
    text-align: left;
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.planner-item:hover,
.recent-item:hover {
    transform: translateY(-2px);
    border-color: rgba(79, 70, 229, 0.3);
    background: rgba(255, 255, 255, 0.9);
}

.planner-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px;
}

.planner-index {
    width: 30px;
    height: 30px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: rgba(79, 70, 229, 0.1);
    color: ${palette.indigo};
    font-weight: 900;
}

.planner-index.done {
    background: rgba(22, 163, 74, 0.1);
    color: ${palette.green};
}

.planner-copy,
.recent-copy,
.leader-name {
    min-width: 0;
}

.planner-copy strong,
.recent-copy strong,
.leader-name strong {
    display: block;
    color: ${palette.ink};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.planner-copy small,
.recent-copy small,
.leader-name small {
    display: block;
    color: ${palette.muted};
    font-size: 12px;
    margin-top: 2px;
}

.planner-action {
    color: ${palette.indigo};
    font-size: 12px;
    font-weight: 850;
}

.flashcard-box {
    margin-top: 16px;
    border-radius: 24px;
    padding: 18px;
    background: linear-gradient(135deg, rgba(79, 70, 229, 0.1), rgba(8, 145, 178, 0.1));
    border: 1px solid rgba(79, 70, 229, 0.16);
}

.flashcard-label {
    color: ${palette.muted};
    font-size: 12px;
    font-weight: 800;
}

.flashcard-word {
    color: ${palette.ink};
    font-size: 28px;
    font-weight: 900;
    margin: 6px 0;
}

.flashcard-note {
    color: ${palette.muted};
    font-size: 13px;
}

.recent-item {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 12px;
}

.recent-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    font-size: 16px;
}

.recent-score {
    color: ${palette.ink};
    font-size: 16px;
    font-weight: 900;
}

.recent-arrow {
    color: #94a3b8;
    font-size: 12px;
}

.leader-icon {
    color: ${palette.amber};
    font-size: 24px;
}

.leader-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 12px;
    border-radius: 18px;
    background: rgba(248, 250, 252, 0.78);
    border: 1px solid rgba(226, 232, 240, 0.86);
}

.leader-row.active {
    background: rgba(79, 70, 229, 0.08);
    border-color: rgba(79, 70, 229, 0.2);
}

.leader-rank {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: #fff;
    color: ${palette.indigo};
    font-weight: 900;
}

.leader-value {
    color: ${palette.ink};
    font-size: 12px;
    font-weight: 850;
}

.dashboard-skeleton {
    border-radius: 28px;
    padding: 22px;
    border: 1px solid ${palette.border};
    background: ${palette.card};
}

.skeleton-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
}

.skeleton-node {
    width: 100% !important;
    height: 180px !important;
    border-radius: 22px !important;
}

@media (max-width: 1100px) {
    .dashboard-hero,
    .hero-main {
        grid-template-columns: 1fr;
    }

    .summary-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .bento-radar,
    .bento-planner,
    .bento-fluency,
    .bento-vocab,
    .bento-recent,
    .bento-leaderboard {
        grid-column: span 6;
    }
}

@media (max-width: 760px) {
    .dashboard-shell {
        padding-bottom: 20px;
    }

    .dashboard-hero {
        padding: 14px;
        border-radius: 22px;
    }

    .hero-copy,
    .hero-action,
    .band-panel,
    .bento-card {
        border-radius: 20px;
        padding: 14px;
    }

    .hero-title {
        font-size: 24px !important;
    }

    .band-number {
        font-size: 56px;
    }

    .summary-strip,
    .skill-mini-grid,
    .skeleton-grid {
        grid-template-columns: 1fr;
    }

    .bento-radar,
    .bento-planner,
    .bento-fluency,
    .bento-vocab,
    .bento-recent,
    .bento-leaderboard {
        grid-column: span 12;
        min-height: auto;
    }
}
`;

