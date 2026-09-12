from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.config import router as config_router

api_router = APIRouter()

api_router.include_router(config_router)
api_router.include_router(auth_router)