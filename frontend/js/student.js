/*
==================================================
  CAMPUS COMPLAINT SYSTEM - STUDENT DASHBOARD
  Populates profile info, live complaint metrics,
  and recent activities from the Backend API
==================================================
*/

document.addEventListener("DOMContentLoaded", async function () {
    // Authenticate student session
    const currentUser = await checkAuth("student");
    if (!currentUser) {
        return; // checkAuth redirects to login.html if not authenticated
    }

    // 1. Populate Student Profile Details
    populateProfile(currentUser);

    // 2. Fetch and Populate Live Complaint Statistics & Recent Activity
    await loadComplaintStats();

    // 3. Attach Logout Handler
    initLogoutBtn();

    // 4. Update Notifications Badge safely
    updateNotificationBadge();
});

/**
 * Fills student profile card fields if present on the page
 */
function populateProfile(user) {
    const studentName = document.getElementById("studentName");
    const profileName = document.getElementById("profileName");
    const profileRegisterNumber = document.getElementById("profileRegisterNumber");
    const profileEmail = document.getElementById("profileEmail");
    const profileDepartment = document.getElementById("profileDepartment");
    const profileYear = document.getElementById("profileYear");

    if (studentName) studentName.textContent = user.name || "Student";
    if (profileName) profileName.textContent = user.name || "-";
    if (profileRegisterNumber) {
        profileRegisterNumber.textContent = user.registerNumber || user.studentId || "-";
    }
    if (profileEmail) profileEmail.textContent = user.email || "-";
    if (profileDepartment) profileDepartment.textContent = user.department || "-";
    if (profileYear) profileYear.textContent = user.year || "-";
}

/**
 * Fetches real complaints from GET /api/complaints to compute overview statistics
 */
async function loadComplaintStats() {
    const totalEl = document.getElementById("totalComplaints");
    const pendingEl = document.getElementById("pendingComplaints");
    const progressEl = document.getElementById("progressComplaints");
    const resolvedEl = document.getElementById("resolvedComplaints");
    const recentEl = document.getElementById("recentComplaints");

    // Only fetch if at least one statistic element exists on this page
    if (!totalEl && !pendingEl && !progressEl && !resolvedEl && !recentEl) {
        return;
    }

    if (recentEl && typeof getRecentComplaintsSkeletonHTML === "function") {
        recentEl.innerHTML = getRecentComplaintsSkeletonHTML(3, false);
    }

    try {
        const response = await apiFetch("/complaints");
        const complaints = (response && response.complaints) ? response.complaints : [];

        const total = complaints.length;
        const pending = complaints.filter(c => c.status === "Pending").length;
        const inProgress = complaints.filter(c => c.status === "In Progress").length;
        const resolved = complaints.filter(c => c.status === "Resolved").length;

        if (totalEl) totalEl.textContent = total;
        if (pendingEl) pendingEl.textContent = pending;
        if (progressEl) progressEl.textContent = inProgress;
        if (resolvedEl) resolvedEl.textContent = resolved;

        // Render Recent Activity on Dashboard
        if (recentEl) {
            if (complaints.length === 0) {
                recentEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📭</div>
                        <h3>No complaints yet</h3>
                        <p>You haven't submitted any complaints.</p>
                        <a href="submit-complaint.html" class="secondary-btn">Submit Your First Complaint</a>
                    </div>
                `;
            } else {
                recentEl.innerHTML = "";
                // Show up to 3 most recent complaints
                const recentList = complaints.slice(0, 3);
                recentList.forEach(c => {
                    let statusClass = "status-pending";
                    if (c.status === "In Progress") statusClass = "status-progress";
                    else if (c.status === "Resolved") statusClass = "status-resolved";
                    else if (c.status === "Rejected") statusClass = "status-rejected";

                    const dateStr = c.createdAt
                        ? new Date(c.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                        })
                        : "Recent";

                    const item = document.createElement("div");
                    item.className = "complaint-card";
                    item.style.marginBottom = "15px";
                    item.innerHTML = `
                        <div class="complaint-card-header">
                            <div>
                                <h3>${escapeText(c.title)} ${c.isAnonymous ? '<span class="anonymous-badge">🕵️ Anonymous</span>' : ''}</h3>
                                <span class="complaint-id">${escapeText(c._id)}</span>
                            </div>
                            <span class="status-badge ${statusClass}">${escapeText(c.status)}</span>
                        </div>
                        <div class="complaint-meta">
                            <span><strong>Category:</strong> ${escapeText(c.category)}</span>
                            <span><strong>Priority:</strong> ${escapeText(c.priority)}</span>
                            <span><strong>Date:</strong> ${dateStr}</span>
                        </div>
                        <a href="complaint-details.html?id=${encodeURIComponent(c._id)}" class="view-details-btn">
                            View Details →
                        </a>
                    `;
                    recentEl.appendChild(item);
                });
            }
        }
    } catch (err) {
        console.error("Failed to load student dashboard complaint stats:", err);
        if (recentEl) {
            recentEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <h3>Could not load activity</h3>
                    <p>${escapeText(err.message || "Failed to reach backend server.")}</p>
                </div>
            `;
        }
    }
}

/**
 * Updates the notification badge if element exists
 */
async function updateNotificationBadge() {
    const badge = document.getElementById("notificationBadge");
    if (!badge) return;

    try {
        const res = await apiFetch("/notifications");
        if (res && res.notifications && Array.isArray(res.notifications)) {
            const unreadCount = res.notifications.filter(n => !n.read).length;
            badge.textContent = unreadCount;
            if (unreadCount === 0) {
                badge.classList.add("hidden");
            } else {
                badge.classList.remove("hidden");
            }
        }
    } catch (e) {
        // Silently keep badge hidden if notifications route not yet loaded
        badge.classList.add("hidden");
    }
}

/**
 * Logout button handler
 */
function initLogoutBtn() {
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
 * Helper to escape HTML text
 */
function escapeText(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
