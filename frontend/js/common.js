
/*
==================================================
  MODERN FLOATING TOAST NOTIFICATION SYSTEM
==================================================
*/
function showToast(message, type = 'success', title = null, duration = 4000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    const iconMap = {
        success: '✓',
        error: '✕',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const defaultTitleMap = {
        success: 'Success',
        error: 'Error',
        warning: 'Attention',
        info: 'Information'
    };

    const toastTitle = title || defaultTitleMap[type] || 'Notice';
    const icon = iconMap[type] || 'ℹ️';

    toast.innerHTML = `
        <div class="toast-icon-wrapper">${icon}</div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(toastTitle)}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button type="button" class="toast-close" aria-label="Close notification">×</button>
        <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    let autoCloseTimer;

    function dismiss() {
        clearTimeout(autoCloseTimer);
        toast.classList.add('toast-hiding');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    }

    closeBtn.addEventListener('click', dismiss);

    container.appendChild(toast);

    // Trigger enter animation on next frame
    requestAnimationFrame(() => {
        toast.classList.add('toast-showing');
    });

    if (duration > 0) {
        autoCloseTimer = setTimeout(dismiss, duration);
    }
}


/*
==================================================
  DARK MODE THEME CONTROLLER
==================================================
*/
// Immediately apply saved theme on parse to avoid flash
(function() {
    try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    } catch (e) {}
})();

// Automatically inject and manage theme toggle button in navbar
function initThemeToggle() {
    if (document.getElementById('themeToggleBtn')) return;

    const navContainer = document.querySelector('.navbar .nav-links') || 
                         document.querySelector('.navbar nav') || 
                         document.querySelector('.navbar');

    if (!navContainer) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'themeToggleBtn';
    toggleBtn.className = 'theme-toggle-btn';
    toggleBtn.setAttribute('type', 'button');
    toggleBtn.setAttribute('aria-label', 'Toggle Dark / Light Theme');
    toggleBtn.setAttribute('title', 'Toggle Theme');

    toggleBtn.innerHTML = `
        <span class="theme-icon-light">☀️</span>
        <span class="theme-icon-dark">🌙</span>
    `;

    toggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        try {
            localStorage.setItem('theme', newTheme);
        showToast(`Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info', 'Theme Updated', 2500);
        } catch (err) {}
    });

    navContainer.appendChild(toggleBtn);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
} else {
    initThemeToggle();
}

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
        : 'https://campus-complaint-backend-yi51.onrender.com/api'
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
