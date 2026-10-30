from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_roles
from app.models import User, UserRole
from app.schemas import UserCreateByAdmin, UserOut
from app.security import hash_password

# Everything in this router is admin-only
router = APIRouter(
    prefix="/users",
    tags=["Users (admin)"],
    dependencies=[Depends(require_roles(UserRole.admin))],
)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(data: UserCreateByAdmin, db: Session = Depends(get_db)):
    """Create a driver, admin or resident account."""
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email is already registered")

    user = User(
        name=data.name,
        email=email,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email is already registered")
    db.refresh(user)
    return user


@router.get("", response_model=list[UserOut])
def list_users(role: UserRole | None = None, db: Session = Depends(get_db)):
    query = select(User).order_by(User.id)
    if role:
        query = query.where(User.role == role)
    return db.scalars(query).all()
