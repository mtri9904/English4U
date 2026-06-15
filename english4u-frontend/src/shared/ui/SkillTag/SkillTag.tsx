import { Badge } from '../Badge/Badge'

export interface SkillTagProps {
    skill: 'listening' | 'speaking' | 'reading' | 'writing' | 'grammar' | 'vocabulary'
}

export function SkillTag({ skill }: SkillTagProps) {
    const labels: Record<string, string> = {
        listening: '🎧 Listening',
        speaking: '🗣️ Speaking',
        reading: '📖 Reading',
        writing: '✍️ Writing',
        grammar: '📝 Grammar',
        vocabulary: '📚 Vocabulary'
    }
    return <Badge variant="neutral">{labels[skill] || skill}</Badge>
}
