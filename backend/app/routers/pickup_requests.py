from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user
from app.models import PickupRequest, PickupStatus, User, UserRole
from app.schemas import (
    PickupRequestAssign,
    PickupRequestCreate,
    PickupRequestOut,
    PickupRequestUpdate,
)

router = APIRouter(prefix="/pickup-requests", tags=["Pickup requests"])


def _request_query():
    return select(PickupRequest).options(
        joinedload(PickupRequest.resident), joinedload(PickupRequest.driver)
    )


def _get_request(db: Session, request_id: int) -> PickupRequest:
    item = db.scalars(_request_query().where(PickupRequest.id == request_id)).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Pickup request not found")
    return item


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Administrator access required")


def _validate_future_date(value: date) -> None:
    if value < date.today():
        raise HTTPException(status_code=422, detail="Pickup date cannot be in the past")


@router.get("", response_model=list[PickupRequestOut])
def list_pickup_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = _request_query()
    if current_user.role == UserRole.resident:
        query = query.where(PickupRequest.resident_id == current_user.id)
    elif current_user.role == UserRole.driver:
        query = query.where(PickupRequest.driver_id == current_user.id)
    return db.scalars(query.order_by(PickupRequest.created_at.desc())).unique().all()


@router.post("", response_model=PickupRequestOut, status_code=status.HTTP_201_CREATED)
def create_pickup_request(
    data: PickupRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.resident:
        raise HTTPException(status_code=403, detail="Only residents can submit pickup requests")
    _validate_future_date(data.requested_date)
    item = PickupRequest(
        resident_id=current_user.id,
        location=data.location.strip(),
        waste_type=data.waste_type.strip(),
        description=data.description.strip(),
        requested_date=data.requested_date,
        status=PickupStatus.requested,
    )
    db.add(item)
    db.commit()
    return _get_request(db, item.id)


@router.patch("/{request_id}", response_model=PickupRequestOut)
def update_pickup_request(
    request_id: int,
    data: PickupRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_request(db, request_id)
    if current_user.role == UserRole.resident:
        if item.resident_id != current_user.id:
            raise HTTPException(status_code=404, detail="Pickup request not found")
        if item.status != PickupStatus.requested:
            raise HTTPException(status_code=409, detail="Only new requests can be edited")
    elif current_user.role == UserRole.admin:
        if item.status in (PickupStatus.completed, PickupStatus.cancelled):
            raise HTTPException(status_code=409, detail="Past requests cannot be edited")
    else:
        raise HTTPException(status_code=403, detail="Drivers cannot edit request details")

    changes = data.model_dump(exclude_unset=True)
    if "requested_date" in changes and changes["requested_date"] is not None:
        _validate_future_date(changes["requested_date"])
    for key in ("location", "waste_type", "description"):
        if key in changes and changes[key] is not None:
            changes[key] = changes[key].strip()
    for key, value in changes.items():
        setattr(item, key, value)
    db.commit()
    return _get_request(db, item.id)


@router.post("/{request_id}/assign", response_model=PickupRequestOut)
def assign_pickup_request(
    request_id: int,
    data: PickupRequestAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    item = _get_request(db, request_id)
    if item.status not in (PickupStatus.requested, PickupStatus.assigned):
        raise HTTPException(status_code=409, detail="This request can no longer be assigned")
    driver = db.get(User, data.driver_id)
    if driver is None or driver.role != UserRole.driver or not driver.is_active:
        raise HTTPException(status_code=422, detail="Choose an active driver account")
    item.driver_id = driver.id
    item.status = PickupStatus.assigned
    db.commit()
    return _get_request(db, item.id)


@router.post("/{request_id}/accept", response_model=PickupRequestOut)
def accept_pickup_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.driver:
        raise HTTPException(status_code=403, detail="Only drivers can accept assigned work")
    item = _get_request(db, request_id)
    if item.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="This task is assigned to another driver")
    if item.status != PickupStatus.assigned:
        raise HTTPException(status_code=409, detail="This task is not waiting for acceptance")
    item.status = PickupStatus.accepted
    db.commit()
    return _get_request(db, item.id)


@router.post("/{request_id}/complete", response_model=PickupRequestOut)
def complete_pickup_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.driver:
        raise HTTPException(status_code=403, detail="Only drivers can complete pickup tasks")
    item = _get_request(db, request_id)
    if item.driver_id != current_user.id:
        raise HTTPException(status_code=403, detail="This task is assigned to another driver")
    if item.status != PickupStatus.accepted:
        raise HTTPException(status_code=409, detail="Accept this task before completing it")
    item.status = PickupStatus.completed
    db.commit()
    return _get_request(db, item.id)


@router.delete("/history", response_model=dict[str, int])
def clear_pickup_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    result = db.execute(
        delete(PickupRequest).where(
            PickupRequest.status.in_([PickupStatus.completed, PickupStatus.cancelled])
        )
    )
    db.commit()
    return {"deleted": result.rowcount or 0}


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pickup_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    item = db.get(PickupRequest, request_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Pickup request not found")
    if item.status not in (PickupStatus.completed, PickupStatus.cancelled):
        raise HTTPException(status_code=409, detail="Only past requests can be deleted")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
