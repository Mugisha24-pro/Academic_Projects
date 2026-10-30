"""Create the first admin account.

Run from the backend folder (with the venv active):
    python create_admin.py
"""
from getpass import getpass

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import User, UserRole
from app.security import hash_password


def create_admin(name: str, email: str, password: str) -> User:
    Base.metadata.create_all(bind=engine)
    email = email.strip().lower()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise ValueError("A user with this email already exists")
        user = User(
            name=name.strip(),
            email=email,
            password_hash=hash_password(password),
            role=UserRole.admin,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


if __name__ == "__main__":
    name = input("Admin name: ").strip()
    email = input("Admin email: ").strip()
    password = getpass("Password (min 8 characters): ")
    if len(password) < 8 or len(password.encode("utf-8")) > 72:
        raise SystemExit("Password must be 8 to 72 characters long.")
    if password != getpass("Repeat password: "):
        raise SystemExit("Passwords do not match.")

    try:
        admin = create_admin(name, email, password)
    except ValueError as error:
        raise SystemExit(str(error))
    print(f"Admin created: {admin.email} (id {admin.id})")
