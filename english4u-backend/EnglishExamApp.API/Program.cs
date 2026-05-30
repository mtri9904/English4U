using System.Data.Common;
using System.IdentityModel.Tokens.Jwt;
using EnglishExamApp.API.Authentication;
using EnglishExamApp.API.Payments;
using EnglishExamApp.API.Realtime;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Infrastructure.Data;
using EnglishExamApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
if (builder.Environment.IsDevelopment())
{
    builder.Logging.ClearProviders();
    builder.Logging.AddConsole();
    builder.Logging.AddDebug();
}

var jwtKey = RequireConfiguration(builder.Configuration, "Jwt:Key");
var defaultConnectionString = RequireConnectionString(builder.Configuration, "DefaultConnection");
if (builder.Environment.IsDevelopment())
{
    defaultConnectionString = AddDevelopmentSqlServerDefaults(defaultConnectionString);
}

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters =
            JwtAuthenticationConfiguration.CreateTokenValidationParameters(builder.Configuration, jwtKey);
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(defaultConnectionString));

builder.Services.AddScoped<IApplicationDbContext>(provider =>
    provider.GetRequiredService<ApplicationDbContext>());
builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IAuthCodeGenerator, SecureAuthCodeGenerator>();
builder.Services.AddScoped<IVnpayPaymentService, VnpayPaymentService>();

builder.Services.AddScoped<IExamService, ExamService>();
builder.Services.AddScoped<IExamExecutionService, ExamExecutionService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IUserPresenceService, UserPresenceService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IPasswordHasher, Pbkdf2PasswordHasher>();
builder.Services.AddScoped<ISpeakingMediaStorageService, LocalSpeakingMediaStorageService>();
builder.Services.AddSingleton<IPdfGenerationProgressTracker, PdfGenerationProgressTracker>();
builder.Services.AddSingleton<RealtimeEventDispatcher>();
builder.Services.AddSingleton<IRealtimeEventDispatcher>(provider =>
    provider.GetRequiredService<RealtimeEventDispatcher>());
builder.Services.AddSingleton<IRealtimeEventPublisher>(provider =>
    provider.GetRequiredService<RealtimeEventDispatcher>());

builder.Services.AddHttpClient<IAiIntegrationService, AiScoringHttpService>(client =>
{
    var baseUrl = builder.Configuration["AiScoringService:BaseUrl"] ?? "http://localhost:8000";
    var timeoutMinutes = builder.Configuration.GetValue<double?>("AiScoringService:TimeoutMinutes") ?? 30d;
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromMinutes(Math.Clamp(timeoutMinutes, 1d, 60d));
});

builder.Services.AddHttpClient<IGemmaCompletionClient, GemmaCompletionClient>(client =>
{
    var baseUrl = builder.Configuration["GemmaExamGeneration:BaseUrl"] ?? "https://generativelanguage.googleapis.com/v1beta/openai/";
    client.BaseAddress = new Uri(baseUrl);
    var timeoutMinutes = builder.Configuration.GetValue<double?>("GemmaExamGeneration:TimeoutMinutes") ?? 10d;
    client.Timeout = TimeSpan.FromMinutes(Math.Clamp(timeoutMinutes, 1d, 60d));
});

builder.Services.AddHttpClient<IGeminiPdfNativeExtractionClient, GeminiPdfNativeExtractionClient>(client =>
{
    var baseUrl = builder.Configuration["GeminiPdfNativeExtraction:BaseUrl"] ??
                  builder.Configuration["GeminiScoring:BaseUrl"] ??
                  "https://generativelanguage.googleapis.com";
    client.BaseAddress = new Uri($"{baseUrl.TrimEnd('/')}/");
    var timeoutMinutes = builder.Configuration.GetValue<double?>("GeminiPdfNativeExtraction:TimeoutMinutes") ??
                         builder.Configuration.GetValue<double?>("GemmaExamGeneration:TimeoutMinutes") ??
                         10d;
    client.Timeout = TimeSpan.FromMinutes(Math.Clamp(timeoutMinutes, 1d, 60d));
});

