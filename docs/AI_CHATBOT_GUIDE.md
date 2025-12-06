# TechCare AI Chatbot Integration Guide

## Overview
Chatbot đã được tích hợp với AI service backend. Hệ thống hỗ trợ nhiều loại AI provider.

## 🚀 Quick Start

### 1. Cấu hình Frontend

Tạo file `.env` trong folder `frontend/`:

```bash
# Copy từ file mẫu
cp .env.example .env
```

Chỉnh sửa `.env`:
```env
VITE_AI_API_ENDPOINT=http://localhost:3000/api/ai/chat
VITE_AI_API_KEY=your-api-key-here
```

### 2. Cấu hình Backend

Tạo file `.env` trong folder `backend/`:

```env
PORT=3000
OPENAI_API_KEY=your-openai-key-here  # Nếu dùng OpenAI
```

### 3. Chạy Backend

```bash
cd backend
npm install
npm run dev
```

Backend sẽ chạy tại: `http://localhost:3000`

### 4. Chạy Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend sẽ chạy tại: `http://localhost:5173`

## 📁 Cấu trúc File

```
TechCare-2/
├── frontend/
│   ├── src/
│   │   ├── services/
│   │   │   └── ai-service.ts          # AI service integration
│   │   └── patient/
│   │       └── chatbot.tsx            # Chatbot UI với AI
│   └── .env                           # Frontend config
│
└── backend/
    ├── src/
    │   ├── routes/
    │   │   └── ai.ts                  # AI chat endpoint
    │   └── index.ts                   # Backend entry point
    └── .env                           # Backend config
```

## 🔧 Tích hợp AI Providers

### Option 1: Custom Backend (Hiện tại)

Backend API xử lý requests và trả về responses dựa trên rule-based logic.

**Pros:**
- Không cần API key external
- Kiểm soát hoàn toàn logic
- Miễn phí

**Cons:**
- Không có AI thật
- Phải maintain logic manually

### Option 2: OpenAI Integration

#### Frontend (`ai-service.ts`):
Uncomment function `sendChatMessageOpenAI` và sử dụng:

```typescript
export async function sendChatMessage(messages, userMessage) {
  return sendChatMessageOpenAI(messages, userMessage);
}
```

#### Backend (`ai.ts`):
Uncomment OpenAI integration code và install package:

```bash
npm install openai
```

#### Environment:
```env
VITE_AI_API_ENDPOINT=https://api.openai.com/v1/chat/completions
VITE_AI_API_KEY=sk-your-openai-api-key
```

**Pricing:** ~$0.002/1K tokens (GPT-4)

### Option 3: Google Gemini

#### Frontend (`ai-service.ts`):
Uncomment function `sendChatMessageGemini`

#### Environment:
```env
VITE_AI_API_ENDPOINT=https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent
VITE_AI_API_KEY=your-gemini-api-key
```

**Pricing:** Free tier available

### Option 4: Azure OpenAI

Similar to OpenAI but use Azure endpoint:

```env
VITE_AI_API_ENDPOINT=https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2023-05-15
VITE_AI_API_KEY=your-azure-key
```

## 🎯 Features Implemented

### Frontend (`chatbot.tsx`)
- ✅ Real-time chat interface
- ✅ Message history
- ✅ Loading states với animation
- ✅ Auto-scroll to bottom
- ✅ Typing indicators
- ✅ Quick question buttons
- ✅ Thumbs up/down feedback
- ✅ Error handling

### Backend (`ai.ts`)
- ✅ POST /api/ai/chat endpoint
- ✅ Rule-based fallback responses
- ✅ Context-aware responses
- ✅ Medical domain knowledge
- ✅ Error handling
- ✅ CORS enabled

### AI Service (`ai-service.ts`)
- ✅ Multiple AI provider support
- ✅ Conversation history management
- ✅ Fallback to rule-based when API fails
- ✅ Type-safe interfaces
- ✅ Error handling

## 🧪 Testing

### Test Backend API:

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "What medications am I taking?"}
    ]
  }'
```

Expected response:
```json
{
  "message": "I can help you with your medications...",
  "timestamp": "2025-12-05T..."
}
```

### Test Frontend:
1. Mở http://localhost:5173
2. Navigate to Chatbot page
3. Gõ câu hỏi và xem response

## 🔐 Security Best Practices

1. **API Keys**: Không commit API keys vào Git
   ```bash
   # Add to .gitignore
   .env
   .env.local
   ```

2. **Rate Limiting**: Thêm rate limiting ở backend
   ```bash
   npm install express-rate-limit
   ```

3. **Authentication**: Thêm user authentication
   ```typescript
   // Middleware để check user token
   app.use('/api/ai', authenticateUser);
   ```

4. **Input Validation**: Validate user input
   ```typescript
   if (userMessage.length > 1000) {
     throw new Error('Message too long');
   }
   ```

## 📊 Response Categories

Chatbot hiện hỗ trợ các chủ đề:

1. **Medications** 💊
   - Current medications
   - Dosage information
   - Side effects
   - Drug interactions
   - Refills

2. **Appointments** 📅
   - View upcoming appointments
   - Book new appointments
   - Reschedule/cancel
   - Get directions

3. **Health Concerns** 🏥
   - Symptom checking
   - Urgent care options
   - Emergency guidance
   - Nurse consultation

4. **Test Results** 🔬
   - Lab results
   - Imaging reports
   - Pending tests
   - Result interpretation

5. **Billing & Insurance** 💳
   - Payment options
   - Insurance coverage
   - Financial assistance
   - Bill inquiries

6. **Medical Records** 📋
   - Visit summaries
   - Health history
   - Document downloads
   - Records sharing

## 🚀 Next Steps

### Enhancements để implement:

1. **Context Awareness**
   - Load patient medical records
   - Reference past conversations
   - Personalized responses

2. **Advanced Features**
   - Voice input/output
   - Multi-language support
   - Image upload (for symptoms)
   - Appointment booking integration

3. **Analytics**
   - Track common questions
   - Monitor response quality
   - User satisfaction metrics

4. **Integration**
   - Connect to real medical database
   - EHR system integration
   - Pharmacy systems
   - Insurance verification

## 📞 Support

Nếu có vấn đề:
1. Check backend logs: `npm run dev` output
2. Check browser console: F12 Developer Tools
3. Verify .env configuration
4. Test API endpoint directly với curl

## 📝 API Documentation

### POST /api/ai/chat

**Request:**
```json
{
  "messages": [
    {
      "role": "system" | "user" | "assistant",
      "content": "string"
    }
  ]
}
```

**Response:**
```json
{
  "message": "string",
  "timestamp": "ISO 8601 date string"
}
```

**Error Response:**
```json
{
  "error": "string",
  "message": "string"
}
```

## 🎨 Customization

### Modify System Prompt

Chỉnh sửa trong `ai-service.ts`:

```typescript
{
  role: 'system',
  content: `Your custom system prompt here...`
}
```

### Add New Response Categories

Thêm logic trong `backend/src/routes/ai.ts`:

```typescript
if (lowerMessage.includes('your-keyword')) {
  return 'Your custom response';
}
```

### Styling

Chỉnh sửa UI trong `chatbot.tsx` sử dụng Tailwind classes.

---

**Version:** 1.0.0  
**Last Updated:** December 5, 2025  
**Author:** TechCare Development Team
