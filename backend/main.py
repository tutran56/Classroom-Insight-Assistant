from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.controllers.analytics_controller import router as analytics_router
from app.controllers.class_controller import router as class_router
from app.controllers.job_controller import router as job_router
from app.core.config import settings

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

settings.DATA_DIR.mkdir(parents=True, exist_ok=True)
settings.DEMO_OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
(settings.DATA_DIR / "tmp_jobs").mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(settings.DATA_DIR)), name="static")

app.include_router(class_router)
app.include_router(analytics_router)
app.include_router(job_router)


@app.get("/")
def root():
    return {
        "message": "Classroom Behavior MVC API is running",
        "environment": settings.APP_ENV,
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "app_name": settings.APP_NAME,
        "data_dir": str(settings.DATA_DIR),
        "demo_outputs_dir": str(settings.DEMO_OUTPUTS_DIR),
    }