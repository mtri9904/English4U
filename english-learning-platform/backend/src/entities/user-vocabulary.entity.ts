import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('UserVocabularies')
export class UserVocabulary {
    @PrimaryGeneratedColumn()
    VocabID: number;

    @Column()
    UserID: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'UserID' })
    User: User;

    @Column({ type: 'nvarchar', length: 100 })
    Word: string;

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    Meaning: string;

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    ExampleSentence: string;

    @Column({ type: 'varchar', length: 20, default: 'New' })
    Status: string; // 'New', 'Learning', 'Mastered'

    @Column({ type: 'datetime', nullable: true })
    NextReviewDate: Date; // For spaced repetition

    @CreateDateColumn()
    SavedAt: Date;
}
