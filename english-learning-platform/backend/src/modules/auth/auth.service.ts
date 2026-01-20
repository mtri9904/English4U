import {
    Injectable,
    UnauthorizedException,
    ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../entities/user.entity';
import { Role } from '../../entities/role.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
        private jwtService: JwtService,
    ) { }

    // Workflow II: User Registration
    async register(registerDto: RegisterDto) {
        const { Email, Password, FullName } = registerDto;

        // Check if user already exists
        const existingUser = await this.userRepository.findOne({
            where: { Email },
        });

        if (existingUser) {
            throw new ConflictException('Email already registered');
        }

        // Get Student role (default)
        const studentRole = await this.roleRepository.findOne({
            where: { RoleName: 'Student' },
        });

        if (!studentRole) {
            throw new Error('Student role not found. Please seed database.');
        }

        // Hash password
        const PasswordHash = await bcrypt.hash(Password, 10);

        // Create user
        const user = this.userRepository.create({
            FullName,
            Email,
            PasswordHash,
            RoleID: studentRole.RoleID,
            AuthProvider: 'Email',
            CoinBalance: 0,
            IsActive: true,
        });

        await this.userRepository.save(user);

        // Generate token
        const token = this.generateToken(user);

        return {
            success: true,
            message: 'Registration successful',
            user: {
                UserID: user.UserID,
                FullName: user.FullName,
                Email: user.Email,
                CoinBalance: user.CoinBalance,
                Role: studentRole.RoleName,
            },
            token,
        };
    }

    // Workflow II: User Login
    async login(loginDto: LoginDto) {
        const { Email, Password } = loginDto;

        // Find user
        const user = await this.userRepository.findOne({
            where: { Email },
            relations: ['Role'],
        });

        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        if (!user.IsActive) {
            throw new UnauthorizedException('Account is deactivated');
        }

        // Verify password
        if (user.PasswordHash) {
            const isPasswordValid = await bcrypt.compare(Password, user.PasswordHash);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Invalid email or password');
            }
        } else {
            throw new UnauthorizedException(
                'This account uses OAuth. Please login with Google/Facebook',
            );
        }

        // Generate token
        const token = this.generateToken(user);

        return {
            success: true,
            message: 'Login successful',
            user: {
                UserID: user.UserID,
                FullName: user.FullName,
                Email: user.Email,
                AvatarURL: user.AvatarURL,
                CoinBalance: user.CoinBalance,
                Role: user.Role.RoleName,
            },
            token,
        };
    }

    // Generate JWT token
    private generateToken(user: User): string {
        const payload = {
            sub: user.UserID,
            email: user.Email,
        };

        return this.jwtService.sign(payload);
    }

    // Get user profile
    async getProfile(userId: number) {
        const user = await this.userRepository.findOne({
            where: { UserID: userId },
            relations: ['Role'],
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        return {
            UserID: user.UserID,
            FullName: user.FullName,
            Email: user.Email,
            AvatarURL: user.AvatarURL,
            CoinBalance: user.CoinBalance,
            Role: user.Role.RoleName,
            CreatedAt: user.CreatedAt,
        };
    }
}
