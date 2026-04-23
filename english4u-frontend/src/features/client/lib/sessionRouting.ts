const normalizeSkill = (value?: string | null) => (value ?? '').trim().toUpperCase();

export const isObjectiveSkill = (value?: string | null) => {
    const skill = normalizeSkill(value);
    return skill === 'READING' || skill === 'LISTENING';
};

export const isWritingSkill = (value?: string | null) => normalizeSkill(value) === 'WRITING';

export const isSupportedRunnerSkill = (value?: string | null) =>
    isObjectiveSkill(value) || isWritingSkill(value);

export const getSessionRunnerPath = (sessionId: string, skillType?: string | null) => {
    const skill = normalizeSkill(skillType);
    if (skill === 'LISTENING') {
        return `/app/sessions/${sessionId}/listening`;
    }

    if (skill === 'WRITING') {
        return `/app/sessions/${sessionId}/writing`;
    }

    return `/app/sessions/${sessionId}/reading`;
};

export const getSkillLabel = (value?: string | null) => {
    const skill = normalizeSkill(value);
    if (!skill) {
        return 'Unknown';
    }

    return skill.charAt(0) + skill.slice(1).toLowerCase();
};
