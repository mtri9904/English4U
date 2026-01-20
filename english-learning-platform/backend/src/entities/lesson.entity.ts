import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Unit } from './unit.entity';

@Entity('Lessons')
export class Lesson {
    @PrimaryGeneratedColumn()
    LessonID: number;

    @Column()
    UnitID: number;

    @ManyToOne(() => Unit, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'UnitID' })
    Unit: Unit;

    @Column({ type: 'nvarchar', length: 200 })
    Title: string;

    @Column({ type: 'varchar', length: 50 })
    LessonType: string; // 'Reading', 'Listening', 'Speaking', 'Writing', 'Grammar'

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    ContentText: string; // Reading passage, Grammar theory, etc.

    @Column({ type: 'varchar', length: 500, nullable: true })
    MediaURL: string; // Audio/Video URL

    @Column({ type: 'int', nullable: true })
    Duration: number; // Expected duration in minutes

    @Column({ type: 'int', nullable: true })
    OrderIndex: number;

    @CreateDateColumn()
    CreatedAt: Date;
}
