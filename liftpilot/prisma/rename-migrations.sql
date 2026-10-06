-- The migrations 0_ to 9_ were renamed 00_ to 09_ (2026-10-06): Prisma applies them in the order of their names as text,
-- and on an empty database 10_, 11_ and 12_ came before 2_ (11_drawing_set_pdf needs the table of 2_drawing_sets).
-- A database that applied them under the old names gets the new ones here, before `prisma migrate deploy`; the files
-- did not change, so their checksums match. Runs at every start and changes nothing a second time.
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    UPDATE "_prisma_migrations" SET "migration_name" = '0' || "migration_name"
    WHERE "migration_name" IN ('0_init', '1_shaft_design', '2_drawing_sets', '3_lift_designs', '4_self_service', '5_client_logo',
      '6_project_kind', '7_calculation_collaudo', '8_roles_subscription_prices', '9_room_designs_free_prices');
  END IF;
END $$;
