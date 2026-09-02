-- SLSU Payroll System - MySQL/Aiven Database Schema
-- Optimized for MySQL, Aiven MySQL, and local environments

-- Create Database
CREATE DATABASE IF NOT EXISTS payroll_db;
USE payroll_db;

-- 1. Users Table (System Access)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    displayName VARCHAR(255),
    role VARCHAR(50) DEFAULT 'employee', -- 'admin', 'payroll_officer', 'employee', 'accountant', 'department_head'
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Employees Table (HR Records)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(255) PRIMARY KEY,
    employeeId VARCHAR(255) UNIQUE NOT NULL,
    firstName VARCHAR(255) NOT NULL,
    lastName VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    password VARCHAR(255),
    category VARCHAR(255), -- 'FACULTY', 'STAFF', etc.
    basicSalary DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    salaryType VARCHAR(50) DEFAULT 'monthly', -- 'monthly', 'daily'
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive'
    phoneNumber VARCHAR(50) DEFAULT '09171234567',
    hireDate DATE,
    hasSss INT DEFAULT 0,
    hasPhilhealth INT DEFAULT 0,
    hasPagibig INT DEFAULT 0,
    bpno VARCHAR(255),
    mi VARCHAR(10),
    prefix VARCHAR(50),
    appellation VARCHAR(50),
    birthDate VARCHAR(50),
    crn VARCHAR(255),
    effectivityDate VARCHAR(50),
    position VARCHAR(255),
    gender VARCHAR(50) DEFAULT 'MALE',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Payroll Cycles Table (Billing Periods)
