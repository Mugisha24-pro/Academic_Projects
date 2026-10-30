import enum
from datetime import date, datetime

from sqlalchemy import (
    Date, DateTime, Enum, Float, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    driver = "driver"
    resident = "resident"


class BinStatus(str, enum.Enum):
    active = "active"
    full = "full"
    maintenance = "maintenance"


class RouteStatus(str, enum.Enum):
    planned = "planned"
    in_progress = "in_progress"
    completed = "completed"


class ReportStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    resolved = "resolved"


class PickupStatus(str, enum.Enum):
    requested = "requested"
    assigned = "assigned"
    accepted = "accepted"
    completed = "completed"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.resident)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    routes: Mapped[list["Route"]] = relationship(back_populates="driver")
    reports: Mapped[list["Report"]] = relationship(back_populates="user")


class Bin(Base):
    __tablename__ = "bins"

    id: Mapped[int] = mapped_column(primary_key=True)
    location_name: Mapped[str] = mapped_column(String(150))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    capacity_liters: Mapped[int] = mapped_column(Integer, default=120)
    fill_level: Mapped[float] = mapped_column(Float, default=0)  # percent, 0 to 100
    status: Mapped[BinStatus] = mapped_column(Enum(BinStatus), default=BinStatus.active)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    stops: Mapped[list["RouteStop"]] = relationship(back_populates="bin")
    reports: Mapped[list["Report"]] = relationship(back_populates="bin")


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    scheduled_date: Mapped[date] = mapped_column(Date)
    status: Mapped[RouteStatus] = mapped_column(Enum(RouteStatus), default=RouteStatus.planned)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    driver: Mapped["User | None"] = relationship(back_populates="routes")
    stops: Mapped[list["RouteStop"]] = relationship(
        back_populates="route", cascade="all, delete-orphan"
    )


class RouteStop(Base):
    __tablename__ = "route_stops"

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"))
    bin_id: Mapped[int] = mapped_column(ForeignKey("bins.id"))
    stop_order: Mapped[int] = mapped_column(Integer)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    route: Mapped["Route"] = relationship(back_populates="stops")
    bin: Mapped["Bin"] = relationship(back_populates="stops")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    bin_id: Mapped[int] = mapped_column(ForeignKey("bins.id"))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.open)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="reports")
    bin: Mapped["Bin"] = relationship(back_populates="reports")


class PickupRequest(Base):
    __tablename__ = "pickup_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    resident_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    location: Mapped[str] = mapped_column(String(255))
    waste_type: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text)
    requested_date: Mapped[date] = mapped_column(Date)
    status: Mapped[PickupStatus] = mapped_column(Enum(PickupStatus), default=PickupStatus.requested, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    resident: Mapped["User"] = relationship(foreign_keys=[resident_id])
    driver: Mapped["User | None"] = relationship(foreign_keys=[driver_id])
