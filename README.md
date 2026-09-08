# 🛠️ PBL6 - SaaS Equipment Management

Nền tảng SaaS quản lý vòng đời thiết bị, bảo trì và điều phối kỹ thuật viên hiện trường dành cho đa doanh nghiệp (Multi-tenant Architecture). Đồ án chuyên ngành Công nghệ phần mềm (PBL6).

## 🚀 Công nghệ sử dụng

* **Frontend Web:** ReactJS (Vite) + TailwindCSS
* **Backend API:** Node.js + Express / NestJS
* **Mobile App:** Flutter
* **Database:** PostgreSQL

## 📂 Cấu trúc thư mục (Monorepo)

Dự án sử dụng kiến trúc Monorepo, gồm 3 phân hệ chính hoạt động độc lập:

```text
pbl6-saas-equipment/
├── backend/       # Chứa mã nguồn Node.js (RESTful API)
├── frontend/      # Chứa mã nguồn ReactJS (Web Admin & Web End-user)
└── mobile/        # Chứa mã nguồn Flutter (App dành cho Kỹ thuật viên)