CREATE TABLE IF NOT EXISTS payroll_cycles (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    startDate DATE NOT NULL,
    endDate DATE NOT NULL,
    type VARCHAR(50) DEFAULT 'all', -- 'monthly', 'semi-monthly', or 'all'
    categoryFilter VARCHAR(255) DEFAULT 'all',
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'processed', 'completed'
    totalGross DECIMAL(15, 2) DEFAULT 0.00,
    totalDeductions DECIMAL(15, 2) DEFAULT 0.00,
    totalNet DECIMAL(15, 2) DEFAULT 0.00,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Payroll Entries Table (Individual Payslips per Cycle)
CREATE TABLE IF NOT EXISTS payroll_entries (
    id VARCHAR(255) PRIMARY KEY,
    cycleId VARCHAR(255) NOT NULL,
    employeeId VARCHAR(255) NOT NULL,
    employeeName VARCHAR(255) NOT NULL,
    basicPay DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    overtime DECIMAL(15, 2) DEFAULT 0.00,
    bonuses DECIMAL(15, 2) DEFAULT 0.00,
    allowances DECIMAL(15, 2) DEFAULT 0.00,
    otHours DECIMAL(15, 2) DEFAULT 0.00,
    incentives DECIMAL(15, 2) DEFAULT 0.00,
    teachingHours DECIMAL(15, 2) DEFAULT 0.00,
    grossPay DECIMAL(15, 2) DEFAULT 0.00,
    totalDeductions DECIMAL(15, 2) DEFAULT 0.00,
    netPay DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processed'
    deductions_json TEXT, -- Stores breakdown of deductions as JSON
    custom_values_json TEXT, -- Stores manual overrides as JSON
    isValidated INT DEFAULT 0,
    
    -- Government shares columns (Spreadsheet columns)
    govSecGsis DECIMAL(15, 2) DEFAULT 0.00,
    govSecHdmf DECIMAL(15, 2) DEFAULT 0.00,
    govSecPh DECIMAL(15, 2) DEFAULT 0.00,
    govSecEcip DECIMAL(15, 2) DEFAULT 0.00,
    
    -- Compensations columns
    compSal2nd DECIMAL(15, 2) DEFAULT 0.00,
    compPera DECIMAL(15, 2) DEFAULT 0.00,
    compGross DECIMAL(15, 2) DEFAULT 0.00,
    absences DECIMAL(15, 2) DEFAULT 0.00,
    
    -- Deductions columns
    dedPolicyLoan DECIMAL(15, 2) DEFAULT 0.00,
    dedConsolLoan DECIMAL(15, 2) DEFAULT 0.00,
    dedMplLite DECIMAL(15, 2) DEFAULT 0.00,
    dedMpl DECIMAL(15, 2) DEFAULT 0.00,
    dedCpl DECIMAL(15, 2) DEFAULT 0.00,
    dedGfal DECIMAL(15, 2) DEFAULT 0.00,
    dedEmergencyLoan DECIMAL(15, 2) DEFAULT 0.00,
    dedGsisPremPersonal DECIMAL(15, 2) DEFAULT 0.00,
    dedEducAsst DECIMAL(15, 2) DEFAULT 0.00,
    dedPagibigPersonal DECIMAL(15, 2) DEFAULT 0.00,
    dedPagibigMpl DECIMAL(15, 2) DEFAULT 0.00,
    dedSss DECIMAL(15, 2) DEFAULT 0.00,
    dedPagibigMp2 DECIMAL(15, 2) DEFAULT 0.00,
    dedPhilhealthCont DECIMAL(15, 2) DEFAULT 0.00,
    dedCsbLoan DECIMAL(15, 2) DEFAULT 0.00,
    dedTaxWithheld DECIMAL(15, 2) DEFAULT 0.00,
    
    FOREIGN KEY (cycleId) REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 5. Payroll Records Table (Historical & Archived Payrolls by Year & Month)
CREATE TABLE IF NOT EXISTS payroll_records (
    id VARCHAR(255) PRIMARY KEY,
    cycleId VARCHAR(255) NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    monthName VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    periodType VARCHAR(50) DEFAULT 'monthly',
    totalEmployees INT DEFAULT 0,
    totalGross DECIMAL(15, 2) DEFAULT 0.00,
    totalDeductions DECIMAL(15, 2) DEFAULT 0.00,
    totalNet DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'archived',
    notes TEXT NULL,
    recordDataJson LONGTEXT NULL,
    createdBy VARCHAR(255) NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5b. Deduction Records Table (Historical & Archived Deductions Matrix Snapshots)
CREATE TABLE IF NOT EXISTS deduction_records (
    id VARCHAR(255) PRIMARY KEY,
    year INT NOT NULL,
    month INT NOT NULL,
    monthName VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    periodType VARCHAR(50) DEFAULT 'monthly',
    totalEmployees INT DEFAULT 0,
    totalDeductions DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'saved',
    notes TEXT NULL,
    recordDataJson LONGTEXT NULL,
    createdBy VARCHAR(255) NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Deduction Types Table (Configuration)
CREATE TABLE IF NOT EXISTS deduction_types (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Deductions Table (Recurring Deductions per Employee)
CREATE TABLE IF NOT EXISTS deductions (
    id VARCHAR(255) PRIMARY KEY,
    employeeId VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL,
    description TEXT,
    amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'active',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 7. Employee Categories Table (Classification)
CREATE TABLE IF NOT EXISTS employee_categories (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Employee Positions Table
CREATE TABLE IF NOT EXISTS employee_positions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Schedules Table (Lecture & Work hours)
CREATE TABLE IF NOT EXISTS schedules (
    id VARCHAR(255) PRIMARY KEY,
    employeeId VARCHAR(255) NOT NULL,
    dayOfWeek VARCHAR(50),
    startTime VARCHAR(50),
    endTime VARCHAR(50),
    subject VARCHAR(255),
    room VARCHAR(255),
    specificDate VARCHAR(50),
    effectiveFrom VARCHAR(50),
    effectiveTo VARCHAR(50),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 10. DTR Logs Table (Daily Time Records / Form 48)
CREATE TABLE IF NOT EXISTS dtr_logs (
    id VARCHAR(255) PRIMARY KEY,
    employeeId VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    timeIn DATETIME,
    timeOut DATETIME,
    status VARCHAR(50) DEFAULT 'present', -- 'present', 'absent', 'leave'
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- 11. Audit Logs Table (Security Logging)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255),
    userEmail VARCHAR(255),
    action VARCHAR(255),
    detail TEXT,
    ipAddress VARCHAR(255),
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 12. SMS Logs Table (Notifications Tracking)
CREATE TABLE IF NOT EXISTS sms_logs (
    id VARCHAR(255) PRIMARY KEY,
    employeeId VARCHAR(255) NOT NULL,
    phoneNumber VARCHAR(50),
    message TEXT,
    status VARCHAR(50) DEFAULT 'sent',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
);

-- 13. Holidays Table (State & University Public Holidays)
CREATE TABLE IF NOT EXISTS holidays (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    date VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- DATABASE SEEDS & INITIALIZATION DATA
-- =========================================================================

-- Seed Categories
INSERT IGNORE INTO employee_categories (id, name, description) VALUES
('cat-1', 'Regular Employee', 'Fixed monthly salary, Full benefits, Subject to tax'),
('cat-2', 'Job Order', 'Paid per day or per hour, Contract-based, Minimal or no benefits'),
('cat-3', 'Visiting Instructor', 'Paid per unit or teaching hour, Workload-based computation'),
('cat-4', 'FACULTY', 'Academic faculty status with teaching load and standard monthly appointment'),
('cat-5', 'STAFF', 'Administrative and support staff with standard monthly appointment');

-- Seed Deduction Types
INSERT IGNORE INTO deduction_types (id, name, description) VALUES 
('dt-1', 'Loan Payment', 'Employee loans'),
('dt-2', 'Insurance', 'Health or life insurance'),
('dt-3', 'Additional Tax', 'Withholding tax'),
('dt-4', 'Other', 'Miscellaneous deductions');

-- Seed Default Administration & System Access Users (Passwords: admin123, accountant123, head123)
INSERT IGNORE INTO users (id, email, password, displayName, role) VALUES 
('admin-1', 'admin@gmail.com', 'admin123', 'Admin User', 'admin'),
('admin-2', 'caturanchristian@gmail.com', 'admin123', 'Admin User', 'admin'),
('admin-3', 'chancaturan@gmail.com', 'admin123', 'Admin User', 'admin'),
('accountant-1', 'accountant@example.com', 'accountant123', 'System Accountant', 'accountant'),
('depthead-1', 'head@gmail.com', 'head123', 'Department Head', 'department_head');

-- Seed Holidays
INSERT IGNORE INTO holidays (id, name, date, type) VALUES
('hol-1', 'New Year\'s Day', '2026-01-01', 'Regular'),
('hol-2', 'Maundy Thursday', '2026-04-02', 'Regular'),
('hol-3', 'Good Friday', '2026-04-03', 'Regular'),
('hol-4', 'Araw ng Kagitingan', '2026-04-09', 'Regular'),
('hol-5', 'Labor Day', '2026-05-01', 'Regular'),
('hol-6', 'Independence Day', '2026-06-12', 'Regular'),
('hol-7', 'Ninoy Aquino Day', '2026-08-21', 'Special Non-Working'),
('hol-8', 'National Heroes Day', '2026-08-31', 'Regular'),
('hol-9', 'All Saints\' Day', '2026-11-01', 'Special Non-Working'),
('hol-10', 'Bonifacio Day', '2026-11-30', 'Regular'),
('hol-11', 'Feast of the Immaculate Conception', '2026-12-08', 'Special Non-Working'),
('hol-12', 'Christmas Day', '2026-12-25', 'Regular'),
('hol-13', 'Rizal Day', '2026-12-30', 'Regular');

-- 14. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    departmentHeadId VARCHAR(255),
    description TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
    id VARCHAR(255) PRIMARY KEY,
    departmentId VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    units INT DEFAULT 3,
    description TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departmentId) REFERENCES departments(id) ON DELETE CASCADE
);

-- Seed Department Head Users
INSERT IGNORE INTO users (id, email, password, displayName, role) VALUES 
('depthead-bsit', 'bsithead@gmail.com', 'bsithead123', 'BSIT Department Head', 'department_head'),
('depthead-bsed', 'bsedhead@gmail.com', 'bsedhead123', 'BSED Department Head', 'department_head'),
('depthead-bsa', 'bsahead@gmail.com', 'bsahead123', 'BSA Department Head', 'department_head'),
('depthead-bsab', 'bsabhead@gmail.com', 'bsabhead123', 'BSAB Department Head', 'department_head');

-- Seed Departments
INSERT IGNORE INTO departments (id, name, code, departmentHeadId, description) VALUES
('dept-bsit', 'Bachelor of Science in Information Technology', 'BSIT', 'depthead-bsit', 'Department of Computer Studies and Information Technology'),
('dept-bsed', 'Bachelor of Secondary Education', 'BSED', 'depthead-bsed', 'Department of Teacher Education, Elementary and Secondary Education'),
('dept-bsa', 'Bachelor of Science in Agriculture', 'BSA', 'depthead-bsa', 'Department of Crop, Soil, and Animal Sciences'),
('dept-bsab', 'Bachelor of Science in Agribusiness', 'BSAB', 'depthead-bsab', 'Department of Agribusiness Management and Agricultural Economics');

-- Seed Subjects
INSERT IGNORE INTO subjects (id, departmentId, code, name, units, description) VALUES
('sub-bsit101', 'dept-bsit', 'BSIT101', 'Introduction to Computing', 3, 'Overview of computer systems, history, and basic terminology'),
('sub-bsit102', 'dept-bsit', 'BSIT102', 'Computer Programming 1', 3, 'Introduction to structured programming using a modern high-level language'),
('sub-bsit103', 'dept-bsit', 'BSIT103', 'Data Structures and Algorithms', 3, 'Basic concepts of data representation, search, sort, and algorithms complexity'),
('sub-bsed101', 'dept-bsed', 'BSED101', 'Foundation of Education', 3, 'Philosophical, sociological, and psychological foundations of education'),
('sub-bsed102', 'dept-bsed', 'BSED102', 'Curriculum Development', 3, 'Principles and procedures of curriculum planning, implementation, and evaluation'),
('sub-bsa101', 'dept-bsa', 'BSA101', 'Introduction to Agriculture', 3, 'Overview of agricultural practices, soils, crops, and livestock'),
('sub-bsa102', 'dept-bsa', 'BSA102', 'Soil Science', 3, 'Physical, chemical, and biological properties of soils in agriculture'),
('sub-bsab101', 'dept-bsab', 'BSAB101', 'Principles of Agribusiness', 3, 'Fundamentals of agribusiness management, markets, and supply chains'),
('sub-bsab102', 'dept-bsab', 'BSAB102', 'Agricultural Marketing', 3, 'Analysis of market structures, pricing, and distribution of agricultural products');

