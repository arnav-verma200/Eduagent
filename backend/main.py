import os
import uvicorn
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Import routers
from backend.routers import exams, students, reports

app = FastAPI(
    title="EduAgent API",
    description="Multi-agent AI-powered exam design, evaluation, diagnostics, and integrity platform.",
    version="1.0.0"
)

# CORS middleware for hackathon connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for the hackathon
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(exams.router)
app.include_router(students.router)
app.include_router(reports.router)

@app.get("/")
async def root():
    return {
        "name": "EduAgent API Backend",
        "status": "healthy",
        "gemini_api_configured": os.getenv("GEMINI_API_KEY") is not None,
        "supabase_configured": os.getenv("SUPABASE_URL") is not None
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    # Run uvicorn server
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=True)
