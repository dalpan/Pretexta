import axios from 'axios';

const BASE_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

const api = axios.create({ baseURL: BASE_URL });

// Attach auth token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('soceng_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear local auth state and reload to trigger login redirect
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('soceng_token');
      localStorage.removeItem('soceng_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
