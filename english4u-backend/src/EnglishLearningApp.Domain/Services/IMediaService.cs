namespace EnglishLearningApp.Domain.Services;

public interface IMediaService
{
    Task<string> UploadImageAsync(Stream stream, string fileName);
    Task<string> UploadAudioAsync(Stream stream, string fileName);
    Task DeleteAsync(string publicId);
}
