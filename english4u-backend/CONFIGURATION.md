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
dotnet user-secrets set "GemmaExamGeneration:BaseUrl" "https://generativelanguage.googleapis.com/v1beta/openai/"
dotnet user-secrets set "GemmaExamGeneration:Model" "gemini-3.1-flash-lite"
dotnet user-secrets set "GemmaExamGeneration:SendAuthorizationHeader" "true"
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

## PDF extraction with MinerU

PDF exam generation uses MinerU as the required extraction engine. If the
MinerU container is not running or returns invalid output, generation fails
instead of falling back to the legacy PdfPig extractor.

Local defaults:

```json
"MinerU": {
  "BaseUrl": "http://localhost:8010",
  "Backend": "pipeline",
  "ParseMethod": "auto",
  "Languages": ["en"],
  "EnableFormula": false,
  "EnableTable": true,
  "ReturnImages": false,
  "SaveDebugArtifacts": false,
  "DebugOutputDirectory": ".runtime/mineru-debug",
  "TimeoutMinutes": 10
}
```

When checking whether extraction quality is coming from MinerU or Gemini,
enable local MinerU debug artifacts:

```powershell
dotnet user-secrets set "MinerU:SaveDebugArtifacts" "true"
dotnet user-secrets set "MinerU:DebugOutputDirectory" "C:\Users\Hande\OneDrive\Documents\DoAnTotNghiep\English4skills\.runtime\mineru-debug"
```

Each PDF extraction then writes `mineru-response.*` and
`normalized-text.txt`; compare `normalized-text.txt` with the uploaded PDF
before tuning Gemini.

For generated passage JSON, the backend calls Google's OpenAI-compatible
Gemini API endpoint with the Gemini/Gemma API key:

```json
"GemmaExamGeneration": {
  "BaseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
  "Model": "gemini-3.1-flash-lite",
  "Temperature": 0.0,
  "MaxOutputTokens": 8192,
  "TimeoutMinutes": 10,
  "SendAuthorizationHeader": true
}
```

The generation flow retries transient Gemini/Gemma API failures such as 429,
500, 502, 503, and 504, waiting 5 seconds before retrying unless the API
returns a specific retry delay.

For an RTX 4050 6GB machine, keep `Backend` as `pipeline` first. Start the
local Docker service from the repo root:

```powershell
docker compose -f docker-compose.mineru.yml up -d
```

The MinerU API is exposed at `http://localhost:8010`; `AiScoringService` keeps
using `http://localhost:8000`, so the two services do not fight over one port.

## Database migrations

EF Core migrations use a design-time `ApplicationDbContextFactory`, so
`dotnet ef database update` only needs `ConnectionStrings:DefaultConnection`.
Running the API still requires `Jwt:Key`.
