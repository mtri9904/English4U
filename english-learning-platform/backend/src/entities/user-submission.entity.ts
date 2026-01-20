import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Question } from './question.entity';

@Entity('UserSubmissions')
export class UserSubmission {
    @PrimaryGeneratedColumn()
    SubmissionID: number;

    @Column()
    UserID: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'UserID' })
    User: User;

    @Column()
    QuestionID: number;

    @ManyToOne(() => Question)
    @JoinColumn({ name: 'QuestionID' })
    Question: Question;

    // Answer data
    @Column({ type: 'int', nullable: true })
    SelectedOptionID: number; // For MCQ

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    TextAnswer: string; // For Writing/Fill-in-blank

    @Column({ type: 'varchar', length: 500, nullable: true })
    AudioURL: string; // For Speaking

    // Scoring
    @Column({ type: 'bit', nullable: true })
    IsCorrect: boolean;

    @Column({ type: 'float', nullable: true })
    AutoScore: number; // AI or system auto-score

    @Column({ type: 'float', nullable: true })
    TeacherScore: number; // Teacher override

    // Speaking-specific scores
    @Column({ type: 'float', nullable: true })
    PronunciationScore: number;

    @Column({ type: 'float', nullable: true })
    FluencyScore: number;

    // Feedback
    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    SystemFeedback: string; // AI feedback

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    TeacherFeedback: string;

    @CreateDateColumn()
    SubmittedAt: Date;
}
