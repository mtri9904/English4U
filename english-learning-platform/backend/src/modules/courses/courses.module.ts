import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Course } from '../../entities/course.entity';
import { Unit } from '../../entities/unit.entity';
import { Lesson } from '../../entities/lesson.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Course, Unit, Lesson])],
    controllers: [CoursesController],
    providers: [CoursesService],
    exports: [CoursesService],
})
export class CoursesModule { }
