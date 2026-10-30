import axios from "axios";
import type { Bin, CollectionRoute, LoginResponse, PickupRequest, PickupRequestInput, User } from "./types";

const TOKEN_KEY = "smart-waste.access-token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8001",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams({ username: email, password });
  const response = await api.post<LoginResponse>("/auth/login", body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  saveToken(response.data.access_token);
  return response.data;
}

export async function register(name: string, email: string, password: string): Promise<User> {
  const response = await api.post<User>("/auth/register", { name, email, password });
  return response.data;
}

export async function getCurrentUser(): Promise<User> {
  const response = await api.get<User>("/auth/me");
  return response.data;
}

export async function getBins(): Promise<Bin[]> {
  const response = await api.get<Bin[]>("/bins");
  return response.data;
}

export async function updateFillLevel(id: number, fillLevel: number): Promise<Bin> {
  const response = await api.patch<Bin>(`/bins/${id}`, { fill_level: fillLevel });
  return response.data;
}

export async function getRoutes(): Promise<CollectionRoute[]> {
  const response = await api.get<CollectionRoute[]>("/routes");
  return response.data;
}

export async function getDrivers(): Promise<User[]> {
  const response = await api.get<User[]>("/users", { params: { role: "driver" } });
  return response.data;
}

export async function getUsers(): Promise<User[]> {
  const response = await api.get<User[]>("/users");
  return response.data;
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: User["role"];
}): Promise<User> {
  const response = await api.post<User>("/users", data);
  return response.data;
}

export async function createRoute(data: {
  name: string;
  scheduled_date: string;
  driver_id: number | null;
  bin_ids: number[];
}): Promise<CollectionRoute> {
  const response = await api.post<CollectionRoute>("/routes", data);
  return response.data;
}

export async function collectRouteStop(routeId: number, stopId: number): Promise<CollectionRoute> {
  const response = await api.post<CollectionRoute>(`/routes/${routeId}/stops/${stopId}/collect`);
  return response.data;
}

export async function deleteRoute(routeId: number): Promise<void> {
  await api.delete(`/routes/${routeId}`);
}

export async function getPickupRequests(): Promise<PickupRequest[]> {
  const response = await api.get<PickupRequest[]>("/pickup-requests");
  return response.data;
}

export async function createPickupRequest(data: PickupRequestInput): Promise<PickupRequest> {
  const response = await api.post<PickupRequest>("/pickup-requests", data);
  return response.data;
}

export async function updatePickupRequest(id: number, data: Partial<PickupRequestInput>): Promise<PickupRequest> {
  const response = await api.patch<PickupRequest>(`/pickup-requests/${id}`, data);
  return response.data;
}

export async function assignPickupRequest(id: number, driverId: number): Promise<PickupRequest> {
  const response = await api.post<PickupRequest>(`/pickup-requests/${id}/assign`, { driver_id: driverId });
  return response.data;
}

export async function acceptPickupRequest(id: number): Promise<PickupRequest> {
  const response = await api.post<PickupRequest>(`/pickup-requests/${id}/accept`);
  return response.data;
}

export async function completePickupRequest(id: number): Promise<PickupRequest> {
  const response = await api.post<PickupRequest>(`/pickup-requests/${id}/complete`);
  return response.data;
}

export async function clearPickupHistory(): Promise<number> {
  const response = await api.delete<{ deleted: number }>("/pickup-requests/history");
  return response.data.deleted;
}

export async function deletePickupRequest(id: number): Promise<void> {
  await api.delete(`/pickup-requests/${id}`);
}

export function getApiError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}
