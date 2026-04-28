namespace EnglishExamApp.Domain.Entities;

public class UserAnswer
{
    public Guid Id { get; set; }
    public Guid SessionId { get; set; }
    public Guid? QuestionId { get; set; }
    public Guid? WritingTaskId { get; set; }
    public Guid? SpeakingQuestionId { get; set; }
    public string? AnswerText { get; set; }
    public double ScoreEarned { get; set; }
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;

    public ExamSession Session { get; set; } = null!;
    public Question? Question { get; set; }
    public WritingTask? WritingTask { get; set; }
    public SpeakingQuestion? SpeakingQuestion { get; set; }
    public ICollection<UserAudioRecord> UserAudioRecords { get; set; } = [];
    public ICollection<AiFeedback> AiFeedbacks { get; set; } = [];
}
