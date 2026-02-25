using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using EnglishLearningApp.Domain.Services;
using EnglishLearningApp.Infrastructure.Repositories;
using EnglishLearningApp.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace EnglishLearningApp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        services.AddScoped<IGenericRepository<User>, GenericRepository<User>>();
        services.AddScoped<IGenericRepository<Course>, GenericRepository<Course>>();
        services.AddScoped<IGenericRepository<Lesson>, GenericRepository<Lesson>>();
        services.AddScoped<IGenericRepository<Question>, GenericRepository<Question>>();
        services.AddScoped<IGenericRepository<Exam>, GenericRepository<Exam>>();
        services.AddScoped<IGenericRepository<ExamSession>, GenericRepository<ExamSession>>();
        services.AddScoped<IGenericRepository<UserAnswer>, GenericRepository<UserAnswer>>();
        services.AddScoped<IGenericRepository<ScoringResult>, GenericRepository<ScoringResult>>();
        services.AddScoped<IGenericRepository<LearningProgress>, GenericRepository<LearningProgress>>();
        services.AddScoped<IGenericRepository<Notification>, GenericRepository<Notification>>();

        services.AddScoped<IGenericRepository<Exam>, GenericRepository<Exam>>();
        services.AddScoped<IGenericRepository<ExamSession>, GenericRepository<ExamSession>>();
        services.AddScoped<IGenericRepository<UserAnswer>, GenericRepository<UserAnswer>>();
        services.AddScoped<IGenericRepository<ScoringResult>, GenericRepository<ScoringResult>>();
        services.AddScoped<IGenericRepository<ExamQuestion>, GenericRepository<ExamQuestion>>();

        services.AddScoped<IJwtProvider, JwtProvider>();
        services.AddScoped<IPasswordHasher, BcryptPasswordHasher>();

        return services;
    }
}
