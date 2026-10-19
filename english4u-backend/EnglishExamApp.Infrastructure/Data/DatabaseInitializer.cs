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

        // Ensure flashcard tables exist in SQLite
        try
        {
            await context.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS flashcard_decks (
                    id TEXT PRIMARY KEY,
                    userId TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    color TEXT DEFAULT '#3b82f6',
                    icon TEXT DEFAULT 'Book',
                    isPublic INTEGER DEFAULT 0,
                    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS flashcard_items (
                    id TEXT PRIMARY KEY,
                    deckId TEXT NOT NULL,
                    userId TEXT NOT NULL,
                    word TEXT NOT NULL,
                    phonetic TEXT,
                    partOfSpeech TEXT,
                    meaningVi TEXT NOT NULL,
                    definitionEn TEXT,
                    exampleSentence TEXT,
                    exampleSentenceVi TEXT,
                    collocations TEXT,
                    imageUrl TEXT,
                    audioUrl TEXT,
                    contextNote TEXT,
                    quizDistractors TEXT,
                    repetitions INTEGER DEFAULT 0,
                    easeFactor REAL DEFAULT 2.5,
                    intervalDays INTEGER DEFAULT 0,
                    nextReviewDate TEXT DEFAULT CURRENT_TIMESTAMP,
                    lastReviewedAt TEXT,
                    reviewCount INTEGER DEFAULT 0,
                    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (deckId) REFERENCES flashcard_decks (id) ON DELETE CASCADE,
                    FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
                );
            ");

            try
            {
                await context.Database.ExecuteSqlRawAsync("ALTER TABLE flashcard_items ADD COLUMN quizDistractors TEXT;");
            }
            catch
            {
                // Column already exists or freshly created
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "[!] Could not run flashcard tables check.");
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

        // 4. Seed Default IELTS Flashcard Deck
        var existingDeck = await context.FlashcardDecks.Include(d => d.Items).FirstOrDefaultAsync(d => d.Title.Contains("IELTS Band 7.0+"));
        if (existingDeck == null)
        {
            var targetUserId = existingAdmin?.Id ?? existingStudent?.Id ?? Guid.NewGuid();
            var sampleDeck = new FlashcardDeck
            {
                Id = Guid.NewGuid(),
                UserId = targetUserId,
                Title = "Từ vựng IELTS Band 7.0+ thiết yếu",
                Description = "Bộ từ vựng học thuật đỉnh cao với hình ảnh 3D và phiên âm chuẩn, giúp bạn ghi điểm tuyệt đối trong Reading & Writing.",
                Color = "#2563eb",
                Icon = "Sparkles",
                IsPublic = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var sampleCards = new List<FlashcardItem>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    DeckId = sampleDeck.Id,
                    UserId = targetUserId,
                    Word = "ubiquitous",
                    Phonetic = "/juːˈbɪk.wɪ.təs/",
                    PartOfSpeech = "adjective",
                    MeaningVi = "phổ biến, có mặt ở khắp mọi nơi",
                    DefinitionEn = "present, appearing, or found everywhere",
                    ExampleSentence = "Smartphones have become ubiquitous in almost every aspect of contemporary life.",
                    ExampleSentenceVi = "Điện thoại thông minh đã trở nên phổ biến ở hầu hết mọi khía cạnh của cuộc sống hiện đại.",
                    Collocations = "ubiquitous presence, ubiquitous technology, become ubiquitous",
                    ImageUrl = "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c1/Six_weeks_old_cat_%28aka%29.jpg/500px-Six_weeks_old_cat_%28aka%29.jpg",
                    ContextNote = "IELTS Writing Task 2 - Technology topic",
                    QuizDistractors = "hiếm gặp, khó tìm | chỉ xuất hiện ở một số ít nơi | mang tính chất tạm thời"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    DeckId = sampleDeck.Id,
                    UserId = targetUserId,
                    Word = "ameliorate",
                    Phonetic = "/əˈmiː.li.ə.reɪt/",
                    PartOfSpeech = "verb",
                    MeaningVi = "cải thiện, làm cho tốt hơn (tình trạng xấu)",
                    DefinitionEn = "to make something bad or unsatisfactory better",
                    ExampleSentence = "Investing in public transit is an effective measure to ameliorate urban traffic congestion.",
                    ExampleSentenceVi = "Đầu tư vào giao thông công cộng là một biện pháp hữu hiệu để cải thiện tình trạng ùn tắc giao thông đô thị.",
                    Collocations = "ameliorate the situation, ameliorate poverty, ameliorate living conditions",
                    ImageUrl = "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Orbe-Agiez_Syndicat_am%C3%A9liorations_foncieres.jpg/500px-Orbe-Agiez_Syndicat_am%C3%A9liorations_foncieres.jpg",
                    ContextNote = "IELTS Writing Task 2 - Environment & Transport",
                    QuizDistractors = "làm cho tồi tệ hơn | giữ nguyên hiện trạng | phá hủy hoàn toàn"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    DeckId = sampleDeck.Id,
                    UserId = targetUserId,
                    Word = "resilient",
                    Phonetic = "/rɪˈzɪl.jənt/",
                    PartOfSpeech = "adjective",
                    MeaningVi = "kiên cường, có khả năng phục hồi nhanh chóng",
                    DefinitionEn = "able to withstand or recover quickly from difficult conditions",
                    ExampleSentence = "Economies with diverse industries tend to be more resilient during financial crises.",
                    ExampleSentenceVi = "Các nền kinh tế có các ngành công nghiệp đa dạng có xu hướng kiên cường hơn trong các cuộc khủng hoảng tài chính.",
                    Collocations = "resilient economy, resilient workforce, highly resilient",
                    ImageUrl = "https://upload.wikimedia.org/wikipedia/commons/9/9d/Resilient_tree_-_geograph.org.uk_-_1458335.jpg",
                    ContextNote = "IELTS Reading - Ecology & Economy",
                    QuizDistractors = "dễ vỡ, mỏng manh | buông xuôi khi gặp khó | thiếu tính ổn định"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    DeckId = sampleDeck.Id,
                    UserId = targetUserId,
                    Word = "procrastinate",
                    Phonetic = "/prəʊˈkræs.tɪ.neɪt/",
                    PartOfSpeech = "verb",
                    MeaningVi = "trì hoãn, chần chừ làm việc cần làm",
                    DefinitionEn = "to delay or postpone action; put off doing something",
                    ExampleSentence = "Students often procrastinate when confronted with demanding research assignments.",
                    ExampleSentenceVi = "Sinh viên thường trì hoãn khi phải đối mặt với các bài tập nghiên cứu đòi hỏi nhiều nỗ lực.",
                    Collocations = "tend to procrastinate, chronic procrastinator, procrastinate on tasks",
                    ImageUrl = "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2e/Procrastination_Crossword.jpg/500px-Procrastination_Crossword.jpg",
                    ContextNote = "IELTS Speaking Part 1 - Studies and Time Management",
                    QuizDistractors = "đẩy nhanh tiến độ | hành động quyết liệt ngay | kết thúc sớm hơn dự định"
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    DeckId = sampleDeck.Id,
                    UserId = targetUserId,
                    Word = "lucrative",
                    Phonetic = "/ˈluː.krə.tɪv/",
                    PartOfSpeech = "adjective",
                    MeaningVi = "sinh lợi cao, béo bở, đem lại nhiều tiền",
                    DefinitionEn = "producing a great deal of profit",
                    ExampleSentence = "Software engineering remains one of the most lucrative career paths for young graduates.",
                    ExampleSentenceVi = "Kỹ thuật phần mềm vẫn là một trong những con đường sự nghiệp béo bở nhất đối với sinh viên mới tốt nghiệp.",
                    Collocations = "lucrative market, lucrative business, lucrative career",
                    ImageUrl = "https://images.unsplash.com/photo-1553729459-efe14ef6055d?w=500&q=80",
                    ContextNote = "IELTS Speaking Part 2 - Jobs and Business",
                    QuizDistractors = "thua lỗ, tốn kém | vô ích, không có giá trị | mang tính phi lợi nhuận"
                }
            };

            foreach (var card in sampleCards)
            {
                sampleDeck.Items.Add(card);
            }

            context.FlashcardDecks.Add(sampleDeck);
            logger.LogInformation("[+] Prepared sample IELTS Band 7.0+ Flashcard Deck with {Count} cards.", sampleCards.Count);
        }

        await context.SaveChangesAsync();
        logger.LogInformation("[+] Database initialization and user seeding completed.");
    }
}
