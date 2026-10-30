export type BinStatus = "active" | "full" | "maintenance";

export interface Bin {
  id: number;
  location_name: string;
  latitude: number;
  longitude: number;
  capacity_liters: number;
  fill_level: number;
  status: BinStatus;
  created_at: string;
  updated_at: string;
}

export type UserRole = "admin" | "resident" | "driver";

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export type RouteStatus = "planned" | "in_progress" | "completed";

export interface RouteStop {
  id: number;
  bin_id: number;
  stop_order: number;
  collected_at: string | null;
  bin: Bin;
}

export interface CollectionRoute {
  id: number;
  name: string;
  driver_id: number | null;
  driver: Pick<User, "id" | "name" | "email"> | null;
  scheduled_date: string;
  status: RouteStatus;
  created_at: string;
  stops: RouteStop[];
}

export type PickupStatus = "requested" | "assigned" | "accepted" | "submitted" | "completed" | "cancelled";

export interface PickupRequest {
  destination_bin_id: number | null;
  destination_bin: Bin | null;
  waste_volume_liters: number | null;
  id: number;
  resident_id: number;
  resident: Pick<User, "id" | "name">;
  driver_id: number | null;
  driver: Pick<User, "id" | "name"> | null;
  location: string;
  waste_type: string;
  description: string;
  requested_date: string;
  status: PickupStatus;
  created_at: string;
  updated_at: string;
}

export interface PickupRequestInput {
  destination_bin_id: number;
  waste_volume_liters: number;
  location: string;
  waste_type: string;
  description: string;
  requested_date: string;
}
