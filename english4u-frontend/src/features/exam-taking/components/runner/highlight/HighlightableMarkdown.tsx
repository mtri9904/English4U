import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import {
    HIGHLIGHT_COLOR_OPTIONS,
    HIGHLIGHT_COLOR_STYLES,
    type HighlightableProps,
    type RunnerHighlightColor,
} from '../../../constants/highlight.constants';
import {
    applyRenderedHighlights,
    getSelectionOffsetsInsideRoot,
    unwrapRenderedHighlights,
} from '../../../utils/highlight.utils';

export const markdownComponents = {
    p: ({ children }: any) => <p style={{ margin: '0 0 10px', color: '#334155', lineHeight: 1.7, fontSize: '14px' }}>{children}</p>,
    strong: ({ children }: any) => <strong style={{ color: '#0f172a' }}>{children}</strong>,
    code: ({ children }: any) => (
        <code
            style={{
                padding: '1px 8px',
                borderRadius: 999,
                background: '#dbeafe',
                color: '#1d4ed8',
                border: '1px solid #93c5fd',
                fontSize: '0.8125rem',
                fontWeight: 700,
            }}
        >
            {children}
        </code>
    ),
    ol: ({ children }: any) => (
        <ol style={{ margin: '0 0 10px', paddingLeft: 24, listStyleType: 'decimal', color: '#334155', lineHeight: 1.7, fontSize: '14px' }}>
            {children}
        </ol>
    ),
    ul: ({ children }: any) => (
        <ul style={{ margin: '0 0 10px', paddingLeft: 20, listStyleType: 'disc', color: '#334155', lineHeight: 1.7, fontSize: '14px' }}>
            {children}
        </ul>
    ),
    li: ({ children }: any) => <li style={{ marginBottom: 6, color: '#334155', lineHeight: 1.7, fontSize: '14px' }}>{children}</li>,
};

export const compactMarkdownComponents = {
    ...markdownComponents,
    p: ({ children }: any) => <p style={{ margin: 0, color: '#334155', lineHeight: 1.5, fontSize: '14px' }}>{children}</p>,
    ol: ({ children }: any) => (
        <ol style={{ margin: 0, paddingLeft: 24, listStyleType: 'decimal', color: '#334155', lineHeight: 1.7, fontSize: '14px' }}>
            {children}
        </ol>
    ),
    ul: ({ children }: any) => (
        <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc', color: '#334155', lineHeight: 1.7, fontSize: '14px' }}>
            {children}
        </ul>
    ),
    li: ({ children }: any) => <li style={{ marginBottom: 4, color: '#334155', lineHeight: 1.7, fontSize: '14px' }}>{children}</li>,
};

export interface HighlightableMarkdownProps extends HighlightableProps {
    sourceKey: string;
    text: string;
    components?: typeof markdownComponents;
}

export const HighlightableMarkdown = ({
    sourceKey,
    text,
    components = markdownComponents,
    highlights = [],
    onCreateHighlight,
    onDeleteHighlight,
}: HighlightableMarkdownProps) => {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [selectionMenu, setSelectionMenu] = useState<{
        startOffset: number;
        endOffset: number;
        selectedText: string;
        left: number;
        top: number;
    } | null>(null);

    const sourceHighlights = useMemo(
        () => highlights.filter((highlight) => highlight.sourceKey === sourceKey),
        [highlights, sourceKey],
    );

    useEffect(() => {
        const root = rootRef.current;
        if (!root) {
            return;
        }

        applyRenderedHighlights(root, sourceHighlights);
        return () => {
            unwrapRenderedHighlights(root);
        };
    }, [sourceHighlights, text]);

    const handleMouseUp = () => {
        if (!onCreateHighlight) {
            return;
        }

        window.setTimeout(() => {
            const root = rootRef.current;
            if (!root) {
                return;
            }

            const selection = getSelectionOffsetsInsideRoot(root);
            if (!selection) {
                setSelectionMenu(null);
                return;
            }

            setSelectionMenu({
                startOffset: selection.startOffset,
                endOffset: selection.endOffset,
                selectedText: selection.selectedText,
                left: selection.rect.left + (selection.rect.width / 2),
                top: Math.max(12, selection.rect.top - 44),
            });
        }, 0);
    };

    const createHighlight = (color: RunnerHighlightColor) => {
        if (!selectionMenu || !onCreateHighlight) {
            return;
        }

        onCreateHighlight({
            sourceKey,
            startOffset: selectionMenu.startOffset,
            endOffset: selectionMenu.endOffset,
            selectedText: selectionMenu.selectedText,
            color,
        });
        setSelectionMenu(null);
        window.getSelection()?.removeAllRanges();
    };

    const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
        const target = event.target instanceof HTMLElement
            ? event.target.closest('span[data-runner-highlight="true"]')
            : null;
        const highlightId = target instanceof HTMLElement ? target.dataset.highlightId : null;
        if (highlightId && onDeleteHighlight) {
            onDeleteHighlight(highlightId);
            setSelectionMenu(null);
        }
    };

    return (
        <>
            <div ref={rootRef} onMouseUp={handleMouseUp} onClick={handleClick}>
                <ReactMarkdown components={components}>
                    {text}
                </ReactMarkdown>
            </div>
            {selectionMenu ? createPortal(
                <div
                    style={{
                        position: 'fixed',
                        left: selectionMenu.left,
                        top: selectionMenu.top,
                        transform: 'translateX(-50%)',
                        zIndex: 2000,
                        display: 'flex',
                        gap: 6,
                        padding: '7px 9px',
                        borderRadius: 999,
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)',
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                >
                    {HIGHLIGHT_COLOR_OPTIONS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            aria-label={`Highlight ${color}`}
                            onClick={() => createHighlight(color)}
                            style={{
                                width: 22,
                                height: 22,
                                borderRadius: 999,
                                border: `2px solid ${HIGHLIGHT_COLOR_STYLES[color].border}`,
                                background: HIGHLIGHT_COLOR_STYLES[color].background,
                                cursor: 'pointer',
                            }}
                        />
                    ))}
                </div>,
                document.body,
            ) : null}
        </>
    );
};

