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

# 5. Cấu trúc dữ liệu cho luồng Bác sĩ kê đơn
class DoctorPrescriptionRequest(BaseModel):
    diagnosis: str      # VD: "Viêm họng hạt cấp tính ở người lớn"
    symptoms: str       # VD: "Đau rát họng, ho có đờm, sốt 38 độ"

@app.post("/api/suggest_medicine")
async def suggest_medicine(request: DoctorPrescriptionRequest):
    prompt = f"""
    Bạn là một Dược sĩ lâm sàng AI chuyên nghiệp, hỗ trợ Bác sĩ kê đơn thuốc.
    - Chẩn đoán của Bác sĩ: {request.diagnosis}
    - Triệu chứng đi kèm: {request.symptoms}
    
    Hãy đề xuất một danh sách thuốc phù hợp (bao gồm thuốc điều trị nguyên nhân và thuốc giảm triệu chứng).
    Tuyệt đối chỉ trả về MỘT mảng JSON (JSON array) với cấu trúc chính xác như sau, không giải thích thêm:
    [
        {{
            "med_name": "Tên thuốc (Ví dụ: Paracetamol 500mg)",
            "active_ingredient": "Hoạt chất",
            "dosage": "Liều dùng khuyến nghị (Ví dụ: 1 viên/lần, 2 lần/ngày)",
            "usage": "Cách dùng & Lưu ý (Ví dụ: Uống sau ăn)"
        }}
    ]
    """

    try:
        response = ollama.chat(
            model='llama3.1:8b', 
            messages=[{'role': 'user', 'content': prompt}],
            format='json', 
            options={'temperature': 0.1} # Giữ ở mức thấp để thuốc chuẩn xác
        )
        
        return {"reply": response['message']['content']}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi Chatbot: {str(e)}")