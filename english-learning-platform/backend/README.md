# English Learning Platform - Backend

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+ installed
- SQL Server running (local or remote)
- Database `EnglishAppDB` created

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and update with your SQL Server credentials:
```env
DB_HOST=localhost
DB_PORT=1433
DB_USERNAME=sa
DB_PASSWORD=YourPassword123
DB_DATABASE=EnglishAppDB

JWT_SECRET=your-secret-key
```

### 3. Seed Database
Run the seed script in SQL Server Management Studio or Azure Data Studio:
```sql
-- Execute: database/seed.sql
```

This will create:
- 3 Roles (Student, Teacher, Admin)
- 6 Levels (A1, A2, B1, B2, C1, C2)

### 4. Run Backend Server
```bash
npm run start:dev
```

Server will run on: `http://localhost:3000`

## 📡 API Endpoints

### Authentication (Workflow II)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/profile` - Get user profile (Auth required)

### Courses (Workflow IX - Admin)
- `GET /api/courses` - Get all published courses
- `GET /api/courses/:id` - Get course with units and lessons
- `POST /api/courses` - Create course (Auth required)
- `PUT /api/courses/:id` - Update course (Auth required)
- `DELETE /api/courses/:id` - Delete course (Auth required)

### Lessons (Workflows IV & V)
- `GET /api/lessons/:id` - Get lesson content and questions
- `POST /api/lessons/submit` - Submit answers for auto-grading

### Speaking (Workflow VII) 🔥
- `POST /api/speaking/upload` - Upload speaking audio + AI grading
  - Form fields: `audio` (file), `QuestionID` (number)

## 🔄 Workflows Implemented

✅ **Workflow II**: User registration and login with JWT  
✅ **Workflow IV**: Listening lessons with auto-grading  
✅ **Workflow V**: Reading lessons with auto-grading  
✅ **Workflow VII**: Speaking with audio upload and AI integration  
✅ **Workflow IX**: Admin course management  
✅ **Workflow X**: File storage system

## 🎯 Next Steps
1. Set up Python AI Service (FastAPI) for speaking analysis
2. Complete frontend integration
3. Add OAuth authentication
4. Implement teacher grading interface
