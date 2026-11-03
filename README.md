# learningEL

Học từ vựng tiếng Anh từ chính những gì bạn đọc: dán đoạn văn → app lọc từ mới → tạo flashcard kèm câu gốc → ôn theo lặp lại ngắt quãng (SM-2).

## Chạy thử

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev      # mở http://localhost:3000
npm test         # chạy unit test (SM-2, lọc từ)
npm run typecheck
```

## Tính năng hiện có

- **Thêm từ**: dán đoạn văn → app **dịch từng câu** (song ngữ Anh–Việt, từ mới tô vàng ngay trong câu) → bên dưới là danh sách từ mới lọc theo trình độ A2–C2, có phiên âm, phát âm, từ loại, nghĩa tiếng Việt. Bấm vào bất kỳ từ nào trong câu để thêm/bỏ. Thẻ lưu kèm bản dịch câu gốc. Từ bỏ chọn được ghi nhớ là "đã biết".
- **Ôn tập**: lặp lại ngắt quãng SM-2, hiện câu gốc, phát âm, xem trước khoảng ôn của từng nút. Phím tắt: `Space` hiện đáp án, `1–4` chấm điểm.
- **Thẻ của tôi**: thống kê, tìm kiếm, sửa nghĩa, xoá, tra bù nghĩa cho thẻ thiếu, quản lý từ đã biết, sao lưu/nhập file JSON.

## Tra nghĩa hoạt động thế nào

Trình duyệt gọi `POST /api/lookup` (file `src/app/api/lookup/route.ts`, chạy phía server):

| Thông tin | Nguồn | Cần key? |
|---|---|---|
| Phiên âm, file phát âm, định nghĩa tiếng Anh | Free Dictionary API | Không |
| Nghĩa tiếng Việt theo ngữ cảnh câu | Claude API (`src/lib/lookup/ai.ts`) | `ANTHROPIC_API_KEY` |
| Nghĩa tiếng Việt từng từ (dự phòng) | MyMemory | Không |
| Dịch cả câu | Claude qua `/api/translate` nếu có key; không thì trình duyệt gọi thẳng MyMemory (`src/lib/lookup/translate-client.ts`) | Không |

Không có key vẫn dùng được, chỉ là nghĩa không theo ngữ cảnh (ví dụ *bank* luôn ra "ngân hàng"). Muốn bật AI: copy `.env.example` thành `.env.local`, điền key, rồi **khởi động lại** `npm run dev`. Kết quả được cache ở server và trong trình duyệt nên mỗi từ chỉ tra một lần.

## Cấu trúc

```
src/
  app/
    page.tsx              Thêm từ
    review/page.tsx       Ôn tập
    cards/page.tsx        Thẻ của tôi
    api/lookup/route.ts   API tra nghĩa từ (server)
    api/translate/route.ts API dịch câu bằng AI (server, chỉ khi có key)
  components/             Nav, Highlight, SpeakButton, SentenceView (câu song ngữ bấm được từng từ)
  lib/
    types.ts
    format.ts             Hiển thị khoảng thời gian
    speech.ts             Phát âm (audio từ điển hoặc giọng trình duyệt)
    srs/sm2.ts            Thuật toán SM-2 + test
    nlp/
      tokenize.ts, lemmatize.ts, extract.ts (+ test)
      data/frequency.json   15.000 từ phổ biến nhất (FrequencyWords, OpenSubtitles 2018)
      data/common-words.ts  Tra rank, ngưỡng theo trình độ
    lookup/
      dictionary.ts       Free Dictionary + MyMemory (server)
      ai.ts               Claude dịch theo ngữ cảnh (server)
      client.ts           Gọi /api/lookup theo lô, cache localStorage
    storage/local.ts      Lưu dữ liệu bằng localStorage
    supabase/client.ts    Bản 2 (chưa dùng)
supabase/migrations/0001_init.sql   Schema DB cho bản 2
```

## Việc tiếp theo (gợi ý theo thứ tự)

**Bản 1 — hoàn thiện lõi**
- [x] Danh sách tần suất 15.000 từ, chọn trình độ.
- [x] Tra phiên âm, phát âm, nghĩa; sửa nghĩa trước khi lưu.
- [x] Trang danh sách thẻ, sao lưu.
- [ ] Thay lemmatizer tự viết bằng `wink-lemmatizer` (xem các ca sai trong `extract.test.ts`).
- [ ] Nhận diện cụm động từ (give up, look into).
- [ ] Bài test trình độ đầu vào thay cho chọn tay.

**Bản 2 — tài khoản và AI**
- [ ] Tạo project Supabase, chạy `supabase/migrations/0001_init.sql`, điền `.env.local` theo `.env.example`.
- [ ] Viết `storage/supabase.ts` cùng các hàm như `storage/local.ts`, ghi thêm `review_logs` mỗi lần ôn.
- [ ] Đăng nhập (Supabase Auth: email hoặc Google).
- [ ] Chuyển cache tra nghĩa từ bộ nhớ server sang bảng trong database.

**Bản 3 — mở rộng**
- [ ] PWA cài lên điện thoại, nhắc ôn hằng ngày.
- [ ] Tiện ích trình duyệt: bôi đen từ trên web để lưu.
- [ ] Nhập phụ đề phim (.srt).
- [ ] Chuyển từ SM-2 sang FSRS (`ts-fsrs`), so sánh tỉ lệ nhớ bằng dữ liệu `review_logs`.
