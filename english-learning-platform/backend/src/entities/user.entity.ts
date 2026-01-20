import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Role } from './role.entity';

@Entity('Users')
export class User {
    @PrimaryGeneratedColumn()
    UserID: number;

    @Column()
    RoleID: number;

    @ManyToOne(() => Role)
    @JoinColumn({ name: 'RoleID' })
    Role: Role;

    @Column({ type: 'nvarchar', length: 100 })
    FullName: string;

    @Column({ type: 'varchar', length: 100, unique: true })
    Email: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    PasswordHash: string; // Null if OAuth login

    @Column({ type: 'varchar', length: 500, nullable: true })
    AvatarURL: string;

    @Column({ type: 'varchar', length: 50, default: 'Email' })
    AuthProvider: string; // 'Email', 'Google', 'Facebook'

    @Column({ type: 'int', default: 0 })
    CoinBalance: number;

    @CreateDateColumn()
    CreatedAt: Date;

    @Column({ type: 'bit', default: 1 })
    IsActive: boolean;
}
