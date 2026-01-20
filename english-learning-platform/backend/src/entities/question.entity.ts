import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';

@Entity('Questions')
export class Question {
    @PrimaryGeneratedColumn()
    QuestionID: number;

    @Column()
    LessonID: number;

    @ManyToOne(() => Lesson, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'LessonID' })
    Lesson: Lesson;

    @Column({ type: 'nvarchar', length: 'MAX' })
    ContentText: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    MediaURL: string; // If question has accompanying media

    @Column({ type: 'varchar', length: 50 })
    QuestionType: string; // 'MCQ', 'TrueFalse', 'Cloze', 'ShortAnswer', 'Essay', 'Speaking'

    @Column({ type: 'int', default: 1 })
    ScorePoint: number;
}
