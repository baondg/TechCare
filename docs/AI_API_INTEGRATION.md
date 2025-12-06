# Hướng dẫn tích hợp AI API bất kỳ

## 🎯 Tổng quan

Code đã được thiết kế để hỗ trợ **BẤT KỲ AI API nào**, không chỉ OpenAI hay Gemini. Bạn có thể sử dụng:

- OpenAI (ChatGPT)
- Anthropic (Claude)
- Google Gemini
- Cohere
- Hugging Face
- Azure OpenAI
- AWS Bedrock
- Mistral AI
- Perplexity AI
- **Bất kỳ API tự build của riêng bạn**

## 🚀 Cách sử dụng

### Bước 1: Tạo file `.env`

```bash
cd frontend
cp .env.example .env
```

### Bước 2: Cấu hình theo AI provider của bạn

#### Ví dụ 1: OpenAI

```env
VITE_AI_PROVIDER=openai
VITE_AI_API_ENDPOINT=https://api.openai.com/v1/chat/completions
VITE_AI_API_KEY=sk-proj-abcd1234...
```

#### Ví dụ 2: Anthropic Claude

```env
VITE_AI_PROVIDER=anthropic
VITE_AI_API_ENDPOINT=https://api.anthropic.com/v1/messages
VITE_AI_API_KEY=sk-ant-api03-xyz...
```

#### Ví dụ 3: Cohere

```env
VITE_AI_PROVIDER=cohere
VITE_AI_API_ENDPOINT=https://api.cohere.ai/v1/chat
VITE_AI_API_KEY=your-cohere-key
```

#### Ví dụ 4: Hugging Face

```env
VITE_AI_PROVIDER=huggingface
VITE_AI_API_ENDPOINT=https://api-inference.huggingface.co/models/meta-llama/Llama-2-70b-chat-hf
VITE_AI_API_KEY=hf_abcdefgh...
```

#### Ví dụ 5: Custom API (bất kỳ)

Nếu bạn có API riêng với format khác:

```env
VITE_AI_PROVIDER=custom
VITE_AI_API_ENDPOINT=https://your-api.com/chat
VITE_AI_API_KEY=your-secret-key
```

Code sẽ tự động:
- Gửi request với format OpenAI-like (messages array)
- Parse response tìm field: `message`, `response`, `content`, `text`, hoặc `output`

## 📝 Các provider được hỗ trợ sẵn

### 1. OpenAI

**Request format:**
```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "temperature": 0.7,
  "max_tokens": 500
}
```

**Response format:**
```json
{
  "choices": [
    {
      "message": {
        "content": "AI response here"
      }
    }
  ]
}
```

**Headers:**
```
Authorization: Bearer sk-...
```

---

### 2. Anthropic (Claude)

**Request format:**
```json
{
  "model": "claude-3-sonnet-20240229",
  "messages": [
    {"role": "user", "content": "..."}
  ],
  "system": "System prompt...",
  "max_tokens": 500
}
```

**Response format:**
```json
{
  "content": [
    {
      "text": "AI response here"
    }
  ]
}
```

**Headers:**
```
x-api-key: sk-ant-...
anthropic-version: 2023-06-01
```

---

### 3. Cohere

**Request format:**
```json
{
  "message": "User message",
  "chat_history": [
    {"role": "USER", "message": "..."},
    {"role": "CHATBOT", "message": "..."}
  ],
  "preamble": "System prompt"
}
```

**Response format:**
```json
{
  "text": "AI response here"
}
```

**Headers:**
```
Authorization: Bearer your-cohere-key
```

---

### 4. Hugging Face

**Request format:**
```json
{
  "inputs": "Full conversation text",
  "parameters": {
    "max_new_tokens": 500,
    "temperature": 0.7
  }
}
```

**Response format:**
```json
[
  {
    "generated_text": "AI response here"
  }
]
```

**Headers:**
```
Authorization: Bearer hf_...
```

---

### 5. Google Gemini

**Request format:**
```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "Full conversation"
        }
      ]
    }
  ]
}
```

