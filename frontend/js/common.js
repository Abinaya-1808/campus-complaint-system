/*
==================================================
  CAMPUS COMPLAINT SYSTEM - COMMON API & HELPERS
==================================================
*/

// Centralized Backend API Base URL
// Automatically selects local backend when developing locally, and production URL when deployed
const IS_LOCAL_DEV = (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'file:'
);

const API_BASE_URL = window.__API_URL__ || (
    IS_LOCAL_DEV
        ? 'http://127.0.0.1:5000/api'
        : 'https://campus-complaint-backend.onrender.com/api'
);

// Get stored JWT token
function getToken() {
    return localStorage.getItem('token') || '';
}

// Get currently logged-in user profile from session
function getCurrentUser() {
    try {
        const data = localStorage.getItem('currentUser');
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
}

// Save session safely (never stores password or hashes)
function setSession(token, user) {
    if (token) {
        localStorage.setItem('token', token);
    }
    if (user) {
        const safeUser = {
            id: user.id || user._id,
            _id: user._id || user.id,
            name: user.name || '',
            email: user.email || '',
            role: user.role || 'student',
            studentId: user.studentId || user.registerNumber || '',
            registerNumber: user.registerNumber || user.studentId || '',
            department: user.department || '',
            year: user.year || '',
            phone: user.phone || ''
        };
        localStorage.setItem('currentUser', JSON.stringify(safeUser));
    }
}

// Clear session on logout or token expiry
function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
}

// Centralized Fetch Wrapper
async function apiFetch(endpoint, options = {}) {
    const url = endpoint.startsWith('http')
        ? endpoint
        : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const token = getToken();
    if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        ...options,
        headers
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // Handle token expiration on protected routes
            if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
                clearSession();
                if (!window.location.pathname.endsWith('login.html')) {
                    window.location.href = 'login.html';
                }
            }

            const error = new Error(data.message || `Request failed with status ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    } catch (err) {
        if (err.name === 'TypeError' && err.message.toLowerCase().includes('fetch')) {
            const netErr = new Error('Cannot connect to the backend server. Please verify the server is running on port 5000.');
            netErr.status = 0;
            throw netErr;
        }
        throw err;
    }
}

// Session verification helper
async function checkAuth(requiredRole = null) {
    const token = getToken();
    const user = getCurrentUser();

    if (!token || !user) {
        clearSession();
        window.location.href = 'login.html';
        return null;
    }

    if (requiredRole && user.role !== requiredRole) {
        if (user.role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'student-dashboard.html';
        }
        return null;
    }

    try {
        const res = await apiFetch('/auth/me');
        if (res.success && res.user) {
            setSession(token, res.user);

            // Re-verify against server's actual role to prevent LocalStorage tampering
            if (requiredRole && res.user.role !== requiredRole) {
                if (res.user.role === 'admin') {
                    window.location.href = 'admin-dashboard.html';
                } else {
                    window.location.href = 'student-dashboard.html';
                }
                return null;
            }

            if (res.user.role === 'student') {
                updateNavNotificationBadge();
            }

            return res.user;
        }
    } catch (err) {
        clearSession();
        window.location.href = 'login.html';
        return null;
    }

    return user;
}

// Automatically updates navbar notification badge on any page with #notificationBadge
async function updateNavNotificationBadge() {
    const badge = document.getElementById("notificationBadge");
    if (!badge) return;

    try {
        const res = await apiFetch("/notifications");
        if (res && res.unreadCount !== undefined) {
            badge.textContent = res.unreadCount;
            if (res.unreadCount === 0) {
                badge.classList.add("hidden");
            } else {
                badge.classList.remove("hidden");
            }
        }
    } catch (e) {
        badge.classList.add("hidden");
    }
}
