import React from 'react';

export const NewsModalStyles: React.FC = () => {
    return (
        <style>{`
            .guardian-full-article p {
                margin-bottom: 16px;
            }
            .guardian-interactive-p {
                cursor: pointer;
                border-radius: 6px;
                padding: 2px 4px;
                margin-left: -4px;
                margin-right: -4px;
                transition: background-color 0.15s ease;
            }
            .guardian-interactive-p:hover {
                background-color: rgba(239, 246, 255, 0.7);
            }
            .guardian-full-article figure {
                margin: 24px 0;
                width: 100%;
            }
            .guardian-full-article img {
                width: 100%;
                max-width: 100%;
                height: auto;
                border-radius: 12px;
                display: block;
                box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
            }
            .guardian-full-article figcaption {
                font-size: 12px;
                color: #64748b;
                font-style: italic;
                margin-top: 6px;
                line-height: 1.4;
            }
            .guardian-full-article h2, .guardian-full-article h3 {
                font-weight: 700;
                color: #0f172a;
                margin-top: 28px;
                margin-bottom: 12px;
            }
            .guardian-full-article blockquote {
                border-left: 4px solid #2563eb;
                background: #f8fbff;
                padding: 12px 18px;
                margin: 20px 0;
                border-radius: 0 10px 10px 0;
                color: #1e3a8a;
                font-style: italic;
            }
            .guardian-full-article a {
                color: #2563eb;
                text-decoration: underline;
            }
        `}</style>
    );
};

