/**
 * Helper to safely escape HTML entities
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


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
    setTimeout(() => { toast.classList.add('toast-showing'); }, 20);

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
        showToast(`Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} Mode`, 'info', 'Theme Updated', 3500);
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
// Automatically ensure graduation cap logo icon is in navbar across all pages
function initNavbarLogoIcon() {
    const logoEl = document.querySelector('.navbar .logo');
    if (logoEl && !logoEl.querySelector('.logo-icon')) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'logo-icon');
        svg.setAttribute('width', '28');
        svg.setAttribute('height', '28');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>';
        logoEl.insertBefore(svg, logoEl.firstChild);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavbarLogoIcon);
} else {
    initNavbarLogoIcon();
}

/**
 * Global Department Routing Taxonomy
 */
const DEPARTMENT_ROUTING_MAP = {
    'Hostel': 'Hostel Administration & Welfare',
    'Mess/Cafeteria': 'Food Safety & Dining Services',
    'Canteen': 'Food Safety & Dining Services',
    'Infrastructure': 'Estate & Physical Infrastructure',
    'Maintenance': 'Estate & Physical Infrastructure',
    'Classroom': 'Estate & Physical Infrastructure',
    'Academic': 'Academic Affairs & Faculty Council',
    'Library': 'Library & Learning Resources',
    'Internet/Wi-Fi': 'IT Services & Campus Network',
    'Transport': 'Campus Fleet & Transportation',
    'Harassment': 'Student Safety & Ethics Committee',
    'Other': 'Dean of Student Affairs'
};

function getDepartmentForCategory(category) {
    if (!category) return 'Dean of Student Affairs';
    const cat = String(category).trim();
    if (DEPARTMENT_ROUTING_MAP[cat]) return DEPARTMENT_ROUTING_MAP[cat];
    const catLower = cat.toLowerCase();
    for (const [key, dept] of Object.entries(DEPARTMENT_ROUTING_MAP)) {
        if (catLower.includes(key.toLowerCase())) return dept;
    }
    return 'Dean of Student Affairs';
}

/* ==================================================
   REUSABLE SKELETON LOADING TEMPLATES
================================================== */

/**
 * Returns skeleton HTML for complaints list
 * @param {number} count Number of cards
 * @param {boolean} isAdmin Whether to render admin or student layout
 */
function getComplaintSkeletonHTML(count = 3, isAdmin = true) {
    let cards = '';
    for (let i = 0; i < count; i++) {
        if (isAdmin) {
            cards += `
                <div class="admin-complaint-card skeleton-card" aria-hidden="true">
                    <div class="admin-complaint-header">
                        <div style="flex: 1; max-width: 65%;">
                            <div class="skeleton skeleton-title" style="width: 65%; height: 22px; margin-bottom: 8px;"></div>
                            <div class="skeleton skeleton-subtitle" style="width: 35%; height: 12px; margin-bottom: 0;"></div>
                        </div>
                        <div class="skeleton skeleton-badge" style="width: 88px; height: 26px;"></div>
                    </div>
                    <div class="admin-complaint-info">
                        <div class="admin-info-item">
                            <div class="skeleton" style="width: 55px; height: 11px; margin-bottom: 8px;"></div>
                            <div class="skeleton" style="width: 75%; height: 18px;"></div>
                        </div>
                        <div class="admin-info-item">
                            <div class="skeleton" style="width: 45px; height: 11px; margin-bottom: 8px;"></div>
                            <div class="skeleton" style="width: 65%; height: 18px;"></div>
                        </div>
                        <div class="admin-info-item">
                            <div class="skeleton" style="width: 55px; height: 11px; margin-bottom: 8px;"></div>
                            <div class="skeleton" style="width: 80%; height: 18px;"></div>
                        </div>
                        <div class="admin-info-item">
                            <div class="skeleton" style="width: 65px; height: 11px; margin-bottom: 8px;"></div>
                            <div class="skeleton" style="width: 70%; height: 18px;"></div>
                        </div>
                    </div>
                    <div class="admin-complaint-footer">
                        <div class="skeleton" style="width: 190px; height: 15px;"></div>
                        <div class="skeleton skeleton-btn" style="width: 110px; height: 36px;"></div>
                    </div>
                </div>
            `;
        } else {
            cards += `
                <div class="complaint-card skeleton-card" aria-hidden="true" style="margin-bottom: 20px;">
                    <div class="complaint-card-header">
                        <div style="flex: 1; max-width: 65%;">
                            <div class="skeleton skeleton-title" style="width: 70%; height: 22px; margin-bottom: 8px;"></div>
                            <div class="skeleton skeleton-subtitle" style="width: 40%; height: 12px; margin-bottom: 0;"></div>
                        </div>
                        <div class="skeleton skeleton-badge" style="width: 88px; height: 26px;"></div>
                    </div>
                    <div class="complaint-meta" style="gap: 16px; margin: 15px 0;">
                        <div class="skeleton" style="width: 120px; height: 16px;"></div>
                        <div class="skeleton" style="width: 110px; height: 16px;"></div>
                        <div class="skeleton" style="width: 130px; height: 16px;"></div>
                        <div class="skeleton" style="width: 95px; height: 16px;"></div>
                    </div>
                    <div class="skeleton skeleton-btn" style="width: 120px; height: 38px; align-self: flex-start; margin-top: 10px;"></div>
                </div>
            `;
        }
    }
    return isAdmin ? `<div class="admin-complaint-list">${cards}</div>` : cards;
}

/**
 * Returns skeleton HTML for single complaint details view
 * @param {boolean} isAdmin
 */
