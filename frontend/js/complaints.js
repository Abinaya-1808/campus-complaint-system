/*
==================================================
  CAMPUS COMPLAINT SYSTEM - COMPLAINTS MODULE
  Connects:
  1. Submit Complaint (POST /api/complaints)
  2. My Complaints List (GET /api/complaints)
  3. Complaint Details (GET /api/complaints/:id)
==================================================
*/

document.addEventListener("DOMContentLoaded", async function () {
    // Authenticate student session
    const user = await checkAuth("student");
    if (!user) {
        return; // checkAuth redirects to login.html if session invalid
    }

    // Initialize logout handler on navbar
    initLogoutHandler();

    // 1. Complaint Submission
    initComplaintForm(user);

    // 2. My Complaints List
    initMyComplaints();

    // 3. Complaint Details
    initComplaintDetails(user);
});

/**
 * Normalizes user-selected category to strictly match backend enum
 * Allowed: 'Academic', 'Hostel', 'Infrastructure', 'Mess/Cafeteria', 'Library', 'Harassment', 'Other'
 */
function normalizeCategory(category) {
    if (!category) return "Other";
    const map = {
        "canteen": "Mess/Cafeteria",
        "mess/cafeteria": "Mess/Cafeteria",
        "classroom": "Academic",
        "academic": "Academic",
        "hostel": "Hostel",
        "transport": "Infrastructure",
        "internet/wi-fi": "Infrastructure",
        "maintenance": "Infrastructure",
        "infrastructure": "Infrastructure",
        "library": "Library",
        "harassment": "Harassment",
        "other": "Other"
    };
    return map[category.toLowerCase()] || category;
}

/**
 * Connects Submit Complaint form to POST /api/complaints
 */
