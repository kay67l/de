-- ============================================================
-- Run this in Supabase SQL Editor (project: velauvjxueqgoxnuglfg)
-- Purpose: align past_executives.category with the split
--          ligec / edicom categories (was: lit)
-- ====================================================

-- 1. Find and drop the existing CHECK constraint on category
--    (replace the constraint name if yours differs)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'past_executives'::regclass
    AND contype = 'c'
    AND conkey = (SELECT attnum FROM pg_attribute WHERE attrelid = 'past_executives'::regclass AND attname = 'category');

  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE past_executives DROP CONSTRAINT ' || con_name;
    RAISE NOTICE 'Dropped old CHECK constraint: %', con_name;
  ELSE
    RAISE NOTICE 'No CHECK constraint found on past_executives.category — skipping drop.';
  END IF;
END $$;

-- 2. Add the new CHECK constraint matching the executives table
ALTER TABLE past_executives
  ADD CONSTRAINT past_executives_category_check
  CHECK (category IN ('rec', 'zec', 'ligec', 'wds', 'edicom', 'sec', 'adhoc'));

-- 3. Migrate existing rows that still have category = 'lit'
--    - editorial / edicom subgroup → edicom
--    - everything else → ligec
UPDATE past_executives
SET category = CASE
  WHEN subgroup ILIKE '%editorial%' OR subgroup ILIKE '%edicom%' THEN 'edicom'
  ELSE 'ligec'
END
WHERE category = 'lit';

-- Verify
SELECT category, COUNT(*) AS count
FROM past_executives
GROUP BY category
ORDER BY count DESC;
