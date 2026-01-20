import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('Roles')
export class Role {
  @PrimaryGeneratedColumn()
  RoleID: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  RoleName: string; // 'Student', 'Teacher', 'Admin'

  @Column({ type: 'nvarchar', length: 255, nullable: true })
  Description: string;
}