function initComplaintForm(currentUser) {
    
    let compressedImageData = "";
    const evidenceInput = document.getElementById("evidence");
    const previewContainer = document.getElementById("imagePreviewContainer");
    const previewImg = document.getElementById("imagePreview");
    const removeBtn = document.getElementById("removeImageBtn");

    if (evidenceInput) {
        evidenceInput.addEventListener("change", function(e) {
            const file = e.target.files && e.target.files[0];
            if (!file) {
                compressedImageData = "";
                if (previewContainer) previewContainer.style.display = "none";
                return;
            }

            if (!file.type.startsWith("image/")) {
                alert("Please select a valid image file (PNG, JPG, JPEG, WebP).");
                evidenceInput.value = "";
                compressedImageData = "";
                return;
            }

            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const maxDim = 1000;
                    let width = img.width;
                    let height = img.height;

                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    const canvas = document.createElement("canvas");
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0, width, height);
                    compressedImageData = canvas.toDataURL("image/jpeg", 0.78);

                    if (previewImg && previewContainer) {
                        previewImg.src = compressedImageData;
                        previewContainer.style.display = "block";
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    if (removeBtn) {
        removeBtn.addEventListener("click", function() {
            if (evidenceInput) evidenceInput.value = "";
            compressedImageData = "";
            if (previewContainer) previewContainer.style.display = "none";
            if (previewImg) previewImg.src = "";
        });
    }

    const complaintForm = document.getElementById("complaintForm");
    if (!complaintForm) return;

    complaintForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const title = document.getElementById("complaintTitle").value.trim();
        const rawCategory = document.getElementById("category").value;
        const priority = document.getElementById("priority").value;
        const location = document.getElementById("location").value.trim();
        const description = document.getElementById("description").value.trim();
        const isAnonymous = document.getElementById("isAnonymous") ? document.getElementById("isAnonymous").checked : false;
        const evidenceInput = document.getElementById("evidence");
        const messageEl = document.getElementById("complaintMessage");
        const submitBtn = complaintForm.querySelector('button[type="submit"]');

        messageEl.innerHTML = "";

        // Client-side validations
        if (!title || !rawCategory || !priority || !location || !description) {
            displayMessage(messageEl, "Please fill in all required fields.", "error");
            return;
        }

        const category = normalizeCategory(rawCategory);

        // Check if an attachment was selected
        let attachmentNotice = "";
        if (evidenceInput && evidenceInput.files && evidenceInput.files.length > 0) {
            attachmentNotice = "<br><small style='color: #64748b;'><em>Note: File attachments are not yet supported by the server. Your complaint was submitted with your details.</em></small>";
        }

        // Set button loading state
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting Complaint...";

        try {
            const payload = {
                title,
                category,
                priority,
                location,
                description,
                isAnonymous,
                image: compressedImageData
            };

            const response = await apiFetch("/complaints", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            if (response && response.success && response.complaint) {
                const complaint = response.complaint;
                const complaintId = complaint._id;

                displayMessage(
                    messageEl,
                    `<strong>Complaint submitted successfully!</strong><br>Complaint ID: <code>${escapeHtml(complaintId)}</code>${attachmentNotice}`,
                    "success"
                );
                showToast('Complaint submitted successfully! Redirecting...', 'success', 'Success');

                complaintForm.reset();

                setTimeout(function () {
                    window.location.href = "my-complaints.html";
                }, 2000);
            } else {
                throw new Error(response?.message || "Failed to submit complaint.");
            }
        } catch (err) {
            let errorText = err.message || "An error occurred while submitting your complaint.";
            if (err.data && err.data.errors && Array.isArray(err.data.errors)) {
                errorText = err.data.errors.map(e => e.message || e.msg).join("<br>");
            }
            displayMessage(messageEl, errorText, "error");
            showToast(errorText, 'error', 'Submission Failed');
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
}

/**
 * Connects My Complaints list page to GET /api/complaints
 */
async function initMyComplaints() {
    const complaintsList = document.getElementById("complaintsList");
    if (!complaintsList) return;

    // Loading State
    complaintsList.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⏳</div>
            <h3>Loading complaints...</h3>
            <p>Fetching your complaints from the server.</p>
        </div>
    `;

    try {
        const response = await apiFetch("/complaints");
        const complaints = (response && response.complaints) ? response.complaints : [];

        // Calculate and update counters
        const total = complaints.length;
        const pending = complaints.filter(c => c.status === "Pending").length;
        const progress = complaints.filter(c => c.status === "In Progress").length;
        const resolved = complaints.filter(c => c.status === "Resolved").length;

        const myTotal = document.getElementById("myTotal");
        const myPending = document.getElementById("myPending");
        const myProgress = document.getElementById("myProgress");
        const myResolved = document.getElementById("myResolved");

        if (myTotal) myTotal.textContent = total;
        if (myPending) myPending.textContent = pending;
        if (myProgress) myProgress.textContent = progress;
        if (myResolved) myResolved.textContent = resolved;

        // Empty state
        if (complaints.length === 0) {
            complaintsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>No complaints found</h3>
                    <p>You have not submitted any complaints yet.</p>
                    <a href="submit-complaint.html" class="secondary-btn">Submit Complaint</a>
                </div>
            `;
            return;
        }

        // Render Complaint Cards
        complaintsList.innerHTML = "";

        complaints.forEach(function (complaint) {
            let statusClass = "status-pending";
            if (complaint.status === "In Progress") statusClass = "status-progress";
            else if (complaint.status === "Resolved") statusClass = "status-resolved";
            else if (complaint.status === "Rejected") statusClass = "status-rejected";

            const dateStr = complaint.createdAt
                ? new Date(complaint.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                })
                : "Recent";

            const card = document.createElement("div");
            card.className = "complaint-card";

            card.innerHTML = `
                <div class="complaint-card-header">
                    <div>
                        <h3>${escapeHtml(complaint.title)} ${complaint.isAnonymous ? `<span class="anonymous-badge">🕵️ Anonymous</span>` : ""}</h3>
                        <span class="complaint-id">${escapeHtml(complaint._id)}</span>
                    </div>
                    <span class="status-badge ${statusClass}">
                        ${escapeHtml(complaint.status)}
                    </span>
                </div>

                <div class="complaint-meta">
                    <span><strong>Category:</strong> ${escapeHtml(complaint.category)}</span>
                    <span><strong>Priority:</strong> ${escapeHtml(complaint.priority)}</span>
                    <span><strong>Location:</strong> ${escapeHtml(complaint.location)}</span>
                    <span><strong>Date:</strong> ${dateStr}</span>
                </div>

                <a href="complaint-details.html?id=${encodeURIComponent(complaint._id)}" class="view-details-btn">
                    View Details →
                </a>
            `;

            complaintsList.appendChild(card);
        });

    } catch (err) {
        complaintsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <h3>Failed to load complaints</h3>
                <p>${escapeHtml(err.message || "An error occurred while communicating with the server.")}</p>
                <button onclick="location.reload()" class="secondary-btn" style="cursor:pointer; border:none; margin-top:12px;">
                    Retry
                </button>
            </div>
        `;
    }
}

/**
 * Connects Complaint Details view to GET /api/complaints/:id
 */
async function initComplaintDetails(currentUser) {
    const detailsContent = document.getElementById("detailsContent");
    if (!detailsContent) return;

    const urlParams = new URLSearchParams(window.location.search);
    const complaintId = urlParams.get("id");

    if (!complaintId) {
        detailsContent.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">❌</div>
                <h3>Missing Complaint ID</h3>
                <p>No complaint identifier was provided in the URL.</p>
                <a href="my-complaints.html" class="secondary-btn">Back to My Complaints</a>
            </div>
        `;

        // Initialize interactive rating events if unresolved rating card is present
        initRatingWidget(complaint._id);

        return;
    }

    // Loading State
    detailsContent.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⏳</div>
            <h3>Loading complaint details...</h3>
            <p>Fetching details from server.</p>
        </div>
    `;

    try {
        const response = await apiFetch(`/complaints/${encodeURIComponent(complaintId)}`);
        const complaint = response ? response.complaint : null;

        if (!complaint) {
            throw new Error("Complaint not found.");
        }

        let statusClass = "status-pending";
        if (complaint.status === "In Progress") statusClass = "status-progress";
        else if (complaint.status === "Resolved") statusClass = "status-resolved";
        else if (complaint.status === "Rejected") statusClass = "status-rejected";

        const createdDate = complaint.createdAt
            ? new Date(complaint.createdAt).toLocaleString("en-IN")
            : "Unknown";

        // Build status timeline HTML
        let timelineHTML = "";
        if (complaint.statusTimeline && Array.isArray(complaint.statusTimeline) && complaint.statusTimeline.length > 0) {
            complaint.statusTimeline.forEach(function (item) {
                const timelineDate = item.date ? new Date(item.date).toLocaleString("en-IN") : "";
                timelineHTML += `
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <h3>${escapeHtml(item.status)}</h3>
                        <div class="timeline-date">${timelineDate}</div>
                        <div class="timeline-message">${escapeHtml(item.message || "Status updated.")}</div>
                    </div>
                `;
            });
        } else {
            timelineHTML = `
                <div class="timeline-item">
                    <div class="timeline-dot"></div>
                    <h3>${escapeHtml(complaint.status)}</h3>
                    <div class="timeline-date">${createdDate}</div>
                    <div class="timeline-message">Complaint registered.</div>
                </div>
            `;
        }

        // Build admin responses HTML
        let responseHTML = "";
        if (complaint.adminResponses && Array.isArray(complaint.adminResponses) && complaint.adminResponses.length > 0) {
            responseHTML = complaint.adminResponses.map(resp => {
                const rDate = resp.date ? new Date(resp.date).toLocaleString("en-IN") : "";
                const adminName = (resp.admin && resp.admin.name) ? resp.admin.name : "Administrator";
                return `
                    <div class="response-box" style="margin-bottom: 12px;">
                        <p style="margin: 0 0 6px 0;">${escapeHtml(resp.message)}</p>
                        <small style="color: #64748b;">— Response by <strong>${escapeHtml(adminName)}</strong> on ${rDate}</small>
                    </div>
                `;
            }).join("");
        } else if (complaint.adminResponse) {
            responseHTML = `<div class="response-box">${escapeHtml(complaint.adminResponse)}</div>`;
        } else {
            responseHTML = `<div class="no-response">No response from the administration yet.</div>`;
        }

        
        // Resolution Rating & Feedback Section
        let ratingSectionHTML = "";
        if (complaint.status === "Resolved") {
            if (complaint.rating) {
                const starsFilled = "★".repeat(complaint.rating);
                const starsEmpty = "☆".repeat(5 - complaint.rating);
                const rDate = complaint.ratedAt ? new Date(complaint.ratedAt).toLocaleDateString("en-IN") : "";
                ratingSectionHTML = `
                    <div class="resolution-feedback-card rated">
                        <h3>⭐ Your Resolution Feedback</h3>
                        <div class="stars-display">${starsFilled}${starsEmpty} <span style="font-size:15px; font-weight:700; color:#475569;">(${complaint.rating}/5 Stars)</span></div>
                        ${complaint.feedback ? `<p class="feedback-text">"${escapeHtml(complaint.feedback)}"</p>` : ""}
                        <small style="color: #64748b;">Submitted ${rDate ? "on " + rDate : ""}</small>
                    </div>
                `;
            } else {
                ratingSectionHTML = `
                    <div class="resolution-feedback-card" id="ratingCard">
                        <h3>⭐ Rate This Resolution</h3>
                        <p>This complaint has been marked <strong>Resolved</strong>. How satisfied are you with the resolution?</p>
                        <div class="star-rating" id="starRating">
                            <span class="star" data-val="1">★</span>
                            <span class="star" data-val="2">★</span>
                            <span class="star" data-val="3">★</span>
                            <span class="star" data-val="4">★</span>
                            <span class="star" data-val="5">★</span>
                        </div>
                        <textarea id="feedbackText" placeholder="Share your experience or feedback for the maintenance team (optional)..." rows="3"></textarea>
                        <div id="ratingError"></div>
                        <button type="button" id="submitRatingBtn" class="submit-rating-btn">Submit Rating</button>
                    </div>
                `;
            }
        }

        const studentObj = complaint.student || {};
        const studentName = studentObj.name || currentUser.name || "Student";
        const studentDept = studentObj.department || currentUser.department || "-";

        detailsContent.innerHTML = `
            <a href="my-complaints.html" class="back-btn">← Back to My Complaints</a>

            <div class="details-header">
                <div>
                    <h1>${escapeHtml(complaint.title)} ${complaint.isAnonymous ? `<span class="anonymous-badge">🕵️ Anonymous</span>` : ""}</h1>
                    <div class="details-id">Complaint ID: ${escapeHtml(complaint._id)}</div>
                </div>
                <span class="status-badge ${statusClass}">
                    ${escapeHtml(complaint.status)}
                </span>
            </div>

            <div class="details-section">
                <h2>Complaint Information</h2>
                <div class="details-grid">
                    <div class="detail-item">
                        <span>Category</span>
                        <strong>${escapeHtml(complaint.category)}</strong>
                    </div>
                    <div class="detail-item">
                        <span>Priority</span>
                        <strong>${escapeHtml(complaint.priority)}</strong>
                    </div>
                    <div class="detail-item">
                        <span>Location</span>
                        <strong>${escapeHtml(complaint.location)}</strong>
                    </div>
                    <div class="detail-item">
                        <span>Submitted</span>
                        <strong>${createdDate}</strong>
                    </div>
                    <div class="detail-item">
                        <span>Student</span>
                        <strong>${escapeHtml(studentName)}</strong>
                    </div>
                    <div class="detail-item">
                        <span>Department</span>
                        <strong>${escapeHtml(studentDept)}</strong>
                    </div>
                </div>
            </div>

            <div class="details-section">
                <h2>Description</h2>
                <div class="description-box">
                    ${escapeHtml(complaint.description)}
                </div>
            </div>

            <div class="details-section">
                <h2>Status Timeline</h2>
                <div class="timeline">
                    ${timelineHTML}
                </div>
            </div>

            <div class="details-section">
                <h2>Admin Response</h2>
                ${responseHTML}
                ${ratingSectionHTML}
            </div>

            <div class="details-section">
                <h2>Evidence</h2>
                <div class="no-response">
                    No evidence was uploaded. (Server does not currently support file uploads).
                </div>
            </div>
        `;

    } catch (err) {
        let errTitle = "Complaint Not Found";
        let errMsg = err.message || "The requested complaint could not be retrieved.";
        let errIcon = "❌";

        if (err.status === 403) {
            errTitle = "Access Denied";
            errMsg = "You can only view your own complaints.";
            errIcon = "🔒";
        } else if (err.status === 404) {
            errTitle = "Complaint Not Found";
            errMsg = "No complaint exists with ID: " + escapeHtml(complaintId);
            errIcon = "🔍";
        }

        detailsContent.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${errIcon}</div>
                <h3>${errTitle}</h3>
                <p>${errMsg}</p>
                <a href="my-complaints.html" class="secondary-btn">Back to My Complaints</a>
            </div>
        `;
    }
}

/**
 * Escapes unsafe HTML characters to prevent XSS
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
 * Helper to display styled messages
 */
function displayMessage(container, message, type) {
    if (!container) return;
    const cssClass = type === "success" ? "message-success" : "message-error";
    container.innerHTML = `<div class="${cssClass}">${message}</div>`;
}

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

function initRatingWidget(complaintId) {
    const starContainer = document.getElementById("starRating");
    const submitBtn = document.getElementById("submitRatingBtn");
    if (!starContainer || !submitBtn) return;

    let selectedRating = 0;
    const stars = starContainer.querySelectorAll(".star");

    stars.forEach(star => {
        star.addEventListener("mouseover", function() {
            const val = parseInt(this.getAttribute("data-val"), 10);
            stars.forEach(s => {
                s.classList.toggle("hovered", parseInt(s.getAttribute("data-val"), 10) <= val);
            });
        });

        star.addEventListener("mouseout", function() {
            stars.forEach(s => s.classList.remove("hovered"));
        });

        star.addEventListener("click", function() {
            selectedRating = parseInt(this.getAttribute("data-val"), 10);
            stars.forEach(s => {
                s.classList.toggle("selected", parseInt(s.getAttribute("data-val"), 10) <= selectedRating);
            });
        });
    });

    submitBtn.addEventListener("click", async function() {
        const errorEl = document.getElementById("ratingError");
        const feedbackText = document.getElementById("feedbackText").value.trim();
        errorEl.innerHTML = "";

        if (selectedRating === 0) {
            errorEl.innerHTML = '<span style="color: #dc2626; font-size: 13px;">Please select at least 1 star before submitting.</span>';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";

        try {
            const res = await apiFetch(`/complaints/${complaintId}/feedback`, {
                method: "POST",
                body: JSON.stringify({
                    rating: selectedRating,
                    feedback: feedbackText
                })
            });

            if (res && res.success) {
                const card = document.getElementById("ratingCard");
                const starsFilled = "★".repeat(selectedRating);
                const starsEmpty = "☆".repeat(5 - selectedRating);
                card.className = "resolution-feedback-card rated";
                card.innerHTML = `
                    <h3>⭐ Your Resolution Feedback</h3>
                    <div class="stars-display">${starsFilled}${starsEmpty} <span style="font-size:15px; font-weight:700; color:#475569;">(${selectedRating}/5 Stars)</span></div>
                    ${feedbackText ? `<p class="feedback-text">"${escapeHtml(feedbackText)}"</p>` : ""}
                    <small style="color: #16a34a; font-weight: 600;">✓ Rating submitted successfully!</small>
                `;
            } else {
                throw new Error(res?.message || "Failed to submit rating.");
            }
        } catch (err) {
            errorEl.innerHTML = `<span style="color: #dc2626; font-size: 13px;">${escapeHtml(err.message || "Failed to submit rating.")}</span>`;
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Rating";
        }
    });
}
