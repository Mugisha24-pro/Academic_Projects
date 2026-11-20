# ♻️ Smart Waste Collection Management System

A full-stack web application designed to improve waste collection management through digital bin monitoring, resident pickup requests, driver task assignments, collection route planning, and administrator approval.

---

## 1. Project Overview

The **Smart Waste Collection Management System** is a web-based platform developed to make waste collection more organized, efficient, and transparent.

Traditional waste collection can face challenges such as overflowing bins, delayed collection, poor coordination between residents and collection teams, and limited information about collection activities.

This system provides a centralized platform where residents can submit waste pickup requests, administrators can manage bins and coordinate collection activities, and drivers can access and complete their assigned tasks.

The application also tracks bin fill levels and helps administrators identify bins that require collection. Its approval-based workflow ensures that collection records and bin information are updated only after the administrator confirms that the work has been completed.

## 2. Project Objectives

The main objectives of this project are to:

- Improve the organization and management of waste collection activities.
- Allow residents to submit and monitor waste pickup requests.
- Help administrators manage waste bins, users, drivers, and collection routes.
- Provide drivers with access to their assigned collection tasks.
- Monitor bin fill levels and identify bins requiring collection.
- Improve accountability through an administrator approval process.
- Maintain accurate information about waste collection activities.

## 3. Key Features

### Authentication and User Management
- User registration and login.
- Secure password hashing.
- JWT-based authentication.
- Role-based access control.
- Administrator management of user accounts.

### Waste Bin Management
- Register and manage waste bins.
- Store bin locations using geographical coordinates.
- Track bin capacity and fill percentage.
- Monitor bin operational status.
- Identify bins requiring collection.

### Resident Pickup Requests
- Residents can submit waste pickup requests.
- Specify pickup location, waste type, requested date, and description.
- Select a destination waste bin and provide the waste volume.
- View submitted requests and their progress.
- Edit eligible requests.

### Driver Management
- Administrators can assign pickup requests and collection routes to drivers.
- Drivers can view their assigned tasks.
- Drivers can accept assigned pickup requests.
- Drivers can submit completed pickup work for administrator review.
- Drivers can record completed collection-route stops.

### Collection Route Management
- Administrators can create collection routes.
- Select bins that require collection.
- Assign drivers to collection routes.
- Organize bins according to collection stop order.
- Monitor collection progress.
- Approve completed routes.

### Bin Capacity Monitoring
- Track the percentage of waste contained in each bin.
- Identify bins whose fill level exceeds 95%.
- Prevent duplicate assignment of bins to active collection routes.
- Update bin fill levels after approved waste deliveries.
- Reset collected bins to empty after administrator approval.

## 4. User Roles and Responsibilities

| User Role | Responsibilities |
|---|---|
| **Administrator** | Manage users and waste bins, review pickup requests, assign drivers, create collection routes, monitor tasks, and approve completed work. |
| **Driver** | View assigned tasks, accept pickup requests, perform collection activities, and submit completed work for approval. |
| **Resident** | Register, log in, view waste bins, submit pickup requests, and monitor request progress. |

Each role has specific permissions to ensure that users access only the operations assigned to their responsibilities.

## 5. Technology Stack

The project uses the following technologies:

| Component | Technology |
|---|---|
| Frontend | React 19 |
| Programming Language (Frontend) | TypeScript |
| Frontend Build Tool | Vite |
| Frontend Routing | React Router |
| HTTP Client | Axios |
| Backend | Python |
| Backend Framework | FastAPI |
| Database ORM | SQLAlchemy |
| Data Validation and Configuration | Pydantic, pydantic-settings |
| Database | PostgreSQL |
| Authentication | JWT |
| Password Security | bcrypt |
| Backend Testing | Python unittest |

## 6. System Architecture

The application follows a **client-server architecture** consisting of three main layers:

### Presentation Layer
Built with React and TypeScript. It provides the user interface through which administrators, drivers, and residents interact with the system.

### Application Layer
Built with Python and FastAPI. It handles business logic, authentication, request validation, role permissions, collection workflows, and communication between the frontend and database.

### Data Layer
Uses PostgreSQL to store and manage application data. SQLAlchemy provides the connection between the backend application and the database.

