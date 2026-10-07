using Microsoft.Extensions.Configuration;

namespace ETransport.Infrastructure.Storage;

public interface IFileStorageService
{
    Task<string> UploadAsync(Stream stream, string fileName, string contentType);
    Task<Stream?> DownloadAsync(string objectKey);
    Task DeleteAsync(string objectKey);
}

/// <summary>
/// Lokal disk saqlash (docker volume). MinIO keyinchalik shu interfeys orqali almashtiriladi.
/// </summary>
public class LocalFileStorageService(IConfiguration configuration) : IFileStorageService
{
    private string Root =>
        configuration["FileStorage:Root"]
        ?? configuration["MinIO:LocalFallbackRoot"]
        ?? "/var/etransport/uploads";

    public async Task<string> UploadAsync(Stream stream, string fileName, string contentType)
    {
        Directory.CreateDirectory(Root);
        var safeName = SanitizeFileName(fileName);
        var key = $"{DateTime.UtcNow:yyyy/MM}/{Guid.NewGuid():N}_{safeName}";
        var fullPath = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
        await using var fs = File.Create(fullPath);
        await stream.CopyToAsync(fs);
        return key;
    }

    public Task<Stream?> DownloadAsync(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey) || objectKey.Contains("..", StringComparison.Ordinal))
            return Task.FromResult<Stream?>(null);

        // Muhim: objectKey har doim Root ichidagi nisbiy yo'l sifatida talqin qilinadi.
        // Absolyut yo'lni to'g'ridan-to'g'ri ochish (masalan "/etc/passwd") ataylab
        // olib tashlangan — aks holda chaqiruvchi tomondan berilgan istalgan qiymat
        // serverdagi istalgan o'qiladigan faylni ochib berardi.
        var fullPath = ResolvePath(objectKey);
        if (File.Exists(fullPath))
            return Task.FromResult<Stream?>(File.OpenRead(fullPath));

        var fileName = Path.GetFileName(objectKey);
        var directPath = Path.Combine(Root, fileName);
        if (File.Exists(directPath))
            return Task.FromResult<Stream?>(File.OpenRead(directPath));

        if (Directory.Exists(Root))
        {
            try
            {
                var matches = Directory.GetFiles(Root, fileName, SearchOption.AllDirectories);
                if (matches.Length > 0)
                    return Task.FromResult<Stream?>(File.OpenRead(matches[0]));
            }
            catch { }
        }

        return Task.FromResult<Stream?>(null);
    }

    public Task DeleteAsync(string objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey) || objectKey.Contains("..", StringComparison.Ordinal))
            return Task.CompletedTask;

        var fullPath = ResolvePath(objectKey);
        if (File.Exists(fullPath))
            File.Delete(fullPath);
        return Task.CompletedTask;
    }

    private string ResolvePath(string objectKey)
    {
        var relative = objectKey.Replace('/', Path.DirectorySeparatorChar).TrimStart(Path.DirectorySeparatorChar);
        return Path.Combine(Root, relative);
    }

    private static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName?.Trim() ?? "file");
        if (string.IsNullOrWhiteSpace(name)) name = "file";
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '_');
        return name.Length > 180 ? name[^180..] : name;
    }
}
