-- AddForeignKey
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_tenant_id_setup_group_id_fkey" FOREIGN KEY ("tenant_id", "setup_group_id") REFERENCES "maintenance_setup_groups"("tenant_id", "registration_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

