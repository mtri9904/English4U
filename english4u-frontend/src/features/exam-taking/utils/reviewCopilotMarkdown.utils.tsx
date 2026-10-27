import {
    COPILOT_PANEL_MIN_WIDTH,
    COPILOT_PANEL_MOBILE_MIN_WIDTH,
    COPILOT_PANEL_MAX_WIDTH,
    COPILOT_PANEL_DEFAULT_WIDTH,
    COPILOT_PANEL_STORAGE_KEY,
} from '../constants/reviewCopilot.constants';

export const markdownComponents = {
    p: ({ children }: any) => <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>{children}</p>,
    strong: ({ children }: any) => (
        <strong
            style={{
                color: '#0f172a',
                fontWeight: 800,
                background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(191,219,254,0.7) 100%)',
                padding: '0 2px',
                borderRadius: 4,
            }}
        >
            {children}
        </strong>
    ),
    ul: ({ children }: any) => <ul style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 }}>{children}</ul>,
    ol: ({ children }: any) => <ol style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 }}>{children}</ol>,
    li: ({ children }: any) => <li style={{ marginBottom: 4 }}>{children}</li>,
    code: ({ children }: any) => (
        <code
            style={{
                background: '#e0f2fe',
                color: '#0f172a',
                borderRadius: 8,
                padding: '1px 6px',
                fontSize: '0.82rem',
            }}
        >
            {children}
        </code>
    ),
};

export const stripCodeFenceWrapper = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('```')) {
        return trimmed;
    }

    const firstLineEnd = trimmed.indexOf('\n');
    if (firstLineEnd === -1) {
        return trimmed;
    }

    const lastFenceIndex = trimmed.lastIndexOf('```');
    if (lastFenceIndex <= firstLineEnd) {
        return trimmed.slice(firstLineEnd + 1).trim();
    }

    return trimmed.slice(firstLineEnd + 1, lastFenceIndex).trim();
};

export const hasVietnameseCharacters = (value: string) =>
    /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(value);

export const normalizeCopilotText = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

export const copilotReasoningMarkers = [
    'current focus:',
    "user's current focus",
    "user's question",
    'context:',
    'question content:',
    'current_location_text',
    'current_focus_text',
    'review_document',
    'transcript provided',
    'transcript window provided',
    'the content of the transcript window',
    'scanning the transcript window',
    'scanning the transcript',
    'scanning for',
    'the provided text',
    'state that',
    'does not contain the answer',
    'question 11/12',
    'question 11',
    'question 12',
    'correct answers:',
    'correct answer for',
    'evidence for',
    'drafting the response',
    'drafting:',
    'execution:',
    'response structure:',
    'refining the vietnamese',
    'refining',
    'final polish',
    'self-correction',
    'the previous response was cut off',
    'continue from:',
    'completion:',
    'voice:',
    'language:',
    'structure:',
    'constraint:',
    'start from',
    'highlight the part',
    'final check',
    'check constraints',
    'constraint:',
    'constraints:',
    'plan:',
    'observation:',
    'action:',
    'analysis:',
    'reasoning:',
    'constraint check',
    'problem:',
    'rule:',
    'inform the user',
    'image provided:',
    'quote:',
    'explanation:',
    'tutor voice',
    'no outside knowledge',
    'no internal thoughts',
    'formatting:',
    'timestamps:',
    'explain in vietnamese',
    'use quote english evidence first',
    "student's status",
    "the student didn't answer",
    'correct answer:',
    "student's choice:",
    'student choice:',
    'student chose',
    'student answer:',
    'the question is about',
    'the statement says',
    'found in paragraph',
    'found in đoạn',
    'this matches',
    'direct answer:',
    'specify the location:',
    'provide the english evidence:',
    'english quotes included',
    'there is no transcript window',
    'the review_document',
    'wait,',
    "let's",
    'okay, the logic holds',
    'the provided transcript window',
    'step 1',
    'step 2',
    'step 3',
    'step 4',
];

export const copilotAnswerIntroMarkers = [
    'doc o',
    'de tra loi dung',
    'de tra loi',
    'vi sao dap an',
    'vi sao',
    'bang chung',
    'giai thich',
    'dap an la',
    'dap an dung',
    'dap an',
    'do do',
    'ket luan',
    'phan tich',
    'dua vao',
    'tu transcript',
    'theo transcript',
    'duoi day la',
];

