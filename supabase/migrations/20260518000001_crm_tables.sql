-- Normalized CRM tables (migrated from flat inquiries table)
-- Run BEFORE 20260518000002_report_rpc.sql

ALTER TABLE IF EXISTS trials RENAME TO trials_legacy;

CREATE TABLE coaches (
  coach_id   bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  coach_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE families (
  family_id         bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  family_name       text,
  family_date       timestamptz NOT NULL DEFAULT now(),
  country           text,
  state             text,
  enquiry_status    text NOT NULL DEFAULT 'Yet to Qualify',
  pipeline_status   text NOT NULL DEFAULT 'Inquiry',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  legacy_inquiry_id bigint UNIQUE
);

CREATE TABLE learners (
  learner_id           bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  family_id            bigint NOT NULL REFERENCES families(family_id),
  trial_status         text NOT NULL DEFAULT 'Yet to Arrange',
  is_qualified_learner boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  legacy_inquiry_id    bigint UNIQUE
);

CREATE TABLE trials (
  trial_id            bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  learner_id          bigint NOT NULL REFERENCES learners(learner_id),
  family_id           bigint NOT NULL REFERENCES families(family_id),
  trial_date          date,
  trial_arranged_date timestamptz NOT NULL DEFAULT now(),
  coach_id            bigint REFERENCES coaches(coach_id),
  trial_status        text NOT NULL DEFAULT 'Trial Arranged',
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Migrate inquiries → families
INSERT INTO families (family_date, country, state, enquiry_status, pipeline_status, legacy_inquiry_id)
SELECT
  i.inquiry_created_date,
  i.country,
  i.state,
  CASE i.qualification_status
    WHEN 'Qualified'     THEN 'Qualified'
    WHEN 'Not Qualified' THEN 'Disqualified'
    ELSE                      'Yet to Qualify'
  END,
  CASE i.qualification_status
    WHEN 'Qualified' THEN 'Lead'
    ELSE                  'Inquiry'
  END,
  i.inquiry_id
FROM inquiries i;

-- Migrate inquiries → learners
INSERT INTO learners (family_id, trial_status, is_qualified_learner, legacy_inquiry_id)
SELECT
  f.family_id,
  TRIM(i.trial_status),
  (i.qualification_status = 'Qualified'),
  i.inquiry_id
FROM inquiries i
JOIN families f ON f.legacy_inquiry_id = i.inquiry_id;

CREATE INDEX ON families (family_date);
CREATE INDEX ON families (country);
CREATE INDEX ON families (enquiry_status);
CREATE INDEX ON learners (family_id);
CREATE INDEX ON learners (is_qualified_learner);
CREATE INDEX ON trials (learner_id);
CREATE INDEX ON trials (family_id);
CREATE INDEX ON trials (trial_date);
CREATE INDEX ON trials (coach_id);

ALTER TABLE families ENABLE ROW LEVEL SECURITY;
ALTER TABLE learners ENABLE ROW LEVEL SECURITY;
ALTER TABLE trials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select" ON families FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON learners FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON trials   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON coaches  FOR SELECT TO anon USING (true);
