# English4U

Nền tảng luyện thi tiếng Anh toàn diện với 4 kỹ năng **Listening · Reading · Writing · Speaking**, tích hợp đánh giá AI tự động theo chuẩn IELTS band score.

---

## Tổng quan hệ thống

```
english4u-frontend/     # React 18 + TypeScript + Vite
english4u-backend/      # ASP.NET Core 8 (Clean Architecture)
AiScoringService/       # Python FastAPI — AI chấm điểm & xử lý âm thanh
```

### Kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser (User)                         │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS
          ┌─────────────▼──────────────┐
          │   english4u-frontend       │   React 18 · Vite · Ant Design v5
          │   (Port 5173 / Vercel)     │   Tailwind CSS · TanStack Query
          └─────────────┬──────────────┘
                        │ REST API
          ┌─────────────▼──────────────┐
          │   english4u-backend        │   ASP.NET Core 8 · EF Core
          │   (Port 5000 / Docker)     │   SQL Server · JWT Auth
          └──────┬────────────┬────────┘
                 │            │ HTTP (nội bộ)
          ┌──────▼──────┐ ┌──▼────────────────┐
          │  SQL Server │ │  AiScoringService  │   FastAPI · Faster-Whisper
          │  (Database) │ │  (Port 8000)       │   Google Gemini · Allosaurus
          └─────────────┘ └───────────────────┘
```

---

## Tech Stack

### Frontend — `english4u-frontend/`
| Thư viện | Vai trò |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool |
| Ant Design v5 | Component library |
| Tailwind CSS v4 | Utility CSS |
| React Router v6 | Routing |
| TanStack Query v5 | Server state management |
| Zustand | Client state |
| Axios | HTTP client |
| React Hook Form + Zod | Form & validation |
| Tiptap | Rich text editor (writing) |
| Framer Motion | Animations |
| Recharts | Biểu đồ kết quả |
| Cloudinary | Upload & lưu trữ audio |

### Backend — `english4u-backend/`
| Thư viện | Vai trò |
|---|---|
| ASP.NET Core 8 | Web API framework |
| Entity Framework Core | ORM |
| SQL Server | Database chính |
| JWT Bearer | Authentication |
| Google Gemini API | AI sinh đề thi, copilot |
| MinerU | Trích xuất nội dung từ PDF |
| VNPay | Thanh toán |
| SMTP Email | Gửi mail xác thực |

### AI Scoring Service — `AiScoringService/`
| Thư viện | Vai trò |
|---|---|
| FastAPI + Uvicorn | Web framework |
| Faster-Whisper | Speech-to-text (STT) |
| Google Gemini (google-genai) | Chấm điểm Writing & Speaking |
| Allosaurus | Nhận dạng âm vị (phoneme) |
| Praat-Parselmouth | Phân tích giọng nói (prosody) |
| Silero VAD | Voice Activity Detection |
| TextStat + LexicalRichness | Đánh giá độ phức tạp văn bản |

---

## Tính năng chính

### 4 kỹ năng IELTS
- **Listening** — Nghe audio, trả lời câu hỏi; auto-align transcript với Whisper
- **Reading** — Đọc passage, trả lời dạng MCQ / fill-in-the-blank / matching
- **Writing** — Soạn thảo essay với Tiptap, AI chấm điểm theo 4 tiêu chí IELTS
- **Speaking** — Ghi âm giọng nói, AI đánh giá pronunciation, fluency, coherence, vocabulary

### AI Features
- 🎤 **Speaking Assessment** — Whisper STT → Gemini scoring → Allosaurus phoneme analysis
- ✍️ **Writing Scoring** — Gemini chấm 4 tiêu chí: Task Achievement, Coherence, Lexical Resource, Grammatical Range
- 📄 **Exam Generation** — Tự động sinh đề từ PDF (MinerU + Gemini)
- 🤖 **AI Copilot** — Gợi ý học tập, giải thích đáp án

### Hệ thống
- Đăng nhập Google OAuth / Email
- Quản lý bài thi, bộ câu hỏi theo IELTS Part 1-3
- Lịch sử làm bài, thống kê điểm số band
- Thanh toán VNPay (mở khoá đề thi premium)

---

## Cài đặt & Chạy local

### Yêu cầu
- Node.js ≥ 18
- .NET SDK 8.0
- Python 3.10+
- SQL Server (local hoặc Docker)
- Docker (tuỳ chọn, cho MinerU)

---

### 1. Frontend

```bash
cd english4u-frontend
npm install
cp .env.example .env        # cấu hình VITE_API_BASE_URL
npm run dev                 # http://localhost:5173
```

---

### 2. Backend

```bash
cd english4u-backend/EnglishExamApp.API

