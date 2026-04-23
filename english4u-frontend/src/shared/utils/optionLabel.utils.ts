/**
 * Chuyển đổi số nguyên dương sang số La Mã (chữ thường).
 * Ví dụ: 1 -> i, 2 -> ii, 3 -> iii, 4 -> iv, 5 -> v, ...
 */
export const toRoman = (num: number): string => {
    if (num <= 0) return '';
    const lookup: Record<string, number> = {
        m: 1000,
        cm: 900,
        d: 500,
        cd: 400,
        c: 100,
        xc: 90,
        l: 50,
        xl: 40,
        x: 10,
        ix: 9,
        v: 5,
        iv: 4,
        i: 1,
    };
    let roman = '';
    let n = num;
    for (const i in lookup) {
        while (n >= lookup[i]) {
            roman += i;
            n -= lookup[i];
        }
    }
    return roman;
};

/**
 * Chuyển đổi index sang nhãn lựa chọn (A, B, C... hoặc i, ii, iii...).
 */
export const getOptionLabel = (index: number, type: 'alpha' | 'roman' = 'alpha'): string => {
    if (type === 'roman') {
        return toRoman(index + 1);
    }
    return String.fromCharCode(65 + index); // A, B, C...
};
