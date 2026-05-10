# Backend Configuration

Runtime secrets must not be committed. Keep `EnglishExamApp.API/appsettings.json`
for non-secret defaults only, and put local secrets in .NET user-secrets or
environment variables.

## Required local secrets

Run these commands from `english4u-backend/EnglishExamApp.API`:

```powershell
dotnet user-secrets set "Jwt:Key" "replace-with-a-strong-32-byte-minimum-secret"
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=localhost;Database=EnglishExamApp;User Id=sa;Password=your-password;TrustServerCertificate=True;MultipleActiveResultSets=true;"
```

## Optional integrations

Set only the integrations you need locally:

```powershell
dotnet user-secrets set "Google:ClientId" "your-google-oauth-client-id"
dotnet user-secrets set "GeminiScoring:ApiKey" "your-gemini-api-key"
dotnet user-secrets set "GemmaExamGeneration:ApiKey" "your-gemini-api-key"
dotnet user-secrets set "GeminiCopilot:ApiKey" "your-gemini-api-key"
dotnet user-secrets set "GeminiVisualExtraction:ApiKey" "your-gemini-api-key"
dotnet user-secrets set "Vnpay:TmnCode" "your-vnpay-tmn-code"
dotnet user-secrets set "Vnpay:HashSecret" "your-vnpay-hash-secret"
dotnet user-secrets set "Email:FromEmail" "your-sender@example.com"
dotnet user-secrets set "Email:AppPassword" "your-email-app-password"
dotnet user-secrets set "SeedAdmin:Password" "temporary-local-admin-password"
```

`POST /api/auth/seed-admin` is available only in the Development environment and
requires `SeedAdmin:Password`.

Environment variables use `__` for nested keys, for example:

```powershell
$env:Jwt__Key = "replace-with-a-strong-32-byte-minimum-secret"
$env:ConnectionStrings__DefaultConnection = "Server=localhost;Database=EnglishExamApp;User Id=sa;Password=your-password;TrustServerCertificate=True;MultipleActiveResultSets=true;"
```

The AI services also accept `GEMINI_API_KEY` as a shared fallback key.

## Database migrations

EF Core migrations use a design-time `ApplicationDbContextFactory`, so
`dotnet ef database update` only needs `ConnectionStrings:DefaultConnection`.
Running the API still requires `Jwt:Key`.
