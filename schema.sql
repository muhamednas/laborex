-- =====================================================
-- Blue-Collar Labor Exchange - Database Schema
-- PostgreSQL 16 + PostGIS
-- =====================================================

-- Extensions (already installed, but safe to re-run)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- ENUMS
-- =====================================================
DO $$ BEGIN
    CREATE TYPE worker_status AS ENUM ('available', 'working', 'inactive', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE application_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE rating_direction AS ENUM ('employer_to_worker', 'worker_to_employer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'disputed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- =====================================================
-- 1. WORKER PROFILES
-- =====================================================
CREATE TABLE IF NOT EXISTS worker_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    whatsapp_number VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(150),
    preferred_language VARCHAR(10) DEFAULT 'si',  -- si, ta, en
    
    -- Skills extracted via NLP (array of tags)
    skills TEXT[] DEFAULT '{}',
    
    -- Raw voice/text registration for audit
    raw_registration_text TEXT,
    voice_note_url TEXT,
    
    -- Geospatial (PostGIS)
    home_location GEOGRAPHY(POINT, 4326),
    home_address_text VARCHAR(255),
    service_radius_km INTEGER DEFAULT 10,
    
    -- Trust & reputation
    trust_score NUMERIC(4,2) DEFAULT 50.00 CHECK (trust_score BETWEEN 0 AND 100),
    total_jobs_completed INTEGER DEFAULT 0,
    total_ratings_received INTEGER DEFAULT 0,
    avg_rating NUMERIC(3,2) DEFAULT 0.00,
    
    -- Wage expectations (LKR per day)
    min_daily_wage INTEGER DEFAULT 2500,
    
    -- NIC for EPF/ETF (nullable - informal workers may not have one initially)
    nic_number VARCHAR(20) UNIQUE,
    
    status worker_status DEFAULT 'available',
    is_verified BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workers_location ON worker_profiles USING GIST(home_location);
CREATE INDEX IF NOT EXISTS idx_workers_skills ON worker_profiles USING GIN(skills);
CREATE INDEX IF NOT EXISTS idx_workers_status ON worker_profiles(status) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_workers_trust ON worker_profiles(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_workers_name_trgm ON worker_profiles USING GIN(full_name gin_trgm_ops);

-- =====================================================
-- 2. EMPLOYERS (SMEs)
-- =====================================================
CREATE TABLE IF NOT EXISTS employers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    whatsapp_number VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(150),
    
    -- Business registration (optional for informal SMEs)
    business_reg_number VARCHAR(50),
    industry_category VARCHAR(100),  -- construction, agriculture, hospitality, etc.
    
    -- Location
    business_location GEOGRAPHY(POINT, 4326),
    business_address_text VARCHAR(255),
    
    -- Trust metrics
    trust_score NUMERIC(4,2) DEFAULT 50.00 CHECK (trust_score BETWEEN 0 AND 100),
    total_jobs_posted INTEGER DEFAULT 0,
    total_ratings_received INTEGER DEFAULT 0,
    avg_rating NUMERIC(3,2) DEFAULT 0.00,
    
    -- EPF/ETF registration
    epf_employer_number VARCHAR(50),
    is_epf_registered BOOLEAN DEFAULT FALSE,
    
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employers_location ON employers USING GIST(business_location);
CREATE INDEX IF NOT EXISTS idx_employers_industry ON employers(industry_category);
CREATE INDEX IF NOT EXISTS idx_employers_name_trgm ON employers USING GIN(business_name gin_trgm_ops);

-- =====================================================
-- 3. JOB POSTINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employer_id UUID NOT NULL REFERENCES employers(id) ON DELETE CASCADE,
    
    title VARCHAR(200) NOT NULL,
    description TEXT,
    required_skills TEXT[] DEFAULT '{}',
    
    -- Location
    job_location GEOGRAPHY(POINT, 4326) NOT NULL,
    job_address_text VARCHAR(255),
    
    -- Wage & duration
    daily_wage INTEGER NOT NULL,  -- LKR per day
    workers_needed INTEGER DEFAULT 1,
    workers_hired INTEGER DEFAULT 0,
    
    start_date DATE NOT NULL,
    end_date DATE,
    duration_days INTEGER,
    
    -- Compliance
    includes_epf_etf BOOLEAN DEFAULT FALSE,
    includes_meals BOOLEAN DEFAULT FALSE,
    includes_transport BOOLEAN DEFAULT FALSE,
    
    status job_status DEFAULT 'open',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_jobs_location ON job_postings USING GIST(job_location);
CREATE INDEX IF NOT EXISTS idx_jobs_skills ON job_postings USING GIN(required_skills);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_postings(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON job_postings(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_start_date ON job_postings(start_date);

-- =====================================================
-- 4. JOB APPLICATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS job_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
    
    status application_status DEFAULT 'pending',
    
    -- Match scoring (cached from matching engine)
    match_score NUMERIC(5,2),
    distance_km NUMERIC(6,2),
    
    -- Worker's response via WhatsApp
    worker_message TEXT,
    employer_message TEXT,
    
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    
    UNIQUE(job_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_apps_job ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_apps_worker ON job_applications(worker_id);
CREATE INDEX IF NOT EXISTS idx_apps_status ON job_applications(status);

-- =====================================================
-- 5. WORK HISTORY LEDGER (immutable completed jobs)
-- =====================================================
CREATE TABLE IF NOT EXISTS work_history_ledger (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID NOT NULL REFERENCES worker_profiles(id),
    employer_id UUID NOT NULL REFERENCES employers(id),
    job_id UUID REFERENCES job_postings(id),
    application_id UUID REFERENCES job_applications(id),
    
    -- Job snapshot (denormalized for historical accuracy)
    job_title VARCHAR(200),
    skills_used TEXT[],
    
    -- Dates worked
    work_start_date DATE NOT NULL,
    work_end_date DATE NOT NULL,
    days_worked INTEGER NOT NULL,
    
    -- Financials (LKR)
    daily_wage INTEGER NOT NULL,
    gross_earnings INTEGER NOT NULL,
    
    -- Compliance deductions (auto-calculated)
    epf_employee_contribution INTEGER DEFAULT 0,  -- 8% from worker
    epf_employer_contribution INTEGER DEFAULT 0,  -- 12% from employer
    etf_employer_contribution INTEGER DEFAULT 0,  -- 3% from employer
    net_payment INTEGER NOT NULL,
    
    payment_status payment_status DEFAULT 'pending',
    payment_date DATE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_worker ON work_history_ledger(worker_id);
CREATE INDEX IF NOT EXISTS idx_history_employer ON work_history_ledger(employer_id);
CREATE INDEX IF NOT EXISTS idx_history_dates ON work_history_ledger(work_end_date DESC);

-- =====================================================
-- 6. RATINGS & REVIEWS
-- =====================================================
CREATE TABLE IF NOT EXISTS ratings_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_history_id UUID NOT NULL REFERENCES work_history_ledger(id) ON DELETE CASCADE,
    
    direction rating_direction NOT NULL,
    rater_id UUID NOT NULL,      -- worker_id OR employer_id depending on direction
    ratee_id UUID NOT NULL,
    
    -- Ratings (1-5)
    overall_rating SMALLINT NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
    
    -- Dimensional ratings (1-5, nullable)
    punctuality_rating SMALLINT CHECK (punctuality_rating BETWEEN 1 AND 5),
    skill_rating SMALLINT CHECK (skill_rating BETWEEN 1 AND 5),
    attitude_rating SMALLINT CHECK (attitude_rating BETWEEN 1 AND 5),
    payment_timeliness_rating SMALLINT CHECK (payment_timeliness_rating BETWEEN 1 AND 5),
    fairness_rating SMALLINT CHECK (fairness_rating BETWEEN 1 AND 5),
    
    review_text TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(work_history_id, direction)
);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings_reviews(ratee_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater ON ratings_reviews(rater_id);
CREATE INDEX IF NOT EXISTS idx_ratings_history ON ratings_reviews(work_history_id);

-- =====================================================
-- TRIGGERS: auto-update updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_workers_updated ON worker_profiles;
CREATE TRIGGER trg_workers_updated BEFORE UPDATE ON worker_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_employers_updated ON employers;
CREATE TRIGGER trg_employers_updated BEFORE UPDATE ON employers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_jobs_updated ON job_postings;
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON job_postings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TRIGGER: auto-calculate EPF/ETF on work_history insert
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_epf_etf()
RETURNS TRIGGER AS $$
BEGIN
    NEW.gross_earnings := NEW.daily_wage * NEW.days_worked;
    NEW.epf_employee_contribution := ROUND(NEW.gross_earnings * 0.08);
    NEW.epf_employer_contribution := ROUND(NEW.gross_earnings * 0.12);
    NEW.etf_employer_contribution := ROUND(NEW.gross_earnings * 0.03);
    NEW.net_payment := NEW.gross_earnings - NEW.epf_employee_contribution;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_epf_etf ON work_history_ledger;
CREATE TRIGGER trg_calc_epf_etf BEFORE INSERT ON work_history_ledger
    FOR EACH ROW EXECUTE FUNCTION calculate_epf_etf();

-- =====================================================
-- TRIGGER: auto-update worker avg_rating after new rating
-- =====================================================
CREATE OR REPLACE FUNCTION update_ratee_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.direction = 'employer_to_worker' THEN
        UPDATE worker_profiles
        SET avg_rating = (
                SELECT AVG(overall_rating)::NUMERIC(3,2)
                FROM ratings_reviews
                WHERE ratee_id = NEW.ratee_id AND direction = 'employer_to_worker'
            ),
            total_ratings_received = total_ratings_received + 1
        WHERE id = NEW.ratee_id;
    ELSIF NEW.direction = 'worker_to_employer' THEN
        UPDATE employers
        SET avg_rating = (
                SELECT AVG(overall_rating)::NUMERIC(3,2)
                FROM ratings_reviews
                WHERE ratee_id = NEW.ratee_id AND direction = 'worker_to_employer'
            ),
            total_ratings_received = total_ratings_received + 1
        WHERE id = NEW.ratee_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_ratee ON ratings_reviews;
CREATE TRIGGER trg_update_ratee AFTER INSERT ON ratings_reviews
    FOR EACH ROW EXECUTE FUNCTION update_ratee_stats();

-- =====================================================
-- DONE
-- =====================================================