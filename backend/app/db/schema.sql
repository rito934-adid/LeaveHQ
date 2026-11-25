CREATE TABLE IF NOT EXISTS departments (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
    id BIGSERIAL PRIMARY KEY,
    employee_code VARCHAR(30) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE,
    department_id BIGINT REFERENCES departments(id),
    designation VARCHAR(120),
    joining_date DATE,
    employment_status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (employment_status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(80) UNIQUE NOT NULL,
    description TEXT,
    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS leave_records (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    leave_type_id BIGINT NOT NULL REFERENCES leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days NUMERIC(5,2) NOT NULL,
    duration_type VARCHAR(20) NOT NULL DEFAULT 'full_day'
        CONSTRAINT leave_duration_type_check
        CHECK (duration_type IN ('full_day', 'first_half', 'second_half', 'custom_hours')),
    start_time TIME,
    end_time TIME,
    total_hours NUMERIC(6,2),
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'taken'
        CHECK (status IN ('planned', 'taken', 'cancelled')),
    admin_remarks TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_date >= start_date),
    CHECK (total_days > 0)
);

CREATE TABLE IF NOT EXISTS admins (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT REFERENCES admins(id),
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_department
ON employees(department_id);

CREATE INDEX IF NOT EXISTS idx_leave_employee
ON leave_records(employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_dates
ON leave_records(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_leave_status
ON leave_records(status);

INSERT INTO leave_types (name, description)
VALUES
    ('Casual Leave', 'Personal or planned leave'),
    ('Sick Leave', 'Medical or health-related leave'),
    ('Earned Leave', 'Accumulated earned leave'),
    ('Unpaid Leave', 'Leave without pay'),
    ('Other', 'Other approved leave categories')
ON CONFLICT (name) DO NOTHING;
