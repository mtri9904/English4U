import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { CoursesModule } from './modules/courses/courses.module';
import { LessonsModule } from './modules/lessons/lessons.module';
import { SpeakingModule } from './modules/speaking/speaking.module';
import { UsersModule } from './modules/users/users.module';
import * as entities from './entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mssql',
        host: configService.get('DB_HOST', 'localhost'),
        port: parseInt(configService.get('DB_PORT', '1433'), 10),
        username: configService.get('DB_USERNAME', 'sa'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_DATABASE', 'EnglishAppDB'),
        entities: Object.values(entities),
        synchronize: false, // Set to false in production, use migrations
        options: {
          encrypt: false, // Set to true if using Azure SQL
          trustServerCertificate: true, // For local development
        },
        logging: true,
      }),
      inject: [ConfigService],
    }),
    // Serve uploaded files statically
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    AuthModule,
    CoursesModule,
    LessonsModule,
    SpeakingModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