**Application communication:**

React Frontend → FastAPI REST API → SQLAlchemy → PostgreSQL Database

## 7. Main System Workflows

### 7.1 Resident Waste Pickup Request

1. A resident logs into the application.
2. The resident submits a waste pickup request with the required information.
3. The system validates and stores the request.
4. The administrator reviews the submitted request.
5. The administrator assigns the request to an active driver.
6. The driver accepts the assigned task.
7. After completing the delivery, the driver submits the task for approval.
8. The administrator reviews and approves the submitted task.
9. The system updates the destination bin's fill level and marks the request as completed.

### 7.2 Waste Collection Route

1. The system identifies bins with fill levels above 95% as eligible for collection, subject to collection and maintenance restrictions.
2. The administrator creates a collection route using eligible bins.
3. The administrator assigns a driver to the route.
4. The driver accesses the assigned route.
5. The driver collects waste from each assigned bin.
6. The driver submits each completed collection stop.
7. The administrator reviews and approves the completed route.
8. The system marks the route as completed and resets the collected bins' fill levels to zero.

### 7.3 Approval-Based Collection Workflow

An important business rule in this system is that **a driver's submission does not automatically mean that a collection task is completed**.

The driver submits the completed work, but the administrator has the responsibility to review and approve it.

- When a driver submits a pickup request, the bin is not immediately updated.
- When a driver submits a collection stop, the bin remains full until route approval.
- After successful administrator approval, the system updates the relevant bin information.
- The system validates capacity and collection conditions before applying these updates.

This approach improves accountability and helps maintain accurate collection records.

## 8. Database Overview

The application uses PostgreSQL as its relational database management system.

The main database entities include:

| Table | Description |
|---|---|
| `users` | Stores user information, authentication details, roles, and account status. |
| `bins` | Stores waste-bin locations, geographical coordinates, capacity, fill level, and operational status. |
| `routes` | Stores collection route information, assigned drivers, scheduled dates, and route status. |
| `route_stops` | Stores the bins included in collection routes and their collection order and submission information. |
| `reports` | Stores reports submitted by users concerning waste bins and their resolution status. |
| `pickup_requests` | Stores resident pickup requests, assigned drivers, destination bins, waste volumes, and request statuses. |

The database uses primary keys and foreign keys to maintain relationships between users, bins, routes, route stops, reports, and pickup requests.

## 9. Request and Collection Statuses

### Pickup Request Status

The application supports the following pickup request statuses:

| Status | Meaning |
|---|---|
| `requested` | A resident has submitted a pickup request. |
| `assigned` | An administrator has assigned the request to a driver. |
| `accepted` | The assigned driver has accepted the task. |
| `submitted` | The driver has submitted the completed work for review. |
| `completed` | The administrator has approved the work. |
| `cancelled` | The request has been cancelled. |

### Collection Route Status

| Status | Meaning |
|---|---|
| `planned` | The route has been created and is awaiting collection. |
| `in_progress` | Collection activities are underway. |
| `completed` | The administrator has approved the completed route. |

## 10. Project Structure

The project is organized into two main directories:

```text
smart-waste-system/
│
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── bins.py
│   │   │   ├── pickup_requests.py
│   │   │   ├── routes.py
│   │   │   └── users.py
│   │   │
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── deps.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── security.py
│   │
│   ├── migrations/
│   ├── tests/
│   ├── create_admin.py
│   └── requirements.txt
│
└── frontend/
    ├── public/
    ├── src/
    │   ├── components/
    │   ├── assets/
    │   ├── App.tsx
    │   ├── App.css
    │   ├── api.ts
    │   ├── auth.tsx
    │   ├── main.tsx
    │   └── types.ts
    │
    ├── package.json
    └── vite.config.ts
```

## 11. Installation and Setup

### Prerequisites

Before running the project, make sure you have installed:

