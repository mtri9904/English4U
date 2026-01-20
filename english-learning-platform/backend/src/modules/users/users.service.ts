import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Role } from '../../entities/role.entity';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
    ) { }

    // Get all users
    async findAll() {
        const users = await this.userRepository.find({
            relations: ['Role'],
            order: { CreatedAt: 'DESC' },
        });

        return users.map(user => ({
            UserID: user.UserID,
            FullName: user.FullName,
            Email: user.Email,
            Role: user.Role.RoleName,
            CoinBalance: user.CoinBalance,
            IsActive: user.IsActive,
            CreatedAt: user.CreatedAt,
        }));
    }

    // Get user by ID
    async findOne(id: number) {
        const user = await this.userRepository.findOne({
            where: { UserID: id },
            relations: ['Role'],
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return {
            UserID: user.UserID,
            FullName: user.FullName,
            Email: user.Email,
            AvatarURL: user.AvatarURL,
            Role: user.Role.RoleName,
            CoinBalance: user.CoinBalance,
            IsActive: user.IsActive,
            CreatedAt: user.CreatedAt,
        };
    }

    // Update user role
    async updateRole(userId: number, roleName: string) {
        const user = await this.userRepository.findOne({
            where: { UserID: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const role = await this.roleRepository.findOne({
            where: { RoleName: roleName },
        });

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        user.RoleID = role.RoleID;
        await this.userRepository.save(user);

        return {
            success: true,
            message: 'User role updated successfully',
        };
    }

    // Update user status (activate/deactivate)
    async updateStatus(userId: number, isActive: boolean) {
        const user = await this.userRepository.findOne({
            where: { UserID: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        user.IsActive = isActive;
        await this.userRepository.save(user);

        return {
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        };
    }
}
