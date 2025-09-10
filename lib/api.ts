import axios from "axios";
import { toast } from "react-toastify"
// Base URL from env or fallback
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 10000,
});

// ---------- Interfaces ----------

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  token?: string;
  api_key?: string;
  user?: any;
}

interface LoginData {
  email: string;
  password: string;
}
interface SignupData {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
}
interface ForgotPasswordData {
  email: string;
}
interface ResetPasswordData {
  token: string;
  new_password: string;
}

interface Patient {
  id: string;
  firstname: string;
  lastname: string;
  age: number;
  gender: string;
  dob: string;
  email?: string;
  phone?: string;
  address?: string;
  created_at: string;
}

interface CreatePatientData {
  firstname: string;
  lastname: string;
  age: number;
  gender: string;
  dob: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface User {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
}

interface SOAPNote {
  id: string;
  user_id: string;
  soap_data: {
    subjective: any;
    objective: any;
    assessment: string;
    plan: any;
  };
  summary: string;
  transcript: string;
  diarized_transcript: string;
  s3_key: string;
  created_at: string;
}

interface SOAPNotesResponse {
  soap_notes: SOAPNote[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ---------- Schedules & Slots Types ----------
export interface CreateScheduleRequest {
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  patients_per_slot: number;
  location: string;
  days_of_week: string[];
  recurring_interval_weeks: number;
}

export interface Schedule {
  id: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  patients_per_slot: number;
  location: string;
  days_of_week: string[];
  recurring_interval_weeks: number;
}

export interface Slot {
  id: string;
  schedule_id: string;
  doctor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_patients: number;
  current_patients: number;
  status: "AVAILABLE" | "FULL" | "BLOCKED";
  location: string;
}

// ---------- Error Class ----------

class ApiError extends Error {
  constructor(public status: number, message: any) {
    const normalized = typeof message === "string"
      ? message
      : (() => { try { return JSON.stringify(message) } catch { return String(message) } })();
    super(normalized);
    this.name = "ApiError";
  }
}

// ---------- Core Request Function ----------

async function apiRequest<T>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    data?: any;
    params?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<ApiResponse<T>> {
  const { method = "GET", data, params, headers = {} } = options;

  console.log(`🌐 Making ${method} request to: ${API_BASE_URL}${endpoint}`);
  console.log("🌐 Request data:", data);
  console.log("🌐 Request headers:", headers);

  try {
    const response = await apiClient.request({
      url: endpoint,
      method,
      data,
      params,
      headers,
    });

    console.log("🌐 Response status:", response.status);
    console.log("🌐 Response data:", response.data);

    return {
      success: true,
      data: response.data.data || response.data,
      token: response.data.access_token,
      api_key: response.data.api_key,
      user: response.data.user,
    };
  } catch (error: any) {
    console.error("❌ API Request failed:", {
      endpoint,
      method,
      baseURL: API_BASE_URL,
      error: error.message,
      code: error.code,
      status: error.response?.status,
      data: error.response?.data,
    });

    if (error && error.response) {
      const status = error.response.status || 500;
      const message =
        error.response.data?.detail ||
        error.response.data?.message ||
        error.message ||
        "API request failed";

      throw new ApiError(status, message);
    }

    if (error.code === "ECONNABORTED") {
      throw new ApiError(
        408,
        `Request timeout - server at ${API_BASE_URL} not responding.`
      );
    }
    if (error.code === "ERR_NETWORK") {
      throw new ApiError(503, `Cannot connect to server at ${API_BASE_URL}.`);
    }

    throw new ApiError(500, `Network error: ${error.message}`);
  }
}

// ---------- Header Helpers ----------

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  console.log(
    "🔑 Access Token from localStorage:",
    token ? "Present" : "Missing"
  );
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function getApiKeyAuthHeaders(): Record<string, string> {
  const apiKey = localStorage.getItem("api_key");
  return apiKey ? { "x-api-key": apiKey } : {};
}

// ---------- Auth & Patients API ----------

export const authApi = {
  async login(
    credentials: LoginData
  ): Promise<{ token: string; api_key: string; user: User }> {
    const response = await apiRequest<{
      access_token: string;
      api_key: string;
      user: User;
    }>("/login", {
      method: "POST",
      data: credentials,
    });

    if (!response.token || !response.api_key) {
      throw new Error("Login response missing tokens.");
    }

    localStorage.setItem("token", response.token);
    localStorage.setItem("api_key", response.api_key);
    localStorage.setItem("user", JSON.stringify(response.user));

    return {
      token: response.token,
      api_key: response.api_key,
      user: response.user!,
    };
  },

  async signup(
    userData: SignupData
  ): Promise<{ token: string; user: User; api_key?: string }> {
    const response = await apiRequest<{
      access_token: string;
      user: User;
      api_key?: string;
    }>("/signup", {
      method: "POST",
      data: userData,
    });

    localStorage.setItem("token", response.token!);
    localStorage.setItem("user", JSON.stringify(response.user));

    return {
      token: response.token!,
      user: response.user!,
      api_key: response.api_key,
    };
  },

  async updateProfile(profileData: {
    firstname: string;
    lastname: string;
    email: string;
    phone?: string;
    specialty?: string;
  }): Promise<any> {
    const response = await apiRequest("/update-profile-information", {
      method: "PUT",
      data: profileData,
      headers: {
        ...getAuthHeaders(),
        ...getApiKeyAuthHeaders(),
      },
    });
    if (!response.success) {
      throw new ApiError(500, response.message || "Failed to update profile");
    }
    return response.data;
  },

  async logout(): Promise<void> {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      await apiRequest("/logout", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // ignore
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("api_key");
      localStorage.removeItem("user");
    }
  },

  async getCurrentUser(): Promise<User | null> {
    const token = localStorage.getItem("token");
    if (!token) return null;

    try {
      const response = await apiRequest<User>("/me", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      return response.success ? response.data || null : null;
    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("api_key");
      localStorage.removeItem("user");
      return null;
    }
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await apiRequest<{ message: string }>("/forgot-password", {
      method: "POST",
      data: { email },
    });
    if (!response.success)
      throw new Error(response.message || "Failed to send reset email");
    return { message: response.message || "Reset email sent" };
  },

  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const response = await apiRequest<{ message: string }>("/reset-password", {
      method: "POST",
      data: { token, new_password: newPassword },
    });
    if (!response.success)
      throw new Error(response.message || "Failed to reset password");
    return { message: response.message || "Password reset successfully" };
  },

  // ✅ Call /user/patients
  async getPatients(): Promise<Patient[]> {
    const response = await apiRequest<Patient[]>("/patients", {
      headers: {
        ...getAuthHeaders(),
        ...getApiKeyAuthHeaders(),
      },
    });
    if (!response.success)
      throw new Error(response.message || "Failed to fetch patients");
    return response.data || [];
  },

  async createPatient(patientData: CreatePatientData): Promise<Patient> {
    const response = await apiRequest<Patient>("/patients", {
      method: "POST",
      data: patientData,
      headers: {
        ...getAuthHeaders(),
        ...getApiKeyAuthHeaders(),
      },
    });
    if (!response.success)
      throw new Error(response.message || "Failed to create patient");
    return response.data!;
  },
};

// ---------- Health Report Upload API ----------

export async function uploadHealthReportApi(
  userId: string,
  file: File,
  patientInfo: any = {},
  onUploadProgress?: (percent: number) => void
): Promise<any> {
  const authHeaders = getAuthHeaders();
  const apiKeyHeaders = getApiKeyAuthHeaders();

  if (!authHeaders.authorization || !apiKeyHeaders["x-api-key"]) {
    throw new Error("Missing access token or API key. Please login again.");
  }

  const formData = new FormData();
  formData.append("file", file);
  Object.keys(patientInfo).forEach((k) =>
    formData.append(k, patientInfo[k] ?? "")
  );

  const response = await axios.post(
    `${API_BASE_URL}/healthreport/parse`,   
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
        ...authHeaders,
        ...apiKeyHeaders,
      },
      timeout: 60000,
      onUploadProgress: (e: any) => {
        if (e.total && onUploadProgress) {
          onUploadProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    } as any
  );

  // Success toast after upload + parse
  toast.success("Health Report Uploaded and parsed.");

  return response.data;
}
// Interface for /generate-soap-note response result
export interface GenerateSoapNoteResponse {
  soap_data: {
    subjective: Record<string, any>;
    objective: Record<string, any>;
    assessment: string;
    plan: any;
  };
  user_id: string;
  patient_id: string;
  transcript?: string;
  summary?: string;
  speakers?: any[];
  diarized_transcript?: string;
}

// ---------- Health Report Parse API (NEW) ----------

export async function parseHealthReportApi(
  patientId: string,
  userId: string,
  file: File,
  onUploadProgress?: (percent: number) => void
): Promise<any> {
  const authHeaders = getAuthHeaders();
  const apiKeyHeaders = getApiKeyAuthHeaders();

  if (!authHeaders.authorization || !apiKeyHeaders["x-api-key"]) {
    throw new Error("Missing access token or API key. Please login again.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await axios.post(
    `${API_BASE_URL}/healthreport/parse/${patientId}`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
        ...authHeaders,
        ...apiKeyHeaders,
      },
      onUploadProgress: (e: any) => {
        if (e.total && onUploadProgress) {
          onUploadProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
      timeout: 60000,
    } as any
  );

  return response.data;
}

// ---------- SOAP Notes API ----------

export const soapApi = {
  async getNotes(page = 1, limit = 10): Promise<SOAPNotesResponse> {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const userId = user.id || user._id;
    if (!userId) throw new Error("User ID not found. Please login again.");

    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    };
    const response = await apiRequest<SOAPNotesResponse>(
      "/soap-notes-history",
      {
        params: { page, limit, user_id: userId },
        headers,
      }
    );
    if (!response.success)
      throw new Error(response.message || "Failed to fetch SOAP notes");
    return response.data!;
  },

  async getNoteById(noteId: string): Promise<SOAPNote> {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const userId = user.id || user._id;
    if (!userId) throw new Error("User ID not found. Please login again.");
    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    };
    const response = await apiRequest<SOAPNote>(`/soap/notes/${noteId}`, {
      params: { user_id: userId },
      headers,
    });
    if (!response.success)
      throw new Error(response.message || "Failed to fetch SOAP note");
    return response.data!;
  },

  async createNote(noteData: {
    patientId: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  }): Promise<{ id: string; note: SOAPNote }> {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const userId = user.id || user._id;
    if (!userId) throw new Error("User ID not found. Please login again.");

    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    };
    const response = await apiRequest<{ id: string; note: SOAPNote }>(
      "/soap/notes",
      {
        method: "POST",
        headers,
        data: { ...noteData, user_id: userId },
      }
    );
    if (!response.success)
      throw new Error(response.message || "Failed to create SOAP note");
    return response.data!;
  },

