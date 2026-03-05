import { useEditor, EditorContent, Node } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { mergeAttributes } from '@tiptap/core';
import { forwardRef, useImperativeHandle, useEffect } from 'react';
import { cleanUpClipboardText } from '../pages/exam-editor/examEditor.helpers';

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
    onChange: (val: string) => void;
    placeholder?: string;
    minHeight?: string;
    onFocus?: () => void;
    enableMarkdownBold?: boolean;
}

export interface TiptapQxEditorRef {
    insertQ: (qNum: number) => void;
    toggleBold: () => void;
}

export const TiptapQxEditor = forwardRef<TiptapQxEditorRef, TiptapQxEditorProps>(({
    value,
    onChange,
    placeholder,
    minHeight = '120px',
    onFocus,
    enableMarkdownBold = false,
}, ref) => {
    const escapeHtml = (text: string) => text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const convertMarkdownBoldToHtml = (text: string) => {
        if (!enableMarkdownBold) return text;
        return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    };

    // Convert text [Q1] to <span data-qx data-label="Q1">[Q1]</span>
    const parseTextToNodes = (text: string) => {
        return text.split(/(\[Q\d+\])/g)
            .map((part) => {
                const match = part.match(/^\[(Q\d+)\]$/);
                if (match) {
                    return `<span data-qx data-label="${match[1]}">[${match[1]}]</span>`;
                }
                return convertMarkdownBoldToHtml(escapeHtml(part));
            })
            .join('');
    };

    // Convert HTML back to text [Qx]
    const serializeToText = (html: string) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        doc.querySelectorAll('span[data-qx]').forEach((node) => {
            const label = node.getAttribute('data-label');
            node.replaceWith(`[${label}]`);
        });

        if (enableMarkdownBold) {
            doc.querySelectorAll('strong, b').forEach((node) => {
                node.replaceWith(`**${node.textContent || ''}**`);
            });
        }

        // Extract text and handle block elements (like <p>)
        const paragraphs = doc.querySelectorAll('p');
        const lines: string[] = [];
        paragraphs.forEach((p) => {
            lines.push(p.textContent || '');
        });

        return lines.join('\n');
    };

    const editor = useEditor({
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
            QxNode,
        ],
        content: parseTextToNodes(value),
        onUpdate: ({ editor }) => {
            onChange(serializeToText(editor.getHTML()));
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

                const pastedText = clipboardData.getData('text/plain') ?? '';
                if (!pastedText) return false;

                event.preventDefault();
                const cleaned = cleanUpClipboardText(pastedText);
                const { from, to } = view.state.selection;
                view.dispatch(view.state.tr.insertText(cleaned, from, to));
                return true;
            },
        },
    });

    useImperativeHandle(ref, () => ({
        insertQ: (qNum: number) => {
            if (editor) {
                (editor.commands as any).insertQx(`Q${qNum}`);
            }
        },
        toggleBold: () => {
            if (editor) {
                editor.chain().focus().toggleBold().run();
            }
        },
    }));

    // Sync value from outside (only if fundamentally different)
    useEffect(() => {
        if (!editor) return;

        const currentHtml = editor.getHTML();
        const currentSerialized = serializeToText(currentHtml);
        const shouldNormalizeMarkdownBold = enableMarkdownBold
            && /\*\*[^*]+\*\*/.test(value)
            && !/<(strong|b)\b/i.test(currentHtml);

        if (value !== currentSerialized || shouldNormalizeMarkdownBold) {
            editor.commands.setContent(parseTextToNodes(value));
        }
    }, [value, editor, enableMarkdownBold]);

    return (
        <div style={{
            border: '1px solid #d9d9d9',
            borderRadius: '8px',
            background: '#fff',
            transition: 'all 0.2s',
            minHeight: minHeight
        }} className="qx-editor-container">
            <style>{`
        .qx-editor-container:focus-within {
          border-color: #4096ff;
          box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.1);
        }
        .tiptap-content p {
          margin: 0;
          min-height: 1.5em;
        }
        .tiptap-content span[data-qx] {
          user-select: all;
        }
      `}</style>
            <EditorContent editor={editor} />
        </div >
    );
});
