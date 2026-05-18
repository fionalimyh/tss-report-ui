-- Report RPC functions — depends on tables created in 20260518000001_crm_tables.sql

CREATE OR REPLACE FUNCTION get_report_countries()
RETURNS TABLE (country text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT f.country
  FROM families f
  WHERE f.country IS NOT NULL
  ORDER BY f.country;
$$;

CREATE OR REPLACE FUNCTION get_report_states(p_country text)
RETURNS TABLE (state text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT f.state
  FROM families f
  WHERE f.country = p_country
    AND f.state IS NOT NULL
  ORDER BY f.state;
$$;

-- Returns coach_id + coach_name. Switches to coach_name label when coaches table is populated.
CREATE OR REPLACE FUNCTION get_report_coaches()
RETURNS TABLE (coach_id bigint, coach_name text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.coach_id, c.coach_name
  FROM coaches c
  ORDER BY c.coach_name;
$$;

CREATE OR REPLACE FUNCTION get_inq_to_lead_monthly(
  p_country    text,
  p_state      text,
  p_start_date timestamptz,
  p_end_date   timestamptz
)
RETURNS TABLE (
  month           text,
  total_families  bigint,
  qualified_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', f.family_date), 'YYYY-MM') AS month,
    COUNT(DISTINCT f.family_id)                             AS total_families,
    COUNT(DISTINCT f.family_id)
      FILTER (WHERE f.enquiry_status = 'Qualified')         AS qualified_count
  FROM families f
  WHERE f.country = p_country
    AND (p_state = 'all' OR f.state = p_state)
    AND f.family_date >= p_start_date
    AND f.family_date <  p_end_date
  GROUP BY DATE_TRUNC('month', f.family_date)
  ORDER BY DATE_TRUNC('month', f.family_date);
$$;

CREATE OR REPLACE FUNCTION get_lead_to_trial_monthly(
  p_country     text,
  p_state       text,
  p_start_date  timestamptz,
  p_end_date    timestamptz,
  p_coach_id    bigint  DEFAULT NULL,
  p_trial_start date    DEFAULT NULL,
  p_trial_end   date    DEFAULT NULL
)
RETURNS TABLE (
  month                text,
  qualified_learners   bigint,
  trial_arranged_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', f.family_date), 'YYYY-MM') AS month,
    COUNT(l.learner_id)
      FILTER (WHERE l.is_qualified_learner = true)           AS qualified_learners,
    COUNT(DISTINCT t.learner_id)
      FILTER (
        WHERE t.trial_id IS NOT NULL
          AND (p_coach_id    IS NULL OR t.coach_id    = p_coach_id)
          AND (p_trial_start IS NULL OR t.trial_date >= p_trial_start)
          AND (p_trial_end   IS NULL OR t.trial_date <= p_trial_end)
      )                                                      AS trial_arranged_count
  FROM families f
  JOIN learners l ON l.family_id = f.family_id
  LEFT JOIN trials t
    ON  t.learner_id   = l.learner_id
    AND t.trial_status = 'Trial Arranged'
  WHERE f.country = p_country
    AND (p_state = 'all' OR f.state = p_state)
    AND f.family_date >= p_start_date
    AND f.family_date <  p_end_date
  GROUP BY DATE_TRUNC('month', f.family_date)
  ORDER BY DATE_TRUNC('month', f.family_date);
$$;

CREATE OR REPLACE FUNCTION get_families_for_export(
  p_country    text,
  p_state      text,
  p_start_date timestamptz,
  p_end_date   timestamptz
)
RETURNS TABLE (
  family_id       bigint,
  family_date     timestamptz,
  country         text,
  state           text,
  enquiry_status  text,
  pipeline_status text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    f.family_id, f.family_date, f.country, f.state,
    f.enquiry_status, f.pipeline_status
  FROM families f
  WHERE f.country = p_country
    AND (p_state = 'all' OR f.state = p_state)
    AND f.family_date >= p_start_date
    AND f.family_date <  p_end_date
  ORDER BY f.family_date;
$$;
