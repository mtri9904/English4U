import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('courses')
export class CoursesController {
    constructor(private coursesService: CoursesService) { }

    // GET /api/courses - Get all published courses
    @Get()
    findAll() {
        return this.coursesService.findAllPublished();
    }

    // GET /api/courses/:id - Get course details
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.coursesService.findOne(+id);
    }

    // POST /api/courses - Create course (Admin only)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('Admin')
    @Post()
    create(@Body() createCourseDto: CreateCourseDto) {
        return this.coursesService.create(createCourseDto);
    }

    // PUT /api/courses/:id - Update course (Admin only)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('Admin')
    @Put(':id')
    update(@Param('id') id: string, @Body() updateData: Partial<CreateCourseDto>) {
        return this.coursesService.update(+id, updateData);
    }

    // DELETE /api/courses/:id - Delete course (Admin only)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('Admin')
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.coursesService.remove(+id);
    }
}
