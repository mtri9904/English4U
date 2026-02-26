using EnglishLearningApp.Domain.Entities;
using EnglishLearningApp.Domain.Repositories;
using EnglishLearningApp.Domain.Services;
using EnglishLearningApp.Infrastructure.Repositories;
using EnglishLearningApp.Infrastructure.Services;
using EnglishLearningApp.Infrastructure.Settings;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace EnglishLearningApp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IGenericRepository<User>, GenericRepository<User>>();
        services.AddScoped<IGenericRepository<Course>, GenericRepository<Course>>();
        services.AddScoped<IGenericRepository<Lesson>, GenericRepository<Lesson>>();
        services.AddScoped<IGenericRepository<Question>, GenericRepository<Question>>();

        services.AddScoped<IGenericRepository<Exam>, GenericRepository<Exam>>();
        services.AddScoped<IGenericRepository<ExamQuestion>, GenericRepository<ExamQuestion>>();
        services.AddScoped<IGenericRepository<ExamSession>, GenericRepository<ExamSession>>();
        services.AddScoped<IGenericRepository<UserAnswer>, GenericRepository<UserAnswer>>();
        services.AddScoped<IGenericRepository<ScoringResult>, GenericRepository<ScoringResult>>();

        services.AddScoped<IGenericRepository<FlashcardDeck>, GenericRepository<FlashcardDeck>>();
        services.AddScoped<IGenericRepository<Flashcard>, GenericRepository<Flashcard>>();
        services.AddScoped<IGenericRepository<UserFlashcardProgress>, GenericRepository<UserFlashcardProgress>>();
        services.AddScoped<IGenericRepository<LearningProgress>, GenericRepository<LearningProgress>>();

        services.AddScoped<IGenericRepository<Achievement>, GenericRepository<Achievement>>();
        services.AddScoped<IGenericRepository<UserAchievement>, GenericRepository<UserAchievement>>();
        services.AddScoped<IGenericRepository<DailyStreak>, GenericRepository<DailyStreak>>();
        services.AddScoped<IGenericRepository<CourseReview>, GenericRepository<CourseReview>>();
        services.AddScoped<IGenericRepository<LessonComment>, GenericRepository<LessonComment>>();
        services.AddScoped<IGenericRepository<Tag>, GenericRepository<Tag>>();
        services.AddScoped<IGenericRepository<CourseTag>, GenericRepository<CourseTag>>();
        services.AddScoped<IGenericRepository<Notification>, GenericRepository<Notification>>();

        services.AddScoped<IGenericRepository<Subscription>, GenericRepository<Subscription>>();
        services.AddScoped<IGenericRepository<UserSubscription>, GenericRepository<UserSubscription>>();
        services.AddScoped<IGenericRepository<Payment>, GenericRepository<Payment>>();

        services.AddScoped<IJwtProvider, JwtProvider>();
        services.AddScoped<IPasswordHasher, BcryptPasswordHasher>();
        services.Configure<CloudinarySettings>(configuration.GetSection("Cloudinary"));
        services.AddScoped<IMediaService, CloudinaryService>();

        return services;
    }
}
