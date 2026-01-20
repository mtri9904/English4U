import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('CoinHistory')
export class CoinHistory {
    @PrimaryGeneratedColumn()
    TransactionID: number;

    @Column()
    UserID: number;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'UserID' })
    User: User;

    @Column({ type: 'int' })
    Amount: number; // Positive = earned, Negative = spent

    @Column({ type: 'nvarchar', length: 255, nullable: true })
    Description: string; // e.g., "Completed Lesson", "Purchased Theme"

    @CreateDateColumn()
    CreatedAt: Date;
}
