-- The standards a calculation's acceptance test is made to, as chosen (null: the default by the context). Not part of
-- the calculation's hash; the row stays immutable (trigger of 0_init).
ALTER TABLE "Calculation" ADD COLUMN     "collaudo" JSONB;
