from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Bin, BinStatus, Route, RouteStatus, RouteStop, User, UserRole
from app.schemas import RouteCreate, RouteOut, RouteUpdate

router = APIRouter(prefix="/routes", tags=["Routes"])


def _route_query():
    return select(Route).options(
        joinedload(Route.driver),
        selectinload(Route.stops).joinedload(RouteStop.bin),
    )


def _get_route(db: Session, route_id: int) -> Route:
    route = db.scalars(_route_query().where(Route.id == route_id)).first()
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    route.stops.sort(key=lambda stop: stop.stop_order)
    return route


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Administrator access required")


def _validate_driver(db: Session, driver_id: int | None) -> None:
    if driver_id is None:
        return
    driver = db.get(User, driver_id)
    if driver is None or driver.role != UserRole.driver or not driver.is_active:
        raise HTTPException(status_code=422, detail="Choose an active driver account")


def _make_stops(db: Session, bin_ids: list[int]) -> list[RouteStop]:
    bins = db.scalars(select(Bin).where(Bin.id.in_(bin_ids))).all()
    by_id = {bin_.id: bin_ for bin_ in bins}
    missing = [bin_id for bin_id in bin_ids if bin_id not in by_id]
    if missing:
        raise HTTPException(status_code=422, detail=f"Bin not found: {missing[0]}")
    return [
        RouteStop(bin=by_id[bin_id], stop_order=index)
        for index, bin_id in enumerate(bin_ids, start=1)
    ]


@router.get("", response_model=list[RouteOut])
def list_routes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.admin:
        query = _route_query().order_by(Route.scheduled_date, Route.id)
    elif current_user.role == UserRole.driver:
        query = _route_query().where(Route.driver_id == current_user.id).order_by(
            Route.scheduled_date, Route.id
        )
    else:
        raise HTTPException(status_code=403, detail="Driver or administrator access required")
    routes = db.scalars(query).unique().all()
    for route in routes:
        route.stops.sort(key=lambda stop: stop.stop_order)
    return routes


@router.post("", response_model=RouteOut, status_code=status.HTTP_201_CREATED)
def create_route(
    data: RouteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    _validate_driver(db, data.driver_id)
    route = Route(
        name=data.name.strip(),
        scheduled_date=data.scheduled_date,
        driver_id=data.driver_id,
        stops=_make_stops(db, data.bin_ids),
    )
    db.add(route)
    db.commit()
    return _get_route(db, route.id)


@router.get("/{route_id}", response_model=RouteOut)
def get_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = _get_route(db, route_id)
    if current_user.role != UserRole.admin and not (
        current_user.role == UserRole.driver and route.driver_id == current_user.id
    ):
        raise HTTPException(status_code=403, detail="This route is not assigned to you")
    return route


@router.patch("/{route_id}", response_model=RouteOut)
def update_route(
    route_id: int,
    data: RouteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    route = _get_route(db, route_id)
    if route.status != RouteStatus.planned:
        raise HTTPException(status_code=409, detail="Only planned routes can be edited")

    changes = data.model_dump(exclude_unset=True)
    if "driver_id" in changes:
        _validate_driver(db, changes["driver_id"])
    bin_ids = changes.pop("bin_ids", None)
    if bin_ids is not None:
        route.stops.clear()
        route.stops.extend(_make_stops(db, bin_ids))
    for field, value in changes.items():
        if field == "name" and value is not None:
            value = value.strip()
        setattr(route, field, value)
    db.commit()
    return _get_route(db, route.id)


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    if route.status != RouteStatus.planned:
        raise HTTPException(status_code=409, detail="Only planned routes can be deleted")
    db.delete(route)
    db.commit()


@router.post("/{route_id}/stops/{stop_id}/collect", response_model=RouteOut)
def collect_stop(
    route_id: int,
    stop_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = _get_route(db, route_id)
    if current_user.role != UserRole.admin and not (
        current_user.role == UserRole.driver and route.driver_id == current_user.id
    ):
        raise HTTPException(status_code=403, detail="This route is not assigned to you")
    if route.status == RouteStatus.completed:
        raise HTTPException(status_code=409, detail="This route is already complete")
    stop = next((item for item in route.stops if item.id == stop_id), None)
    if stop is None:
        raise HTTPException(status_code=404, detail="Stop not found on this route")
    if stop.collected_at is not None:
        raise HTTPException(status_code=409, detail="This stop is already collected")

    stop.collected_at = datetime.now(timezone.utc)
    if stop.bin.status != BinStatus.maintenance:
        stop.bin.fill_level = 0
        stop.bin.status = BinStatus.active
    route.status = RouteStatus.in_progress
    if all(item.collected_at is not None for item in route.stops):
        route.status = RouteStatus.completed
    db.commit()
    return _get_route(db, route.id)
