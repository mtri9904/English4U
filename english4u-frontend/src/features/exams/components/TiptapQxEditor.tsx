import { normalizeMarkdownBoldText } from '@/shared/utils/markdown.utils';
import { useEditor, EditorContent, Node } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { mergeAttributes } from '@tiptap/core';
import { forwardRef, useImperativeHandle, useEffect } from 'react';

// Custom Node for [Qx]
const QxNode = Node.create({
    name: 'qx',
    group: 'inline',
    inline: true,
    selectable: true,
    draggable: false,
    atom: true,

    addAttributes() {
        return {
            label: {
                default: '',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-qx]',
                getAttrs: (element) => ({
                    label: (element as HTMLElement).getAttribute('data-label'),
                }),
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-qx': '',
                'data-label': HTMLAttributes.label,
                style: 'color: #0284c7; font-weight: 700; background: #e0f2fe; border-radius: 4px; padding: 0 4px; border: 1px solid #bae6fd; display: inline-block; cursor: default; margin: 0 2px; line-height: 1;',
            }),
            `[${HTMLAttributes.label}]`,
        ];
    },

    addCommands() {
        return {
            insertQx:
                (label: string) =>
                    ({ chain }: { chain: any }) => {
                        return chain()
                            .insertContent({
                                type: this.name,
                                attrs: { label },
                            })
                            .insertContent(' ') // Add a space after for easier typing
                            .run();
                    },
        } as any;
    },
});

interface TiptapQxEditorProps {
    value: string;
    onChange?: (val: string) => void;
    placeholder?: string;
    minHeight?: string;
    onFocus?: () => void;
    enableMarkdownBold?: boolean;
    borderless?: boolean;
    style?: React.CSSProperties;
    onTableActiveChange?: (isActive: boolean) => void;
    editable?: boolean;
}

export interface TiptapQxEditorRef {
    insertQ: (qNum: number) => void;
    toggleBold: () => void;
    insertTable: (rows?: number, cols?: number) => void;
    addRow: () => void;
    deleteRow: () => void;
    addColumn: () => void;
    deleteColumn: () => void;
    deleteTable: () => void;
    isTableActive: () => boolean;
}