**Response format:**
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "text": "AI response here"
          }
        ]
      }
    }
  ]
}
```

**API Key:** In URL parameter `?key=YOUR_KEY`

---

## 🔧 Tích hợp API mới

Nếu bạn có API với format khác hoàn toàn:

### Option 1: Sửa trong `ai-service.ts`

Thêm case mới trong hàm `buildRequestBody`:

```typescript
case 'your-provider':
  return {
    // Your custom request format
    prompt: userMessage,
    history: messages,
    // ...
  }
```

Thêm case mới trong hàm `extractMessage`:

```typescript
case 'your-provider':
  return data.your_response_field || 'No response'
```

Thêm case mới trong hàm `buildHeaders`:

```typescript
case 'your-provider':
  headers['X-Custom-Auth'] = apiKey
  break
```

### Option 2: Dùng Custom Provider (không cần sửa code)

Nếu API của bạn trả về một trong các field sau:
- `message`
- `response`
- `content`
- `text`
- `output`

Thì chỉ cần set:

```env
VITE_AI_PROVIDER=custom
VITE_AI_API_ENDPOINT=https://your-api.com/endpoint
VITE_AI_API_KEY=your-key
```

Code sẽ tự động xử lý!

## 📊 Test API của bạn

### Kiểm tra request format

```bash
# Xem request được gửi đi
# Mở DevTools > Network tab > Xem request payload
```

### Test trực tiếp với curl

```bash
curl -X POST https://your-api.com/endpoint \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'
```

### Debug trong code

Thêm log trong `ai-service.ts`:

```typescript
console.log('Request Body:', requestBody)
console.log('Response Data:', data)
```

## 🎨 Ví dụ thực tế

### Ví dụ 1: Dùng OpenRouter (proxy nhiều models)

```env
VITE_AI_PROVIDER=openai
VITE_AI_API_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
VITE_AI_API_KEY=sk-or-v1-...
```

OpenRouter dùng format giống OpenAI nên set provider là `openai`.

### Ví dụ 2: Dùng Together AI

```env
VITE_AI_PROVIDER=openai
VITE_AI_API_ENDPOINT=https://api.together.xyz/v1/chat/completions
VITE_AI_API_KEY=your-together-key
```

Together AI cũng dùng OpenAI-compatible format.

### Ví dụ 3: Dùng Perplexity AI

```env
VITE_AI_PROVIDER=openai
VITE_AI_API_ENDPOINT=https://api.perplexity.ai/chat/completions
VITE_AI_API_KEY=pplx-...
```

### Ví dụ 4: Dùng Mistral AI

```env
VITE_AI_PROVIDER=openai
VITE_AI_API_ENDPOINT=https://api.mistral.ai/v1/chat/completions
VITE_AI_API_KEY=your-mistral-key
```

### Ví dụ 5: Dùng Groq (Fast inference)

```env
VITE_AI_PROVIDER=openai
VITE_AI_API_ENDPOINT=https://api.groq.com/openai/v1/chat/completions
VITE_AI_API_KEY=gsk_...
```

### Ví dụ 6: Self-hosted Ollama

```env
VITE_AI_PROVIDER=openai
VITE_AI_API_ENDPOINT=http://localhost:11434/v1/chat/completions
VITE_AI_API_KEY=not-needed
```

## 🔐 Security Tips

1. **Không commit API keys**: Thêm `.env` vào `.gitignore`

```bash
echo ".env" >> .gitignore
```

2. **Dùng environment variables**: Trên production, set qua hosting platform

3. **Rate limiting**: Thêm rate limit ở backend

4. **Proxy qua backend**: Tốt nhất là frontend gọi backend, backend gọi AI API

## ❓ Troubleshooting

### Lỗi: "API error: 401"
- Check API key có đúng không
- Check header authentication format

### Lỗi: "No response from AI"
- Check response format có match với provider không
- Thêm console.log để xem response data

### Lỗi: CORS
- Nếu call direct từ frontend, AI API phải enable CORS
- Hoặc proxy qua backend

### Response không đúng format
- Set `VITE_AI_PROVIDER=custom`
- Check field name trong response
- Có thể cần thêm case mới trong `extractMessage`

## 🎯 Kết luận

Code linh hoạt, hỗ trợ mọi AI API! Bạn chỉ cần:

1. ✅ Có API endpoint
2. ✅ Có API key
3. ✅ Biết request/response format
4. ✅ Set 3 biến trong `.env`

Không cần sửa code nếu API dùng format phổ biến!
