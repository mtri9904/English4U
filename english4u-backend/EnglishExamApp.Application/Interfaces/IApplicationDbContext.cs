using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace EnglishExamApp.Application.Interfaces;

public interface IApplicationDbContext
{
    DatabaseFacade Database { get; }

    DbSet<User> Users { get; }
    DbSet<Role> Roles { get; }
    DbSet<UserRole> UserRoles { get; }
    DbSet<Subscription> Subscriptions { get; }
    DbSet<UserSubscription> UserSubscriptions { get; }
    DbSet<Payment> Payments { get; }
    DbSet<Exam> Exams { get; }
    DbSet<ExamSection> ExamSections { get; }
    DbSet<ReadingPassage> ReadingPassages { get; }
    DbSet<ListeningPart> ListeningParts { get; }
    DbSet<WritingTask> WritingTasks { get; }
    DbSet<SpeakingPart> SpeakingParts { get; }
    DbSet<SpeakingQuestion> SpeakingQuestions { get; }
    DbSet<QuestionGroup> QuestionGroups { get; }
    DbSet<Question> Questions { get; }
    DbSet<QuestionOption> QuestionOptions { get; }
    DbSet<DocumentUpload> DocumentUploads { get; }
    DbSet<ExamSession> ExamSessions { get; }
    DbSet<UserAnswer> UserAnswers { get; }
    DbSet<UserAudioRecord> UserAudioRecords { get; }
    DbSet<SavedQuestion> SavedQuestions { get; }
    DbSet<ScoringRubric> ScoringRubrics { get; }
    DbSet<ScoringResult> ScoringResults { get; }
    DbSet<AiFeedback> AiFeedbacks { get; }
    DbSet<SpeechTranscript> SpeechTranscripts { get; }
    DbSet<PhonemeAnalysis> PhonemeAnalyses { get; }
    DbSet<Tag> Tags { get; }
    DbSet<ExamTag> ExamTags { get; }
    DbSet<Notification> Notifications { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
