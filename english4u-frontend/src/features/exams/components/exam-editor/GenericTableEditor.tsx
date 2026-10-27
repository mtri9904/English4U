import { useState, useMemo } from 'react';
import { Button, Input } from 'antd';
import { BoldOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { applyBoldToTextarea } from '../../utils/examEditor.utils';

export interface GenericTableEditorProps {
    contentData?: string | null;
    onChange: (val: string) => void;
    nextQNum: number;
}

export const GenericTableEditor = ({
    contentData,
    onChange,
    nextQNum,
}: GenericTableEditorProps) => {
    const tableData: string[][] = useMemo(() => {
        try {
            const data = JSON.parse(contentData || '[]');
            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) return data;
        } catch {}
        return [['Cột 1', 'Cột 2'], ['ND 1', 'ND 2']];
    }, [contentData]);

    const [focused, setFocused] = useState<{ r: number; c: number } | null>(null);

    const updateTable = (newData: string[][]) => onChange(JSON.stringify(newData));

    const insertQ = () => {
        if (!focused) return;
        const newData = tableData.map((row) => [...row]);
        newData[focused.r][focused.c] = (newData[focused.r][focused.c] || '') + ` [Q${nextQNum}]`;
        updateTable(newData);
    };

    return (
        <div style={{ padding: '12px', border: '1px solid #d9d9d9', borderRadius: '6px', background: '#fafafa', marginBottom: '10px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.8125rem' }}>Bảng Điền Từ (Layout Động)</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <Button size="small" type="primary" onClick={insertQ} disabled={!focused}>
                    Thêm ô trống [Q{nextQNum}]
                </Button>
                <Button size="small" onClick={() => updateTable([...tableData, Array(tableData[0]?.length || 1).fill('')])}>
                    + Thêm Hàng
                </Button>
                <Button size="small" onClick={() => updateTable(tableData.map((r) => [...r, '']))}>
                    + Thêm Cột
                </Button>
                <Button size="small" danger onClick={() => updateTable(tableData.map((r) => r.slice(0, r.length - 1)))}>
                    - Xoá Cột Cuối
                </Button>
                <Button
                    size="small"
                    icon={<BoldOutlined />}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        if (!focused) return;
                        const el = document.activeElement as HTMLTextAreaElement;
                        if (!el || el.tagName !== 'TEXTAREA') return;

                        applyBoldToTextarea(el, tableData[focused.r][focused.c] || '', (v) => {
                            const newData = tableData.map((row) => [...row]);
                            newData[focused.r][focused.c] = v;
                            updateTable(newData);
                        });
                    }}
                >
                    In đậm
                </Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <tbody>
                        {tableData.map((row, rIdx) => (
                            <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                    <td key={cIdx} style={{ border: '1px solid #d9d9d9', padding: '0' }}>
                                        <Input.TextArea
                                            value={cell}
                                            autoSize={{ minRows: 2, maxRows: 5 }}
                                            placeholder="Nhập nội dung..."
                                            style={{ border: 'none', borderRadius: 0, resize: 'none', boxShadow: 'none' }}
                                            onKeyDown={(e) => {
                                                if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                                                    applyBoldToTextarea(e.currentTarget, cell || '', (v) => {
                                                        const newData = tableData.map((r) => [...r]);
                                                        newData[rIdx][cIdx] = v;
                                                        updateTable(newData);
                                                    });
                                                }
                                            }}
                                            onChange={(e) => {
                                                const newData = tableData.map((r) => [...r]);
                                                newData[rIdx][cIdx] = e.target.value;
                                                updateTable(newData);
                                            }}
                                            onFocus={() => setFocused({ r: rIdx, c: cIdx })}
                                        />
                                    </td>
                                ))}
                                {tableData.length > 1 && (
                                    <td style={{ width: 30, textAlign: 'center', border: '1px solid #d9d9d9', background: '#fff' }}>
                                        <MinusCircleOutlined style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => updateTable(tableData.filter((_, i) => i !== rIdx))} />
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
