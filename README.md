# Classroom-Insight-Assistant

Hướng dẫn ngắn gọn để chạy được hệ thống.

## 1. Cần chuẩn bị trước

Máy local cần có:
- Python 3.11+
- Node.js 20+
- npm
- ffmpeg

Ngoài ra cần có:
- 1 project Supabase
- 1 tài khoản Google Drive
- 1 OAuth client cho Google Drive
- 1 Telegram Bot (nếu muốn dùng tính năng gửi Telegram)
- Google Colab GPU để chạy worker

---

## 2. Cấu trúc chính của repo

- `backend/` → API FastAPI
- `frontend/` → web Next.js
- `Model/` → file model
- `colab_workerl (2).ipynb` → worker Colab

---

## 3. Các file model cần có

Trong thư mục `Model/` cần có:

- `best_model.pth`
- `labels.json`
- `prompt_groups.json`
- `prompts_dict.json`
- `text_features_prompts.pt`

---

## 4. Tạo file môi trường cho backend

Tạo file:

```text
backend/.env
```

Nội dung:

```env
APP_NAME=AI Classroom Behavior System API
APP_ENV=development
APP_HOST=127.0.0.1
APP_PORT=8000

SUPABASE_URL=
SUPABASE_KEY=

GEMINI_API_KEY=

GOOGLE_DRIVE_JOBS_DIR=./data/classroom_jobs
GOOGLE_DRIVE_OAUTH_CLIENT_FILE=credentials/gdrive-oauth-client.json
GOOGLE_DRIVE_TOKEN_FILE=credentials/gdrive-token.json

GOOGLE_DRIVE_INCOMING_FOLDER_ID=
GOOGLE_DRIVE_PROCESSING_FOLDER_ID=
GOOGLE_DRIVE_DONE_FOLDER_ID=
GOOGLE_DRIVE_FAILED_FOLDER_ID=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_API_BASE=https://api.telegram.org
```

Điền đầy đủ các giá trị còn trống.

---

## 5. Tạo file môi trường cho frontend

Tạo file:

```text
frontend/.env.local
```

Nội dung:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

---

## 6. Chuẩn bị Google Drive

Tạo 4 folder trên Google Drive:

- `incoming`
- `processing`
- `done`
- `failed`

Lấy folder ID của từng folder rồi điền vào:

- `GOOGLE_DRIVE_INCOMING_FOLDER_ID`
- `GOOGLE_DRIVE_PROCESSING_FOLDER_ID`
- `GOOGLE_DRIVE_DONE_FOLDER_ID`
- `GOOGLE_DRIVE_FAILED_FOLDER_ID`

trong file `backend/.env`.

---

## 7. Chuẩn bị Google OAuth credential

Tạo thư mục:

```text
backend/credentials/
```

Đặt file OAuth client JSON vào:

```text
backend/credentials/gdrive-oauth-client.json
```

Sau khi đăng nhập Google lần đầu, token có thể được tạo thêm tại:

```text
backend/credentials/gdrive-token.json
```

---

## 8. Chuẩn bị Supabase

Tạo project Supabase và điền vào `backend/.env`:

- `SUPABASE_URL`
- `SUPABASE_KEY`

Cần có các bảng tối thiểu:

- `sessions`
- `behavior_events`
- `behavior_segments`
- `telegram_logs`

---

## 9. Chuẩn bị Telegram

Nếu muốn dùng tính năng gửi Telegram, điền:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

vào `backend/.env`.

Bot phải được mở và `/start` trong chat trước.

---

## 10. Chạy backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend chạy tại:

```text
http://127.0.0.1:8000
```

Kiểm tra nhanh:

```bash
curl http://127.0.0.1:8000/health
```

---

## 11. Chạy frontend

Mở terminal mới:

```bash
cd frontend
npm install
npm run dev
```

Frontend chạy tại:

```text
http://127.0.0.1:3000
```

Mở trình duyệt vào:

```text
http://localhost:3000/dashboard
```

---

## 12. Chạy worker trên Colab

Mở file:

```text
colab_workerl (2).ipynb
```

trên Google Colab.

### Các bước:
1. Bật GPU trong Colab
2. Mount Google Drive
3. Sửa path model và job root trong notebook

Ví dụ nên sửa thành:

```python
RUN_DIR = "/content/drive/MyDrive/Classroom-Insight-Assistant/Model"
JOBS_ROOT = "/content/drive/MyDrive/classroom_jobs"
```

Trong đó:
- `RUN_DIR` là nơi chứa model trong Google Drive
- `JOBS_ROOT` là nơi chứa 4 folder:
  - `incoming`
  - `processing`
  - `done`
  - `failed`

### Sau đó:
- chạy cell cài package
- chạy cell mount Drive
- chạy cell cấu hình path
- chạy cell load model
- chạy cell start worker

---

## 13. Cách chạy toàn bộ hệ thống

### Bước 1
Chạy backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload
```

### Bước 2
Chạy frontend

```bash
cd frontend
npm run dev
```

### Bước 3
Mở Colab worker và chạy notebook

### Bước 4
Mở Dashboard:

```text
http://localhost:3000/dashboard
```

### Bước 5
Upload video:
- chọn lớp
- chọn video
- upload

### Bước 6
Worker sẽ lấy job từ Google Drive và chạy inference

### Bước 7
Khi job xong, frontend sẽ hiện session mới

---

## 14. Các API chính để hệ thống chạy

### Job
- `POST /jobs/upload`
- `GET /jobs/{job_id}/status`
- `GET /jobs/{job_id}/result`

### Session / kết quả
- `GET /classes-db`
- `GET /classes-db/{session_id}`
- `GET /classes-db/{session_id}/behavior-distribution`
- `GET /classes-db/{session_id}/segments`
- `GET /classes-db/{session_id}/telegram-logs`
- `GET /classes-db/{session_id}/top-phone-window`
- `GET /classes-db/{session_id}/top-negative-window`
- `GET /classes-db/{session_id}/ai-commentary`

### Prompt search / Telegram
- `POST /classes-db/{session_id}/prompt-search`
- `POST /classes-db/{session_id}/telegram-send-window`

---

## 15. Kiểm tra nếu chạy chưa được

### Backend không chạy
Kiểm tra:
- `backend/.env`
- Google OAuth file
- Supabase URL/key

### Frontend không gọi được API
Kiểm tra:
- backend có đang chạy không
- `frontend/.env.local` có đúng URL backend không

### Worker không thấy job
Kiểm tra:
- `JOBS_ROOT`
- 4 folder trên Google Drive
- đúng tài khoản Google Drive chưa

### Telegram không gửi được
Kiểm tra:
- bot token
- chat id
- bot đã `/start` chưa
- ffmpeg đã cài chưa