export const copilotMetaLineMarkers = [
    'transcript window',
    'transcript segment',
    'current focus:',
    'question content:',
    "student's choice:",
    'student choice:',
    'current_focus_label',
    'current_focus_text',
    'evidence segment',
    'relevant text',
    'correct answer:',
    'correct answer for',
    'correct answers:',
    'evidence in text:',
    'identify the timestamp',
    'identify the specific timestamps',
    'provide english quotes',
    'explain in vietnamese',
    'follow strict system instructions',
    'map analysis',
    'replay audio',
    'tapescript',
    'quote:',
    'explanation:',
    'answer a:',
    'answer b:',
    'answer c:',
    'answer d:',
    'answer e:',
    'answer f:',
    'answer g:',
    'answer h:',
    'evidence from paragraph',
    'direct answer:',
    'context provided',
    'identify the specific time range',
    'tone:',
    'no external knowledge',
    'no meta-talk',
    'no latex',
    'clear, natural',
    'use labels',
    'english quotes included',
    'observation:',
    'analysis:',
    'reasoning:',
    'plan:',
    'execution:',
    'response structure:',
    'drafting:',
    'refining',
    'self-correction',
    'final polish:',
    'check constraints:',
    'requirement:',
    'follow the system instructions',
    'identify the specific transcript lines',
    'explain the location markers',
    'connect these markers',
    'map analysis (from image)',
];

