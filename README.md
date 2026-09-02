# SLSU Payroll System - Local Setup Guide

Follow these steps to run this application on your local machine using VS Code.

## 1. Prerequisites
Ensure you have the following installed:
*   **Node.js** (v18 or higher)
*   **MySQL Server** (v8.0 or higher)
*   **VS Code**

## 2. Export the Project
1.  In AI Studio, go to **Settings > Export**.
2.  Choose **Download as ZIP** or **Export to GitHub**.
3.  Open the project folder in VS Code.

## 3. Database Setup
1.  Open your MySQL terminal or a tool like MySQL Workbench.
2.  Run the commands found in `schema.sql` to create the database and tables.
    ```bash
    mysql -u your_username -p < schema.sql
    ```

## 4. Environment Configuration
1.  In the root directory, create a file named `.env`.
2.  Copy the contents from `.env.example` into `.env`.
3.  Fill in your actual MySQL credentials:
    ```env
    MYSQL_HOST=localhost
    MYSQL_USER=root
    MYSQL_PASSWORD=your_password
    MYSQL_DATABASE=payroll_db
    MYSQL_PORT=3306
    GEMINI_API_KEY=your_gemini_api_key
    ```

## 5. Install Dependencies
Open the VS Code terminal (Ctrl+`) and run:
```bash
npm install
```

## 6. Run the Application
Start the development server (which runs both the Express backend and Vite frontend):
```bash
npm run dev
```

## 7. Access the App
*   Open your browser and go to: `http://localhost:3000`
*   **Admin Login:**
    *   **Email:** `caturanchristian@gmail.com`
    *   **Password:** `admin123`

## Troubleshooting
*   **Port 3000 busy:** If another app is using port 3000, you can change the port in `server.ts`.
*   **MySQL Connection Error:** Double-check your `.env` credentials and ensure the MySQL service is running.