builder.Services.AddScoped<IPdfTextExtractionService, LocalPdfTextExtractionService>();
builder.Services.AddScoped<IExamPdfGenerationService, GemmaPdfExamGenerationService>();

builder.Services.AddHttpClient<IReadingCopilotService, GeminiReadingCopilotService>(client =>
{
    var baseUrl = builder.Configuration["GeminiCopilot:BaseUrl"] ?? "https://generativelanguage.googleapis.com";
    client.BaseAddress = new Uri($"{baseUrl.TrimEnd('/')}/");
    client.Timeout = TimeSpan.FromMinutes(3);
});

builder.Services.AddHttpClient<IWritingVisualExtractionService, GeminiWritingVisualExtractionService>(client =>
{
    var baseUrl = builder.Configuration["GeminiVisualExtraction:BaseUrl"]
        ?? builder.Configuration["GeminiScoring:BaseUrl"]
        ?? "https://generativelanguage.googleapis.com";
    client.BaseAddress = new Uri($"{baseUrl.TrimEnd('/')}/");
    client.Timeout = TimeSpan.FromMinutes(2);
});

var app = builder.Build();
var uploadRoot = Path.Combine(app.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadRoot);

using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>()
        .CreateLogger("StartupMigration");
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    try
    {
        logger.LogInformation("Applying pending database migrations...");
        dbContext.Database.Migrate();
        logger.LogInformation("Database migrations applied successfully.");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Failed to apply database migrations at startup.");
        throw;
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options
            .WithTitle("EnglishExamApp API")
            .WithTheme(ScalarTheme.BluePlanet)
            .WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
    });
}

app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(30),
});

app.UseStaticFiles();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadRoot),
    RequestPath = "/uploads",
});

app.UseRouting();
app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.Map("/ws/realtime", async context =>
{
    var wsToken = context.Request.Query["token"].ToString();
    if (string.IsNullOrWhiteSpace(wsToken))
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { message = "Missing websocket token." });
        return;
    }

    var tokenValidationParameters =
        JwtAuthenticationConfiguration.CreateTokenValidationParameters(builder.Configuration, jwtKey);

    var tokenHandler = new JwtSecurityTokenHandler();
    try
    {
        tokenHandler.ValidateToken(wsToken, tokenValidationParameters, out _);
    }
    catch
    {
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await context.Response.WriteAsJsonAsync(new { message = "Invalid websocket token." });
        return;
    }

    if (!context.WebSockets.IsWebSocketRequest)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { message = "WebSocket connection required." });
        return;
    }

    var realtimeDispatcher = context.RequestServices.GetRequiredService<IRealtimeEventDispatcher>();
    using var socket = await context.WebSockets.AcceptWebSocketAsync();
    await realtimeDispatcher.HandleConnectionAsync(socket, context.RequestAborted);
});

app.Run();

static string RequireConfiguration(IConfiguration configuration, string key)
{
    var value = configuration[key];
    if (!string.IsNullOrWhiteSpace(value))
    {
        return value;
    }

    throw new InvalidOperationException(
        $"Missing required configuration '{key}'. Set it with environment variable '{key.Replace(":", "__")}' or user-secrets key '{key}'.");
}

static string RequireConnectionString(IConfiguration configuration, string name)
{
    var value = configuration.GetConnectionString(name);
    if (!string.IsNullOrWhiteSpace(value))
    {
        return value;
    }

    throw new InvalidOperationException(
        $"Missing required connection string '{name}'. Set it with environment variable 'ConnectionStrings__{name}' or user-secrets key 'ConnectionStrings:{name}'.");
}

static string AddDevelopmentSqlServerDefaults(string connectionString)
{
    var configuredValues = new DbConnectionStringBuilder
    {
        ConnectionString = connectionString
    };
    if (configuredValues.ContainsKey("Encrypt"))
    {
        return connectionString;
    }

    var connectionStringBuilder = new SqlConnectionStringBuilder(connectionString);
    connectionStringBuilder["Encrypt"] = "False";

    return connectionStringBuilder.ConnectionString;
}
