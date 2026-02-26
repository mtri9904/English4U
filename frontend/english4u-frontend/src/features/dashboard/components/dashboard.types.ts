export interface DailyStreak {
    currentStreak: number
    longestStreak: number
    lastActiveDate: string
    weekActivity: boolean[]
    todayDone: boolean
}

export interface SkillScore {
    skill: string
    score: number
    maxScore: number
}

export interface LessonProgress {
    id: string
    title: string
    skill: 'listening' | 'speaking' | 'reading' | 'writing'
    completedPercent: number
    totalMinutes: number
    doneMinutes: number
    lastStudied: string
}

export interface Achievement {
    id: string
    title: string
    icon: string
    description: string
    unlockedAt: string
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export interface DashboardUser {
    name: string
    avatar: string
    level: string
    xp: number
    xpToNext: number
    notifications: number
}
