import { useId, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Button, Tag } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { TiptapQxEditor, type TiptapQxEditorRef } from '../../components/TiptapQxEditor';

interface FlowchartEditorProps {
    contentData?: string | null;
    onChange: (value: string) => void;
    nextQNum: number;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
}

type FlowchartRows = string[][];

interface FlowchartData {
    layout?: string;
    rows: FlowchartRows;
}

const normalizeRows = (rows: unknown): FlowchartRows => {
    if (!Array.isArray(rows)) {
        return [['']];
    }

    const normalized = rows
        .map((row) => {
            if (!Array.isArray(row)) return [''];
            const cells = row
                .map((cell) => (typeof cell === 'string' ? cell : ''))
                .filter((cell) => cell !== undefined);
            return cells.length > 0 ? cells : [''];
        })
        .filter((row) => row.length > 0);

    return normalized.length > 0 ? normalized : [['']];
};

const parseFlowchartRows = (contentData?: string | null): FlowchartRows => {
    if (!contentData) return [['']];

    try {
        const parsed = JSON.parse(contentData) as unknown;

        if (Array.isArray(parsed)) {
            return normalizeRows(parsed);
        }

        if (parsed && typeof parsed === 'object' && Array.isArray((parsed as FlowchartData).rows)) {
            return normalizeRows((parsed as FlowchartData).rows);
        }
    } catch {
        // Fallback for plain-text content.
    }

    return [[contentData]];
};

const buildFlowchartPayload = (rows: FlowchartRows) => JSON.stringify({
    layout: 'flowchart',
    rows,
});

const buildConnections = (fromCount: number, toCount: number) => {
    const lineCount = Math.max(fromCount, toCount);
    const pairs = new Set<string>();

    for (let i = 0; i < lineCount; i += 1) {
        const fromIdx = Math.min(fromCount - 1, Math.floor((i * fromCount) / lineCount));
        const toIdx = Math.min(toCount - 1, Math.floor((i * toCount) / lineCount));
        pairs.add(`${fromIdx}-${toIdx}`);
    }

    return Array.from(pairs).map((item) => {
        const [from, to] = item.split('-').map((value) => Number.parseInt(value, 10));
        return { from, to };
    });
};

const getNodeCenters = (count: number) => {
    if (count <= 0) return [];
    return Array.from({ length: count }, (_, index) => ((index + 0.5) / count) * 100);
};

