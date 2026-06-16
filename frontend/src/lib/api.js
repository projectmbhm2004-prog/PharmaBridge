import axios from "axios";

// one axios instance pointed at the backend, used everywhere
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// stick the bearer token on every request if we have one
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// any 401 = dead session, so wipe local state and send them to login.
// except the login call itself - a 401 there just means wrong password, and the Login page
// shows that inline. redirecting would just look like the page refreshed on them.
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
