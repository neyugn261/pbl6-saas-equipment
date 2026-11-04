-- AddForeignKey
ALTER TABLE "warranty_assessment_history" ADD CONSTRAINT "warranty_assessment_history_tenant_id_request_id_fkey" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "service_requests"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