- Python 3.10 or later
- Node.js and npm
- PostgreSQL
- Git (optional)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd smart-waste-system
```

Alternatively, download and extract the project ZIP file.

### Step 2: Create the PostgreSQL Database

Open PostgreSQL or pgAdmin and execute:

```sql
CREATE DATABASE smart_waste_db;
```

You can use another database name if you update the connection configuration accordingly.

### Step 3: Configure the Backend

Open a terminal inside the `backend` directory.

Create a Python virtual environment:

```bash
python -m venv .venv
```

Activate it on Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

Install the required Python packages:

```bash
pip install fastapi "uvicorn[standard]" sqlalchemy pydantic-settings psycopg2-binary "python-jose[cryptography]" bcrypt python-multipart
```

Create a `.env` file inside the `backend` directory:

```env
DATABASE_URL=postgresql+psycopg2://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/smart_waste_db
SECRET_KEY=YOUR_LONG_RANDOM_SECRET_KEY
```

Replace the example database credentials and secret with your own values.

### Step 4: Create the First Administrator

While inside the `backend` directory and with the virtual environment activated, run:

```bash
python create_admin.py
```

Follow the instructions to enter the administrator's name, email, and password.

The script creates the administrator account and securely hashes the password before storing it.

### Step 5: Configure the Frontend

Open another terminal inside the `frontend` directory.

Install the frontend dependencies:

```bash
npm install
```

The default backend API address is:

```text
http://127.0.0.1:8001
```

If you use another backend address, create a `.env` file inside `frontend`:

```env
VITE_API_URL=http://127.0.0.1:8001
```

## 12. Running the Application

The frontend and backend must run separately.

### Start the Backend

From the `backend` directory:

```bash
uvicorn app.main:app --reload --port 8001
```

The backend will be available at:

```text
http://127.0.0.1:8001
```

### Start the Frontend

From the `frontend` directory:

```bash
npm run dev
```

Open the local address displayed in the terminal, normally:

```text
http://localhost:5173
```

You can now access the application through your browser.

## 13. API Documentation

The backend uses FastAPI, which automatically generates interactive API documentation.

After starting the backend, access:

- **Swagger UI:** http://127.0.0.1:8001/docs
- **ReDoc:** http://127.0.0.1:8001/redoc
- **Health Check:** http://127.0.0.1:8001/health

The API includes endpoints for authentication, user management, waste bins, pickup requests, and collection routes.

## 14. Testing

The backend includes automated workflow tests covering important business rules, including:

- Driver submission and administrator approval.
- Pickup request assignment and eligibility.
- Collection route approval.
- Bin capacity validation.
- Maintenance restrictions.
- Duplicate collection assignments.
- Transaction rollback when approval fails.
- Resident request ownership and editing restrictions.

To run the backend tests, execute the following command from the `backend` directory:

```bash
python -B -m unittest discover -s tests -v
```

To check the frontend production build, execute from the `frontend` directory:

```bash
npm run build
```

## 15. Security and Data Integrity

The system incorporates several security and data-integrity measures:

- Passwords are hashed using bcrypt.
- JWT access tokens are used for authentication.
- Protected backend operations enforce user roles.
- Residents are restricted to their own pickup requests.
- Bin capacity is validated before approved deliveries are recorded.
- Collection approval uses database transactions to protect related updates.
- PostgreSQL row locking is used in critical approval workflows.

**Deployment note:** Configure production environment variables and allowed frontend origins before deploying. Never publish database credentials, secret keys, or private environment files to GitHub.

## 16. Future Improvements

Potential future enhancements include:

- Integration of IoT sensors for automatic waste-level monitoring.
- Advanced route optimization based on distance and traffic conditions.
- Email, SMS, or in-app notifications.
- Detailed collection performance reports and analytics.
- Mobile application support for drivers and residents.
- Production deployment, automated backups, and expanded monitoring.

## 17. Conclusion

The Smart Waste Collection Management System provides a centralized digital solution for improving waste collection coordination and bin management.

By connecting residents, administrators, and drivers through one platform, the application helps organize pickup requests, manage collection routes, monitor bin capacity, and maintain accountability through administrator approval.

The project demonstrates the application of full-stack web development, REST API design, relational database management, authentication, role-based access control, and software engineering principles to address a practical community problem.

---

**Project Name:** Smart Waste Collection Management System  
**Project Type:** Full-Stack Web Application  
**Frontend:** React, TypeScript, Vite  
**Backend:** Python, FastAPI  
**Database:** PostgreSQL  
**Architecture:** Client–Server Architecture
