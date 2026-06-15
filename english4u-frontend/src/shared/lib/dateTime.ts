export const formatDateTimeToMinute = (value?: string | null): string | null => {
    if (!value) return null;

    const normalized = value.trim();
    const vnDisplayPattern = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})(?::\d{2})?$/;
    const vnDisplayMatch = normalized.match(vnDisplayPattern);
    if (vnDisplayMatch) {
        return `${vnDisplayMatch[1]} ${vnDisplayMatch[2]}`;
    }

    const isoWithoutTimezonePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
    const sqlLikeWithoutTimezonePattern = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

    const normalizedForParsing = isoWithoutTimezonePattern.test(normalized)
        ? `${normalized}Z`
        : sqlLikeWithoutTimezonePattern.test(normalized)
            ? `${normalized.replace(' ', 'T')}Z`
            : normalized;

    const parsed = new Date(normalizedForParsing);
    if (!Number.isNaN(parsed.getTime())) {
        return new Intl.DateTimeFormat('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(parsed).replace(',', '');
    }

    return normalized;
};
