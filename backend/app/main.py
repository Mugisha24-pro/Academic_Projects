from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models  # noqa: F401  (registers the tables)
from app.database import Base, engine, get_db
from app.routers import auth, bins, pickup_requests, routes, users

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Smart Waste Collection Management System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(bins.router)
app.include_router(routes.router)
app.include_router(pickup_requests.router)


@app.get("/")
def root():
    return {"message": "Smart Waste API is running"}


@app.get("/health")
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}
