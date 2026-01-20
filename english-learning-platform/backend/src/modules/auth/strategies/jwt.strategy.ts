import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: configService.get('JWT_SECRET', 'default-secret-key'),
        });
    }

    async validate(payload: { sub: number; email: string }) {
        const user = await this.userRepository.findOne({
            where: { UserID: payload.sub },
            relations: ['Role'],
        });

        if (!user || !user.IsActive) {
            throw new UnauthorizedException();
        }

        // Return user with role name for RolesGuard
        return {
            userId: user.UserID,
            email: user.Email,
            role: user.Role.RoleName,
        };
    }
}
