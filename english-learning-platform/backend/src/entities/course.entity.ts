import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Level } from './level.entity';

@Entity('Courses')
export class Course {
    @PrimaryGeneratedColumn()
    CourseID: number;

    @Column()
    LevelID: number;

    @ManyToOne(() => Level)
    @JoinColumn({ name: 'LevelID' })
    Level: Level;

    @Column({ type: 'nvarchar', length: 200 })
    Title: string;

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    Description: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    ThumbnailURL: string;

    @Column({ type: 'int', default: 0 })
    Price: number; // In coins

    @Column({ type: 'bit', default: 0 })
    IsPublished: boolean;

    @CreateDateColumn()
    CreatedAt: Date;
}
