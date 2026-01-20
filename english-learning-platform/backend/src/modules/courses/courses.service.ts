import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../../entities/course.entity';
import { Unit } from '../../entities/unit.entity';
import { Lesson } from '../../entities/lesson.entity';
import { CreateCourseDto } from './dto/create-course.dto';

@Injectable()
export class CoursesService {
    constructor(
        @InjectRepository(Course)
        private courseRepository: Repository<Course>,
        @InjectRepository(Unit)
        private unitRepository: Repository<Unit>,
        @InjectRepository(Lesson)
        private lessonRepository: Repository<Lesson>,
    ) { }

    // Get all published courses
    async findAllPublished() {
        return this.courseRepository.find({
            where: { IsPublished: true },
            relations: ['Level'],
            order: { CreatedAt: 'DESC' },
        });
    }

    // Get course by ID with units and lessons
    async findOne(id: number) {
        const course = await this.courseRepository.findOne({
            where: { CourseID: id },
            relations: ['Level'],
        });

        if (!course) {
            throw new NotFoundException('Course not found');
        }

        // Get units with lessons
        const units = await this.unitRepository.find({
            where: { CourseID: id },
            order: { OrderIndex: 'ASC' },
        });

        // Get lessons for each unit
        const unitsWithLessons = await Promise.all(
            units.map(async (unit) => {
                const lessons = await this.lessonRepository.find({
                    where: { UnitID: unit.UnitID },
                    order: { OrderIndex: 'ASC' },
                });
                return { ...unit, lessons };
            }),
        );

        return {
            ...course,
            units: unitsWithLessons,
        };
    }

    // Admin: Create course
    async create(createCourseDto: CreateCourseDto) {
        const course = this.courseRepository.create(createCourseDto);
        return this.courseRepository.save(course);
    }

    // Admin: Update course
    async update(id: number, updateData: Partial<CreateCourseDto>) {
        await this.courseRepository.update(id, updateData);
        return this.findOne(id);
    }

    // Admin: Delete course
    async remove(id: number) {
        const result = await this.courseRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException('Course not found');
        }
        return { success: true, message: 'Course deleted' };
    }
}
