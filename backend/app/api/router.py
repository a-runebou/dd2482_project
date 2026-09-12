from fastapi import APIRouter

from app.api.config import router as config_router

api_router = APIRouter()

api_router.include_router(config_router)