export interface ApiError {
  message: string;
  type?: string;
}

export interface SuccessResponse<T> {
  data: T;
  success: boolean;
}

export interface ErrorResponse {
  error?: string;
  message?: string;
  detail?: string;
  status?: string;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Astronaut {
  id: number;
  callsign: string;
  name: string;
  age: number;
  agency: string;
}

export interface Mission {
  id: number;
  code: string;
  name: string;
  category: string;
  destination: string;
  phase: string;
  status: string;
}
