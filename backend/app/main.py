from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(title="Schedular API")
app.include_router(
    api_router,
    prefix="/api/v1"
)

@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"} 
