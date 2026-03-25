from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import ollama
import json

app = FastAPI(title="Symptom Checker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Trong thực tế sẽ đổi thành Domain Web của bạn
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Kết nối với Database y khoa vừa tạo
db_client = chromadb.PersistentClient(path="./medical_db")
medical_collection = db_client.get_collection(name="medical_guidelines")

# 1. Định nghĩa Data Model từ UI truyền lên
class SymptomDetail(BaseModel):
    symptom: str        # VD: "Headache"
    severity: str       # VD: "Moderate"
    duration: str       # VD: "1-3 days"

class AnalyzeRequest(BaseModel):
    symptoms: List[SymptomDetail]

# 2. Định nghĩa API Endpoint
@app.post("/api/analyze_symptoms")
async def analyze_symptoms(request: AnalyzeRequest):
    # Định dạng dữ liệu đầu vào thành chuỗi dễ hiểu cho AI
    symptoms_text = "\n".join(
        [f"- {s.symptom} (Mức độ: {s.severity}, Thời gian: {s.duration})" for s in request.symptoms]
    )
    
    # --- BƯỚC MỚI: TRA CỨU DATABASE ---
    # Tìm kiếm 1 phác đồ có triệu chứng giống nhất với người bệnh
    db_results = medical_collection.query(
        query_texts=[symptoms_text],
        n_results=1
    )
    
    # Lấy ra nội dung phác đồ chuẩn
    medical_context = db_results['documents'][0][0] if db_results['documents'] else "Không có dữ liệu đặc biệt."

    # --- ÉP AI SỬ DỤNG DỮ LIỆU CHUẨN ---

    prompt = f"""
    Bạn là một bác sĩ chẩn đoán AI. Bệnh nhân có các triệu chứng sau:
    {symptoms_text}
    
    Hãy phân tích và trả về CHỈ MỘT object JSON với cấu trúc chính xác như sau:
    {{
        "possible_conditions": [
            {{"disease": "Tên bệnh 1", "probability": "High/Medium/Low", "reason": "Lý do vì sao"}}
        ],
        "recommended_action": "Lời khuyên (ví dụ: Nghỉ ngơi / Gặp bác sĩ ngay)",
        "suggested_medication_type": ["Loại thuốc 1", "Loại thuốc 2"]
    }}
    Không giải thích gì thêm, chỉ in ra JSON hợp lệ.
    """

    try:
        # Gọi Local LLM (ví dụ: Llama-3) và ép kiểu đầu ra là JSON
        response = ollama.chat(
            model='llama3.1:8b', 
            messages=[{'role': 'user', 'content': prompt}],
            format='json' # Rất quan trọng để parse kết quả
        )
        
        # Parse JSON để đảm bảo an toàn trước khi trả về Frontend
        result_json = json.loads(response['message']['content'])
        return result_json
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Chạy server: uvicorn api_symptom:app --reload