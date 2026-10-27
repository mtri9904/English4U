export const objectiveRunnerStyles = `
.runner-page-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-width: 0;
    height: 100%;
}

.runner-back-button {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 12px;
    border: 1px solid #dbeafe;
    background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
    color: #0f172a;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.runner-back-button:hover {
    border-color: #93c5fd !important;
    background: #eff6ff !important;
    color: #1d4ed8 !important;
}

.runner-title-block {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
}

.runner-title-accent {
    width: 4px;
    height: 30px;
    flex: 0 0 4px;
    border-radius: 999px;
    background: linear-gradient(180deg, #2563eb 0%, #14b8a6 100%);
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
}

.runner-page-title {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #0f172a;
    font-weight: 800;
    font-size: 1.08rem;
    letter-spacing: -0.02em;
}

.runner-header-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.runner-audio-slot {
    width: 320px;
    min-width: 320px;
    max-width: 320px;
    flex: 0 0 320px;
}

.runner-audio-player {
    display: block;
    width: 100%;
    height: 34px;
}

.runner-audio-hidden {
    display: none;
}

.runner-mock-audio-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    padding: 8px 12px;
    border-radius: 16px;
    border: 1px solid #bfdbfe;
    background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
}

.runner-mock-audio-head,
.runner-mock-audio-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.runner-mock-audio-badge {
    font-size: 0.72rem;
    font-weight: 800;
    color: #1d4ed8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.runner-mock-audio-state {
    font-size: 0.72rem;
    font-weight: 700;
    color: #475569;
    white-space: nowrap;
}

.runner-mock-audio-track {
    position: relative;
    width: 100%;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    background: #dbeafe;
}

.runner-mock-audio-track-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
}

.runner-mock-audio-meta {
    font-size: 0.72rem;
    font-weight: 700;
    color: #334155;
}

.runner-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid #e2e8f0;
    background: #ffffff;
    color: #334155;
    font-size: 0.84rem;
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum";
}

.runner-skill-chip {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
}

.runner-timer-chip {
    min-width: 92px;
    justify-content: center;
}

.runner-save-chip {
    border-color: #bbf7d0;
    background: #f0fdf4;
    color: #15803d;
}

.runner-save-status-chip {
    min-width: 132px;
    justify-content: center;
}

.runner-header-submit {
    flex-shrink: 0;
    height: 32px;
    border-radius: 999px;
    padding-inline: 14px;
    font-size: 0.84rem;
    font-weight: 800;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.16);
}

.runner-split-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: stretch;
    height: calc(100vh - 118px);
    min-height: 520px;
}

.runner-split-pane {
    min-width: 0;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: 18px !important;
}

.runner-split-pane::-webkit-scrollbar {
    width: 8px;
}

.runner-split-pane::-webkit-scrollbar-track {
    background: transparent;
}

.runner-split-pane::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.42);
    border-radius: 999px;
}

@media (max-width: 1100px) {
    .runner-split-layout {
        grid-template-columns: 1fr;
        height: auto;
    }

    .runner-split-pane {
        height: auto;
        max-height: none !important;
        overflow: visible !important;
        padding-bottom: 20px !important;
    }
}

@media (max-width: 980px) {
    .runner-autosave-tag {
        display: none;
    }

    .runner-audio-slot {
        width: 250px;
        min-width: 250px;
        max-width: 250px;
        flex-basis: 250px;
    }

    .runner-page-title {
        font-size: 0.875rem;
    }
}

@media (max-width: 820px) {
    .runner-header-meta {
        gap: 6px;
    }

    .runner-skill-chip {
        display: none;
    }

    .runner-audio-slot {
        width: 190px;
        min-width: 190px;
        max-width: 190px;
        flex-basis: 190px;
    }

    .runner-mock-audio-state {
        display: none;
    }

    .runner-header-submit {
        padding-inline: 10px;
    }
}
`;