export const TiptapQxEditor = forwardRef<TiptapQxEditorRef, TiptapQxEditorProps>(({
    value,
    onChange,
    placeholder,
    minHeight = '120px',
    onFocus,
    enableMarkdownBold = false,
    borderless = false,
    style,
    onTableActiveChange,
    editable = true,
}, ref) => {
    const normalizeEditorText = (text?: string | null) => normalizeMarkdownBoldText(text);

    const escapeHtml = (text: string) => text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const convertTextPartToHtml = (text: string) =>
        escapeHtml(text)
            .split(/(\[Q\d+\])/g)
            .map((part) => {
                const match = part.match(/^\[(Q\d+)\]$/);
                if (match) {
                    return `<span data-qx data-label="${match[1]}">[${match[1]}]</span>`;
                }
                return part.replace(/\n/g, '<br />');
            })
            .join('');

    const parseInlineTextToHtml = (text: string) => {
        const normalized = normalizeEditorText(text);
        if (!enableMarkdownBold) {
            return convertTextPartToHtml(normalized);
        }
        const segments = normalized.replace(/__(.+?)__/g, '**$1**').split(/(\*\*[\s\S]+?\*\*)/g);
        return segments
            .map((segment) => {
                const boldMatch = segment.match(/^\*\*([\s\S]+?)\*\*$/);
                if (boldMatch) {
                    return `<strong>${convertTextPartToHtml(boldMatch[1])}</strong>`;
                }
                return convertTextPartToHtml(segment);
            })
            .join('');
    };

    const isMarkdownTableLine = (line: string) => {
        const trimmed = line.trim();
        return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
    };

    const convertLegacyMixedJson = (rawText: string) => {
        if (rawText.trim().startsWith('{') && rawText.includes('mixed_note_table')) {
            try {
                const parsed = JSON.parse(rawText);
                if (parsed.layout === 'mixed_note_table') {
                    const lines: string[] = [];
                    if (parsed.topText) lines.push(parsed.topText);
                    if (Array.isArray(parsed.tableData) && parsed.tableData.length > 0) {
                        parsed.tableData.forEach((row: string[], rIdx: number) => {
                            lines.push(`| ${row.map((c) => (c || '').trim()).join(' | ')} |`);
                            if (rIdx === 0) {
                                lines.push(`| ${row.map(() => '---').join(' | ')} |`);
                            }
                        });
                    }
                    if (parsed.bottomText) lines.push(parsed.bottomText);
                    return lines.join('\n');
                }
            } catch {}
        }
        return rawText;
    };

    // Convert text and markdown tables to Tiptap HTML nodes
    const parseTextToNodes = (text: string) => {
        const sourceText = convertLegacyMixedJson(text || '');
        const lines = sourceText.split(/\r?\n/);
        const htmlParts: string[] = [];
        let currentTableLines: string[] = [];

        const flushTable = () => {
            if (currentTableLines.length === 0) return;
            const rows: string[][] = [];
            for (const line of currentTableLines) {
                const trimmed = line.trim();
                if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue; // Separator row
                const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim().replace(/\\\|/g, '|'));
                rows.push(cells);
            }
            if (rows.length > 0) {
                const header = rows[0];
                const bodyRows = rows.slice(1);
                let tableHtml = '<table><thead><tr>';
                for (const cell of header) {
                    tableHtml += `<th><p>${parseInlineTextToHtml(cell)}</p></th>`;
                }
                tableHtml += '</tr></thead><tbody>';
                for (const row of bodyRows) {
                    tableHtml += '<tr>';
                    for (const cell of row) {
                        tableHtml += `<td><p>${parseInlineTextToHtml(cell)}</p></td>`;
                    }
                    tableHtml += '</tr>';
                }
                tableHtml += '</tbody></table>';
                htmlParts.push(tableHtml);
            }
            currentTableLines = [];
        };

        for (const line of lines) {
            if (isMarkdownTableLine(line)) {
                currentTableLines.push(line);
            } else {
                flushTable();
                if (line.trim().length === 0) {
                    htmlParts.push('<p></p>');
                } else {
                    htmlParts.push(`<p>${parseInlineTextToHtml(line)}</p>`);
                }
            }
        }
        flushTable();

        return htmlParts.join('') || '<p></p>';
    };

    // Convert HTML back to text with Markdown tables and [Qx]
    const serializeToText = (html: string) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('span[data-qx]').forEach((node) => {
            const label = node.getAttribute('data-label');
            node.replaceWith(`[${label}]`);
        });

        doc.querySelectorAll('br').forEach((node) => {
            node.replaceWith('\n');
        });

        if (enableMarkdownBold) {
            doc.querySelectorAll('strong, b').forEach((node) => {
                node.replaceWith(`**${node.textContent || ''}**`);
            });
        }

        const lines: string[] = [];
        Array.from(doc.body.childNodes).forEach((child) => {
            if (child.nodeType === 1) {
                const el = child as HTMLElement;
                if (el.tagName.toLowerCase() === 'table') {
                    const trs = Array.from(el.querySelectorAll('tr'));
                    if (trs.length > 0) {
                        trs.forEach((tr, rIdx) => {
                            const cells = Array.from(tr.querySelectorAll('th, td'));
                            const cellTexts = cells.map((cell) =>
                                (cell.textContent || '').trim().replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
                            );
                            lines.push(`| ${cellTexts.join(' | ')} |`);
                            if (rIdx === 0) {
                                const sep = cells.map(() => '---');
                                lines.push(`| ${sep.join(' | ')} |`);
                            }
                        });
                    }
                } else {
                    lines.push(el.textContent || '');
                }
            } else if (child.nodeType === 3) {
                const txt = child.textContent?.trim();
                if (txt) lines.push(txt);
            }
        });

        if (lines.length === 0) {
            return (doc.body.textContent || '').trim();
        }

        return lines.join('\n');
    };

    const editor = useEditor({
        editable,
        extensions: [
            StarterKit.configure({
                heading: false,
                codeBlock: false,
                bulletList: false,
                orderedList: false,
            }),
            Placeholder.configure({
                placeholder: placeholder || 'Nhập nội dung...',
            }),
            Table.configure({
                resizable: false,
                HTMLAttributes: {
                    class: 'tiptap-table',
                },
            }),
            TableRow,
            TableHeader,
            TableCell,
            QxNode,
        ],
        content: parseTextToNodes(value),
        onUpdate: ({ editor }) => {
            onChange?.(serializeToText(editor.getHTML()));
        },
        onSelectionUpdate: ({ editor }) => {
            onTableActiveChange?.(editor.isActive('table'));
        },
        onFocus: () => {
            if (onFocus) onFocus();
        },
        editorProps: {
            attributes: {
                class: 'tiptap-content',
                style: `min-height: ${minHeight}; padding: 8px 12px; font-size: 14px; outline: none;`,
            },
            handlePaste: (view, event) => {
                const clipboardData = event.clipboardData;
                if (!clipboardData) return false;

                const htmlData = clipboardData.getData('text/html');
                if (htmlData && /<table\b/i.test(htmlData)) {
                    return false;
                }

                const pastedText = clipboardData.getData('text/plain') ?? '';
                if (!pastedText) return false;

                if (pastedText.includes('|') && pastedText.includes('\n')) {
                    // Let markdown table paste work natively or insert content
                    return false;
                }

                event.preventDefault();
                const cleaned = pastedText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
                const { from, to } = view.state.selection;
                view.dispatch(view.state.tr.insertText(cleaned, from, to));
                return true;
            },
        },
    });

    useImperativeHandle(ref, () => ({
        insertQ: (qNum: number) => {
            if (editor) {
                editor.chain().focus().insertContent({
                    type: 'qx',
                    attrs: { label: `Q${qNum}` },
                }).insertContent(' ').run();
            }
        },
        toggleBold: () => {
            if (editor) {
                editor.chain().focus().toggleBold().run();
            }
        },
        insertTable: (rows = 3, cols = 3) => {
            if (editor) {
                editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
            }
        },
        addRow: () => {
            if (editor) {
                editor.chain().focus().addRowAfter().run();
            }
        },
        deleteRow: () => {
            if (editor) {
                editor.chain().focus().deleteRow().run();
            }
        },
        addColumn: () => {
            if (editor) {
                editor.chain().focus().addColumnAfter().run();
            }
        },
        deleteColumn: () => {
            if (editor) {
                editor.chain().focus().deleteColumn().run();
            }
        },
        deleteTable: () => {
            if (editor) {
                editor.chain().focus().deleteTable().run();
            }
        },
        isTableActive: () => {
            return !!editor?.isActive('table');
        },
    }));

    // Sync value from outside (only if fundamentally different)
    useEffect(() => {
        if (!editor) return;

        const currentHtml = editor.getHTML();
        const currentSerialized = serializeToText(currentHtml);
        const normalizedValue = normalizeEditorText(convertLegacyMixedJson(value || ''));

        if (editor.isFocused && normalizedValue === currentSerialized) {
            return;
        }

        const shouldNormalizeMarkdownBold = enableMarkdownBold
            && /(\*\*[^*]+\*\*|__[^_]+__)/.test(normalizedValue)
            && !/<(strong|b)\b/i.test(currentHtml);

        const hasTableInValue = isMarkdownTableLine(normalizedValue);
        const hasTableInHtml = /<table\b/i.test(currentHtml);

        if (normalizedValue !== currentSerialized || shouldNormalizeMarkdownBold || (hasTableInValue !== hasTableInHtml)) {
            editor.commands.setContent(parseTextToNodes(normalizedValue));
        }
    }, [value, editor, enableMarkdownBold]);

    useEffect(() => {
        if (editor && editor.isEditable !== editable) {
            editor.setEditable(editable);
        }
    }, [editor, editable]);

    return (
        <div style={{
            border: borderless ? 'none' : '1px solid #d9d9d9',
            borderRadius: borderless ? 0 : '8px',
            background: editable ? '#fff' : 'transparent',
            transition: 'all 0.2s',
            minHeight: minHeight,
            cursor: editable ? 'text' : 'default',
            ...style,
        }} className={`qx-editor-container ${borderless ? 'qx-editor-borderless' : ''} ${!editable ? 'qx-editor-readonly' : ''}`}>
            <style>{`
        .qx-editor-container:focus-within {
          border-color: #4096ff;
          box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.1);
        }
        .qx-editor-borderless:focus-within {
          border-color: transparent !important;
          box-shadow: inset 0 0 0 2px #3b82f6 !important;
        }
        .qx-editor-readonly:focus-within {
          border-color: transparent !important;
          box-shadow: none !important;
        }
        .tiptap-content p {
          margin: 0;
          min-height: 1.5em;
        }
        .tiptap-content span[data-qx] {
          user-select: all;
        }
        .tiptap-content table {
          border-collapse: collapse;
          margin: 10px 0;
          width: 100%;
          table-layout: fixed;
          border: 1px solid #cbd5e1;
        }
        .tiptap-content table td,
        .tiptap-content table th {
          min-width: 80px;
          border: 1px solid #cbd5e1;
          padding: 8px 10px;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }
        .tiptap-content table th {
          font-weight: 600;
          background-color: #f8fafc;
          text-align: left;
        }
        .tiptap-content table p {
          margin: 0;
          min-height: 1.25em;
        }
      `}</style>
            <EditorContent editor={editor} />
        </div >
    );
});
