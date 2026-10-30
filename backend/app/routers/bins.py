from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_roles
from app.models import Bin, BinStatus, UserRole
from app.schemas import BinCreate, BinOut, BinUpdate

# Every endpoint needs a logged-in user; writing endpoints also need the admin role
router = APIRouter(
    prefix="/bins",
    tags=["Bins"],
    dependencies=[Depends(get_current_user)],
)

admin_only = Depends(require_roles(UserRole.admin))

PRIORITY_THRESHOLD = 80  # percent


@router.post("", response_model=BinOut, status_code=201, dependencies=[admin_only])
def create_bin(data: BinCreate, db: Session = Depends(get_db)):
    bin_ = Bin(**data.model_dump())
    db.add(bin_)
    db.commit()
    db.refresh(bin_)
    return bin_


@router.get("", response_model=list[BinOut])
def list_bins(
    status: BinStatus | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = select(Bin).order_by(Bin.id).offset(skip).limit(limit)
    if status:
        query = query.where(Bin.status == status)
    return db.scalars(query).all()


# Must be defined before "/{bin_id}" so "priority" is not read as an id
@router.get("/priority", response_model=list[BinOut])
def priority_bins(db: Session = Depends(get_db)):
    query = (
        select(Bin)
        .where(Bin.fill_level >= PRIORITY_THRESHOLD)
        .order_by(Bin.fill_level.desc())
    )
    return db.scalars(query).all()


@router.get("/{bin_id}", response_model=BinOut)
def get_bin(bin_id: int, db: Session = Depends(get_db)):
    bin_ = db.get(Bin, bin_id)
    if not bin_:
        raise HTTPException(status_code=404, detail="Bin not found")
    return bin_


@router.patch("/{bin_id}", response_model=BinOut, dependencies=[admin_only])
def update_bin(bin_id: int, data: BinUpdate, db: Session = Depends(get_db)):
    bin_ = db.get(Bin, bin_id)
    if not bin_:
        raise HTTPException(status_code=404, detail="Bin not found")

    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(bin_, field, value)

    # Smart rule: if only the fill level was sent, update the status automatically
    if "fill_level" in changes and "status" not in changes:
        if bin_.status != BinStatus.maintenance:
            bin_.status = (
                BinStatus.full
                if bin_.fill_level >= PRIORITY_THRESHOLD
                else BinStatus.active
            )

    db.commit()
    db.refresh(bin_)
    return bin_


@router.delete("/{bin_id}", status_code=204, dependencies=[admin_only])
def delete_bin(bin_id: int, db: Session = Depends(get_db)):
    bin_ = db.get(Bin, bin_id)
    if not bin_:
        raise HTTPException(status_code=404, detail="Bin not found")
    db.delete(bin_)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This bin is used by a route and cannot be deleted",
        )
    return Response(status_code=204)
