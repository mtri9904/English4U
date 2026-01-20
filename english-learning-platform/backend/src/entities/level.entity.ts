import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('Levels')
export class Level {
    @PrimaryGeneratedColumn()
    LevelID: number;

    @Column({ type: 'varchar', length: 20 })
    LevelName: string; // 'A1', 'A2', 'B1', etc.

    @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
    Description: string;
}
