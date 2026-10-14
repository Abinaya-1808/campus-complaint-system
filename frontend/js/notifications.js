/*
==================================================
  CAMPUS COMPLAINT SYSTEM - NOTIFICATIONS MODULE
  Connects:
  1. Load Notifications (GET /api/notifications)
  2. Mark Single Read (PATCH /api/notifications/:id/read)
  3. Mark All as Read (PATCH /api/notifications/read-all)
==================================================
*/

document.addEventListener("DOMContentLoaded", async function () {
    // 1. Authenticate student session
    const currentUser = await checkAuth("student");
    if (!currentUser) {
        return; // checkAuth redirects to login.html if unauthorized
    }

    // 2. Attach logout handler
    initLogoutHandler();

    // 3. Load live notifications from backend
    loadNotifications();

    // 4. Attach Mark All as Read handler
    initMarkAllReadHandler();
});

/**
 * Common logout button listener
 */
function initLogoutHandler() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", function (event) {
            event.preventDefault();
            clearSession();
            window.location.href = "login.html";
        });
    }
}

/**
 * Fetches and renders live notifications
 */
async function loadNotifications() {
    const list = document.getElementById("notificationsList");
    const totalEl = document.getElementById("totalNotifications");
    const unreadEl = document.getElementById("unreadNotifications");

    if (!list) return;

    // Loading State
    list.innerHTML = `
        <div class="notifications-empty">
            <p>Loading notifications from server...</p>
        </div>
    `;

    try {
        const response = await apiFetch("/notifications");
        const notifications = (response && response.notifications) ? response.notifications : [];
        const unreadCount = response && response.unreadCount !== undefined
            ? response.unreadCount
            : notifications.filter(n => !n.isRead).length;

        // Update Summary Counters
        if (totalEl) totalEl.textContent = notifications.length;
        if (unreadEl) unreadEl.textContent = unreadCount;

        // Update Navbar Badge
        updateNavBadge(unreadCount);

        // Empty State
        if (notifications.length === 0) {
            list.innerHTML = `
                <div class="notifications-empty">
                    <h3>No notifications yet</h3>
                    <p>Updates about your complaints will appear here.</p>
                </div>
            `;
            return;
        }

        // Render Notifications List
        list.innerHTML = `
            <div class="notification-list">
                ${notifications.map(notification => {
                    const isUnread = !notification.isRead;
                    const dateStr = notification.createdAt
                        ? new Date(notification.createdAt).toLocaleString("en-IN")
                        : "Recent";

                    const icon = getNotificationIcon(notification.type);
                    const title = getNotificationTitle(notification.type, notification.title);

                    // Extract complaint reference ID
                    let complaintLinkHtml = "";
                    if (notification.complaint) {
                        const complaintId = notification.complaint._id || notification.complaint;
                        complaintLinkHtml = `
                            <a href="complaint-details.html?id=${encodeURIComponent(complaintId)}" class="notification-link">
                                View Complaint →
                            </a>
                        `;
                    }

                    // Single mark-as-read button for unread notifications
                    let markBtnHtml = "";
                    if (isUnread) {
                        markBtnHtml = `
                            <button
                                type="button"
                                class="mark-single-btn"
                                data-id="${escapeHtml(notification._id)}"
                                style="background: none; border: 1px solid #93c5fd; color: #2563eb; font-size: 11px; padding: 4px 9px; border-radius: 6px; cursor: pointer; margin-top: 8px; font-weight: 500;"
                            >
                                ✓ Mark as read
                            </button>
                        `;
                    }

                    return `
                        <div class="notification-card ${isUnread ? "unread" : ""}" id="notif-${escapeHtml(notification._id)}">
                            <div class="notification-content">
                                <div class="notification-icon">
                                    ${icon}
                                </div>
                                <div class="notification-text">
                                    <h3>${escapeHtml(title)}</h3>
                                    <p>${escapeHtml(notification.message)}</p>
                                    ${complaintLinkHtml}
                                    ${markBtnHtml}
                                </div>
                            </div>
                            <div class="notification-time">
                                ${dateStr}
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        // Attach click listeners to individual "Mark as read" buttons
        attachSingleMarkReadListeners();

    } catch (err) {
        list.innerHTML = `
            <div class="notifications-empty">
                <h3>Failed to load notifications</h3>
                <p style="color: #dc2626;">${escapeHtml(err.message || "Could not reach server.")}</p>
                <button onclick="location.reload()" class="mark-read-btn" style="margin-top: 15px;">
                    Retry
                </button>
            </div>
        `;
    }
}

