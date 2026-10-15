using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Data;

public static class DatabaseInitializer
{
    public static async Task InitializeDatabaseAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<ApplicationDbContext>>();

        logger.LogInformation("[*] Ensuring SQLite database and tables are created...");
        var dbFile = "english4u.db";
        var b64File = "english4u.db.b64";
        var candidateB64 = File.Exists(b64File) ? b64File : (File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, b64File)) ? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, b64File) : null);
        if (!File.Exists(dbFile) && !File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, dbFile)) && candidateB64 != null)
        {
            try
            {
                logger.LogInformation("[*] Restoring database from base64 seed template ({Path})...", candidateB64);
                var b64Content = File.ReadAllText(candidateB64).Trim();
                var dbBytes = Convert.FromBase64String(b64Content);
                File.WriteAllBytes(dbFile, dbBytes);
                logger.LogInformation("[+] Database successfully restored from base64 template ({Bytes} bytes).", dbBytes.Length);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[!] Failed to restore database from base64 template.");
            }
        }

        var creator = context.Database.GetService<IDatabaseCreator>() as RelationalDatabaseCreator;
        if (creator != null)
        {
            if (!await creator.ExistsAsync())
            {
                await creator.CreateAsync();
            }
            if (!await creator.HasTablesAsync())
            {
                await creator.CreateTablesAsync();
            }
        }
        else
        {
            await context.Database.EnsureCreatedAsync();
        }

        // 1. Seed Roles
        var seedRoles = new[] { "Admin", "Student", "Teacher", "ContentCreator" };
        var roleEntities = new Dictionary<string, Role>(StringComparer.OrdinalIgnoreCase);

        foreach (var roleName in seedRoles)
        {
            var existingRole = await context.Roles.FirstOrDefaultAsync(r => r.Name == roleName);
            if (existingRole == null)
            {
                existingRole = new Role
                {
                    Id = Guid.NewGuid(),
                    Name = roleName
                };
                context.Roles.Add(existingRole);
            }
            roleEntities[roleName] = existingRole;
        }
        await context.SaveChangesAsync();

        // 2. Seed CMS Admin Account
        var adminEmail = "admin@english4u.com";
        var existingAdmin = await context.Users.Include(u => u.UserRoles).FirstOrDefaultAsync(u => u.Email == adminEmail);
        if (existingAdmin == null)
        {
            var adminUser = new User
            {
                Id = Guid.NewGuid(),
                Email = adminEmail,
                DisplayName = "Quản Trị Viên (CMS)",
                PasswordHash = passwordHasher.HashPassword("Admin@123456"),
                Provider = "local",
                IsActive = true,
                IsEmailConfirmed = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            context.Users.Add(adminUser);
            context.UserRoles.Add(new UserRole
            {
                UserId = adminUser.Id,
                RoleId = roleEntities["Admin"].Id
            });
            logger.LogInformation("[+] Created CMS Admin account: {Email} / Admin@123456", adminEmail);
        }
        else
        {
            existingAdmin.PasswordHash = passwordHasher.HashPassword("Admin@123456");
            existingAdmin.IsActive = true;
            existingAdmin.IsEmailConfirmed = true;
            if (!existingAdmin.UserRoles.Any(ur => ur.RoleId == roleEntities["Admin"].Id))
            {
                existingAdmin.UserRoles.Add(new UserRole
                {
                    UserId = existingAdmin.Id,
                    RoleId = roleEntities["Admin"].Id
                });
            }
            logger.LogInformation("[+] Verified and refreshed CMS Admin account: {Email} / Admin@123456", adminEmail);
        }

        // Cấp quyền Admin cho tài khoản Google của chủ sở hữu nếu có
        var ownerEmail = "minhtritamm@gmail.com";
        var existingOwner = await context.Users.Include(u => u.UserRoles).FirstOrDefaultAsync(u => u.Email == ownerEmail);
        if (existingOwner != null)
        {
            existingOwner.IsActive = true;
            existingOwner.IsEmailConfirmed = true;
            if (!existingOwner.UserRoles.Any(ur => ur.RoleId == roleEntities["Admin"].Id))
            {
                existingOwner.UserRoles.Add(new UserRole
                {
                    UserId = existingOwner.Id,
                    RoleId = roleEntities["Admin"].Id
                });
                logger.LogInformation("[+] Granted Admin role to owner account: {Email}", ownerEmail);
            }
        }

        // 3. Seed Client Student Account
        var studentEmail = "student@english4u.com";
        var existingStudent = await context.Users.Include(u => u.UserRoles).FirstOrDefaultAsync(u => u.Email == studentEmail);
        if (existingStudent == null)
        {
            var studentUser = new User
            {
                Id = Guid.NewGuid(),
                Email = studentEmail,
                DisplayName = "Học Viên (Client)",
                PasswordHash = passwordHasher.HashPassword("Student@123456"),
                Provider = "local",
                IsActive = true,
                IsEmailConfirmed = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            context.Users.Add(studentUser);
            context.UserRoles.Add(new UserRole
            {
                UserId = studentUser.Id,
                RoleId = roleEntities["Student"].Id
            });
            logger.LogInformation("[+] Created Client Student account: {Email} / Student@123456", studentEmail);
        }

        await context.SaveChangesAsync();
        logger.LogInformation("[+] Database initialization and user seeding completed.");
    }
}