  async deleteNote(noteId: string): Promise<void> {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const userId = user.id || user._id;
    if (!userId) throw new Error("User ID not found. Please login again.");
    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    };
    const response = await apiRequest(`/soap/notes/${noteId}`, {
      method: "DELETE",
      params: { user_id: userId },
      headers,
    });
    if (!response.success)
      throw new Error(response.message || "Failed to delete SOAP note");
  },

  async generateSoapNote(
    formData: FormData,
    onUploadProgress?: (percent: number) => void
  ): Promise<GenerateSoapNoteResponse> {
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();

    if (!authHeaders.authorization || !apiKeyHeaders["x-api-key"]) {
      throw new Error("Missing access token or API key. Please login again.");
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}/generate-soap-note`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            ...authHeaders,
            ...apiKeyHeaders,
          },
          onUploadProgress: (progressEvent: any) => {
            if (progressEvent.total && onUploadProgress) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              onUploadProgress(percentCompleted);
            }
          },
          timeout: 60000, // 60 seconds
        } as any
      );

      // Defensive: check that response.data is an object and has a 'result' property
      if (
        response.data &&
        typeof response.data === "object" &&
        "result" in response.data
      ) {
        return (response.data as { result: GenerateSoapNoteResponse }).result;
      }

      throw new Error("Invalid response from server: missing result");
    } catch (error: any) {
      console.error("Error in generateSoapNote:", error);
      throw new Error(
        error.response?.data?.message ||
          error.message ||
          "Failed to generate SOAP note"
      );
    }
  },
};

// ---------- Schedules & Slots API ----------
export const schedulesApi = {
  async list(): Promise<Schedule[]>{
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();
    const res = await apiRequest<{ schedules: Schedule[] }>(
      "/schedules/",
      { method: "GET", headers: { ...authHeaders, ...apiKeyHeaders } }
    );
    const payload = (res.data as any) || {};
    return payload.schedules ?? (Array.isArray(payload) ? payload : []);
  },

  async create(data: CreateScheduleRequest): Promise<{ schedule: Schedule; slots?: Slot[] }>{
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();

    const response = await apiRequest<{ schedule: Schedule; slots?: Slot[] }>(
      "/schedules/",
      { method: "POST", data, headers: { ...authHeaders, ...apiKeyHeaders } }
    );

    return response.data as any;
  },

  async update(scheduleId: string, data: Partial<CreateScheduleRequest>): Promise<{ schedule: Schedule; slots?: Slot[] }>{
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();

    const response = await apiRequest<{ schedule: Schedule; slots?: Slot[] }>(
      `/schedules/${scheduleId}`,
      { method: "PUT", data, headers: { ...authHeaders, ...apiKeyHeaders } }
    );

    return response.data as any;
  },

  async getSlotsForSchedule(scheduleId: string): Promise<Slot[]>{
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();

    const res = await apiRequest<{ slots: Slot[] }>(
      `/schedules/${scheduleId}/slots`,
      { method: "GET", headers: { ...authHeaders, ...apiKeyHeaders } }
    );
    const payload = (res.data as any) || {};
    return payload.slots ?? (Array.isArray(payload) ? payload : []);
  },

  async delete(scheduleId: string): Promise<void> {
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();

    await apiRequest(`/schedules/${scheduleId}` as any, {
      method: "DELETE",
      headers: { ...authHeaders, ...apiKeyHeaders },
    });
  },

  async getDatesWithSlots(location: string, fromDate: string, days: number = 30): Promise<Array<{date: string; available_slots: number}>> {
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();

    const response = await apiRequest<{dates: Array<{date: string; available_slots: number}>}>(
      `/schedules/locations/${encodeURIComponent(location)}/dates-with-slots?from_date=${fromDate}&days=${days}`,
      { method: "GET", headers: { ...authHeaders, ...apiKeyHeaders } }
    );
    return response.data?.dates || [];
  },

  async bulkReschedule(scheduleId: string, targetDate: string, location: string): Promise<{
    rescheduledCount: number;
    remainingCount: number;
    conflicts: any[];
    moved: Array<{appointment_id: string; new_slot_id: string; date: string; location: string}>;
  }> {
    const authHeaders = getAuthHeaders();
    const apiKeyHeaders = getApiKeyAuthHeaders();

    const response = await apiRequest<{
      rescheduledCount: number;
      remainingCount: number;
      conflicts: any[];
      moved: Array<{appointment_id: string; new_slot_id: string; date: string; location: string}>;
    }>(
      "/appointments/reschedule/bulk",
      { 
        method: "POST", 
        data: { schedule_id: scheduleId, date: targetDate, location },
        headers: { ...authHeaders, ...apiKeyHeaders } 
      }
    );
    return response.data!;
  },
};

// ---------- Reports API (Biomarkers) ----------

export interface BiomarkerReportResponse {
  reports: Array<{
    report_id: string;
    patient_id?: string;
    patient_info?: any;
    original_filename?: string;
    test_date?: string;
    report_name?: string;
    test_category?: string;
    biomarkers: Array<{
      name: string;
      result_value: string;
      unit?: string | null;
      reference_range?: string | null;
      status?: string | null;
      category?: string | null;
      source_page?: number;
    }>;
    biomarkers_count?: number;
    provider_used?: string;
    created_at?: string;
    pdf_key?: string;
    bucket?: string;
  }>;
  pagination: {
    current_page: number;
    per_page: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export async function fetchReports(params: {
  patient_id?: string;
  test_date_from?: string;
  test_date_to?: string;
  created_date_from?: string;
  created_date_to?: string;
  report_type?: string;
  page?: number;
  limit?: number;
} = {}): Promise<BiomarkerReportResponse> {
  const response = await apiRequest<BiomarkerReportResponse>("/healthreport/get_reports", {
    params,
    headers: {
      ...getAuthHeaders(),
      ...getApiKeyAuthHeaders(),
    },
  })
  if (!response.success) {
    throw new Error(response.message || "Failed to fetch reports")
  }
  return response.data as BiomarkerReportResponse
}

// ---------- Dashboard Stats (Single API with fallback) ----------

export interface DashboardStats {
  totalNotes: number;
  thisWeek: number;
  avgProcessingTimeMs: number | null;
  activePatients: number;
  changes?: {
    totalNotesPct?: number | null;
    thisWeekPct?: number | null;
    avgProcessingTimePct?: number | null;
    activePatientsPct?: number | null;
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Try dedicated endpoint if backend provides it
  try {
    const response = await apiRequest<DashboardStats>(`${API_BASE_URL}/dashboard-stats`, {
      headers: {
        ...getAuthHeaders(),
        ...getApiKeyAuthHeaders(),
      },
    });
    if (response.success && response.data) {
      const data = response.data as any;
      return {
        totalNotes: Number(data.total_notes ?? data.totalNotes ?? 0),
        thisWeek: Number(data.notes_last_7_days ?? data.thisWeek ?? 0),
        avgProcessingTimeMs: data.avg_processing_ms ?? data.avgProcessingTimeMs ?? null,
        activePatients: Number(data.active_patients ?? data.activePatients ?? 0),
        changes: {
          totalNotesPct: data.total_notes_change_pct ?? null,
          thisWeekPct: data.notes_last_7_days_change_pct ?? null,
          avgProcessingTimePct: data.avg_processing_ms_change_pct ?? null,
          activePatientsPct: data.active_patients_change_pct ?? null,
        },
      };
    }
  } catch (e: any) {
    console.error("Error in getDashboardStats:", e);
    return {  
      totalNotes: 0,
      thisWeek: 0,
      avgProcessingTimeMs: null,
      activePatients: 0,
    };
  }
  return { totalNotes: 0, thisWeek: 0, avgProcessingTimeMs: null, activePatients: 0 };
}