/**
 * Attaches click event listeners to each individual "Mark as read" button
 */
function attachSingleMarkReadListeners() {
    const buttons = document.querySelectorAll(".mark-single-btn");
    buttons.forEach(btn => {
        btn.addEventListener("click", async function (event) {
            event.stopPropagation();
            const notificationId = this.getAttribute("data-id");
            if (!notificationId) return;

            const card = document.getElementById(`notif-${notificationId}`);
            this.disabled = true;
            this.textContent = "Marking...";

            try {
                const response = await apiFetch(`/notifications/${encodeURIComponent(notificationId)}/read`, {
                    method: "PATCH"
                });

                if (response && response.success) {
                    if (card) {
                        card.classList.remove("unread");
                    }
                    this.remove();

                    // Update unread count
                    const unreadEl = document.getElementById("unreadNotifications");
                    if (unreadEl) {
                        const current = parseInt(unreadEl.textContent, 10) || 0;
                        const newCount = Math.max(0, current - 1);
                        unreadEl.textContent = newCount;
                        updateNavBadge(newCount);
                    }
                } else {
                    throw new Error(response?.message || "Failed to mark as read.");
                }
            } catch (err) {
                this.disabled = false;
                this.textContent = "✓ Mark as read";
                alert(err.message || "Failed to update notification. Please try again.");
            }
        });
    });
}

/**
 * Connects the "Mark All as Read" button to PATCH /api/notifications/read-all
 */
function initMarkAllReadHandler() {
    const markAllBtn = document.getElementById("markAllReadBtn");
    if (!markAllBtn) return;

    markAllBtn.addEventListener("click", async function () {
        const unreadEl = document.getElementById("unreadNotifications");
        const currentUnread = unreadEl ? (parseInt(unreadEl.textContent, 10) || 0) : 0;

        if (currentUnread === 0) {
            return; // No unread notifications to mark
        }

        const originalText = markAllBtn.textContent;
        markAllBtn.disabled = true;
        markAllBtn.textContent = "Marking all as read...";

        try {
            const response = await apiFetch("/notifications/read-all", {
                method: "PATCH"
            });

            if (response && response.success) {
                // Update UI: remove unread class from all cards
                const unreadCards = document.querySelectorAll(".notification-card.unread");
                unreadCards.forEach(card => card.classList.remove("unread"));

                // Remove all individual mark buttons
                const singleButtons = document.querySelectorAll(".mark-single-btn");
                singleButtons.forEach(btn => btn.remove());

                // Reset counters
                if (unreadEl) unreadEl.textContent = "0";
                updateNavBadge(0);

                markAllBtn.disabled = false;
                markAllBtn.textContent = originalText;
            } else {
                throw new Error(response?.message || "Failed to mark all as read.");
            }
        } catch (err) {
            alert(err.message || "Error updating notifications. Please try again.");
            markAllBtn.disabled = false;
            markAllBtn.textContent = originalText;
        }
    });
}

/**
 * Updates notification badge in navbar
 */
function updateNavBadge(unreadCount) {
    const badge = document.getElementById("notificationBadge");
    if (!badge) return;

    badge.textContent = unreadCount;
    if (unreadCount === 0) {
        badge.classList.add("hidden");
    } else {
        badge.classList.remove("hidden");
    }
}

/**
 * Maps notification type to emoji icon
 */
function getNotificationIcon(type) {
    if (type === "status_update" || type === "status") {
        return "🔄";
    }
    if (type === "admin_response" || type === "response") {
        return "💬";
    }
    if (type === "complaint_lodged" || type === "submitted") {
        return "📋";
    }
    return "🔔";
}

/**
 * Returns human-readable notification title
 */
function getNotificationTitle(type, customTitle) {
    if (customTitle) return customTitle;
    if (type === "status_update") return "Complaint Status Updated";
    if (type === "admin_response") return "Official Admin Response";
    if (type === "complaint_lodged") return "Complaint Lodged";
    return "Notification Update";
}

/**
 * Escapes unsafe characters for HTML output
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}