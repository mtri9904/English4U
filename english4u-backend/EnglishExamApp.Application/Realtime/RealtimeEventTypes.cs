namespace EnglishExamApp.Application.Realtime;

public static class RealtimeEventTypes
{
    public const string NotificationsChanged = "notifications.changed";
    public const string ExamsChanged = "exams.changed";
    public const string UsersPresenceChanged = "users.presence.changed";
    public const string ExamPdfGenerationProgress = "exam.pdf-generation.progress";
}
