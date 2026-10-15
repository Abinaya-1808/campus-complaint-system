/*
==================================================
  CAMPUS COMPLAINT SYSTEM - ADMIN PORTAL
  Connects:
  1. Admin Dashboard Overview (GET /api/complaints)
  2. Admin Complaints List & Filters (GET /api/complaints)
  3. Admin Complaint Details (GET /api/complaints/:id)
  4. Status Updates (PATCH /api/complaints/:id/status)
  5. Admin Responses (POST /api/complaints/:id/responses)
==================================================
*/

document.addEventListener("DOMContentLoaded", async function () {
    // 1. Verify Admin Authentication via backend
    const currentUser = await checkAuth("admin");
    if (!currentUser) {
        return; // checkAuth redirects to login.html or student-dashboard.html if unauthorized
    }

    // 2. Set Admin Name in Navbar/Header if element exists
    const adminNameEl = document.getElementById("adminName");
    if (adminNameEl) {
        adminNameEl.textContent = currentUser.name || "Administrator";
    }

    // 3. Attach common logout handler
    initLogoutHandler();

    // 4. Initialize Admin Dashboard if on dashboard page
    initAdminDashboard();

    // 5. Initialize Admin Complaints List if on complaints list page
    initAdminComplaintsList();

    // 6. Initialize Admin Complaint Details if on details page
    initAdminComplaintDetails();
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
 * 1. ADMIN DASHBOARD
 * Fetches real complaints to compute statistics and populate recent complaints
 */
async function initAdminDashboard() {
    const totalEl = document.getElementById("totalComplaints");
    const recentContainer = document.getElementById("recentComplaints");

    // Only run if we are on the admin dashboard page
    if (!totalEl && !recentContainer) return;

    if (recentContainer) {
        recentContainer.innerHTML = `
            <div class="admin-empty">
                <p>Loading dashboard metrics and recent complaints...</p>
            </div>
        `;
    }

    try {
        const response = await apiFetch("/complaints");
        const complaints = (response && response.complaints) ? response.complaints : [];

        // Compute real status statistics
        const total = complaints.length;
        const pending = complaints.filter(c => c.status === "Pending").length;
        const progress = complaints.filter(c => c.status === "In Progress").length;
        const resolved = complaints.filter(c => c.status === "Resolved").length;

        // Compute real priority statistics
        const critical = complaints.filter(c => c.priority === "Critical").length;
        const high = complaints.filter(c => c.priority === "High").length;
        const medium = complaints.filter(c => c.priority === "Medium").length;
        const low = complaints.filter(c => c.priority === "Low").length;

        // Update DOM status elements
        updateElementText("totalComplaints", total);
        updateElementText("pendingComplaints", pending);
        updateElementText("progressComplaints", progress);
        updateElementText("resolvedComplaints", resolved);

        // Update DOM priority elements
        updateElementText("criticalComplaints", critical);
        updateElementText("highComplaints", high);
        updateElementText("mediumComplaints", medium);
        updateElementText("lowComplaints", low);

        // Initialize Interactive Charts
        renderDashboardCharts(complaints);
        // Re-render charts on theme change for instant color harmony
        window.addEventListener('click', function(e) {
            if (e.target && (e.target.id === 'themeToggleBtn' || e.target.closest('#themeToggleBtn'))) {
                setTimeout(() => {
                    if (typeof complaints !== 'undefined' && complaints.length >= 0) {
                        renderDashboardCharts(complaints);
                    }
                }, 100);
            }
        });


        // Render Recent Complaints
        if (recentContainer) {
            if (complaints.length === 0) {
                recentContainer.innerHTML = `
                    <div class="admin-empty">
                        <p>No complaints have been submitted yet.</p>
                    </div>
                `;
            } else {
                const sortedRecent = [...complaints]
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .slice(0, 5);

                recentContainer.innerHTML = sortedRecent.map(complaint => {
                    const statusClass = getStatusClass(complaint.status);
                    const dateStr = complaint.createdAt
                        ? new Date(complaint.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                        })
                        : "Recent";

                    return `
                        <div class="recent-complaint-card">
                            <div class="recent-complaint-info">
                                <h3>${escapeHtml(complaint.title)}</h3>
                                <p>
                                    ${escapeHtml(complaint.category)} • ${escapeHtml(complaint.priority)} • ${dateStr}
                                </p>
                            </div>
                            <div class="recent-complaint-right">
                                <div class="recent-complaint-id">
                                    ${escapeHtml(complaint._id)}
                                </div>
                                <span class="admin-status ${statusClass}">
                                    ${escapeHtml(complaint.status)}
                                </span>
                            </div>
                        </div>
                    `;
                }).join("");
            }
        }
    } catch (err) {
        console.error("Dashboard loading error:", err);
        if (recentContainer) {
            recentContainer.innerHTML = `
                <div class="admin-empty">
                    <p style="color: #dc2626;">Failed to load complaints: ${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    }
}

/**
 * 2. ADMIN COMPLAINT LIST & FILTERS
 * Renders all campus complaints with real-time search, category, status, and priority filtering
 */
async function initAdminComplaintsList() {
    const complaintsList = document.getElementById("adminComplaintsList");
    if (!complaintsList) return;

    const searchInput = document.getElementById("searchComplaint");
    const statusFilter = document.getElementById("statusFilter");
    const categoryFilter = document.getElementById("categoryFilter");
    const priorityFilter = document.getElementById("priorityFilter");
    const complaintCount = document.getElementById("complaintCount");

    complaintsList.innerHTML = `
        <div class="admin-empty">
            <p>Loading complaints from server...</p>
        </div>
    `;

    try {
        const response = await apiFetch("/complaints");
        const allComplaints = (response && response.complaints) ? response.complaints : [];

        function displayComplaints() {
            const searchValue = searchInput ? searchInput.value.trim().toLowerCase() : "";
            const selectedStatus = statusFilter ? statusFilter.value : "all";
            const selectedCategory = categoryFilter ? categoryFilter.value : "all";
            const selectedPriority = priorityFilter ? priorityFilter.value : "all";

            const filteredComplaints = allComplaints.filter(complaint => {
                const cId = (complaint._id || complaint.id || "").toLowerCase();
                const cTitle = (complaint.title || "").toLowerCase();
                const studentObj = complaint.student || {};
                const studentName = (studentObj.name || complaint.studentName || "").toLowerCase();
                const regNumber = (studentObj.registerNumber || studentObj.studentId || complaint.registerNumber || "").toLowerCase();

                const matchesSearch = !searchValue ||
                    cId.includes(searchValue) ||
                    cTitle.includes(searchValue) ||
                    studentName.includes(searchValue) ||
                    regNumber.includes(searchValue);

                const matchesStatus = (selectedStatus === "all") || (complaint.status === selectedStatus);

                const matchesCategory = (selectedCategory === "all") ||
                    (normalizeCategoryComparison(complaint.category, selectedCategory));

                const matchesPriority = (selectedPriority === "all") || (complaint.priority === selectedPriority);

                return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
            });

            if (complaintCount) {
                complaintCount.textContent = filteredComplaints.length;
            }

            if (filteredComplaints.length === 0) {
                complaintsList.innerHTML = `
                    <div class="admin-no-results">
                        <h3>No complaints found</h3>
                        <p>Try changing your search or filters.</p>
                    </div>
                `;
                return;
            }

            const sortedComplaints = [...filteredComplaints].sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            );

            complaintsList.innerHTML = `
                <div class="admin-complaint-list">
                    ${sortedComplaints.map(complaint => {
                        const statusClass = getStatusClass(complaint.status);
                        const priorityClass = getPriorityClass(complaint.priority);
                        const dateStr = complaint.createdAt
                            ? new Date(complaint.createdAt).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric"
                            })
                            : "Recent";

                        const studentObj = complaint.student || {};
                        const isAnon = Boolean(complaint.isAnonymous);
                        const sName = isAnon ? "Anonymous Student" : (studentObj.name || complaint.studentName || "Unknown Student");
                        const sReg = isAnon ? "Protected" : (studentObj.registerNumber || studentObj.studentId || complaint.registerNumber || "-");

                        return `
                            <div class="admin-complaint-card">
                                <div class="admin-complaint-header">
                                    <div>
                                        <h3 class="admin-complaint-title">${escapeHtml(complaint.title)} ${isAnon ? `<span class="anonymous-badge">🕵️ Anonymous</span>` : ""}</h3>
                                        <p class="admin-complaint-id">${escapeHtml(complaint._id)}</p>
                                    </div>
                                    <span class="admin-status ${statusClass}">${escapeHtml(complaint.status)}</span>
                                </div>

                                <div class="admin-complaint-info">
                                    <div class="admin-info-item">
                                        <span>Category</span>
                                        <strong>${escapeHtml(complaint.category)}</strong>
                                    </div>
                                    <div class="admin-info-item">
                                        <span>Priority</span>
                                        <strong>
                                            <span class="priority-badge ${priorityClass}">
                                                ${escapeHtml(complaint.priority)}
                                            </span>
                                        </strong>
                                    </div>
                                    <div class="admin-info-item">
                                        <span>Location</span>
                                        <strong>${escapeHtml(complaint.location)}</strong>
                                    </div>
                                    <div class="admin-info-item">
                                        <span>Submitted</span>
                                        <strong>${dateStr}</strong>
                                    </div>
                                </div>

                                <div class="admin-complaint-footer">
                                    <div class="admin-student-info">
                                        Student: ${escapeHtml(sName)} • ${escapeHtml(sReg)}
                                    </div>
                                    <a href="admin-complaint-details.html?id=${encodeURIComponent(complaint._id)}" class="admin-view-btn">
                                        View Details →
                                    </a>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            `;
        }

        displayComplaints();

        if (searchInput) searchInput.addEventListener("input", displayComplaints);
        if (statusFilter) statusFilter.addEventListener("change", displayComplaints);
        if (categoryFilter) categoryFilter.addEventListener("change", displayComplaints);
        if (priorityFilter) priorityFilter.addEventListener("change", displayComplaints);

    } catch (err) {
        complaintsList.innerHTML = `
            <div class="admin-no-results">
                <h3>Error Loading Complaints</h3>
                <p style="color:#dc2626;">${escapeHtml(err.message || "Failed to communicate with server.")}</p>
                <button onclick="location.reload()" class="admin-primary-btn" style="margin-top: 15px; cursor: pointer; border: none;">
                    Retry
                </button>
            </div>
        `;
    }
}

/**
 * 3. ADMIN COMPLAINT DETAILS & ACTIONS
 * Connects GET /api/complaints/:id, PATCH status, and POST responses
 */
async function initAdminComplaintDetails() {
    const adminDetailsContent = document.getElementById("adminDetailsContent");
    if (!adminDetailsContent) return;

    const urlParams = new URLSearchParams(window.location.search);
    const complaintId = urlParams.get("id");

    if (!complaintId) {
        adminDetailsContent.innerHTML = `
            <section class="admin-details-section">
                <h2>Missing Complaint ID</h2>
                <p>No complaint identifier was provided in the URL.</p>
                <br>
                <a href="admin-complaints.html" class="admin-back-btn">← Back to Complaints</a>
            </section>
        `;
        return;
    }

    adminDetailsContent.innerHTML = `
        <div class="admin-empty">
            <p>Loading complaint details from server...</p>
        </div>
    `;

    try {
        const response = await apiFetch(`/complaints/${encodeURIComponent(complaintId)}`);
        const complaint = response ? response.complaint : null;

        if (!complaint) {
            throw new Error("Complaint not found.");
        }

        renderDetails(complaint);

    } catch (err) {
        let errMessage = err.message || "Could not retrieve complaint.";
        adminDetailsContent.innerHTML = `
            <section class="admin-details-section">
                <h2>Complaint Not Found</h2>
                <p>${escapeHtml(errMessage)}</p>
                <br>
                <a href="admin-complaints.html" class="admin-back-btn">← Back to Complaints</a>
            </section>
        `;
    }

    /**
     * Renders full complaint details, timeline, and update form
     */
    function renderDetails(complaint) {
        const studentObj = complaint.student || {};
        const isAnon = Boolean(complaint.isAnonymous);
        const sName = isAnon ? "Anonymous Student" : (studentObj.name || complaint.studentName || "Student");
        const sReg = isAnon ? "Protected" : (studentObj.registerNumber || studentObj.studentId || complaint.registerNumber || "-");
        const sEmail = isAnon ? "Protected" : (studentObj.email || complaint.email || "-");
        const sDept = studentObj.department || complaint.department || "-";
        const sYear = studentObj.year || complaint.year || "-";

        const createdDate = complaint.createdAt
            ? new Date(complaint.createdAt).toLocaleString("en-IN")
            : "Unknown";

        // Build Timeline HTML
        let timelineHTML = "";
        if (complaint.statusTimeline && Array.isArray(complaint.statusTimeline) && complaint.statusTimeline.length > 0) {
            timelineHTML = complaint.statusTimeline.map(item => {
                const itemDate = item.date ? new Date(item.date).toLocaleString("en-IN") : "";
                return `
                    <div class="admin-timeline-item">
                        <div class="admin-timeline-dot"></div>
                        <div class="admin-timeline-date">${itemDate}</div>
                        <div class="admin-timeline-status">${escapeHtml(item.status)}</div>
                        <div class="admin-timeline-message">${escapeHtml(item.message || "Status updated.")}</div>
                    </div>
                `;
            }).join("");
        } else {
            timelineHTML = `<p>No timeline information available.</p>`;
        }

        // Build Admin Responses HTML
        let responsesHTML = "";
        if (complaint.adminResponses && Array.isArray(complaint.adminResponses) && complaint.adminResponses.length > 0) {
            responsesHTML = `
                <section class="admin-details-section">
                    <h2>Official Admin Responses</h2>
                    ${complaint.adminResponses.map(resp => {
                        const rDate = resp.date ? new Date(resp.date).toLocaleString("en-IN") : "";
                        const responderName = (resp.admin && resp.admin.name) ? resp.admin.name : "Administrator";
                        return `
                            <div class="admin-response-box" style="margin-bottom: 14px;">
                                <p style="margin: 0 0 6px 0;">${escapeHtml(resp.message)}</p>
                                <small style="color: #64748b;">— Posted by <strong>${escapeHtml(responderName)}</strong> on ${rDate}</small>
                            </div>
                        `;
                    }).join("")}
                </section>
            `;
        }

        adminDetailsContent.innerHTML = `
            <div class="admin-details-wrapper">
                <a href="admin-complaints.html" class="admin-back-btn">← Back to Complaints</a>

                <!-- HEADER -->
                <section class="admin-details-header">
                    <div class="admin-details-top">
                        <div>
                            <h1 class="admin-details-title">${escapeHtml(complaint.title)} ${isAnon ? `<span class="anonymous-badge">🕵️ Anonymous</span>` : ""}</h1>
                            <p class="admin-details-id">Complaint ID: ${escapeHtml(complaint._id)}</p>
                        </div>
                        <span class="admin-status ${getStatusClass(complaint.status)}">
                            ${escapeHtml(complaint.status)}
                        </span>
                    </div>
                </section>

                <!-- STUDENT AND COMPLAINT INFORMATION -->
                <section class="admin-details-section">
                    <h2>Complaint Information</h2>
                    <div class="admin-details-grid">
                        <div class="admin-detail-box">
                            <span>Student Name</span>
                            <strong>${escapeHtml(sName)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Register Number</span>
                            <strong>${escapeHtml(sReg)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Email</span>
                            <strong>${escapeHtml(sEmail)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Department</span>
                            <strong>${escapeHtml(sDept)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Year</span>
                            <strong>${escapeHtml(sYear)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Category</span>
                            <strong>${escapeHtml(complaint.category)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Priority</span>
                            <strong>${escapeHtml(complaint.priority)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Location</span>
                            <strong>${escapeHtml(complaint.location)}</strong>
                        </div>
                        <div class="admin-detail-box">
                            <span>Submitted</span>
                            <strong>${createdDate}</strong>
                        </div>
                    </div>
                </section>

                
                <!-- ATTACHED PHOTO -->
                ${complaint.image ? `
                    <section class="admin-details-section">
                        <h2>Attached Evidence Photo</h2>
                        <div class="attached-evidence-card" style="margin-top: 0;">
                            <a href="${complaint.image}" target="_blank" title="Click to view full image in a new tab">
                                <img src="${complaint.image}" alt="Complaint Evidence Photo" class="attached-evidence-img">
                            </a>
                            <p style="font-size: 12px; color: #64748b; margin-top: 6px;">Click the photo to open full size.</p>
                        </div>
                    </section>
                ` : ""}

                <!-- DESCRIPTION -->
                <section class="admin-details-section">
                    <h2>Complaint Description</h2>
                    <div class="admin-description">${escapeHtml(complaint.description)}</div>
                </section>

                <!-- TIMELINE -->
                <section class="admin-details-section">
                    <h2>Status Timeline</h2>
                    <div class="admin-timeline">
                        ${timelineHTML}
                    </div>
                </section>

                <!-- UPDATE COMPLAINT FORM -->
                <section class="admin-details-section">
                    <h2>Update Complaint</h2>
                    <form id="updateComplaintForm" class="admin-update-form">
                        <div class="admin-form-group">
                            <label for="adminStatus">Change Status</label>
                            <select id="adminStatus">
                                <option value="Pending">Pending</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Resolved">Resolved</option>
                                <option value="Rejected">Rejected</option>
                            </select>
                        </div>

                        <div class="admin-form-group">
                            <label for="adminResponse">Admin Response / Note</label>
                            <textarea id="adminResponse" placeholder="Enter status update message or official response to student..."></textarea>
                        </div>

                        <div id="updateMessage"></div>

                        <button type="submit" class="admin-update-btn">
                            Update Complaint
                        </button>
                    </form>
                </section>

                <!-- RESPONSES -->
                ${responsesHTML}

                <!-- STUDENT RESOLUTION RATING -->
                ${complaint.rating ? `
                    <section class="admin-details-section">
                        <h2>Student Resolution Feedback</h2>
                        <div class="resolution-feedback-card rated" style="margin-top: 0;">
                            <div class="stars-display" style="font-size: 20px; color: #f59e0b; margin-bottom: 8px;">
                                ${"★".repeat(complaint.rating)}${"☆".repeat(5 - complaint.rating)} <span style="font-size:15px; font-weight:700; color:#475569;">(${complaint.rating}/5 Stars)</span>
                            </div>
                            ${complaint.feedback ? `<p class="feedback-text">"${escapeHtml(complaint.feedback)}"</p>` : '<p style="color: #64748b; font-size: 13px;">Student rated without written comments.</p>'}
                            <small style="color: #64748b;">Submitted ${complaint.ratedAt ? "on " + new Date(complaint.ratedAt).toLocaleDateString("en-IN") : ""}</small>
                        </div>
                    </section>
                ` : ""}

            </div>
        `;

        // Select the current status in dropdown
        const statusSelect = document.getElementById("adminStatus");
        if (statusSelect) {
            statusSelect.value = complaint.status;
        }

        // Attach Update Form submission handler
        const updateForm = document.getElementById("updateComplaintForm");
        if (updateForm) {
            updateForm.addEventListener("submit", async function (event) {
                event.preventDefault();

                const newStatus = document.getElementById("adminStatus").value;
                const newResponse = document.getElementById("adminResponse").value.trim();
                const updateMessage = document.getElementById("updateMessage");
                const submitBtn = updateForm.querySelector('button[type="submit"]');

                const statusChanged = (complaint.status !== newStatus);
                const hasMessage = (newResponse.length > 0);

                if (!statusChanged && !hasMessage) {
                    showAdminMessage(updateMessage, "No changes detected. Select a new status or enter a response.", "error");
                    return;
                }

                const originalBtnText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = "Updating...";
                updateMessage.innerHTML = "";

                try {
                    let updatedRecord = complaint;

                    // 1. If status changed, update via PATCH /api/complaints/:id/status
                    if (statusChanged) {
                        const statusPayload = {
                            status: newStatus,
                            message: hasMessage ? newResponse : undefined
                        };

                        const statusRes = await apiFetch(`/complaints/${encodeURIComponent(complaint._id)}/status`, {
                            method: "PATCH",
                            body: JSON.stringify(statusPayload)
                        });

                        if (statusRes && statusRes.complaint) {
                            updatedRecord = statusRes.complaint;
                        }
                    }

                    // 2. If status didn't change but admin added an official response, send to POST /api/complaints/:id/responses
                    if (!statusChanged && hasMessage) {
                        const respRes = await apiFetch(`/complaints/${encodeURIComponent(complaint._id)}/responses`, {
                            method: "POST",
                            body: JSON.stringify({ message: newResponse })
                        });

                        if (respRes && respRes.complaint) {
                            updatedRecord = respRes.complaint;
                        }
                    }

                    showAdminMessage(updateMessage, "Complaint updated successfully.", "success");

                    // Re-render complaint details with updated timeline and responses
                    setTimeout(function () {
                        renderDetails(updatedRecord);
                    }, 800);

                } catch (err) {
                    let errText = err.message || "Failed to update complaint.";
                    if (err.data && err.data.errors && Array.isArray(err.data.errors)) {
                        errText = err.data.errors.map(e => e.message || e.msg).join("<br>");
                    }
                    showAdminMessage(updateMessage, errText, "error");
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                }
            });
        }
    }
}

/**
 * Message display helper using admin CSS classes
 */
function showAdminMessage(container, message, type) {
    if (typeof showToast === "function") {
        showToast(message.replace(/<[^>]*>?/gm, " "), type, type === "success" ? "Success" : "Notice");
    }
    if (!container) return;
    const typeClass = type === "success" ? "admin-success-message" : "admin-error-message";
    container.innerHTML = `<div class="admin-update-message ${typeClass}">${message}</div>`;
}

/**
 * Maps status string to admin CSS class
 */
function getStatusClass(status) {
    if (status === "In Progress") return "admin-status-progress";
    if (status === "Resolved") return "admin-status-resolved";
    if (status === "Rejected") return "admin-status-rejected";
    return "admin-status-pending";
}

/**
 * Maps priority string to admin CSS class
 */
function getPriorityClass(priority) {
    if (priority === "Critical") return "priority-critical";
    if (priority === "High") return "priority-high";
    if (priority === "Medium") return "priority-medium";
    return "priority-low";
}

/**
 * Normalizes category comparison for filters
 */
function normalizeCategoryComparison(itemCategory, filterCategory) {
    if (!itemCategory || !filterCategory) return false;
    const iCat = itemCategory.toLowerCase();
    const fCat = filterCategory.toLowerCase();
    if (iCat === fCat) return true;
    if (fCat === "canteen" && iCat.includes("mess")) return true;
    if (fCat === "classroom" && iCat.includes("academic")) return true;
    if ((fCat === "transport" || fCat === "maintenance" || fCat.includes("wi-fi")) && iCat.includes("infrastructure")) return true;
    return false;
}

/**
 * Safe text updater
 */
function updateElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * Safe HTML escaping
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

/**
 * --------------------------------------------------
 * CHART.JS INTERACTIVE VISUAL ANALYTICS
 * --------------------------------------------------
 */
let statusChartInstance = null;
let categoryChartInstance = null;

function renderDashboardCharts(complaints) {
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js library not loaded yet.');
        return;
    }

    const statusCanvas = document.getElementById('statusChart');
    const categoryCanvas = document.getElementById('categoryChart');
    if (!statusCanvas || !categoryCanvas) return;

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const cardBgColor = isDark ? '#151c2c' : '#ffffff';

    // 1. Compute Status Distribution
    const pending = complaints.filter(c => c.status === 'Pending').length;
    const progress = complaints.filter(c => c.status === 'In Progress').length;
    const resolved = complaints.filter(c => c.status === 'Resolved').length;
    const rejected = complaints.filter(c => c.status === 'Rejected').length;
    const total = complaints.length;

    // Update Resolution Rate Badge
    const rateEl = document.getElementById('resolutionRateText');
    if (rateEl) {
        const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;
        rateEl.textContent = `${rate}%`;
    }

    // 2. Compute Category Breakdown
    const categoryMap = {};
    complaints.forEach(c => {
        const cat = c.category ? c.category.trim() : 'General';
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });

    const categoryLabels = Object.keys(categoryMap);
    const categoryCounts = Object.values(categoryMap);

    // Fallbacks if no data yet
    const displayStatusLabels = total > 0 ? ['Pending', 'In Progress', 'Resolved', 'Rejected'] : ['No Complaints Yet'];
    const displayStatusData = total > 0 ? [pending, progress, resolved, rejected] : [1];
    const displayStatusColors = total > 0
        ? ['#f59e0b', '#3b82f6', '#10b981', '#ef4444']
        : [isDark ? '#334155' : '#e2e8f0'];

    const displayCategoryLabels = categoryLabels.length > 0 ? categoryLabels : ['No Categories Yet'];
    const displayCategoryData = categoryCounts.length > 0 ? categoryCounts : [0];

    // Destroy existing instances on re-render (theme switch or data reload)
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }
    if (categoryChartInstance) {
        categoryChartInstance.destroy();
    }

    // 3. Create Status Doughnut Chart
    statusChartInstance = new Chart(statusCanvas, {
        type: 'doughnut',
        data: {
            labels: displayStatusLabels,
            datasets: [{
                data: displayStatusData,
                backgroundColor: displayStatusColors,
                borderColor: cardBgColor,
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: textColor,
                        font: {
                            family: 'Inter',
                            size: 13,
                            weight: '600'
                        },
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#f8fafc',
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            if (total === 0) return ' 0 complaints';
                            const val = context.raw || 0;
                            const pct = Math.round((val / total) * 100);
                            return ` ${context.label}: ${val} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '68%'
        }
    });

    // 4. Create Category Horizontal Bar Chart
    const barPalette = [
        '#38bdf8', '#6366f1', '#a855f7', '#ec4899', '#f97316', '#10b981', '#14b8a6', '#eab308'
    ];

    categoryChartInstance = new Chart(categoryCanvas, {
        type: 'bar',
        data: {
            labels: displayCategoryLabels,
            datasets: [{
                label: 'Complaints',
                data: displayCategoryData,
                backgroundColor: displayCategoryLabels.map((_, i) => barPalette[i % barPalette.length]),
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: isDark ? '#1e293b' : '#0f172a',
                    titleColor: '#ffffff',
                    bodyColor: '#f8fafc',
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            return ` ${context.raw} complaint${context.raw === 1 ? '' : 's'}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: textColor,
                        stepSize: 1,
                        font: { family: 'Inter', size: 12, weight: '500' }
                    },
                    grid: {
                        color: gridColor
                    }
                },
                y: {
                    ticks: {
                        color: textColor,
                        font: { family: 'Inter', size: 13, weight: '600' }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}