function getComplaintDetailsSkeletonHTML(isAdmin = true) {
    return `
        <div class="skeleton-detail-wrapper" aria-hidden="true">
            <section class="${isAdmin ? 'admin-details-section' : 'details-section'}" style="margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 250px;">
                        <div class="skeleton skeleton-title" style="width: 60%; height: 30px; margin-bottom: 10px;"></div>
                        <div class="skeleton skeleton-subtitle" style="width: 35%; height: 14px;"></div>
                    </div>
                    <div class="skeleton skeleton-badge" style="width: 100px; height: 32px;"></div>
                </div>

                <div class="${isAdmin ? 'admin-details-grid' : 'details-grid'}" style="margin-top: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="${isAdmin ? 'admin-detail-box' : 'detail-box'}" style="padding: 16px;">
                        <div class="skeleton" style="width: 60px; height: 11px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 75%; height: 18px;"></div>
                    </div>
                    <div class="${isAdmin ? 'admin-detail-box' : 'detail-box'}" style="padding: 16px;">
                        <div class="skeleton" style="width: 50px; height: 11px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 65%; height: 18px;"></div>
                    </div>
                    <div class="${isAdmin ? 'admin-detail-box' : 'detail-box'}" style="padding: 16px;">
                        <div class="skeleton" style="width: 70px; height: 11px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 80%; height: 18px;"></div>
                    </div>
                    <div class="${isAdmin ? 'admin-detail-box' : 'detail-box'}" style="padding: 16px;">
                        <div class="skeleton" style="width: 65px; height: 11px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 70%; height: 18px;"></div>
                    </div>
                </div>
            </section>

            <section class="${isAdmin ? 'admin-details-section' : 'details-section'}" style="margin-bottom: 24px;">
                <div class="skeleton" style="width: 150px; height: 20px; margin-bottom: 16px;"></div>
                <div class="skeleton skeleton-text" style="width: 100%;"></div>
                <div class="skeleton skeleton-text" style="width: 95%;"></div>
                <div class="skeleton skeleton-text" style="width: 60%;"></div>
            </section>

            <section class="${isAdmin ? 'admin-details-section' : 'details-section'}">
                <div class="skeleton" style="width: 160px; height: 20px; margin-bottom: 20px;"></div>
                <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 16px;">
                    <div class="skeleton skeleton-avatar" style="width: 28px; height: 28px;"></div>
                    <div style="flex: 1;">
                        <div class="skeleton" style="width: 30%; height: 15px; margin-bottom: 6px;"></div>
                        <div class="skeleton" style="width: 20%; height: 12px;"></div>
                    </div>
                </div>
                <div style="display: flex; gap: 16px; align-items: center;">
                    <div class="skeleton skeleton-avatar" style="width: 28px; height: 28px;"></div>
                    <div style="flex: 1;">
                        <div class="skeleton" style="width: 35%; height: 15px; margin-bottom: 6px;"></div>
                        <div class="skeleton" style="width: 25%; height: 12px;"></div>
                    </div>
                </div>
            </section>
        </div>
    `;
}

/**
 * Returns skeleton HTML for recent complaints list in dashboard
 * @param {number} count
 * @param {boolean} isAdmin
 */
function getRecentComplaintsSkeletonHTML(count = 3, isAdmin = true) {
    let items = '';
    for (let i = 0; i < count; i++) {
        if (isAdmin) {
            items += `
                <div class="recent-complaint-card skeleton-card" aria-hidden="true" style="margin-bottom: 12px;">
                    <div class="recent-complaint-info" style="flex: 1;">
                        <div class="skeleton skeleton-title" style="width: 55%; height: 18px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 40%; height: 12px;"></div>
                    </div>
                    <div class="recent-complaint-right" style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                        <div class="skeleton" style="width: 120px; height: 12px;"></div>
                        <div class="skeleton skeleton-badge" style="width: 80px; height: 24px;"></div>
                    </div>
                </div>
            `;
        } else {
            items += `
                <div class="complaint-card skeleton-card" aria-hidden="true" style="margin-bottom: 14px; padding: 18px;">
                    <div class="complaint-card-header" style="margin-bottom: 10px;">
                        <div style="flex: 1; max-width: 60%;">
                            <div class="skeleton skeleton-title" style="width: 65%; height: 18px; margin-bottom: 6px;"></div>
                            <div class="skeleton" style="width: 35%; height: 12px;"></div>
                        </div>
                        <div class="skeleton skeleton-badge" style="width: 80px; height: 24px;"></div>
                    </div>
                    <div class="complaint-meta" style="gap: 12px; margin-bottom: 12px;">
                        <div class="skeleton" style="width: 100px; height: 14px;"></div>
                        <div class="skeleton" style="width: 90px; height: 14px;"></div>
                        <div class="skeleton" style="width: 80px; height: 14px;"></div>
                    </div>
                    <div class="skeleton skeleton-btn" style="width: 105px; height: 32px;"></div>
                </div>
            `;
        }
    }
    return items;
}

/**
 * Returns skeleton HTML for notifications page
 * @param {number} count
 */
function getNotificationsSkeletonHTML(count = 4) {
    let items = '';
    for (let i = 0; i < count; i++) {
        items += `
            <div class="notification-card skeleton-card" aria-hidden="true" style="padding: 18px; margin-bottom: 14px; display: flex; gap: 14px; align-items: flex-start;">
                <div class="skeleton skeleton-avatar" style="width: 36px; height: 36px;"></div>
                <div style="flex: 1;">
                    <div class="skeleton skeleton-title" style="width: 50%; height: 16px; margin-bottom: 8px;"></div>
                    <div class="skeleton skeleton-text" style="width: 85%;"></div>
                    <div class="skeleton" style="width: 25%; height: 12px; margin-top: 6px;"></div>
                </div>
            </div>
        `;
    }
    return items;
}

