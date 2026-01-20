import {
    Controller,
    Get,
    Put,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Admin')
export class UsersController {
    constructor(private usersService: UsersService) { }

    // GET /api/users - List all users (Admin only)
    @Get()
    findAll() {
        return this.usersService.findAll();
    }

    // GET /api/users/:id - Get user details (Admin only)
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.usersService.findOne(+id);
    }

    // PUT /api/users/:id/role - Update user role (Admin only)
    @Put(':id/role')
    updateRole(
        @Param('id') id: string,
        @Body('roleName') roleName: string,
    ) {
        return this.usersService.updateRole(+id, roleName);
    }

    // PUT /api/users/:id/status - Update user status (Admin only)
    @Put(':id/status')
    updateStatus(
        @Param('id') id: string,
        @Body('isActive') isActive: boolean,
    ) {
        return this.usersService.updateStatus(+id, isActive);
    }
}
