import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Course } from './course.entity';

@Entity('Units')
export class Unit {
    @PrimaryGeneratedColumn()
    UnitID: number;

    @Column()
    CourseID: number;

    @ManyToOne(() => Course, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'CourseID' })
    Course: Course;

    @Column({ type: 'nvarchar', length: 200 })
    Title: string;

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    Description: string;

    @Column({ type: 'int', nullable: true })
    OrderIndex: number;
}