# Cấu hình secrets (bắt buộc)
dotnet user-secrets set "Jwt:Key" "your-32-char-minimum-secret-key"
dotnet user-secrets set "ConnectionStrings:DefaultConnection" \
  "Server=localhost;Database=EnglishExamApp;User Id=sa;Password=yourpw;TrustServerCertificate=True;"

# Tuỳ chọn
dotnet user-secrets set "Google:ClientId" "your-google-oauth-client-id"
dotnet user-secrets set "GeminiScoring:ApiKey" "your-gemini-api-key"
dotnet user-secrets set "Email:FromEmail" "your@email.com"
dotnet user-secrets set "Email:AppPassword" "your-email-app-password"
dotnet user-secrets set "Vnpay:TmnCode" "your-vnpay-tmn-code"
dotnet user-secrets set "Vnpay:HashSecret" "your-vnpay-hash-secret"

# Migrate DB
dotnet ef database update

# Chạy
dotnet run                  # http://localhost:5000
```

> Xem chi tiết tại [`english4u-backend/CONFIGURATION.md`](./english4u-backend/CONFIGURATION.md)

---

### 3. AI Scoring Service

```bash
cd AiScoringService

# Tạo .env
cp .env.example .env        # điền GEMINI_API_KEY

# Cài venv & dependencies
python -m venv venv
.\venv\Scripts\activate     # Windows
pip install -r requirements.txt

# Chạy
uvicorn main:app --reload --port 8000
```

**Health check:** `GET http://localhost:8000/health`

```json
{
  "status": "ok",
  "speaking_whisper_loaded": true,
  "listening_whisper_loaded": true
}
```

---

### 4. MinerU (tuỳ chọn — cho sinh đề từ PDF)

```bash
# Từ thư mục gốc
docker compose -f docker-compose.mineru.yml up -d
# API: http://localhost:8010
```

---

## Deploy

### Hugging Face Spaces (AI Service)
```powershell
.\deploy_ai_hf.ps1
```

### Backend Docker
```powershell
.\deploy_be_hf.ps1
```

### Frontend
- Deploy tự động qua **Vercel** khi push lên nhánh `main`
- Config: [`english4u-frontend/vercel.json`](./english4u-frontend/vercel.json)

---

## Cấu trúc thư mục

```
English4U/
├── english4u-frontend/     # React SPA
│   └── src/
│       ├── app/            # Bootstrap, Router, Providers
│       ├── features/       # Domain modules (auth, exam, speaking…)
│       ├── shared/         # Components, hooks, utils dùng chung
│       └── pages/          # Top-level pages
│
├── english4u-backend/      # ASP.NET Core Clean Architecture
│   ├── EnglishExamApp.API/            # Controllers, Middleware
│   ├── EnglishExamApp.Application/   # Use cases, DTOs
│   ├── EnglishExamApp.Domain/        # Entities, Domain logic
│   └── EnglishExamApp.Infrastructure/# EF Core, external services
│
├── AiScoringService/       # Python AI microservice
│   ├── speaking/           # Speaking scoring pipeline
│   ├── writing/            # Writing scoring pipeline
│   ├── listening/          # Listening transcript & alignment
│   ├── main.py             # FastAPI app & endpoints
│   └── schemas.py          # Pydantic request/response models
│
├── deploy_ai_hf.ps1        # Script deploy AI Service lên HuggingFace
├── deploy_be_hf.ps1        # Script deploy Backend
└── run_docker_ai.ps1       # Chạy AI Service bằng Docker local
```

---

## API Endpoints (AI Service)

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/ai/score-speaking` | Chấm điểm 1 câu trả lời Speaking |
| `POST` | `/api/ai/score-speaking-session` | Chấm toàn bộ session Speaking |
| `POST` | `/api/ai/score-writing` | Chấm điểm bài Writing |
| `POST` | `/api/ai/generate-speaking-prompt-audio` | TTS cho đề Speaking |
| `POST` | `/api/ai/generate-listening-transcript` | STT transcript cho Listening |
| `POST` | `/api/ai/align-listening-transcript` | Alignment transcript + audio |
| `POST` | `/api/ai/analyze-readability` | Phân tích độ khó văn bản |
| `GET` | `/health` | Health check |

---

## License

MIT — xem [`LICENSE`](./LICENSE)
