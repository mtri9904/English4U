export type WritingTaskAssetsBundle = {
    imageUrls: string[];
    primaryImageUrl: string | null;
    hiddenDataText: string | null;
};

const normalizeNonEmptyString = (value?: string | null) => {
    const normalized = (value ?? '').trim();
    return normalized || null;
};

const isImageLikeValue = (value: string) =>
    /^https?:\/\//i.test(value) || /^data:image\//i.test(value);

const toStructuredText = (value: unknown): string | null => {
    if (typeof value === 'string') {
        return normalizeNonEmptyString(value);
    }

    if (Array.isArray(value) || (value && typeof value === 'object')) {
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return null;
        }
    }

    return null;
};

const collectImageCandidates = (value: unknown, accumulator: string[]) => {
    if (typeof value === 'string') {
        const normalized = normalizeNonEmptyString(value);
        if (normalized && isImageLikeValue(normalized)) {
            accumulator.push(normalized);
        }
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectImageCandidates(item, accumulator));
        return;
    }

    if (value && typeof value === 'object') {
        const candidateObject = value as Record<string, unknown>;
        [
            candidateObject.imageUrl,
            candidateObject.url,
            candidateObject.assetUrl,
            candidateObject.src,
            candidateObject.images,
            candidateObject.assets,
        ].forEach((item) => collectImageCandidates(item, accumulator));
    }
};

const extractHiddenDataText = (value: unknown): string | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const candidateObject = value as Record<string, unknown>;
    const hiddenDataCandidate =
        candidateObject.hiddenDataText
        ?? candidateObject.hiddenData
        ?? candidateObject.chartDataText
        ?? candidateObject.chartData
        ?? candidateObject.sourceDataText
        ?? candidateObject.sourceData
        ?? candidateObject.data;

    return toStructuredText(hiddenDataCandidate);
};

export const parseWritingTaskAssetsData = (assetsData?: string | null): WritingTaskAssetsBundle => {
    if (!assetsData) {
        return {
            imageUrls: [],
            primaryImageUrl: null,
            hiddenDataText: null,
        };
    }

    const normalizedAssets = assetsData.trim();
    if (!normalizedAssets) {
        return {
            imageUrls: [],
            primaryImageUrl: null,
            hiddenDataText: null,
        };
    }

    try {
        const parsed = JSON.parse(normalizedAssets) as unknown;
        const imageUrls: string[] = [];
        collectImageCandidates(parsed, imageUrls);
        const dedupedImageUrls = [...new Set(imageUrls)];

        return {
            imageUrls: dedupedImageUrls,
            primaryImageUrl: dedupedImageUrls[0] ?? null,
            hiddenDataText: extractHiddenDataText(parsed),
        };
    } catch {
        return {
            imageUrls: isImageLikeValue(normalizedAssets) ? [normalizedAssets] : [],
            primaryImageUrl: isImageLikeValue(normalizedAssets) ? normalizedAssets : null,
            hiddenDataText: null,
        };
    }
};

export const extractWritingTaskImageUrls = (assetsData?: string | null) =>
    parseWritingTaskAssetsData(assetsData).imageUrls;

export const extractWritingTaskPrimaryImageUrl = (assetsData?: string | null) =>
    parseWritingTaskAssetsData(assetsData).primaryImageUrl;

export const extractWritingTaskHiddenDataText = (assetsData?: string | null) =>
    parseWritingTaskAssetsData(assetsData).hiddenDataText;

export const serializeWritingTaskAssetsData = ({
    imageUrl,
    hiddenDataText,
}: {
    imageUrl?: string | null;
    hiddenDataText?: string | null;
}) => {
    const normalizedImageUrl = normalizeNonEmptyString(imageUrl);
    const normalizedHiddenDataText = normalizeNonEmptyString(hiddenDataText);

    if (!normalizedImageUrl && !normalizedHiddenDataText) {
        return '';
    }

    if (normalizedImageUrl && !normalizedHiddenDataText) {
        return normalizedImageUrl;
    }

    return JSON.stringify({
        imageUrl: normalizedImageUrl,
        hiddenDataText: normalizedHiddenDataText,
    });
};
