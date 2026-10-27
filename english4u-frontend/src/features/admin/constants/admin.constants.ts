export const ADMIN_CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const ADMIN_SKILL_LABELS: Record<string, string> = {
    Reading: 'Reading',
    Listening: 'Listening',
    Writing: 'Writing',
    Speaking: 'Speaking',
    FullTest: 'Full Test',
};

export const ADMIN_CONTAINER_VARIANTS = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08 } },
} as const;

export const ADMIN_ITEM_VARIANTS = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
} as const;

// Aliases for backwards compatibility
export const CHART_COLORS = ADMIN_CHART_COLORS;
export const skillLabel = ADMIN_SKILL_LABELS;
export const container = ADMIN_CONTAINER_VARIANTS;
export const item = ADMIN_ITEM_VARIANTS;

