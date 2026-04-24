# REPORT_UPGRADE_EXISTING_FEATURES

## 1. Khao sat hien trang

### Tinh nang da co san
- Auth dang ky/dang nhap local + Firebase login scaffold.
- User/Profile/Follow.
- Feed/Post/Comment.
- Story.
- Reels (dua tren post media).
- Messages/Conversation realtime.
- Notifications.
- Calls realtime.
- Admin/Moderation.

### Diem manh
- Tach frontend/backend ro rang.
- Mongoose models kha day du.
- Da co realtime, moderation va admin dashboard thuc te.
- Frontend da co provider/context cho auth, socket, notifications, calls.

### Diem yeu / technical debt / code smell
- Auth dang pha tron 2 co che: JWT that su va `x-username` legacy.
- `post.controller.js` va `admin.controller.js` qua lon, business logic bi day vao controller.
- Messages truoc khi sua lay `createdAt asc + limit`, co the tra ve 50 tin cu nhat thay vi 50 tin moi nhat.
- Flow upload/delete cua story/comment/post chua cleanup file day du.
- Notification message co cho khong dong bo khi clear history.
- Co duplicate/unused flow nhu `feed.routes.js`, `follow.controller.js`, mot vai file feature rong.

## 2. Nhung gi da nang cap

### Auth va bao mat
- Them shared JWT utility de sign/verify token nhat quan.
- Them phan biet token het han (`TOKEN_EXPIRED`) thay vi nuot loi chung chung.
- Them auth rate limit cho `/api/auth/login` va `/api/auth/register`.
- `sessionUser` duoc cung co:
  - Neu co Bearer JWT hop le thi uu tien xac thuc bang token.
  - Neu token het han/khong hop le va la JWT that su thi tra loi 401 dung nghia.
  - Neu la token legacy khong phai JWT (vd flow Firebase cu) thi van fallback de giu compatibility.
  - Phat hien mismatch giua token va `x-username`.
- Chuyen salt rounds sang env config dung chung.
- Frontend tu clear session local khi gap `TOKEN_EXPIRED` hoac `SESSION_MISMATCH`.
- `AuthProvider` khong con coi moi token local deu la backend session; token JWT va token Firebase duoc xu ly an toan hon.

### Feed / Post / Comment
- Bo sung cleanup file media comment khi:
  - tao comment loi,
  - xoa comment,
  - xoa post.
- Them DB indexes an toan cho post list/feed query.

### Story
- Story video duoc validate them theo gioi han thoi luong.
- Story upload duoc cleanup file/thumbnail neu create bi loi.
- Story like/unlike dong bo notification tot hon.
- Them index cho query active/archive stories.

### Messages / Notifications / Realtime
- Sua bug phan trang tin nhan:
  - backend tra ve 50 tin moi nhat theo thu tu dung,
  - them cursor `beforeMessageId`,
  - tra them `pageInfo`.
- Frontend MessagesPage:
  - ho tro `Xem tin nhan cu hon`,
  - giu vi tri scroll khi prepend message cu,
  - refresh thread an toan hon khi reconnect socket.
- Khong tao notification message khi nguoi nhan dang o dung conversation va message da `seen`.
- Sua clear history de xoa dung message notifications lien quan.
- Emit `message:seen` nhat quan hon cho peer de cap nhat UI/read state.

### Production quality / defensive coding
- `errorHandler` xu ly them Multer errors thay vi roi vao 500 chung.
- Bo sung env docs:
  - `JWT_EXPIRES_IN`
  - `BCRYPT_SALT_ROUNDS`
  - `AUTH_RATE_LIMIT_WINDOW_MS`
  - `AUTH_RATE_LIMIT_MAX`
  - `STORY_VIDEO_MAX_DURATION_SECONDS`
- Loai bo warning duplicate index trong `Conversation`.

## 3. File da sua

