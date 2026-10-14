/*
==================================================
  CAMPUS COMPLAINT SYSTEM - AUTHENTICATION LOGIC
  Connects Registration and Login forms to Backend API
==================================================
*/

document.addEventListener("DOMContentLoaded", function () {
    // Check if user is already logged in with a valid session
    checkExistingSession();

    // Initialize Register Form Handler
    initRegisterForm();

    // Initialize Login Form Handler
    initLoginForm();
});

/**
 * Checks if a session already exists and is valid.
 * If valid, redirects to the appropriate dashboard.
 * If token is expired or invalid, clears the session cleanly.
 */
async function checkExistingSession() {
    const token = getToken();
    const user = getCurrentUser();

    // If no token exists, stay on the current page
    if (!token || !user) {
        return;
    }

    try {
        const response = await apiFetch("/auth/me");
        if (response && response.success && response.user) {
            // Update session with verified backend profile
            setSession(token, response.user);

            // Redirect according to verified backend role
            if (response.user.role === "admin") {
                window.location.href = "admin-dashboard.html";
            } else {
                window.location.href = "student-dashboard.html";
            }
        }
    } catch (err) {
        // Token is expired, invalid, or server rejected it: clear cleanly
        clearSession();
    }
}

/**
 * Connects the Registration form to POST /api/auth/register
 */
function initRegisterForm() {
    const registerForm = document.getElementById("registerForm");
    if (!registerForm) return;

    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const messageEl = document.getElementById("registerMessage");
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        const name = document.getElementById("name").value.trim();
        const registerNumber = document.getElementById("registerNumber").value.trim();
        const email = document.getElementById("email").value.trim();
        const department = document.getElementById("department").value;
        const year = document.getElementById("year").value;
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;

        // Clear previous messages
        messageEl.innerHTML = "";

        // Client-side validations
        if (!name || !registerNumber || !email || !department || !year || !password || !confirmPassword) {
            displayMessage(messageEl, "Please fill in all fields.", "error");
            return;
        }

        if (password.length < 6) {
            displayMessage(messageEl, "Password must contain at least 6 characters.", "error");
            return;
        }

        if (password !== confirmPassword) {
            displayMessage(messageEl, "Passwords do not match.", "error");
            return;
        }

        // Set loading state
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Creating Account...";

        try {
            // Public registration payload - always creates a student account on backend
            const payload = {
                name,
                registerNumber,
                studentId: registerNumber,
                email,
                department,
                year,
                password
            };

            const response = await apiFetch("/auth/register", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            if (response && response.success) {
                displayMessage(
                    messageEl,
                    "Registration successful! Redirecting to login...",
                    "success"
                );
                registerForm.reset();

                setTimeout(function () {
                    window.location.href = "login.html";
                }, 1500);
            } else {
                displayMessage(
                    messageEl,
                    response.message || "Registration failed. Please try again.",
                    "error"
                );
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        } catch (err) {
            let errorText = err.message || "An error occurred during registration.";
            if (err.data && err.data.errors && Array.isArray(err.data.errors)) {
                errorText = err.data.errors.map(e => e.msg || e.message).join("<br>");
            }
            displayMessage(messageEl, errorText, "error");
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
}

/**
 * Connects the Login form to POST /api/auth/login
 */
function initLoginForm() {
    const loginForm = document.getElementById("loginForm");
    if (!loginForm) return;

    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const messageEl = document.getElementById("loginMessage");
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        const loginType = document.getElementById("loginType").value;
        const loginId = document.getElementById("loginId").value.trim();
        const loginPassword = document.getElementById("loginPassword").value;

        // Clear previous messages
        messageEl.innerHTML = "";

        // Client-side validations
        if (!loginType || !loginId || !loginPassword) {
            displayMessage(messageEl, "Please fill in all fields.", "error");
            return;
        }

        // Set loading state
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = "Signing In...";

        try {
            const payload = {
                loginId: loginId,
                email: loginId,
                password: loginPassword
            };

            const response = await apiFetch("/auth/login", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            if (!response || !response.success || !response.token || !response.user) {
                throw new Error(response?.message || "Invalid response from server.");
            }

            const user = response.user;
            const token = response.token;

            // Verify selected role matches the verified backend account role
            if (loginType === "admin" && user.role !== "admin") {
                displayMessage(
                    messageEl,
                    "Access denied: This account does not have administrator privileges.",
                    "error"
                );
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
                return;
            }

            if (loginType === "student" && user.role !== "student") {
                displayMessage(
                    messageEl,
                    "This account is registered as an Administrator. Please select 'Admin' to log in.",
                    "error"
                );
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
                return;
            }

            // Save session securely (stores token & public profile; NEVER stores passwords)
            setSession(token, user);

            displayMessage(
                messageEl,
                `Login successful! Welcome, ${user.name}. Redirecting...`,
                "success"
            );

            // Redirect according to the verified account role
            setTimeout(function () {
                if (user.role === "admin") {
                    window.location.href = "admin-dashboard.html";
                } else {
                    window.location.href = "student-dashboard.html";
                }
            }, 1000);

        } catch (err) {
            let errorText = err.message || "Login failed. Please check your credentials.";
            if (err.status === 401) {
                errorText = "Invalid login ID or password.";
            } else if (err.status === 0) {
                errorText = "Cannot reach server. Ensure the backend is running on http://127.0.0.1:5000.";
            }
            displayMessage(messageEl, errorText, "error");
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
}

/**
 * Helper to display styled success and error messages
 */
function displayMessage(container, message, type) {
    if (!container) return;
    const cssClass = type === "success" ? "message-success" : "message-error";
    container.innerHTML = `<div class="${cssClass}">${message}</div>`;
}