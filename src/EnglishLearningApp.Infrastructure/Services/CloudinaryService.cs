using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using EnglishLearningApp.Domain.Services;
using EnglishLearningApp.Infrastructure.Settings;
using Microsoft.Extensions.Options;

namespace EnglishLearningApp.Infrastructure.Services;

public class CloudinaryService : IMediaService
{
    private readonly Cloudinary _cloudinary;

    public CloudinaryService(IOptions<CloudinarySettings> options)
    {
        var settings = options.Value;
        var account = new Account(settings.CloudName, settings.ApiKey, settings.ApiSecret);
        _cloudinary = new Cloudinary(account) { Api = { Secure = true } };
    }

    public async Task<string> UploadImageAsync(Stream stream, string fileName)
    {
        var uploadParams = new ImageUploadParams
        {
            File = new FileDescription(fileName, stream),
            Folder = "english4u/images",
            Transformation = new Transformation().Quality("auto").FetchFormat("auto")
        };

        var result = await _cloudinary.UploadAsync(uploadParams);

        if (result.Error is not null)
            throw new InvalidOperationException($"Upload ảnh thất bại: {result.Error.Message}");

        return result.SecureUrl.ToString();
    }

    public async Task<string> UploadAudioAsync(Stream stream, string fileName)
    {
        var uploadParams = new VideoUploadParams
        {
            File = new FileDescription(fileName, stream),
            Folder = "english4u/audio"
        };

        var result = await _cloudinary.UploadAsync(uploadParams);

        if (result.Error is not null)
            throw new InvalidOperationException($"Upload audio thất bại: {result.Error.Message}");

        return result.SecureUrl.ToString();
    }

    public async Task DeleteAsync(string publicId)
    {
        var deleteParams = new DeletionParams(publicId);
        await _cloudinary.DestroyAsync(deleteParams);
    }
}
