-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "model_warranty_revisions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "model_warranty_revisions" ADD CONSTRAINT "model_warranty_revisions_tenant_id_model_id_fkey" FOREIGN KEY ("tenant_id", "model_id") REFERENCES "equipment_models"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

