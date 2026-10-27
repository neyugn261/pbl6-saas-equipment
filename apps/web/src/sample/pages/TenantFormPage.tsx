import { Button, Field, PageHeader, Section } from '../components/ui'

export function TenantFormPage() {
  return <div className="page page--narrow"><PageHeader eyebrow="Nền tảng" title="Tạo doanh nghiệp" description="Khởi tạo tenant và tài khoản quản trị đầu tiên." /><Section title="Thông tin doanh nghiệp"><div className="form-grid"><Field label="Tên doanh nghiệp" required><input /></Field><Field label="Mã tenant" required hint="Mã duy nhất, không thể đổi sau khi tạo."><input placeholder="TNT-XXX" /></Field><Field label="Tên Tenant Admin" required><input /></Field><Field label="Email quản trị" required><input type="email" /></Field><Field label="Số điện thoại"><input type="tel" /></Field><div className="form-actions"><Button variant="secondary" type="button">Hủy</Button><Button type="button">Tạo doanh nghiệp</Button></div></div></Section></div>
}
