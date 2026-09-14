from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.config import router as config_router
from app.api.groups import router as groups_router
from app.api.me import router as me_router

api_router = APIRouter()

api_router.include_router(config_router)
api_router.include_router(auth_router)
api_router.include_router(me_router)
api_router.include_router(groups_router)
