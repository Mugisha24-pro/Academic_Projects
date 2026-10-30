from datetime import date, datetime
from typing import Annotated

from pydantic import (
    BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator,
)

from app.models import BinStatus, PickupStatus, RouteStatus, UserRole

# ---------------------------------------------------------------- Bins


class BinBase(BaseModel):
    location_name: str = Field(min_length=1, max_length=150)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    capacity_liters: int = Field(default=120, gt=0)


class BinCreate(BinBase):
    pass


class BinUpdate(BaseModel):
    location_name: str | None = Field(default=None, min_length=1, max_length=150)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    capacity_liters: int | None = Field(default=None, gt=0)
    fill_level: float | None = Field(default=None, ge=0, le=100)
    status: BinStatus | None = None


class BinOut(BinBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fill_level: float
    status: BinStatus
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- Users

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class UserRegister(BaseModel):
    name: Name
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, value: str) -> str:
        # bcrypt only uses the first 72 bytes of a password
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 bytes long")
        return value


class UserCreateByAdmin(UserRegister):
    role: UserRole = UserRole.driver


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------------------------------------------------------- Routes


class RouteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scheduled_date: date
    driver_id: int | None = None
    bin_ids: list[int] = Field(min_length=1)

    @field_validator("bin_ids")
    @classmethod
    def bins_must_be_unique(cls, value: list[int]) -> list[int]:
        if len(value) != len(set(value)):
            raise ValueError("A bin can only appear once on a route")
        return value


class RouteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    scheduled_date: date | None = None
    driver_id: int | None = None
    bin_ids: list[int] | None = None

    @field_validator("bin_ids")
    @classmethod
    def bins_must_be_unique(cls, value: list[int] | None) -> list[int] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("A bin can only appear once on a route")
        return value


class RouteDriverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


class RouteStopOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bin_id: int
    stop_order: int
    collected_at: datetime | None
    bin: BinOut


class RouteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    driver_id: int | None
    driver: RouteDriverOut | None
    scheduled_date: date
    status: RouteStatus
    created_at: datetime
    stops: list[RouteStopOut]


# ---------------------------------------------------------------- Pickup requests


class PickupRequestCreate(BaseModel):
    location: str = Field(min_length=4, max_length=255)
    waste_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=2000)
    requested_date: date


class PickupRequestUpdate(BaseModel):
    location: str | None = Field(default=None, min_length=4, max_length=255)
    waste_type: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, min_length=5, max_length=2000)
    requested_date: date | None = None


class PickupRequestAssign(BaseModel):
    driver_id: int


class PickupRequestPersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class PickupRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    resident_id: int
    resident: PickupRequestPersonOut
    driver_id: int | None
    driver: PickupRequestPersonOut | None
    location: str
    waste_type: str
    description: str
    requested_date: date
    status: PickupStatus
    created_at: datetime
    updated_at: datetime
