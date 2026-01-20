import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Question } from './question.entity';

@Entity('QuestionOptions')
export class QuestionOption {
    @PrimaryGeneratedColumn()
    OptionID: number;

    @Column()
    QuestionID: number;

    @ManyToOne(() => Question, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'QuestionID' })
    Question: Question;

    @Column({ type: 'nvarchar', length: 'MAX' })
    OptionText: string;

    @Column({ type: 'bit', default: 0 })
    IsCorrect: boolean;
}