export const FlowchartEditor = ({
    contentData,
    onChange,
    nextQNum,
    activeEditorRef,
}: FlowchartEditorProps) => {
    const rows = useMemo(() => parseFlowchartRows(contentData), [contentData]);
    const [focused, setFocused] = useState<{ row: number; col: number } | null>(null);
    const cellEditorRefs = useRef<Record<string, TiptapQxEditorRef | null>>({});
    const markerId = useId().replace(/:/g, '');

    const updateRows = (nextRows: FlowchartRows) => {
        onChange(buildFlowchartPayload(normalizeRows(nextRows)));
    };

    const getCellKey = (rowIdx: number, colIdx: number) => `${rowIdx}-${colIdx}`;

    const insertQ = () => {
        if (!focused) return;

        const key = getCellKey(focused.row, focused.col);
        const editorRef = cellEditorRefs.current[key] ?? null;
        activeEditorRef.current = editorRef;
        editorRef?.insertQ(nextQNum);
    };

    const updateCell = (rowIdx: number, colIdx: number, value: string) => {
        const nextRows = rows.map((row) => [...row]);
        nextRows[rowIdx][colIdx] = value;
        updateRows(nextRows);
    };

    const addRow = () => {
        updateRows([...rows, ['']]);
    };

    const removeRow = (rowIdx: number) => {
        if (rows.length <= 1) return;
        updateRows(rows.filter((_, index) => index !== rowIdx));
    };

    const addBoxToRow = (rowIdx: number) => {
        const nextRows = rows.map((row, index) => (index === rowIdx ? [...row, ''] : [...row]));
        updateRows(nextRows);
    };

    const removeBoxFromRow = (rowIdx: number, colIdx: number) => {
        if (rows[rowIdx].length <= 1) return;
        const nextRows = rows.map((row, index) => {
            if (index !== rowIdx) return [...row];
            return row.filter((_, itemIdx) => itemIdx !== colIdx);
        });
        updateRows(nextRows);
    };

    return (
        <div style={{ padding: '12px', border: '1px solid #d9d9d9', borderRadius: '8px', background: '#fafafa', marginBottom: '10px' }}>
            <div style={{ fontWeight: 700, marginBottom: '8px', fontSize: '0.875rem', color: '#1e293b' }}>Flowchart Completion (Layout Động)</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
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
                <Button size="small" onClick={addRow} icon={<PlusOutlined />}>
                    Thêm Hàng Mới
                </Button>
                {focused && (
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                        Đang sửa: Hàng {focused.row + 1}, Ô {focused.col + 1}
                    </Tag>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rows.map((row, rowIdx) => (
                    <div key={rowIdx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Hàng {rowIdx + 1}</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <Button size="small" onClick={() => addBoxToRow(rowIdx)}>
                                    + Ô
                                </Button>
                                {rows.length > 1 && (
                                    <Button size="small" danger onClick={() => removeRow(rowIdx)}>
                                        Xoá Hàng
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                            {row.map((cell, colIdx) => (
                                <div key={colIdx} style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                                    <TiptapQxEditor
                                        ref={(instance) => {
                                            cellEditorRefs.current[getCellKey(rowIdx, colIdx)] = instance;
                                        }}
                                        value={cell}
                                        minHeight="58px"
                                        placeholder="Nhập nội dung ô..."
                                        onChange={(value) => updateCell(rowIdx, colIdx, value)}
                                        onFocus={() => {
                                            setFocused({ row: rowIdx, col: colIdx });
                                            activeEditorRef.current = cellEditorRefs.current[getCellKey(rowIdx, colIdx)] ?? null;
                                        }}
                                    />
                                    {row.length > 1 && (
                                        <Button
                                            type="text"
                                            danger
                                            size="small"
                                            icon={<MinusCircleOutlined />}
                                            style={{ position: 'absolute', top: 2, right: 2 }}
                                            onClick={() => removeBoxFromRow(rowIdx, colIdx)}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {rowIdx < rows.length - 1 && (
                            <div style={{ height: 56, marginTop: '6px' }}>
                                <svg width="100%" height="56" viewBox="0 0 100 56" preserveAspectRatio="none">
                                    <defs>
                                        <marker
                                            id={`arrow-${markerId}`}
                                            markerWidth="7"
                                            markerHeight="7"
                                            refX="6"
                                            refY="3.5"
                                            orient="auto"
                                            markerUnits="strokeWidth"
                                        >
                                            <path d="M0,0 L7,3.5 L0,7 z" fill="#334155" />
                                        </marker>
                                    </defs>
                                    {(() => {
                                        const currentCenters = getNodeCenters(row.length);
                                        const nextCenters = getNodeCenters(rows[rowIdx + 1].length);

                                        if (currentCenters.length > 1 && nextCenters.length === 1) {
                                            const mergeX = nextCenters[0];
                                            const mergeY = 30;
                                            return (
                                                <>
                                                    {currentCenters.map((fromX, index) => (
                                                        <path
                                                            key={`merge-${rowIdx}-${index}`}
                                                            d={`M ${fromX} 4 Q ${fromX} 18 ${mergeX} ${mergeY}`}
                                                            fill="none"
                                                            stroke="#334155"
                                                            strokeWidth="1.5"
                                                            strokeLinecap="round"
                                                        />
                                                    ))}
                                                    <line
                                                        x1={mergeX}
                                                        y1={mergeY}
                                                        x2={mergeX}
                                                        y2={50}
                                                        stroke="#334155"
                                                        strokeWidth="1.8"
                                                        strokeLinecap="round"
                                                        markerEnd={`url(#arrow-${markerId})`}
                                                    />
                                                </>
                                            );
                                        }

                                        if (currentCenters.length === 1 && nextCenters.length > 1) {
                                            const splitX = currentCenters[0];
                                            const splitY = 24;
                                            return (
                                                <>
                                                    <line
                                                        x1={splitX}
                                                        y1={4}
                                                        x2={splitX}
                                                        y2={splitY}
                                                        stroke="#334155"
                                                        strokeWidth="1.5"
                                                        strokeLinecap="round"
                                                    />
                                                    {nextCenters.map((toX, index) => (
                                                        <path
                                                            key={`split-${rowIdx}-${index}`}
                                                            d={`M ${splitX} ${splitY} Q ${toX} 34 ${toX} 50`}
                                                            fill="none"
                                                            stroke="#334155"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            markerEnd={`url(#arrow-${markerId})`}
                                                        />
                                                    ))}
                                                </>
                                            );
                                        }

                                        return buildConnections(row.length, rows[rowIdx + 1].length).map((connection) => {
                                            const fromX = currentCenters[connection.from];
                                            const toX = nextCenters[connection.to];
                                            return (
                                                <path
                                                    key={`${rowIdx}-${connection.from}-${connection.to}`}
                                                    d={`M ${fromX} 4 Q ${toX} 24 ${toX} 50`}
                                                    fill="none"
                                                    stroke="#334155"
                                                    strokeWidth="1.8"
                                                    strokeLinecap="round"
                                                    markerEnd={`url(#arrow-${markerId})`}
                                                />
                                            );
                                        });
                                    })()}
                                </svg>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
