import axios from "axios";

/** Axios instance pre-configured for the PharmaBridge backend. */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Attach the bearer token (if any) to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On an expired/invalid session, clear local state and bounce to login.
// Exclude the login request itself: a 401 there means "wrong credentials",
// which the Login page handles inline — redirecting would look like a refresh.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "";
    const isLoginRequest = url.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
