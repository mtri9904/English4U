using System.Text;
using System.IdentityModel.Tokens.Jwt;
using EnglishExamApp.API.Realtime;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Infrastructure.Data;
using EnglishExamApp.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Extensions.FileProviders;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
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
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IApplicationDbContext>(provider =>
    provider.GetRequiredService<ApplicationDbContext>());

builder.Services.AddScoped<IExamService, ExamService>();
builder.Services.AddScoped<IExamExecutionService, ExamExecutionService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IEmailService, EmailService>();
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
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromMinutes(5);
});

builder.Services.AddHttpClient<IExamPdfGenerationService, GemmaPdfExamGenerationService>(client =>
{
    var baseUrl = builder.Configuration["GemmaExamGeneration:BaseUrl"] ?? "https://generativelanguage.googleapis.com/v1beta/openai/";
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromMinutes(3);
});

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

    var tokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
    };

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
