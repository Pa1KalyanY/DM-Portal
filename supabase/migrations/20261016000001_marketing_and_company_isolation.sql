-- Migration: Digital Marketing Phase 1 and Company Isolation
-- For AaraTech & ClinisolTech Unified Platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Ensure Company column on people table
ALTER TABLE people ADD COLUMN IF NOT EXISTS company TEXT NOT NULL DEFAULT 'AaraTech';
CREATE INDEX IF NOT EXISTS idx_people_company ON people(company);

-- 2. Company Memberships Table (Multi-tenant authorization)
CREATE TABLE IF NOT EXISTS company_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    email TEXT NOT NULL,
    company TEXT NOT NULL, -- 'AaraTech' or 'ClinisolTech'
    role TEXT NOT NULL DEFAULT 'Member', -- 'Admin', 'Recruiter', 'Marketing', 'Member'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_memberships_email ON company_memberships(email);
CREATE INDEX IF NOT EXISTS idx_company_memberships_company ON company_memberships(company);

-- 3. Digital Marketing Members (Team Roster)
CREATE TABLE IF NOT EXISTS marketing_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Marketing Specialist',
    avatar_url TEXT,
    default_company TEXT NOT NULL DEFAULT 'AaraTech',
    allowed_companies JSONB NOT NULL DEFAULT '["AaraTech", "ClinisolTech"]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_members_email ON marketing_members(email);

-- 4. Attendance Tracking
CREATE TABLE IF NOT EXISTS marketing_attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES marketing_members(id) ON DELETE CASCADE,
    user_id TEXT,
    company TEXT NOT NULL DEFAULT 'AaraTech',
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_at TIMESTAMPTZ,
    total_work_minutes INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Active', -- 'Active', 'OnBreak', 'Completed'
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_attendance_date ON marketing_attendance(work_date);
CREATE INDEX IF NOT EXISTS idx_marketing_attendance_member ON marketing_attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_marketing_attendance_company ON marketing_attendance(company);

-- 5. Break Tracking
CREATE TABLE IF NOT EXISTS marketing_breaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attendance_id UUID NOT NULL REFERENCES marketing_attendance(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES marketing_members(id) ON DELETE CASCADE,
    break_type TEXT NOT NULL, -- 'Lunch', 'Tea', 'Short'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 0,
    is_exceeded BOOLEAN NOT NULL DEFAULT false,
    notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_marketing_breaks_attendance ON marketing_breaks(attendance_id);
CREATE INDEX IF NOT EXISTS idx_marketing_breaks_member ON marketing_breaks(member_id);

-- 6. Marketing Tasks
CREATE TABLE IF NOT EXISTS marketing_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company TEXT NOT NULL DEFAULT 'AaraTech',
    title TEXT NOT NULL,
    description TEXT,
    assigned_to_member_id UUID REFERENCES marketing_members(id) ON DELETE SET NULL,
    assigned_to_name TEXT,
    priority TEXT NOT NULL DEFAULT 'Medium', -- 'Urgent', 'High', 'Medium', 'Low'
    status TEXT NOT NULL DEFAULT 'In Progress', -- 'Backlog', 'In Progress', 'In Review', 'Completed'
    due_date DATE,
    tags JSONB DEFAULT '[]'::jsonb,
    created_by TEXT NOT NULL DEFAULT 'Admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_tasks_company ON marketing_tasks(company);
CREATE INDEX IF NOT EXISTS idx_marketing_tasks_status ON marketing_tasks(status);
CREATE INDEX IF NOT EXISTS idx_marketing_tasks_assigned ON marketing_tasks(assigned_to_member_id);

-- 7. Content Calendar & Post Approvals
CREATE TABLE IF NOT EXISTS marketing_content_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company TEXT NOT NULL DEFAULT 'AaraTech',
    title TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'LinkedIn', -- 'LinkedIn', 'Twitter', 'Facebook', 'Blog', 'Email'
    content_type TEXT NOT NULL DEFAULT 'Post', -- 'Post', 'Article', 'Video', 'Carousel'
    scheduled_for TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'Draft', -- 'Draft', 'Under Review', 'Approved', 'Published'
    copy_text TEXT NOT NULL,
    media_urls JSONB DEFAULT '[]'::jsonb,
    approval_notes TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    author_id UUID REFERENCES marketing_members(id) ON DELETE SET NULL,
    author_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_content_company ON marketing_content_posts(company);
CREATE INDEX IF NOT EXISTS idx_marketing_content_status ON marketing_content_posts(status);
CREATE INDEX IF NOT EXISTS idx_marketing_content_sched ON marketing_content_posts(scheduled_for);

-- 8. Daily Work Reports
CREATE TABLE IF NOT EXISTS marketing_daily_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id UUID NOT NULL REFERENCES marketing_members(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'AaraTech',
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tasks_completed TEXT NOT NULL,
    tasks_in_progress TEXT,
    blockers TEXT,
    key_learnings TEXT,
    hours_logged NUMERIC DEFAULT 8.0,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_reports_company ON marketing_daily_reports(company);
CREATE INDEX IF NOT EXISTS idx_marketing_reports_member ON marketing_daily_reports(member_id);
CREATE INDEX IF NOT EXISTS idx_marketing_reports_date ON marketing_daily_reports(report_date);

-- 9. Marketing Company Settings
CREATE TABLE IF NOT EXISTS marketing_company_settings (
    company TEXT PRIMARY KEY,
    max_break_minutes_lunch INTEGER NOT NULL DEFAULT 45,
    max_break_minutes_tea INTEGER NOT NULL DEFAULT 15,
    allowed_roles JSONB DEFAULT '["Marketing Lead", "Content Creator", "Graphic Designer", "Social Media Manager", "SEO Specialist"]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Company Settings
INSERT INTO marketing_company_settings (company, max_break_minutes_lunch, max_break_minutes_tea)
VALUES 
    ('AaraTech', 45, 15),
    ('ClinisolTech', 45, 15)
ON CONFLICT (company) DO NOTHING;

-- Seed Initial 5-Member Team Roster (Dual Company Access)
INSERT INTO marketing_members (full_name, email, role, default_company, allowed_companies)
VALUES
    ('Sarah Jenkins', 'sarah.j@aaratech.com', 'Marketing Lead', 'AaraTech', '["AaraTech", "ClinisolTech"]'::jsonb),
    ('David Chen', 'david.c@aaratech.com', 'Content Strategist', 'AaraTech', '["AaraTech", "ClinisolTech"]'::jsonb),
    ('Priya Sharma', 'priya.s@clinisoltech.com', 'Social Media Manager', 'ClinisolTech', '["AaraTech", "ClinisolTech"]'::jsonb),
    ('Marcus Vance', 'marcus.v@aaratech.com', 'SEO & Performance Specialist', 'AaraTech', '["AaraTech", "ClinisolTech"]'::jsonb),
    ('Elena Rostova', 'elena.r@clinisoltech.com', 'Creative Designer', 'ClinisolTech', '["AaraTech", "ClinisolTech"]'::jsonb)
ON CONFLICT (email) DO NOTHING;

-- RLS Policies
ALTER TABLE marketing_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-write for marketing_members" ON marketing_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for marketing_attendance" ON marketing_attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for marketing_breaks" ON marketing_breaks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for marketing_tasks" ON marketing_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for marketing_content_posts" ON marketing_content_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for marketing_daily_reports" ON marketing_daily_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for marketing_company_settings" ON marketing_company_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for company_memberships" ON company_memberships FOR ALL USING (true) WITH CHECK (true);
