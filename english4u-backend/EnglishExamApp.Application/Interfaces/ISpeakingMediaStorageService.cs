namespace EnglishExamApp.Application.Interfaces;

public sealed record StoredSpeakingMediaDto(
    string AudioUrl,
    int FileSizeKB);

public interface ISpeakingMediaStorageService
{
    Task<StoredSpeakingMediaDto> SaveAsync(
        Guid sessionId,
        Guid speakingQuestionId,
        string originalFileName,
        Stream content,
        CancellationToken cancellationToken = default);

    Task<StoredSpeakingMediaDto> SavePromptAsync(
        string originalFileName,
        Stream content,
        CancellationToken cancellationToken = default);
}
