import ollama

def chat_with_medical_ai(user_input):
    print(f"--- Đang suy luận cho: {user_input} ---")
    
    # Gọi model đã tải ở Bước 2
    response = ollama.chat(model='llama3.1:8b', messages=[
        {
            'role': 'system',
            'content': 'Bạn là trợ lý y khoa chuyên nghiệp. Trả lời ngắn gọn, chính xác bằng tiếng Việt.'
        },
        {
            'role': 'user',
            'content': user_input
        },
    ])
    
    return response['message']['content']

# Chạy thử nghiệm
if __name__ == "__main__":
    question = "Tôi bị đau bụng dưới bên phải kèm sốt nhẹ, đây là triệu chứng bệnh gì?"
    answer = chat_with_medical_ai(question)
    print("AI trả lời:\n", answer)