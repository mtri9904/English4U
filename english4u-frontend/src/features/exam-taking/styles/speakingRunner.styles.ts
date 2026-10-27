export const speakingRunnerStyles = `
@keyframes pulseGlow {
    0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
    }
    70% {
        transform: scale(1.03);
        box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
    }
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
    }
}

@keyframes pulseGlowSuccess {
    0% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
    }
    70% {
        transform: scale(1.03);
        box-shadow: 0 0 0 10px rgba(16, 185, 129, 0);
    }
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
}

.speaking-next-btn-blink {
    animation: pulseGlow 2s infinite;
}

.speaking-next-btn-blink-success {
    animation: pulseGlowSuccess 2s infinite;
}

@keyframes buttonProgress {
    from {
        width: 0%;
    }
    to {
        width: 100%;
    }
}

.speaking-next-btn-progress {
    position: relative;
    overflow: hidden;
    pointer-events: none;
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 50%, #1d4ed8 100%) !important;
    border: none !important;
    box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
    transition: all 0.3s ease;
}

.speaking-next-btn-progress::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.32) 50%, rgba(255, 255, 255, 0.05) 100%);
    animation: buttonProgress 3s linear forwards;
    pointer-events: none;
    z-index: 1;
}

.speaking-next-btn-progress-success {
    position: relative;
    overflow: hidden;
    pointer-events: none;
    background: linear-gradient(135deg, #065f46 0%, #10b981 50%, #047857 100%) !important;
    border: none !important;
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
    transition: all 0.3s ease;
}

.speaking-next-btn-progress-success::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.32) 50%, rgba(255, 255, 255, 0.05) 100%);
    animation: buttonProgress 3s linear forwards;
    pointer-events: none;
    z-index: 1;
}

.speaking-runner-page-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-width: 0;
    height: 100%;
}

.speaking-runner-back-button {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    border-radius: 12px;
    border: 1px solid #bfdbfe;
    background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
    color: #0f172a;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.speaking-runner-back-button:hover {
    border-color: #93c5fd !important;
    background: #eff6ff !important;
    color: #1d4ed8 !important;
}

.speaking-runner-title-block {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
}

.speaking-runner-title-accent {
    width: 4px;
    height: 30px;
    flex: 0 0 4px;
    border-radius: 999px;
    background: linear-gradient(180deg, #2563eb 0%, #0ea5e9 100%);
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.speaking-runner-page-title {
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

.speaking-runner-header-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.speaking-runner-header-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid #dbeafe;
    background: #ffffff;
    color: #334155;
    font-size: 0.85rem;
    font-weight: 600;
}

.speaking-runner-skill-chip {
    border-color: #fecaca;
    background: #fef2f2;
    color: #dc2626;
}

.speaking-runner-part-chip {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #1d4ed8;
}

.speaking-runner-header-submit {
    height: 40px;
    border-radius: 12px;
    padding-inline: 16px;
    flex-shrink: 0;
}

.speaking-runner-main-grid {
    align-items: flex-start;
}

.speaking-runner-sidebar-col {
    align-self: stretch;
}

.speaking-runner-sidebar-card {
    border-radius: 20px;
}

.speaking-runner-sidebar-card .ant-card-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.speaking-runner-prompt-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    padding-right: 4px;
}

.speaking-runner-right-stack {
    width: 100%;
}

@media (max-width: 1080px) {
    .speaking-runner-page-toolbar {
        flex-wrap: wrap;
        align-items: flex-start;
        height: auto;
    }

    .speaking-runner-title-block {
        min-width: min(100%, 320px);
    }

    .speaking-runner-header-meta {
        order: 3;
        width: 100%;
        flex-wrap: wrap;
    }

    .speaking-runner-header-submit {
        margin-left: auto;
    }
}

@media (min-width: 1200px) {
    .speaking-runner-sidebar-card {
        position: sticky;
        top: 12px;
    }

    .speaking-runner-prompt-list {
        max-height: calc(100vh - 320px);
    }
}
`;

