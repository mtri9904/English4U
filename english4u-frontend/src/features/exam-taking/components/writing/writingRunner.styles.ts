export const writingRunnerStyles = `
.writing-runner-page-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-width: 0;
    height: 100%;
}

.writing-runner-back-button {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 12px;
    border: 1px solid #fed7aa;
    background: linear-gradient(135deg, #ffffff 0%, #fff7ed 100%);
    color: #0f172a;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.writing-runner-back-button:hover {
    border-color: #fdba74 !important;
    background: #fff7ed !important;
    color: #c2410c !important;
}

.writing-runner-title-block {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
}

.writing-runner-title-accent {
    width: 4px;
    height: 30px;
    flex: 0 0 4px;
    border-radius: 999px;
    background: linear-gradient(180deg, #d97706 0%, #f97316 100%);
    box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.1);
}

.writing-runner-page-title {
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

.writing-runner-header-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.writing-runner-header-chip {
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
}

.writing-runner-skill-chip {
    border-color: #fed7aa;
    background: #fff7ed;
    color: #c2410c;
}

.writing-runner-save-chip {
    border-color: #bbf7d0;
    background: #f0fdf4;
    color: #15803d;
}

.writing-runner-header-submit {
    flex-shrink: 0;
    height: 32px;
    border-radius: 999px;
    padding-inline: 14px;
    font-size: 0.84rem;
    font-weight: 800;
    box-shadow: 0 2px 8px rgba(217, 119, 6, 0.18);
}

.writing-runner-split-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: stretch;
    height: calc(100vh - 118px);
    min-height: 640px;
}

.writing-runner-split-pane {
    min-width: 0;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-bottom: 18px !important;
}

.writing-runner-split-pane::-webkit-scrollbar {
    width: 8px;
}

.writing-runner-split-pane::-webkit-scrollbar-track {
    background: transparent;
}

.writing-runner-split-pane::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.42);
    border-radius: 999px;
}

@media (max-width: 1100px) {
    .writing-runner-split-layout {
        grid-template-columns: 1fr;
        height: auto;
    }

    .writing-runner-split-pane {
        height: auto;
        max-height: none !important;
        overflow: visible !important;
        padding-bottom: 20px !important;
    }
}

@media (max-width: 980px) {
    .writing-runner-save-chip {
        display: none;
    }

    .writing-runner-page-title {
        font-size: 0.875rem;
    }
}

@media (max-width: 820px) {
    .writing-runner-header-meta {
        gap: 6px;
    }

    .writing-runner-skill-chip {
        display: none;
    }

    .writing-runner-header-submit {
        padding-inline: 10px;
    }
}
`;

