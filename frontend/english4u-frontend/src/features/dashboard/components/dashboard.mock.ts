import type { DailyStreak, SkillScore, LessonProgress, Achievement, DashboardUser } from './dashboard.types'

export const mockUser: DashboardUser = {
    name: 'Minh Anh', avatar: 'MA', level: 'B2', xp: 4820, xpToNext: 6000, notifications: 3,
}

export const mockStreak: DailyStreak = {
    currentStreak: 14, longestStreak: 21, lastActiveDate: '2026-02-26',
    weekActivity: [true, true, false, true, true, true, true], todayDone: true,
}

export const mockSkillScores: SkillScore[] = [
    { skill: 'Listening', score: 78, maxScore: 100 },
    { skill: 'Speaking', score: 62, maxScore: 100 },
    { skill: 'Reading', score: 85, maxScore: 100 },
    { skill: 'Writing', score: 71, maxScore: 100 },
]

export const mockLessons: LessonProgress[] = [
    { id: '1', title: 'IELTS Listening — Section 3 Monologue', skill: 'listening', completedPercent: 72, totalMinutes: 25, doneMinutes: 18, lastStudied: '2 hours ago' },
    { id: '2', title: 'Speaking Part 2 — Describe a Place', skill: 'speaking', completedPercent: 45, totalMinutes: 30, doneMinutes: 14, lastStudied: 'Yesterday' },
    { id: '3', title: 'Academic Reading — Environment Passage', skill: 'reading', completedPercent: 90, totalMinutes: 20, doneMinutes: 18, lastStudied: '3 hours ago' },
    { id: '4', title: 'Task 2 Writing — Technology Essay', skill: 'writing', completedPercent: 30, totalMinutes: 40, doneMinutes: 12, lastStudied: '2 days ago' },
]

export const mockAchievements: Achievement[] = [
    { id: '1', title: 'First Lesson', icon: '🌟', description: 'Completed your very first lesson', unlockedAt: '2026-01-15', rarity: 'common' },
    { id: '2', title: '7-Day Streak', icon: '🔥', description: 'Studied 7 days in a row', unlockedAt: '2026-02-01', rarity: 'rare' },
    { id: '3', title: 'Perfect Score', icon: '💎', description: 'Scored 100% on a practice test', unlockedAt: '2026-02-10', rarity: 'epic' },
    { id: '4', title: 'Speed Reader', icon: '⚡', description: 'Read 5 passages in one session', unlockedAt: '2026-02-18', rarity: 'rare' },
    { id: '5', title: 'Vocal Master', icon: '🎤', description: 'Completed 20 speaking exercises', unlockedAt: '2026-02-20', rarity: 'epic' },
    { id: '6', title: 'Band 7 Club', icon: '👑', description: 'Achieved Band 7 on mock IELTS', unlockedAt: '2026-02-25', rarity: 'legendary' },
]