export const stripLeadingQuoteAndBulletMarkers = (value: string) => value.replace(/^[\s>"'`*-–—]+/, '').trim();

export const looksLikeRepeatedUserQuestionLine = (value: string) => {
    const normalized = normalizeCopilotText(stripLeadingQuoteAndBulletMarkers(value));
    return (
        normalized.startsWith('cau nay nghe doan nao') ||
        normalized.includes('nghe doan nao de tra loi dung') ||
        normalized.includes('nghe cho nao de tra loi dung') ||
        normalized.includes('cau nay nghe cho nao') ||
        normalized.includes('cau nay nam o dau')
    );
};

export const looksLikeCopilotAnswerIntroLine = (value: string) => {
    const normalized = normalizeCopilotText(stripLeadingQuoteAndBulletMarkers(value));
    if (!normalized) {
        return false;
    }

    return copilotAnswerIntroMarkers.some((marker) => normalized.startsWith(marker));
};

export const findUserFacingAnswerStartIndex = (value: string) => {
    const patterns = [
        /(?:Đọc|Doc)\s+(?:ở|o)\s*:/i,
        /(?:Để|De)\s+(?:trả|tra)\s+(?:lời|loi)/i,
        /(?:Đ|D)áp\s+(?:án|an)(?:\s+(?:đúng|dung))?/i,
        /(?:Dẫn|Dan)\s+(?:chứng|chung)/i,
        /(?:Bằng|Bang)\s+(?:chứng|chung)/i,
        /(?:Em|Bạn|Ban)\s+(?:cần|can)\s+(?:đọc|doc)/i,
    ];

    const indexes = patterns
        .map((pattern) => {
            const match = value.match(pattern);
            return match?.index ?? -1;
        })
        .filter((index) => index >= 0);

    return indexes.length > 0 ? Math.min(...indexes) : -1;
};

export const looksLikeCopilotMetaLine = (value: string) => {
    const normalized = normalizeCopilotText(stripLeadingQuoteAndBulletMarkers(value));
    if (!normalized) {
        return false;
    }

    if (/^[a-e]\s*\(correct\)\.?$/i.test(normalized)) {
        return true;
    }

    if (/^question\s+\d+\s*:/.test(normalized)) {
        return true;
    }

    return copilotMetaLineMarkers.some((marker) => normalized.includes(marker));
};

export const looksLikeSelfCheckLine = (value: string) => {
    const normalized = normalizeCopilotText(stripLeadingQuoteAndBulletMarkers(value));
    if (!normalized) {
        return false;
    }

    return (
        /^(?:no meta-talk|no latex|correct labels|correct format|language|no internal thoughts|start immediately|check against mandatory rules)\??\s*:?\s*(?:yes|vietnamese)?\.?$/i.test(
            normalized,
        ) || /^(?:student chose correctly|student did not answer|student didn't answer),?\s+so\b/i.test(normalized)
    );
};

export const looksLikePromptChecklistFragment = (value: string) => {
    const normalized = normalizeCopilotText(stripLeadingQuoteAndBulletMarkers(value));
    if (!normalized) {
        return false;
    }

    const labelHits = [
        'doc o',
        'dap an dung',
        'dan chung',
        'vi sao khop',
        'vi sao lua chon',
    ].filter((label) => normalized.includes(label)).length;

    return labelHits >= 2 && /(?:^|\s)(?:1|2|3|4|5)\.\s*["']?/.test(normalized) && /["']/.test(value);
};

export const looksLikeReasoningParagraph = (value: string) => {
    const normalized = normalizeCopilotText(stripLeadingQuoteAndBulletMarkers(value));
    if (!normalized) {
        return false;
    }

    if (
        /^(?:current focus|question\s+\d+\s+content|student'?s choice|student choice|student chose|result|the question is about|the statement says|scanning|found in|this matches|answer\s+[a-h]:|evidence from|direct answer|specify the location|provide the english evidence|explain why|tone|no external knowledge|no meta-talk|no latex|clear, natural|use labels|english quotes included)\b/i.test(
            normalized,
        )
    ) {
        return true;
    }

    if (
        /^(?:correct answer(?:s)?(?:\s+for\b)?|location|evidence in text|evidence|explanation|plan|execution|response structure|drafting|refining|self-correction|final polish|constraint(?:s)?|check constraints)\s*:/i.test(
            normalized,
        )
    ) {
        return true;
    }

    if (/^(?:dap an dung|de tra loi)\s+(?:cho\s+)?cau\s+nay\.?$/i.test(normalized)) {
        return true;
    }

    return copilotReasoningMarkers.some((marker) => normalized.includes(marker));
};

export const looksLikeStandaloneEnglishParagraph = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || hasVietnameseCharacters(trimmed)) {
        return false;
    }

    if (!/[a-z]/i.test(trimmed)) {
        return false;
    }

    if (/^(?:[-*]\s+|>\s*)/.test(trimmed)) {
        return false;
    }

    const normalized = trimmed.toLowerCase();
    if (/^(?:["'“”‘’]|the passage says|the text says|evidence:|quote:)/i.test(trimmed)) {
        return false;
    }

    return (
        trimmed.length >= 28 &&
        /^(?:i need|we need|the user|user asks|looking at|from the context|the review document|correct answer|student answer|analysis|reasoning|thought|step \d+|need to|must |must not |provided context|provided transcript|system instruction)/i.test(
            normalized,
        )
    );
};

export const canonicalizeParagraph = (value: string) =>
    value
        .toLowerCase()
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[`"'“”‘’]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9à-ỹ ]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

export const likelyVietnameseAnswerLinePattern =
    /^(đọc ở|để|bạn|cụ thể|tóm lại|mình|ở đây|trong đoạn|đáp án|bằng chứng|giải thích|vì|do đó|vậy|nghe|hãy nghe|với câu|ở câu)/i;

export const trimToUserFacingVietnameseStart = (value: string) => {
    const lines = value.split('\n').map((line) => line.trimRight());

    for (let index = 0; index < lines.length; index += 1) {
        const answerStartIndex = findUserFacingAnswerStartIndex(lines[index]);
        if (answerStartIndex >= 0) {
            return [lines[index].slice(answerStartIndex).trim(), ...lines.slice(index + 1)].join('\n').trim();
        }
    }

    const answerIntroLineIndex = lines.findIndex((line) => looksLikeCopilotAnswerIntroLine(line));
    if (answerIntroLineIndex > 0) {
        return lines.slice(answerIntroLineIndex).join('\n').trim();
    }

    const hasMetaNoise = lines.some((line) => {
        const trimmed = line.trim();
        return (
            trimmed &&
            (looksLikeReasoningParagraph(trimmed) ||
                looksLikeCopilotMetaLine(trimmed) ||
                looksLikeSelfCheckLine(trimmed) ||
                looksLikePromptChecklistFragment(trimmed) ||
                looksLikeRepeatedUserQuestionLine(trimmed))
        );
    });
    if (hasMetaNoise) {
        const filteredLines = lines.filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return false;
            }

            if (
                looksLikeReasoningParagraph(trimmed) ||
                looksLikeCopilotMetaLine(trimmed) ||
                looksLikeSelfCheckLine(trimmed) ||
                looksLikePromptChecklistFragment(trimmed) ||
                looksLikeRepeatedUserQuestionLine(trimmed) ||
                looksLikeStandaloneEnglishParagraph(trimmed)
            ) {
                return false;
            }

            return true;
        });

        if (filteredLines.length === 0) {
            return '';
        }

        return filteredLines.join('\n').trim();
    }

    const firstMeaningfulVietnameseLineIndex = lines.findIndex((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            return false;
        }

        if (looksLikeReasoningParagraph(trimmed)) {
            return false;
        }

        if (looksLikeCopilotMetaLine(trimmed)) {
            return false;
        }

        if (looksLikeSelfCheckLine(trimmed) || looksLikePromptChecklistFragment(trimmed)) {
            return false;
        }

        if (looksLikeRepeatedUserQuestionLine(trimmed)) {
            return false;
        }

        return hasVietnameseCharacters(trimmed) || likelyVietnameseAnswerLinePattern.test(trimmed);
    });

    if (firstMeaningfulVietnameseLineIndex <= 0) {
        return value;
    }

    return lines.slice(firstMeaningfulVietnameseLineIndex).join('\n').trim();
};

export const stripLeadingGreeting = (value: string): string =>
    value.replace(/^chào\s+bạn[\s,!.]*\n*/i, '').trim();

export const cleanSpeakingTutorThoughts = (value: string): string => {
    const lastTagIndex = value.lastIndexOf('[START_CHAT]');
    if (lastTagIndex !== -1) {
        return stripLeadingGreeting(value.slice(lastTagIndex + '[START_CHAT]'.length).trim());
    }

    const greetingMatches = [...value.matchAll(/(?:chào\s+bạn)\b/gi)];
    const lastGreetingMatch = greetingMatches[greetingMatches.length - 1];
    if (lastGreetingMatch?.index !== undefined) {
        return stripLeadingGreeting(value.slice(lastGreetingMatch.index).trim());
    }

    return value;
};

export const cleanCopilotDisplayText = (value?: string | null, skillType?: string | null) => {
    const rawText = (value ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\$\\rightarrow\$/g, '->')
        .replace(/\$\\Rightarrow\$/g, '=>')
        .replace(/\$\\leftarrow\$/g, '<-')
        .replace(/\$\\Leftarrow\$/g, '<=')
        .replace(/\$\\leftrightarrow\$/g, '<->')
        .replace(/\$\\Leftrightarrow\$/g, '<=>')
        .replace(/\\rightarrow/g, '->')
        .replace(/\\Rightarrow/g, '=>')
        .replace(/\\leftarrow/g, '<-')
        .replace(/\\Leftarrow/g, '<=')
        .replace(/\\leftrightarrow/g, '<->')
        .replace(/\\Leftrightarrow/g, '<=>')
        .replace(/\$([^$\n]{1,80})\$/g, '$1')
        .trim();

    const unwrapped = stripCodeFenceWrapper(rawText);
    const isSpeaking = skillType?.trim().toUpperCase() === 'SPEAKING';

    let normalized = '';
    if (isSpeaking) {
        normalized = cleanSpeakingTutorThoughts(unwrapped);
    } else {
        const lastTagIndex = unwrapped.lastIndexOf('[START_CHAT]');
        const tagSliced =
            lastTagIndex !== -1 ? unwrapped.slice(lastTagIndex + '[START_CHAT]'.length).trim() : '';
        if (tagSliced) {
            normalized = tagSliced;
        } else {
            normalized = trimToUserFacingVietnameseStart(unwrapped);
        }
    }

    if (!normalized) {
        return '';
    }

    if (isSpeaking) {
        return normalized;
    }

    const paragraphs = normalized
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);

    const filteredParagraphs = paragraphs.filter((paragraph) => {
        if (looksLikeReasoningParagraph(paragraph)) {
            return false;
        }

        if (looksLikeCopilotMetaLine(paragraph)) {
            return false;
        }

        if (looksLikeSelfCheckLine(paragraph) || looksLikePromptChecklistFragment(paragraph)) {
            return false;
        }

        if (looksLikeStandaloneEnglishParagraph(paragraph)) {
            return false;
        }

        if (/^['"`]\w+/i.test(paragraph)) {
            return false;
        }

        return true;
    });

    const dedupedParagraphs: string[] = [];
    const seenParagraphs = new Set<string>();

    for (const paragraph of filteredParagraphs) {
        const canonical = canonicalizeParagraph(paragraph);
        if (!canonical) {
            continue;
        }

        if (seenParagraphs.has(canonical)) {
            continue;
        }

        const isContainedByPrevious = dedupedParagraphs.some((existingParagraph) => {
            const existingCanonical = canonicalizeParagraph(existingParagraph);
            return existingCanonical.includes(canonical) || canonical.includes(existingCanonical);
        });

        if (isContainedByPrevious) {
            continue;
        }

        seenParagraphs.add(canonical);
        dedupedParagraphs.push(paragraph);
    }

    if (dedupedParagraphs.length === 0) {
        return normalized;
    }

    const preferredStartIndex = dedupedParagraphs.findIndex(
        (paragraph) =>
            /^(để|bạn|cụ thể|tóm lại|mình|ở đây|trong đoạn|đáp án)/i.test(paragraph.trim()) ||
            hasVietnameseCharacters(paragraph),
    );

    const finalParagraphs =
        preferredStartIndex > 0 ? dedupedParagraphs.slice(preferredStartIndex) : dedupedParagraphs;

    return finalParagraphs.join('\n\n').trim();
};

