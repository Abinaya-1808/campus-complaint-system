# Campus Complaint System - Backend API

A production-ready RESTful API service built with **Node.js**, **Express.js**, **MongoDB**, and **JWT Authentication** for the Campus Complaint System.

---

## Project Structure

`
CampusComplaintSystemBackend/
|-- src/
|   |-- config/            # Database and service configurations (db.js)
|   |-- controllers/       # Request handlers (auth, complaints, notifications)
|   |-- middleware/        # Authentication & Role Authorization (authMiddleware.js)
|   |-- models/            # Mongoose Schemas (User.js, Complaint.js, Notification.js)
|   |-- routes/            # Express Routers (authRoutes, complaintRoutes, notificationRoutes)
|   |-- scripts/           # Seeder & Test Runner (seedAdmin.js, runTests.js)
|   +-- utils/             # Helpers (generateToken.js)
|-- .env.example           # Environment variable template
|-- .gitignore             # Git ignored files (.env, node_modules, logs)
|-- package.json           # Dependencies and scripts
+-- README.md              # Project documentation
`

---

## Environment Configuration

Copy .env.example to .env and configure your settings:
`ash
cp .env.example .env
`

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| PORT | API server listening port | 5000 |
| NODE_ENV | Environment mode (development, production, 	est) | development |
| MONGO_URI | MongoDB connection string | mongodb://localhost:27017/campus_complaints |
| JWT_SECRET | Secret key for signing JSON Web Tokens | your_secret_key |
| JWT_EXPIRES_IN | Token expiration duration | 7d |
| CORS_ORIGIN | Allowed client origin | http://127.0.0.1:5500 |
| ADMIN_NAME | Initial administrator name | Campus Administrator |
| ADMIN_EMAIL | Initial administrator email | dmin@campus.edu |
| ADMIN_PASSWORD | Initial administrator password | your_secure_password |

---

## Commands

- **Run development server**:
  `ash
  npm run dev
  `

- **Run production server**:
  `ash
  npm start
  `

- **Seed Administrator Account**:
  `ash
  npm run seed:admin
  `

- **Run Automated Test Suite**:
  `ash
  npm test
  `

---

## API Reference

### Health
- GET /api/health - Server and database readiness check

### Authentication
- POST /api/auth/register - Public student registration (enforces student role)
- POST /api/auth/login - Login with email/registerNumber and password
- GET /api/auth/me - Get authenticated user profile (Protected)

### Complaints
- POST /api/complaints - Submit new complaint (Student only)
- GET /api/complaints - List complaints (Students see own; Admins see all)
- GET /api/complaints/:id - Get complaint details (Owner or Admin)
- PATCH /api/complaints/:id/status - Update complaint status (Admin only)
- POST /api/complaints/:id/responses - Add administrator response (Admin only)

### Notifications
- GET /api/notifications - Get user notifications and unread count
- PATCH /api/notifications/:id/read - Mark single notification as read
- PATCH /api/notifications/read-all - Mark all notifications as read
