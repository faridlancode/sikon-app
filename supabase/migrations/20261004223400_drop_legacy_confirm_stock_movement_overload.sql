-- Remove the one-argument overload; the three-argument function supports
-- p_taken_by and p_recorded_by defaults, but PostgREST cannot resolve both.
drop function if exists public.confirm_stock_movement(uuid);
