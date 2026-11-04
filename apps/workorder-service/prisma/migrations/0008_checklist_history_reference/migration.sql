-- AddForeignKey
ALTER TABLE "work_order_checklist_history" ADD CONSTRAINT "work_order_checklist_history_tenant_id_work_order_id_fkey" FOREIGN KEY ("tenant_id", "work_order_id") REFERENCES "work_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE NO ACTION;