### Backend
- `social-backend/.env.example`
- `social-backend/src/controllers/auth.controller.js`
- `social-backend/src/controllers/message.controller.js`
- `social-backend/src/controllers/post.controller.js`
- `social-backend/src/controllers/story.controller.js`
- `social-backend/src/controllers/user.controller.js`
- `social-backend/src/middlewares/auth.js`
- `social-backend/src/middlewares/authRateLimit.js`
- `social-backend/src/middlewares/errorHandler.js`
- `social-backend/src/middlewares/sessionUser.js`
- `social-backend/src/models/Conversation.js`
- `social-backend/src/models/Post.js`
- `social-backend/src/models/Story.js`
- `social-backend/src/realtime/socket.js`
- `social-backend/src/routes/auth.routes.js`
- `social-backend/src/services/message.service.js`
- `social-backend/src/utils/authToken.js`
- `social-backend/src/utils/passwords.js`

### Frontend
- `social-frontend/src/features/auth/AuthProvider.tsx`
- `social-frontend/src/features/auth/ProtectedRoute.tsx`
- `social-frontend/src/features/messages/messages.api.ts`
- `social-frontend/src/features/messages/messages.types.ts`
- `social-frontend/src/pages/Messages/Messages.scss`
- `social-frontend/src/pages/Messages/MessagesPage.tsx`

## 4. Bug / diem yeu da xu ly

- Session local co the tiep tuc song du token JWT het han.
  - Root cause: backend/session middleware fallback qua de dang, frontend khong clear state khi token expired.
- Messages co nguy co hien sai tap tin nhan gan nhat.
  - Root cause: query `sort asc + limit`.
- Clear history chat khong xoa dung notifications.
  - Root cause: query xoa notification dung field `conversationId` khong ton tai trong model.
- Story/comment upload co the de lai file rac khi loi.
  - Root cause: thieu cleanup trong catch/xoa.
- Story like notification chua dong bo khi unlike.
  - Root cause: chi tao notification, khong remove actor.
- Warning duplicate index trong Conversation schema.
  - Root cause: khai bao index ca o field va `schema.index`.

## 5. Nhung cho chua xu ly va ly do

- Chua tach nho `post.controller.js` va `admin.controller.js`.
  - Ly do: file rat lon, can refactor co kiem soat theo use-case de tranh regression rong.
- Chua chuyen hoan toan kho session legacy `x-username`.
  - Ly do: codebase hien tai va flow Firebase cu van phu thuoc vao backward compatibility nay.
- Chua lam soft delete post/comment.
  - Ly do: can cap nhat dong bo model, query, admin views, notifications va frontend.
- Chua viet lai socket/messages architecture.
  - Ly do: uu tien patch bug va o dinh behavior hien co.
- Chua xu ly type errors co san ngoai pham vi thay doi:
  - `social-frontend/src/pages/PostPage.tsx`
  - `social-frontend/src/pages/Reel/Reel.tsx`

## 6. TODO de xu ly tiep

- Tach `post.controller.js` thanh service/use-case nho hon.
- Tach `admin.controller.js` theo nhom: accounts, posts, reports, moderation.
- Chuyen dan cac route `sessionUser` sang auth bang JWT/real user identity day du.
- Can nhac them centralized Zod validation middleware de giam lap lai.
- Them pagination cho comments va co the cho notifications.
- Can nhac code-splitting cho frontend bundle (hien build warning chunk lon).
- Don dep dead code/file rong:
  - `social-frontend/src/features/users/users.types.ts`
  - `social-frontend/src/features/posts/hooks/usePosts.ts`
  - route/controller duplicate khong mount.

## 7. Validation da chay

- Frontend build: `npm run build` - PASS
- Backend syntax/import smoke check bang Node require - PASS
- Frontend typecheck: `npx tsc --noEmit` - FAIL do loi co san ngoai scope thay doi
  - `src/pages/PostPage.tsx(108,35): Parameter 'item' implicitly has an 'any' type.`
  - `src/pages/Reel/Reel.tsx(140,64): Property 'length' does not exist on type '{}'.`
