# Đối Chiếu Mã KH (Customer Code Comparison)

Ứng dụng web hiện đại giúp so sánh và đối chiếu hai danh sách mã (ví dụ: Danh sách tồn kho hệ thống vs Thực tế kiểm kê) một cách nhanh chóng, chính xác ngay trên trình duyệt.

## 🚀 Tính Năng Nổi Bật

- **Đa Dạng Đầu Vào:**
  - 📋 **Dán trực tiếp:** Copy danh sách từ Excel, Text file và dán vào ô nhập liệu.
  - 📁 **Nạp file Excel:** Hỗ trợ kéo thả hoặc chọn file `.xlsx`, `.xls`, `.csv`. 
  - 🤖 **Tự động nhận diện:** Thuật toán thông minh tự động tìm cột chứa "Mã KH" (dạng `X012345`) trong file Excel nhiều sheet.
  - 🏦 **Hỗ trơ Ngân hàng:** Tự động nhận diện và xử lý định dạng sao kê của: **VietinBank, Vietcombank, BIDV, Agribank, LPBank, Sacombank**.
    - *Ưu tiên lấy cột "Họ tên" làm Diễn giải và "Tổng tiền HĐ" làm Số tiền.*
- **So Sánh Tức Thì:** Xử lý hàng nghìn dòng dữ liệu chỉ trong tích tắc.
- **Phân Tích Chi Tiết:**
  - ✅ **Trùng khớp:** Các mã tồn tại ở cả hai danh sách.
  - ⚠️ **Thiếu (Missing):** Có trong danh sách Gốc nhưng thiếu ở Thực tế.
  - 🚫 **Thừa/Lạ (Extra):** Có trong Thực tế nhưng không có trong danh sách Gốc.
- **Tiện Ích:**
  - Sao chép nhanh danh sách kết quả (Thiếu/Thừa) để làm báo cáo.
  - Giao diện Tiếng Việt thân thiện, dễ sử dụng.
  - Chế độ tối (Dark Mode) - *Sắp ra mắt*.

## 🛠 Công Nghệ Sử Dụng

Dự án được xây dựng với các công nghệ web mới nhất đảm bảo hiệu năng và trải nghiệm người dùng:

- **Core:** [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool:** [Vite](https://vitejs.dev/) - Siêu tốc.
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) - Giao diện đẹp, responsive.
- **Excel Processing:** [SheetJS (xlsx)](https://sheetjs.com/) - Xử lý file Excel ngay tại client.
- **Icons:** [Lucide React](https://lucide.dev/)

## 📦 Yêu Cầu & Cài Đặt

### Yêu cầu
- [Node.js](https://nodejs.org/) (Phiên bản 18+ khuyến nghị).

### Cài đặt
1. **Clone dự án (hoặc tải về):**
   ```bash
   git clone https://github.com/trantan170705-lab/doichieumakh.git
   cd doichieumakh
   ```

2. **Cài đặt thư viện:**
   ```bash
   npm install
   ```

3. **Chạy thử nghiệm (Development):**
   ```bash
   npm run dev
   ```
   Ứng dụng sẽ chạy tại `http://localhost:5173`.

## 📖 Hướng Dẫn Sử Dụng

1. **Chuẩn bị dữ liệu:** Bạn cần 2 danh sách:
   - **Danh sách Gốc (Cột A):** Ví dụ dữ liệu từ phần mềm kế toán.
   - **Danh sách Thực tế (Cột B):** Ví dụ dữ liệu quét barcode hoặc kiểm kê tay.
2. **Nhập liệu:**
   - Cách 1: Copy cột mã từ file Excel của bạn và dán vào 2 ô tương ứng trên web.
   - Cách 2: Bấm nút "Nạp từ Excel" để chọn file. Ứng dụng sẽ tự động tách mã từ các Sheet.
3. **So Sánh:** Bấm nút **"So Sánh Ngay"**.
4. **Xem & Báo cáo:**
   - Xem biểu đồ tổng quan số lượng khớp/lệch.
   - Bấm nút **"Xuất Báo Cáo Tổng Thể"** để tải file Excel chứa đầy đủ thông tin (Tổng hợp, Chi tiết khớp, Thiếu, Thừa).
   - Kéo xuống dưới để xem chi tiết từng mã.
   - Bấm "Sao chép" ở các ô "Thiếu trong..." hoặc "Mã lạ..." để dán vào báo cáo, email.

## 🚢 Build & Triển Khai

Để đóng gói ứng dụng thành file tĩnh (để up lên host hoặc chạy offline):

```bash
npm run build
```
Thư mục `dist/` sẽ được tạo ra chứa toàn bộ code web đã được tối ưu.

---
*Dự án nội bộ hỗ trợ nghiệp vụ kiểm kê kho.*
