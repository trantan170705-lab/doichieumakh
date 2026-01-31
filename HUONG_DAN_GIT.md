# Hướng Dẫn Đẩy Code Lên GitHub

Đây là hướng dẫn chi tiết để bạn đưa dự án **Đối Chiếu Mã KH** lên GitHub.

## Chuẩn Bị

1.  Đảm bảo bạn đã cài đặt [Git](https://git-scm.com/downloads).
2.  Đã có tài khoản GitHub và đã đăng nhập.

## 🚀 Lần Đầu Tiên (Khởi tạo Repository)

Mở **Terminal** (hoặc CMD/PowerShell) tại thư mục dự án `doichieuexcel` và thực hiện lần lượt:

### 1. Khởi tạo kho chứa
Nếu đây là lần đầu tiên bạn tạo git cho dự án này:

```bash
git init
```

### 2. Thêm file và Lưu
```bash
git add .
git commit -m "Khoi tao du an Doi Chieu Ma KH"
```

### 3. Đổi tên nhánh và Kết nối
```bash
git branch -M main
git remote add origin https://github.com/trantan170705-lab/doichieumakh.git
```
*> Nếu báo lỗi "already exists", bỏ qua bước này.*

### 4. Đẩy code lên
```bash
git push -u origin main
```

---

## 🔄 Cập Nhật Code (Khi có sửa đổi)

Mỗi khi bạn sửa code, thêm tính năng hoặc fix bug, hãy chạy 3 lệnh sau để cập nhật lên GitHub:

### 1. Thêm thay đổi
```bash
git add .
```

### 2. Lưu trạng thái (Commit)
Ghi chú những gì bạn vừa sửa.
```bash
git commit -m "Mô tả ngắn gọn code vừa sửa"
```
*Ví dụ: `git commit -m "Them chuc nang upload excel"`*

### 3. Đẩy lên GitHub
```bash
git push
```
*(Lần sau chỉ cần `git push` là đủ, không cần `-u origin main` nữa)*

---

## ❓ Xử Lý Lỗi Thường Gặp

### Lỗi: `remote origin already exists`
Nghĩa là dự án đã có kết nối cũ. Sửa bằng cách:
```bash
git remote set-url origin https://github.com/trantan170705-lab/doichieumakh.git
```

### Lỗi: `Updates were rejected...`
Do trên GitHub có file mà máy bạn không có (thường do tạo README trên web trước).
**Cách xử lý:**
```bash
git pull origin main --allow-unrelated-histories
```
Hoặc nếu chắc chắn muốn ghi đè lên GitHub:
```bash
git push -f origin main
```
