from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import ollama

app = FastAPI(title="Chatbot API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Trong thực tế sẽ đổi thành Domain Web của bạn
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Định nghĩa cấu trúc dữ liệu cho Chatbot
class ChatMessage(BaseModel):
    role: str       # Sẽ là "user" (người dùng) hoặc "assistant" (AI)
    content: str    # Nội dung tin nhắn

class ChatRequest(BaseModel):
    messages: List[ChatMessage] # Nhận vào một mảng chứa toàn bộ lịch sử chat

# 4. Tạo Endpoint cho Chatbot
@app.post("/api/chat")
async def chat_with_ai(request: ChatRequest):
    # System Prompt: Cài đặt "nhân cách" cho bác sĩ AI
    system_prompt = {
        "role": "system",
        "content": """Bạn là một trợ lý y khoa AI ân cần, đồng cảm và chuyên nghiệp. 
        Quy tắc:
        1. Trả lời ngắn gọn, rõ ràng bằng tiếng Việt.
        2. Nếu người dùng hỏi về bệnh nặng, luôn khuyên họ đến gặp bác sĩ thực tế.
        3. Tuyệt đối không tự ý kê đơn thuốc kê đơn (như kháng sinh). Chỉ gợi ý các biện pháp chăm sóc tại nhà hoặc thuốc không kê đơn phổ biến."""
    }
    
    # Ghép System Prompt vào đầu danh sách tin nhắn
    full_messages = [system_prompt]
    for msg in request.messages:
        full_messages.append({"role": msg.role, "content": msg.content})
        
    try:
        # Gọi Local LLM (Không dùng format='json' vì đây là chat tự do)
        response = ollama.chat(
            model='llama3.1:8b', 
            messages=full_messages,
            options={'temperature': 0.4} # Tăng một chút để câu văn tự nhiên và đồng cảm hơn
        )
        
        return {"reply": response['message']['content']}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi Chatbot: {str(e)}")