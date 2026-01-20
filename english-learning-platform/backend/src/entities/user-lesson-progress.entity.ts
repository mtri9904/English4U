import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Lesson } from './lesson.entity';

@Entity('UserLessonProgress')
export class UserLessonProgress {
    @PrimaryGeneratedColumn()
    ProgressID: number;

    @Column()
    UserID: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'UserID' })
    User: User;

    @Column()
    LessonID: number;

    @ManyToOne(() => Lesson)
    @JoinColumn({ name: 'LessonID' })
    Lesson: Lesson;

    @Column({ type: 'bit', default: 0 })
    IsCompleted: boolean;

    @Column({ type: 'float', nullable: true })
    HighScore: number;

    @CreateDateColumn()
    LastLearnedAt: Date;
}
