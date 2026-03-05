using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.Infrastructure.Data;

public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options), IApplicationDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<UserSubscription> UserSubscriptions => Set<UserSubscription>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<Exam> Exams => Set<Exam>();
    public DbSet<ExamSection> ExamSections => Set<ExamSection>();
    public DbSet<ReadingPassage> ReadingPassages => Set<ReadingPassage>();
    public DbSet<ListeningPart> ListeningParts => Set<ListeningPart>();
    public DbSet<WritingTask> WritingTasks => Set<WritingTask>();
    public DbSet<SpeakingPart> SpeakingParts => Set<SpeakingPart>();
    public DbSet<SpeakingQuestion> SpeakingQuestions => Set<SpeakingQuestion>();
    public DbSet<QuestionGroup> QuestionGroups => Set<QuestionGroup>();
    public DbSet<Question> Questions => Set<Question>();
    public DbSet<QuestionOption> QuestionOptions => Set<QuestionOption>();
    public DbSet<DocumentUpload> DocumentUploads => Set<DocumentUpload>();
    public DbSet<ExamSession> ExamSessions => Set<ExamSession>();
    public DbSet<UserAnswer> UserAnswers => Set<UserAnswer>();
    public DbSet<UserAudioRecord> UserAudioRecords => Set<UserAudioRecord>();
    public DbSet<SavedQuestion> SavedQuestions => Set<SavedQuestion>();
    public DbSet<ScoringRubric> ScoringRubrics => Set<ScoringRubric>();
    public DbSet<ScoringResult> ScoringResults => Set<ScoringResult>();
    public DbSet<AiFeedback> AiFeedbacks => Set<AiFeedback>();
    public DbSet<SpeechTranscript> SpeechTranscripts => Set<SpeechTranscript>();
    public DbSet<PhonemeAnalysis> PhonemeAnalyses => Set<PhonemeAnalysis>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<ExamTag> ExamTags => Set<ExamTag>();
    public DbSet<Notification> Notifications => Set<Notification>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.Email).HasColumnName("email").HasMaxLength(255).IsRequired();
            entity.HasIndex(e => e.Email).IsUnique();
            entity.Property(e => e.PasswordHash).HasColumnName("passwordHash").HasMaxLength(255).IsRequired();
            entity.Property(e => e.DisplayName).HasColumnName("displayName").HasMaxLength(255);
            entity.Property(e => e.AvatarUrl).HasColumnName("avatarUrl").HasMaxLength(500);
            entity.Property(e => e.IsActive).HasColumnName("isActive").HasDefaultValue(true);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updatedAt").HasDefaultValueSql("GETDATE()");
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.ToTable("roles");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(50).IsRequired();
            entity.HasIndex(e => e.Name).IsUnique();
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.ToTable("user_roles");
            entity.HasKey(e => new { e.UserId, e.RoleId });
            entity.Property(e => e.UserId).HasColumnName("userId").HasMaxLength(36);
            entity.Property(e => e.RoleId).HasColumnName("roleId").HasMaxLength(36);
            entity.HasOne(e => e.User).WithMany(u => u.UserRoles).HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Role).WithMany(r => r.UserRoles).HasForeignKey(e => e.RoleId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.ToTable("subscriptions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Price).HasColumnName("price").HasColumnType("decimal(18,2)");
            entity.Property(e => e.DurationDays).HasColumnName("durationDays");
            entity.Property(e => e.Features).HasColumnName("features");
            entity.Property(e => e.IsActive).HasColumnName("isActive").HasDefaultValue(true);
        });

        modelBuilder.Entity<UserSubscription>(entity =>
        {
            entity.ToTable("user_subscriptions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.UserId).HasColumnName("userId").HasMaxLength(36);
            entity.Property(e => e.SubscriptionId).HasColumnName("subscriptionId").HasMaxLength(36);
            entity.Property(e => e.StartDate).HasColumnName("startDate");
            entity.Property(e => e.EndDate).HasColumnName("endDate");
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(50);
            entity.HasOne(e => e.User).WithMany(u => u.UserSubscriptions).HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Subscription).WithMany(s => s.UserSubscriptions).HasForeignKey(e => e.SubscriptionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("payments");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.UserId).HasColumnName("userId").HasMaxLength(36);
            entity.Property(e => e.Amount).HasColumnName("amount").HasColumnType("decimal(18,2)");
            entity.Property(e => e.PaymentMethod).HasColumnName("paymentMethod").HasMaxLength(50);
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(50);
            entity.Property(e => e.TransactionId).HasColumnName("transactionId").HasMaxLength(255);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
            entity.HasOne(e => e.User).WithMany(u => u.Payments).HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Exam>(entity =>
        {
            entity.ToTable("exams");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.DurationMinutes).HasColumnName("durationMinutes");
            entity.Property(e => e.TotalPoints).HasColumnName("totalPoints");
            entity.Property(e => e.ExamType).HasColumnName("examType").HasMaxLength(50);
            entity.Property(e => e.SourcePdfUrl).HasColumnName("sourcePdfUrl").HasMaxLength(500);
            entity.Property(e => e.IsPublished).HasColumnName("isPublished").HasDefaultValue(false);
            entity.Property(e => e.CreatedBy).HasColumnName("createdBy").HasMaxLength(36);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
            entity.HasOne(e => e.Creator).WithMany(u => u.CreatedExams).HasForeignKey(e => e.CreatedBy).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ExamSection>(entity =>
        {
            entity.ToTable("exam_sections");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.ExamId).HasColumnName("examId").HasMaxLength(36);
            entity.Property(e => e.SkillType).HasColumnName("skillType").HasMaxLength(50).IsRequired();
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255);
            entity.Property(e => e.OrderIndex).HasColumnName("orderIndex");
            entity.HasOne(e => e.Exam).WithMany(ex => ex.ExamSections).HasForeignKey(e => e.ExamId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ReadingPassage>(entity =>
        {
            entity.ToTable("reading_passages");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.SectionId).HasColumnName("sectionId").HasMaxLength(36);
            entity.Property(e => e.PassageNumber).HasColumnName("passageNumber");
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255);
            entity.Property(e => e.ParagraphsData).HasColumnName("paragraphsData");
            entity.Property(e => e.AssetsData).HasColumnName("assetsData");
            entity.HasOne(e => e.Section).WithMany(s => s.ReadingPassages).HasForeignKey(e => e.SectionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ListeningPart>(entity =>
        {
            entity.ToTable("listening_parts");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.SectionId).HasColumnName("sectionId").HasMaxLength(36);
            entity.Property(e => e.PartNumber).HasColumnName("partNumber");
            entity.Property(e => e.AudioUrl).HasColumnName("audioUrl").HasMaxLength(500).IsRequired();
            entity.Property(e => e.ContextDescription).HasColumnName("contextDescription");
            entity.HasOne(e => e.Section).WithMany(s => s.ListeningParts).HasForeignKey(e => e.SectionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<WritingTask>(entity =>
        {
            entity.ToTable("writing_tasks");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.SectionId).HasColumnName("sectionId").HasMaxLength(36);
            entity.Property(e => e.TaskNumber).HasColumnName("taskNumber");
            entity.Property(e => e.PromptText).HasColumnName("promptText").IsRequired();
            entity.Property(e => e.AssetsData).HasColumnName("assetsData");
            entity.Property(e => e.MinWords).HasColumnName("minWords").HasDefaultValue(150);
            entity.HasOne(e => e.Section).WithMany(s => s.WritingTasks).HasForeignKey(e => e.SectionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SpeakingPart>(entity =>
        {
            entity.ToTable("speaking_parts");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.SectionId).HasColumnName("sectionId").HasMaxLength(36);
            entity.Property(e => e.PartNumber).HasColumnName("partNumber");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.HasOne(e => e.Section).WithMany(s => s.SpeakingParts).HasForeignKey(e => e.SectionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SpeakingQuestion>(entity =>
        {
            entity.ToTable("speaking_questions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.PartId).HasColumnName("partId").HasMaxLength(36);
            entity.Property(e => e.Content).HasColumnName("content").IsRequired();
            entity.Property(e => e.CueCardPoints).HasColumnName("cueCardPoints");
            entity.Property(e => e.AudioPromptUrl).HasColumnName("audioPromptUrl").HasMaxLength(500);
            entity.Property(e => e.OrderIndex).HasColumnName("orderIndex");
            entity.HasOne(e => e.Part).WithMany(p => p.SpeakingQuestions).HasForeignKey(e => e.PartId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<QuestionGroup>(entity =>
        {
            entity.ToTable("question_groups");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.PassageId).HasColumnName("passageId").HasMaxLength(36);
            entity.Property(e => e.ListeningPartId).HasColumnName("listeningPartId").HasMaxLength(36);
            entity.Property(e => e.GroupType).HasColumnName("groupType").HasMaxLength(50);
            entity.Property(e => e.Instruction).HasColumnName("instruction");
            entity.Property(e => e.ContentData).HasColumnName("contentData");
            entity.Property(e => e.AssetsData).HasColumnName("assetsData");
            entity.Property(e => e.StartQuestion).HasColumnName("startQuestion");
            entity.Property(e => e.EndQuestion).HasColumnName("endQuestion");
            entity.HasOne(e => e.Passage).WithMany(p => p.QuestionGroups).HasForeignKey(e => e.PassageId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.ListeningPart).WithMany(l => l.QuestionGroups).HasForeignKey(e => e.ListeningPartId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<Question>(entity =>
        {
            entity.ToTable("questions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.GroupId).HasColumnName("groupId").HasMaxLength(36);
            entity.Property(e => e.QuestionNumber).HasColumnName("questionNumber");
            entity.Property(e => e.Content).HasColumnName("content");
            entity.Property(e => e.CorrectAnswer).HasColumnName("correctAnswer");
            entity.Property(e => e.Explanation).HasColumnName("explanation");
            entity.Property(e => e.Provenance).HasColumnName("provenance");
            entity.Property(e => e.EvidenceLocation).HasColumnName("evidenceLocation");
            entity.Property(e => e.Points).HasColumnName("points").HasDefaultValue(1.0);
            entity.HasOne(e => e.Group).WithMany(g => g.Questions).HasForeignKey(e => e.GroupId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<QuestionOption>(entity =>
        {
            entity.ToTable("question_options");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.QuestionId).HasColumnName("questionId").HasMaxLength(36);
            entity.Property(e => e.OptionText).HasColumnName("optionText").IsRequired();
            entity.Property(e => e.IsCorrect).HasColumnName("isCorrect").HasDefaultValue(false);
            entity.Property(e => e.OrderIndex).HasColumnName("orderIndex");
            entity.HasOne(e => e.Question).WithMany(q => q.QuestionOptions).HasForeignKey(e => e.QuestionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DocumentUpload>(entity =>
        {
            entity.ToTable("document_uploads");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.UploadedBy).HasColumnName("uploadedBy").HasMaxLength(36);
            entity.Property(e => e.FileName).HasColumnName("fileName").HasMaxLength(255);
            entity.Property(e => e.FileUrl).HasColumnName("fileUrl").HasMaxLength(500).IsRequired();
            entity.Property(e => e.ProcessStatus).HasColumnName("processStatus").HasMaxLength(50).HasDefaultValue("Pending");
            entity.Property(e => e.ErrorMessage).HasColumnName("errorMessage");
            entity.Property(e => e.GeneratedExamId).HasColumnName("generatedExamId").HasMaxLength(36);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.UpdatedAt).HasColumnName("updatedAt").HasDefaultValueSql("GETDATE()");
            entity.HasOne(e => e.Uploader).WithMany(u => u.DocumentUploads).HasForeignKey(e => e.UploadedBy).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.GeneratedExam).WithMany(ex => ex.DocumentUploads).HasForeignKey(e => e.GeneratedExamId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ExamSession>(entity =>
        {
            entity.ToTable("exam_sessions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.UserId).HasColumnName("userId").HasMaxLength(36);
            entity.Property(e => e.ExamId).HasColumnName("examId").HasMaxLength(36);
            entity.Property(e => e.Status).HasColumnName("status").HasMaxLength(50);
            entity.Property(e => e.StartedAt).HasColumnName("startedAt").HasDefaultValueSql("GETDATE()");
            entity.Property(e => e.EndedAt).HasColumnName("endedAt");
            entity.Property(e => e.TimeRemaining).HasColumnName("timeRemaining");
            entity.HasOne(e => e.User).WithMany(u => u.ExamSessions).HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Exam).WithMany(ex => ex.ExamSessions).HasForeignKey(e => e.ExamId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserAnswer>(entity =>
        {
            entity.ToTable("user_answers");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.SessionId).HasColumnName("sessionId").HasMaxLength(36);
            entity.Property(e => e.QuestionId).HasColumnName("questionId").HasMaxLength(36);
            entity.Property(e => e.WritingTaskId).HasColumnName("writingTaskId").HasMaxLength(36);
            entity.Property(e => e.AnswerText).HasColumnName("answerText");
            entity.Property(e => e.ScoreEarned).HasColumnName("scoreEarned").HasDefaultValue(0.0);
            entity.Property(e => e.SubmittedAt).HasColumnName("submittedAt").HasDefaultValueSql("GETDATE()");
            entity.HasOne(e => e.Session).WithMany(s => s.UserAnswers).HasForeignKey(e => e.SessionId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Question).WithMany(q => q.UserAnswers).HasForeignKey(e => e.QuestionId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(e => e.WritingTask).WithMany(w => w.UserAnswers).HasForeignKey(e => e.WritingTaskId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<UserAudioRecord>(entity =>
        {
            entity.ToTable("user_audio_records");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.AnswerId).HasColumnName("answerId").HasMaxLength(36);
            entity.Property(e => e.AudioUrl).HasColumnName("audioUrl").HasMaxLength(500).IsRequired();
            entity.Property(e => e.DurationSeconds).HasColumnName("durationSeconds");
            entity.Property(e => e.FileSizeKB).HasColumnName("fileSizeKB");
            entity.HasOne(e => e.Answer).WithMany(a => a.UserAudioRecords).HasForeignKey(e => e.AnswerId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SavedQuestion>(entity =>
        {
            entity.ToTable("saved_questions");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.UserId).HasColumnName("userId").HasMaxLength(36);
            entity.Property(e => e.QuestionId).HasColumnName("questionId").HasMaxLength(36);
            entity.Property(e => e.Note).HasColumnName("note");
            entity.Property(e => e.SavedAt).HasColumnName("savedAt").HasDefaultValueSql("GETDATE()");
            entity.HasOne(e => e.User).WithMany(u => u.SavedQuestions).HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Question).WithMany(q => q.SavedQuestions).HasForeignKey(e => e.QuestionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ScoringRubric>(entity =>
        {
            entity.ToTable("scoring_rubrics");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.SkillType).HasColumnName("skillType").HasMaxLength(50);
            entity.Property(e => e.CriteriaName).HasColumnName("criteriaName").HasMaxLength(100);
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.MaxBand).HasColumnName("maxBand");
        });

        modelBuilder.Entity<ScoringResult>(entity =>
        {
            entity.ToTable("scoring_results");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.SessionId).HasColumnName("sessionId").HasMaxLength(36);
            entity.Property(e => e.TotalBandScore).HasColumnName("totalBandScore");
            entity.Property(e => e.ReadingScore).HasColumnName("readingScore");
            entity.Property(e => e.ListeningScore).HasColumnName("listeningScore");
            entity.Property(e => e.WritingScore).HasColumnName("writingScore");
            entity.Property(e => e.SpeakingScore).HasColumnName("speakingScore");
            entity.Property(e => e.OverallFeedback).HasColumnName("overallFeedback");
            entity.Property(e => e.ScoredAt).HasColumnName("scoredAt").HasDefaultValueSql("GETDATE()");
            entity.HasOne(e => e.Session).WithMany(s => s.ScoringResults).HasForeignKey(e => e.SessionId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiFeedback>(entity =>
        {
            entity.ToTable("ai_feedbacks");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.AnswerId).HasColumnName("answerId").HasMaxLength(36);
            entity.Property(e => e.RubricId).HasColumnName("rubricId").HasMaxLength(36);
            entity.Property(e => e.BandScore).HasColumnName("bandScore");
            entity.Property(e => e.AiComment).HasColumnName("aiComment");
            entity.Property(e => e.Improvements).HasColumnName("improvements");
            entity.HasOne(e => e.Answer).WithMany(a => a.AiFeedbacks).HasForeignKey(e => e.AnswerId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Rubric).WithMany(r => r.AiFeedbacks).HasForeignKey(e => e.RubricId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SpeechTranscript>(entity =>
        {
            entity.ToTable("speech_transcripts");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.AudioRecordId).HasColumnName("audioRecordId").HasMaxLength(36);
            entity.Property(e => e.TranscriptText).HasColumnName("transcriptText");
            entity.Property(e => e.ConfidenceScore).HasColumnName("confidenceScore");
            entity.Property(e => e.WordErrorRate).HasColumnName("wordErrorRate");
            entity.HasOne(e => e.AudioRecord).WithMany(a => a.SpeechTranscripts).HasForeignKey(e => e.AudioRecordId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PhonemeAnalysis>(entity =>
        {
            entity.ToTable("phoneme_analyses");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.TranscriptId).HasColumnName("transcriptId").HasMaxLength(36);
            entity.Property(e => e.Word).HasColumnName("word").HasMaxLength(100);
            entity.Property(e => e.ExpectedPhoneme).HasColumnName("expectedPhoneme").HasMaxLength(100);
            entity.Property(e => e.ActualPhoneme).HasColumnName("actualPhoneme").HasMaxLength(100);
            entity.Property(e => e.IsCorrect).HasColumnName("isCorrect");
            entity.HasOne(e => e.Transcript).WithMany(t => t.PhonemeAnalyses).HasForeignKey(e => e.TranscriptId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.ToTable("tags");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.Name).HasColumnName("name").HasMaxLength(100).IsRequired();
            entity.HasIndex(e => e.Name).IsUnique();
        });

        modelBuilder.Entity<ExamTag>(entity =>
        {
            entity.ToTable("exam_tags");
            entity.HasKey(e => new { e.ExamId, e.TagId });
            entity.Property(e => e.ExamId).HasColumnName("examId").HasMaxLength(36);
            entity.Property(e => e.TagId).HasColumnName("tagId").HasMaxLength(36);
            entity.HasOne(e => e.Exam).WithMany(ex => ex.ExamTags).HasForeignKey(e => e.ExamId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Tag).WithMany(t => t.ExamTags).HasForeignKey(e => e.TagId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.ToTable("notifications");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).HasColumnName("id").HasMaxLength(36);
            entity.Property(e => e.UserId).HasColumnName("userId").HasMaxLength(36);
            entity.Property(e => e.Title).HasColumnName("title").HasMaxLength(255).IsRequired();
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.IsRead).HasColumnName("isRead").HasDefaultValue(false);
            entity.Property(e => e.CreatedAt).HasColumnName("createdAt").HasDefaultValueSql("GETDATE()");
            entity.HasOne(e => e.User).WithMany(u => u.Notifications).HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