export const formatCopilotMarkdown = (value?: string | null, skillType?: string | null) => {
    const boldTokens: string[] = [];

    const withProtectedBold = cleanCopilotDisplayText(value, skillType)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\*\*([^*\n][^*\n]{0,160}?)\*\*/g, (_, content: string) => {
            const token = `@@COPILOT_BOLD_${boldTokens.length}@@`;
            boldTokens.push(content.trim());
            return token;
        });

    const normalized = withProtectedBold
        .replace(/(^|\n)\s*\*\s+(?=\S)/g, '$1- ')
        .replace(/([:.;!?])\*(\S)/g, '$1\n\n- $2')
        .replace(/\*\s+\*/g, ' ')
        .replace(/\*/g, '')
        .replace(/([.!?…:;])(?=[^\s\n>"')\]}])/g, '$1 ')
        .replace(/([.!?…:;])\s{2,}/g, '$1 ')
        .replace(/([A-Za-zÀ-ỹ])(\d)/g, '$1 $2')
        .replace(/(\d)([A-Za-zÀ-ỹ])/g, '$1 $2')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/([.!?])\s+(?=-\s+)/g, '$1\n\n')
        .replace(/([.!?])\s+(?=\d+\.\s+)/g, '$1\n\n')
        .replace(/:\s+(?=-\s+)/g, ':\n\n')
        .replace(/:\s+(?=\d+\.\s+)/g, ':\n\n')
        .replace(/([.!?])\s+(?=@@COPILOT_BOLD_\d+@@)/g, '$1\n\n')
        .replace(/(^|\n)(@@COPILOT_BOLD_\d+@@:?)\s*/g, '$1$2\n\n')
        .replace(/(^|\n)(-\s+[^\n]+)(?=\n(?!-|\d+\.))/g, '$1$2\n')
        .replace(/(^|\n)(\d+\.\s+[^\n]+)(?=\n(?!-|\d+\.))/g, '$1$2\n')
        .replace(/^(Chào bạn[^.!?\n]*[.!?])\s+/i, '$1\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return boldTokens.reduce(
        (current, content, index) => current.replace(`@@COPILOT_BOLD_${index}@@`, `**${content}**`),
        normalized,
    );
};

export const getWidthBounds = (viewportWidth: number) => {
    const maxWidth = Math.max(
        COPILOT_PANEL_MOBILE_MIN_WIDTH,
        Math.min(COPILOT_PANEL_MAX_WIDTH, viewportWidth - 12),
    );
    const minWidth = Math.min(
        viewportWidth - 12,
        viewportWidth < 960 ? COPILOT_PANEL_MOBILE_MIN_WIDTH : COPILOT_PANEL_MIN_WIDTH,
    );

    return {
        min: Math.max(COPILOT_PANEL_MOBILE_MIN_WIDTH, minWidth),
        max: Math.max(COPILOT_PANEL_MOBILE_MIN_WIDTH, maxWidth),
    };
};

export const clampPanelWidth = (width: number, viewportWidth: number) => {
    const bounds = getWidthBounds(viewportWidth);
    return Math.min(bounds.max, Math.max(bounds.min, Math.round(width)));
};

export const getInitialPanelWidth = () => {
    if (typeof window === 'undefined') {
        return COPILOT_PANEL_DEFAULT_WIDTH;
    }

    const storedValue = Number(window.localStorage.getItem(COPILOT_PANEL_STORAGE_KEY));
    if (!Number.isFinite(storedValue)) {
        return clampPanelWidth(COPILOT_PANEL_DEFAULT_WIDTH, window.innerWidth);
    }

    return clampPanelWidth(storedValue, window.innerWidth);
};

