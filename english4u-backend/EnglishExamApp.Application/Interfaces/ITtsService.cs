namespace EnglishExamApp.Application.Interfaces;

public interface ITtsService
{
    Task<byte[]?> SynthesizeSpeechAsync(
        string text,
        string voice = "en-US-JennyNeural",
        string? rate = null,
        CancellationToken cancellationToken = default);
}
