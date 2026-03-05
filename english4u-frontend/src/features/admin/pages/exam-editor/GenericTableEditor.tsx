import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Button, Input } from 'antd';
import { BoldOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { TiptapQxEditor, type TiptapQxEditorRef } from '../../components/TiptapQxEditor';

interface GenericTableEditorProps {
    contentData?: string | null;
    onChange: (value: string) => void;
    nextQNum: number;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
}

interface TableLayoutData {
    layout: 'table';
    title: string;
    rows: string[][];
}

const TABLE_TITLE_PLACEHOLDER = 'Tiêu đề bảng';
const DEFAULT_TABLE_TITLE = '';
const DEFAULT_TABLE_ROWS = [['Cột 1', 'Cột 2'], ['ND 1', 'ND 2']];

const normalizeTableTitle = (title: unknown) => {
    if (typeof title !== 'string') return DEFAULT_TABLE_TITLE;

    return title.trim() === TABLE_TITLE_PLACEHOLDER
        ? DEFAULT_TABLE_TITLE
        : title;
};

export const GenericTableEditor = ({
    contentData,
    onChange,
    nextQNum,
    activeEditorRef,
}: GenericTableEditorProps) => {
    const tableLayout = useMemo<TableLayoutData>(() => {
        try {
            const data = JSON.parse(contentData || 'null');

            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
                return {
                    layout: 'table',
                    title: DEFAULT_TABLE_TITLE,
                    rows: data,
                };
            }

            if (data && typeof data === 'object' && Array.isArray((data as TableLayoutData).rows)) {
                const rows = (data as TableLayoutData).rows;
                const title = normalizeTableTitle((data as TableLayoutData).title);

                if (rows.length > 0 && Array.isArray(rows[0])) {
                    return {
                        layout: 'table',
                        title,
                        rows,
                    };
                }
            }
        } catch {
            // Fallback to default table data.
        }

        return {
            layout: 'table',
            title: DEFAULT_TABLE_TITLE,
            rows: DEFAULT_TABLE_ROWS,
        };
    }, [contentData]);

    const [focused, setFocused] = useState<{ r: number; c: number } | null>(null);
    const cellEditorRefs = useRef<Record<string, TiptapQxEditorRef | null>>({});

    const updateTable = (newRows: string[][], nextTitle = tableLayout.title) => {
        const payload: TableLayoutData = {
            layout: 'table',
            title: nextTitle,
            rows: newRows,
        };
        onChange(JSON.stringify(payload));
    };

    const getCellKey = (row: number, col: number) => `${row}-${col}`;

    const insertQ = () => {
        if (!focused) return;

        const key = getCellKey(focused.r, focused.c);
        const editorRef = cellEditorRefs.current[key] ?? null;
        activeEditorRef.current = editorRef;
        editorRef?.insertQ(nextQNum);
    };

    return (
        <div style={{ padding: '12px', border: '1px solid #d9d9d9', borderRadius: '6px', background: '#fafafa', marginBottom: '10px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.8125rem' }}>Bảng Điền Từ (Layout Động)</div>
            <Input
                value={tableLayout.title}
                size="large"
                placeholder={TABLE_TITLE_PLACEHOLDER}
                onChange={(event) => updateTable(tableLayout.rows.map((row) => [...row]), event.target.value)}
                style={{ marginBottom: '10px', fontWeight: 700, fontSize: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <Button
                    size="small"
                    type="primary"
                    onMouseDown={(event) => {
                        event.preventDefault();
                        insertQ();
                    }}
                    disabled={!focused}
                >
                    Thêm ô trống [Q{nextQNum}]
                </Button>
                <Button size="small" onClick={() => updateTable([...tableLayout.rows, Array(tableLayout.rows[0]?.length || 1).fill('')])}>
                    + Thêm Hàng
                </Button>
                <Button size="small" onClick={() => updateTable(tableLayout.rows.map((row) => [...row, '']))}>
                    + Thêm Cột
                </Button>
                <Button size="small" danger onClick={() => updateTable(tableLayout.rows.map((row) => row.slice(0, row.length - 1)))}>
                    - Xoá Cột Cuối
                </Button>
                <Button
                    size="small"
                    icon={<BoldOutlined />}
                    onMouseDown={(event) => {
                        event.preventDefault();
                        if (!focused) return;

                        const activeElement = document.activeElement as HTMLTextAreaElement;
                        if (!activeElement || activeElement.tagName !== 'TEXTAREA') return;

                        const start = activeElement.selectionStart;
                        const end = activeElement.selectionEnd;
                        const text = activeElement.value;
                        const selected = text.substring(start, end);

                        const newText = selected
                            ? text.substring(0, start) + `**${selected}**` + text.substring(end)
                            : `${text} ****`;

                        const newData = tableLayout.rows.map((row) => [...row]);
                        newData[focused.r][focused.c] = newText;
                        updateTable(newData);
                    }}
                >
                    In đậm
                </Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <tbody>
                        {tableLayout.rows.map((row, rowIdx) => (
                            <tr key={rowIdx}>
                                {row.map((cell, colIdx) => (
                                    <td key={colIdx} style={{ border: '1px solid #d9d9d9', padding: '0' }}>
                                        <TiptapQxEditor
                                            ref={(instance) => {
                                                cellEditorRefs.current[getCellKey(rowIdx, colIdx)] = instance;
                                            }}
                                            value={cell}
                                            minHeight="60px"
                                            placeholder="Nhập nội dung..."
                                            onChange={(value) => {
                                                const newData = tableLayout.rows.map((rowData) => [...rowData]);
                                                newData[rowIdx][colIdx] = value;
                                                updateTable(newData);
                                            }}
                                            onFocus={() => {
                                                setFocused({ r: rowIdx, c: colIdx });
                                                activeEditorRef.current = cellEditorRefs.current[getCellKey(rowIdx, colIdx)] ?? null;
                                            }}
                                        />
                                    </td>
                                ))}
                                {tableLayout.rows.length > 1 && (
                                    <td style={{ width: 30, textAlign: 'center', border: '1px solid #d9d9d9', background: '#fff' }}>
                                        <MinusCircleOutlined
                                            style={{ color: '#ef4444', cursor: 'pointer' }}
                                            onClick={() => updateTable(tableLayout.rows.filter((_, index) => index !== rowIdx))}
                                        />
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
