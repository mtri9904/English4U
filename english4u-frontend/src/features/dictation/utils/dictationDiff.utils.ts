import type { DiffToken, SentenceEvaluation } from '../types/dictation.types';

export const FUNCTION_WORDS = new Set([
    'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'and', 'or', 'but', 'is', 'am', 'are', 'was', 'were', 'it', 'its', 'as', 'that'
]);

export function cleanWord(raw: string): string {
    return raw.trim().toLowerCase().replace(/[^\w']/g, '');
}

export function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export function evaluateDictation(
    userInput: string,
    targetSentence: string,
    blindSpots: string[] = []
): SentenceEvaluation {
    const blindSpotSet = new Set(
        [...blindSpots, ...Array.from(FUNCTION_WORDS)].map((w) => cleanWord(w))
    );

    const targetWords = targetSentence.trim().split(/\s+/).filter(Boolean);
    const userWords = userInput.trim().split(/\s+/).filter(Boolean);

    const tokens: DiffToken[] = [];
    let correctCount = 0;
    let incorrectCount = 0;
    let blindSpotMissCount = 0;

    // Use Longest Common Subsequence (LCS) to align user input with target
    const m = userWords.length;
    const n = targetWords.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (cleanWord(userWords[i - 1]) === cleanWord(targetWords[j - 1])) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to build aligned tokens
    let i = m;
    let j = n;
    const aligned: Array<{ user?: string; target?: string }> = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && cleanWord(userWords[i - 1]) === cleanWord(targetWords[j - 1])) {
            aligned.unshift({ user: userWords[i - 1], target: targetWords[j - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            aligned.unshift({ target: targetWords[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
            aligned.unshift({ user: userWords[i - 1] });
            i--;
        }
    }

    // Process aligned pairs into classified DiffTokens
    let tokenIdx = 0;
    for (let k = 0; k < aligned.length; k++) {
        const pair = aligned[k];
        const nextPair = aligned[k + 1];

        // Case 1: Match
        if (pair.user && pair.target && cleanWord(pair.user) === cleanWord(pair.target)) {
            tokens.push({
                id: `token-${tokenIdx++}`,
                word: pair.user,
                targetWord: pair.target,
                status: 'correct',
            });
            correctCount++;
        }
        // Case 2: User substituted a word (user token next to target token)
        else if (pair.user && !pair.target && nextPair && !nextPair.user && nextPair.target) {
            const dist = levenshteinDistance(cleanWord(pair.user), cleanWord(nextPair.target));
            const isTypo = dist <= 2 || dist <= nextPair.target.length * 0.35;

            tokens.push({
                id: `token-${tokenIdx++}`,
                word: pair.user,
                targetWord: nextPair.target,
                status: 'incorrect',
                suggestion: isTypo ? nextPair.target : undefined,
            });
            incorrectCount++;
            k++; // consume nextPair
        }
        // Case 3: Missing word from target
        else if (!pair.user && pair.target) {
            const cleanT = cleanWord(pair.target);
            const isBlind = blindSpotSet.has(cleanT);

            if (isBlind) {
                blindSpotMissCount++;
                tokens.push({
                    id: `token-${tokenIdx++}`,
                    word: `[${pair.target}]`,
                    targetWord: pair.target,
                    status: 'blindspot',
                    isBlindSpot: true,
                    suggestion: `Bỏ sót điểm mù âm thanh "${pair.target}"`,
                });
            } else {
                tokens.push({
                    id: `token-${tokenIdx++}`,
                    word: `[${pair.target}]`,
                    targetWord: pair.target,
                    status: 'missing',
                    suggestion: `Thiếu từ "${pair.target}"`,
                });
            }
        }
        // Case 4: Extra word typed by user
        else if (pair.user && !pair.target) {
            tokens.push({
                id: `token-${tokenIdx++}`,
                word: pair.user,
                status: 'extra',
                suggestion: 'Từ thừa',
            });
            incorrectCount++;
        }
    }

    const totalTarget = targetWords.length;
    const accuracy = totalTarget > 0 ? Math.round((correctCount / totalTarget) * 100) : 0;
    const isComplete = correctCount === totalTarget && incorrectCount === 0;

    return {
        tokens,
        accuracyPercent: Math.max(0, Math.min(100, accuracy)),
        isComplete,
        correctCount,
        incorrectCount,
        blindSpotMissCount,
        totalTargetWords: totalTarget,
    };
}

