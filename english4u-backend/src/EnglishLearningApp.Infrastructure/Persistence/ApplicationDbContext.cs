using EnglishLearningApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EnglishLearningApp.Infrastructure.Persistence;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<Exam> Exams => Set<Exam>();
    public DbSet<ExamQuestion> ExamQuestions => Set<ExamQuestion>();
    public DbSet<ExamSession> ExamSessions => Set<ExamSession>();
    public DbSet<UserAnswer> UserAnswers => Set<UserAnswer>();
    public DbSet<ScoringResult> ScoringResults => Set<ScoringResult>();
    public DbSet<LearningProgress> LearningProgresses => Set<LearningProgress>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<UserSubscription> UserSubscriptions => Set<UserSubscription>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Achievement> Achievements => Set<Achievement>();
    public DbSet<UserAchievement> UserAchievements => Set<UserAchievement>();
    public DbSet<DailyStreak> DailyStreaks => Set<DailyStreak>();
    public DbSet<FlashcardDeck> FlashcardDecks => Set<FlashcardDeck>();
    public DbSet<Flashcard> Flashcards => Set<Flashcard>();
    public DbSet<UserFlashcardProgress> UserFlashcardProgresses => Set<UserFlashcardProgress>();
    public DbSet<CourseReview> CourseReviews => Set<CourseReview>();
    public DbSet<LessonComment> LessonComments => Set<LessonComment>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<CourseTag> CourseTags => Set<CourseTag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Email).HasColumnName("email").HasMaxLength(255).IsRequired();
            entity.HasIndex(e => e.Email).IsUnique();
            entity.Property(e => e.PasswordHash).HasColumnName("passwordHash").HasMaxLength(255).IsRequired();
            entity.Property(e => e.DisplayName).HasColumnName("displayName").HasMaxLength(255);
            entity.Property(e => e.Role).HasColumnName("role").HasMaxLength(50);
            entity.Property(e => e.AvatarUrl).HasColumnName("avatarUrl").HasMaxLength(500);
            entity.Property(e => e.IsActive).HasColumnName("isActive").HasDefaultValue(true);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updatedAt").HasDefaultValueSql("GETDATE()");
        });

        modelBuilder.Entity<Course>(entity =>
        {
            entity.ToTable("courses");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.ThumbnailUrl).HasColumnName("thumbnailUrl").HasMaxLength(500);
            entity.Property(e => e.SkillType).HasColumnName("skillType").HasMaxLength(50);
            entity.Property(e => e.DifficultyLevel).HasColumnName("difficultyLevel").HasMaxLength(50);
            entity.Property(e => e.IsPublished).HasColumnName("isPublished").HasDefaultValue(false);
            entity.Property(e => e.CreatedBy).HasColumnName("createdBy").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updatedAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Creator)
                  .WithMany(u => u.CreatedCourses)
                  .HasForeignKey(e => e.CreatedBy)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Lesson>(entity =>
        {
            entity.ToTable("lessons");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.CourseId).HasColumnName("courseId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.ThumbnailUrl).HasColumnName("thumbnailUrl").HasMaxLength(500);
            entity.Property(e => e.Content).HasColumnName("content");
            entity.Property(e => e.OrderIndex).HasColumnName("orderIndex");
            entity.Property(e => e.Duration).HasColumnName("duration");
            entity.Property(e => e.IsPublished).HasColumnName("isPublished").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Course)
                  .WithMany(c => c.Lessons)
                  .HasForeignKey(e => e.CourseId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Question>(entity =>
        {
            entity.ToTable("questions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.LessonId).HasColumnName("lessonId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.SkillType).HasColumnName("skillType").HasMaxLength(50);
            entity.Property(e => e.QuestionType).HasColumnName("questionType").HasMaxLength(50);
            entity.Property(e => e.Content).HasColumnName("content");
            entity.Property(e => e.AudioUrl).HasColumnName("audioUrl").HasMaxLength(500);
            entity.Property(e => e.ImageUrl).HasColumnName("imageUrl").HasMaxLength(500);
            entity.Property(e => e.CorrectAnswer).HasColumnName("correctAnswer");
            entity.Property(e => e.Options).HasColumnName("options");
            entity.Property(e => e.Points).HasColumnName("points").HasDefaultValue(1);
            entity.Property(e => e.OrderIndex).HasColumnName("orderIndex");
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Lesson)
                  .WithMany(l => l.Questions)
                  .HasForeignKey(e => e.LessonId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Exam>(entity =>
        {
            entity.ToTable("exams");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.CourseId).HasColumnName("courseId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.Duration).HasColumnName("duration");
            entity.Property(e => e.TotalPoints).HasColumnName("totalPoints");
            entity.Property(e => e.PassingScore).HasColumnName("passingScore");
            entity.Property(e => e.IsPublished).HasColumnName("isPublished").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Course)
                  .WithMany(c => c.Exams)
                  .HasForeignKey(e => e.CourseId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ExamQuestion>(entity =>
        {
            entity.ToTable("exam_questions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.ExamId).HasColumnName("examId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.QuestionId).HasColumnName("questionId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.OrderIndex).HasColumnName("orderIndex");

            entity.HasOne(e => e.Exam)
                  .WithMany(ex => ex.ExamQuestions)
                  .HasForeignKey(e => e.ExamId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Question)
                  .WithMany(q => q.ExamQuestions)
                  .HasForeignKey(e => e.QuestionId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ExamSession>(entity =>
        {
            entity.ToTable("exam_sessions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.ExamId).HasColumnName("examId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(50);
            entity.Property(e => e.StartedAt).HasColumnName("startedAt").HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.EndedAt).HasColumnName("endedAt");
            entity.Property(e => e.TimeRemaining).HasColumnName("timeRemaining");
            entity.Property(e => e.DraftData).HasColumnName("draftData");
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.User)
                  .WithMany(u => u.ExamSessions)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Exam)
                  .WithMany(ex => ex.ExamSessions)
                  .HasForeignKey(e => e.ExamId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserAnswer>(entity =>
        {
            entity.ToTable("user_answers");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.SessionId).HasColumnName("sessionId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.QuestionId).HasColumnName("questionId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.AnswerText).HasColumnName("answerText");
            entity.Property(e => e.AudioUrl).HasColumnName("audioUrl").HasMaxLength(500);
            entity.Property(e => e.IsAutoSaved).HasColumnName("isAutoSaved").HasDefaultValue(true);
            entity.Property(e => e.SubmittedAt).HasColumnName("submittedAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Session)
                  .WithMany(s => s.UserAnswers)
                  .HasForeignKey(e => e.SessionId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Question)
                  .WithMany(q => q.UserAnswers)
                  .HasForeignKey(e => e.QuestionId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ScoringResult>(entity =>
        {
            entity.ToTable("scoring_results");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.SessionId).HasColumnName("sessionId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.TotalScore).HasColumnName("totalScore");
            entity.Property(e => e.BandScore).HasColumnName("bandScore");
            entity.Property(e => e.Transcript).HasColumnName("transcript");
            entity.Property(e => e.Feedback).HasColumnName("feedback");
            entity.Property(e => e.PronunciationScore).HasColumnName("pronunciationScore");
            entity.Property(e => e.FluencyScore).HasColumnName("fluencyScore");
            entity.Property(e => e.GrammarScore).HasColumnName("grammarScore");
            entity.Property(e => e.CoherenceScore).HasColumnName("coherenceScore");
            entity.Property(e => e.ScoredAt).HasColumnName("scoredAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Session)
                  .WithOne(s => s.ScoringResult)
                  .HasForeignKey<ScoringResult>(e => e.SessionId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LearningProgress>(entity =>
        {
            entity.ToTable("learning_progress");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.CourseId).HasColumnName("courseId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.CompletedLessons).HasColumnName("completedLessons").HasDefaultValue(0);
            entity.Property(e => e.LastAccessedAt).HasColumnName("lastAccessedAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.User)
                  .WithMany(u => u.LearningProgresses)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Course)
                  .WithMany(c => c.LearningProgresses)
                  .HasForeignKey(e => e.CourseId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.ToTable("notifications");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.IsRead).HasColumnName("isRead").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.User)
                  .WithMany(u => u.Notifications)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.ToTable("subscriptions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Price).HasColumnName("price").HasColumnType("DECIMAL(18,2)");
            entity.Property(e => e.DurationDays).HasColumnName("durationDays");
            entity.Property(e => e.Features).HasColumnName("features");
            entity.Property(e => e.IsActive).HasColumnName("isActive").HasDefaultValue(true);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
        });

        modelBuilder.Entity<UserSubscription>(entity =>
        {
            entity.ToTable("user_subscriptions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.SubscriptionId).HasColumnName("subscriptionId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.StartDate).HasColumnName("startDate");
            entity.Property(e => e.EndDate).HasColumnName("endDate");
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(50);

            entity.HasOne(e => e.User)
                  .WithMany(u => u.UserSubscriptions)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Subscription)
                  .WithMany(s => s.UserSubscriptions)
                  .HasForeignKey(e => e.SubscriptionId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("payments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Amount).HasColumnName("amount").HasColumnType("DECIMAL(18,2)");
            entity.Property(e => e.PaymentMethod).HasColumnName("paymentMethod").HasMaxLength(50);
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(50);
            entity.Property(e => e.TransactionId).HasColumnName("transactionId").HasMaxLength(255);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.User)
                  .WithMany(u => u.Payments)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Achievement>(entity =>
        {
            entity.ToTable("achievements");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.IconUrl).HasColumnName("iconUrl").HasMaxLength(500);
            entity.Property(e => e.PointsReward).HasColumnName("pointsReward").HasDefaultValue(0);
        });

        modelBuilder.Entity<UserAchievement>(entity =>
        {
            entity.ToTable("user_achievements");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.AchievementId).HasColumnName("achievementId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UnlockedAt).HasColumnName("unlockedAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.User)
                  .WithMany(u => u.UserAchievements)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Achievement)
                  .WithMany(a => a.UserAchievements)
                  .HasForeignKey(e => e.AchievementId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DailyStreak>(entity =>
        {
            entity.ToTable("daily_streaks");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.Property(e => e.CurrentStreak).HasColumnName("currentStreak").HasDefaultValue(0);
            entity.Property(e => e.LongestStreak).HasColumnName("longestStreak").HasDefaultValue(0);
            entity.Property(e => e.LastActivityDate).HasColumnName("lastActivityDate");

            entity.HasOne(e => e.User)
                  .WithOne(u => u.DailyStreak)
                  .HasForeignKey<DailyStreak>(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FlashcardDeck>(entity =>
        {
            entity.ToTable("flashcard_decks");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.CourseId).HasColumnName("courseId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Course)
                  .WithMany(c => c.FlashcardDecks)
                  .HasForeignKey(e => e.CourseId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Flashcard>(entity =>
        {
            entity.ToTable("flashcards");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.DeckId).HasColumnName("deckId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.FrontText).HasColumnName("frontText").IsRequired();
            entity.Property(e => e.BackText).HasColumnName("backText").IsRequired();
            entity.Property(e => e.AudioUrl).HasColumnName("audioUrl").HasMaxLength(500);
            entity.Property(e => e.ExampleSentence).HasColumnName("exampleSentence");

            entity.HasOne(e => e.Deck)
                  .WithMany(d => d.Flashcards)
                  .HasForeignKey(e => e.DeckId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserFlashcardProgress>(entity =>
        {
            entity.ToTable("user_flashcard_progress");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.FlashcardId).HasColumnName("flashcardId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.BoxLevel).HasColumnName("boxLevel").HasDefaultValue(1);
            entity.Property(e => e.NextReviewDate).HasColumnName("nextReviewDate");
            entity.Property(e => e.EaseFactor).HasColumnName("easeFactor").HasDefaultValue(2.5);

            entity.HasOne(e => e.User)
                  .WithMany(u => u.UserFlashcardProgresses)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Flashcard)
                  .WithMany(f => f.UserProgresses)
                  .HasForeignKey(e => e.FlashcardId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CourseReview>(entity =>
        {
            entity.ToTable("course_reviews");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.CourseId).HasColumnName("courseId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Rating).HasColumnName("rating");
            entity.Property(e => e.Comment).HasColumnName("comment");
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Course)
                  .WithMany(c => c.CourseReviews)
                  .HasForeignKey(e => e.CourseId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                  .WithMany(u => u.CourseReviews)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<LessonComment>(entity =>
        {
            entity.ToTable("lesson_comments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.LessonId).HasColumnName("lessonId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.UserId).HasColumnName("userId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.ParentId).HasColumnName("parentId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Content).HasColumnName("content").IsRequired();
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");

            entity.HasOne(e => e.Lesson)
                  .WithMany(l => l.LessonComments)
                  .HasForeignKey(e => e.LessonId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                  .WithMany(u => u.LessonComments)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Parent)
                  .WithMany(c => c.Replies)
                  .HasForeignKey(e => e.ParentId)
                  .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("tags");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
            entity.HasIndex(e => e.Name).IsUnique();
        });

        modelBuilder.Entity<CourseTag>(entity =>
        {
            entity.ToTable("course_tags");
            entity.HasKey(e => new { e.CourseId, e.TagId });
            entity.Property(e => e.CourseId).HasColumnName("courseId").HasColumnType("NVARCHAR(36)");
            entity.Property(e => e.TagId).HasColumnName("tagId").HasColumnType("NVARCHAR(36)");

            entity.HasOne(e => e.Course)
                  .WithMany(c => c.CourseTags)
                  .HasForeignKey(e => e.CourseId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Tag)
                  .WithMany(t => t.CourseTags)
                  .HasForeignKey(e => e.TagId)
                  .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
