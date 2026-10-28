import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { BoldOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { TiptapQxEditor, type TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';

export interface GenericTableEditorProps {
    contentData?: string | null;
    onChange: (val: string) => void;
    nextQNum: number;
    activeEditorRef?: MutableRefObject<TiptapQxEditorRef | null>;
}

interface TableLayoutData {
    layout?: string;
    title?: string;
    rows: string[][];
}

const DEFAULT_ROWS = [
    ['Cột 1', 'Cột 2'],
    ['ND 1', 'ND 2'],
];

export const GenericTableEditor = ({
    contentData,
    onChange,
    nextQNum,
    activeEditorRef,
}: GenericTableEditorProps) => {
    const parsedData = useMemo<{ title: string; rows: string[][] }>(() => {
        try {
            const data = JSON.parse(contentData || 'null');
            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
                return {
                    title: '',
                    rows: data.map((row) => (Array.isArray(row) ? row.map((cell) => (typeof cell === 'string' ? cell : '')) : [''])),
                };
            }
            if (data && typeof data === 'object' && Array.isArray((data as TableLayoutData).rows) && (data as TableLayoutData).rows.length > 0) {
                const rows = (data as TableLayoutData).rows;
                const rawTitle = (data as TableLayoutData).title;
                const title: string = typeof rawTitle === 'string' ? rawTitle : '';
                return {
                    title,
                    rows: rows.map((row) => (Array.isArray(row) ? row.map((cell) => (typeof cell === 'string' ? cell : '')) : [''])),
                };
            }
        } catch {
            // fallback
        }
        return {
            title: '',
            rows: DEFAULT_ROWS.map((row) => [...row]),
        };
    }, [contentData]);

    const [focused, setFocused] = useState<{ r: number; c: number } | null>(null);
    const cellEditorRefs = useRef<Record<string, TiptapQxEditorRef | null>>({});

    const getCellKey = (r: number, c: number) => `${r}-${c}`;

    const updateTable = (newRows: string[][], nextTitle = parsedData.title) => {
        if (nextTitle && nextTitle.trim().length > 0) {
            onChange(JSON.stringify({
                layout: 'table',
                title: nextTitle,
                rows: newRows,
            }));
        } else {
            onChange(JSON.stringify(newRows));
        }
    };

    const insertQ = () => {
        const target = focused ?? { r: 0, c: 0 };
        const key = getCellKey(target.r, target.c);
        const editorRef = cellEditorRefs.current[key] ?? null;
        if (activeEditorRef) {
            activeEditorRef.current = editorRef;
        }
        editorRef?.insertQ(nextQNum);
    };

    const toggleBold = () => {
        const target = focused ?? { r: 0, c: 0 };
        const key = getCellKey(target.r, target.c);
        const editorRef = cellEditorRefs.current[key] ?? null;
        if (activeEditorRef) {
            activeEditorRef.current = editorRef;
        }
        editorRef?.toggleBold();
    };

    const addRow = () => {
        const colCount = parsedData.rows[0]?.length || 2;
        updateTable([...parsedData.rows, Array(colCount).fill('')]);
    };

    const addCol = () => {
        updateTable(parsedData.rows.map((row) => [...row, '']));
    };

    const removeLastCol = () => {
        if ((parsedData.rows[0]?.length || 0) <= 1) return;
        const newRows = parsedData.rows.map((row) => row.slice(0, row.length - 1));
        updateTable(newRows);
        if (focused && focused.c >= (newRows[0]?.length || 0)) {
            setFocused({ r: focused.r, c: (newRows[0]?.length || 1) - 1 });
        }
    };

    const removeRow = (rIdx: number) => {
        if (parsedData.rows.length <= 1) return;
        const newRows = parsedData.rows.filter((_, idx) => idx !== rIdx);
        updateTable(newRows);
        if (focused?.r === rIdx) {
            setFocused(null);
        } else if (focused && focused.r > rIdx) {
            setFocused({ r: focused.r - 1, c: focused.c });
        }
    };

    return (
        <div style={{ padding: '12px', border: '1px solid #d9d9d9', borderRadius: '8px', background: '#fafafa', marginBottom: '10px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.8125rem' }}>Bảng Điền Từ (Layout Động)</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                    size="small"
                    type="primary"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        insertQ();
                    }}
                >
                    Thêm ô trống [Q{nextQNum}]
                </Button>
                <Button size="small" onClick={addRow} icon={<PlusOutlined />}>
                    Thêm Hàng
                </Button>
                <Button size="small" onClick={addCol} icon={<PlusOutlined />}>
                    Thêm Cột
                </Button>
                <Button size="small" danger onClick={removeLastCol} disabled={(parsedData.rows[0]?.length || 0) <= 1}>
                    - Xoá Cột Cuối
                </Button>
                <Button
                    size="small"
                    icon={<BoldOutlined />}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        toggleBold();
                    }}
                >
                    In đậm
                </Button>
                {focused && (
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                        Đang chọn: Hàng {focused.r + 1}, Cột {focused.c + 1}
                    </Tag>
                )}
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #d9d9d9' }}>
                    <tbody>
                        {parsedData.rows.map((row, rIdx) => (
                            <tr key={rIdx} style={{ background: rIdx === 0 ? '#f8fafc' : '#fff' }}>
                                {row.map((cell, cIdx) => {
                                    const isCellFocused = focused?.r === rIdx && focused?.c === cIdx;
                                    return (
                                        <td
                                            key={cIdx}
                                            style={{
                                                border: '1px solid #d9d9d9',
                                                padding: 0,
                                                verticalAlign: 'top',
                                                position: 'relative',
                                                background: isCellFocused ? '#eff6ff' : (rIdx === 0 ? '#f8fafc' : '#fff'),
                                            }}
                                        >
                                            <TiptapQxEditor
                                                ref={(instance) => {
                                                    cellEditorRefs.current[getCellKey(rIdx, cIdx)] = instance;
                                                }}
                                                value={cell}
                                                minHeight="48px"
                                                placeholder={rIdx === 0 ? 'Tiêu đề cột...' : 'Nhập nội dung...'}
                                                enableMarkdownBold
                                                borderless
                                                onFocus={() => {
                                                    setFocused({ r: rIdx, c: cIdx });
                                                    if (activeEditorRef) {
                                                        activeEditorRef.current = cellEditorRefs.current[getCellKey(rIdx, cIdx)] ?? null;
                                                    }
                                                }}
                                                onChange={(newVal) => {
                                                    const newRows = parsedData.rows.map((r) => [...r]);
                                                    newRows[rIdx][cIdx] = newVal;
                                                    updateTable(newRows);
                                                }}
                                            />
                                        </td>
                                    );
                                })}
                                {parsedData.rows.length > 1 && (
                                    <td style={{ width: 32, textAlign: 'center', border: '1px solid #d9d9d9', background: '#fff' }}>
                                        <Tooltip title="Xoá hàng này">
                                            <MinusCircleOutlined
                                                style={{ color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                                                onClick={() => removeRow(rIdx)}
                                            />
                                        </Tooltip>
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
