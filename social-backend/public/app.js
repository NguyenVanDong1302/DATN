const out = document.getElementById("out");
const postsEl = document.getElementById("posts");
const notisEl = document.getElementById("notis");

const loginCard = document.getElementById("loginCard");
const appRoot = document.getElementById("appRoot");
const whoEl = document.getElementById("who");
const socketStatus = document.getElementById("socketStatus");

let socket = null;
let currentUsername = localStorage.getItem("username") || "";

function setOut(obj) {
  out.textContent = JSON.stringify(obj, null, 2);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    "X-Username": currentUsername,
  };

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function addNoti(n) {
  const div = document.createElement("div");
  div.className = "noti";
  const when = n.createdAt
    ? new Date(n.createdAt).toLocaleString()
    : new Date().toLocaleString();

  if (n.type === "like") {
    div.innerHTML = `❤️ <b>@${escapeHtml(n.fromUsername)}</b> đã thả tim bài của bạn • <span class="muted">${when}</span> • <span class="muted">postId: ${escapeHtml(n.postId)}</span>`;
  } else if (n.type === "comment") {
    div.innerHTML = `💬 <b>@${escapeHtml(n.fromUsername)}</b> đã comment bài của bạn: "${escapeHtml(n.contentPreview || "")}" • <span class="muted">${when}</span> • <span class="muted">postId: ${escapeHtml(n.postId)}</span>`;
  } else {
    div.textContent = JSON.stringify(n);
  }

  notisEl.prepend(div);
}

function computeUserId(username) {
  // phải giống server (sha256 -> 16 hex)
  // JS không có sha256 built-in sync, nên “hack” đơn giản: gửi username thôi,
  // server vẫn join notify theo userId, nên ta sẽ gọi /api/posts (server set req.user) để lấy sub.
  return null;
}

async function connectSocket(userId) {
  if (socket) socket.disconnect();

  socket = window.io({
    auth: {
      username: currentUsername,
      userId, // để server join room user:<authorId>
    },
  });

  socket.on("connect", () => (socketStatus.textContent = "socket: connected"));
  socket.on(
    "disconnect",
    () => (socketStatus.textContent = "socket: disconnected"),
  );

  // realtime noti cho chủ bài viết
  socket.on("notify", (payload) => {
    addNoti(payload);
  });

  // realtime like update cho ai đang xem post
  socket.on("post:like", async () => {
    await loadPosts(); // đơn giản: reload list
  });

  // realtime comment update cho ai đang mở comment box
  socket.on("post:comment", async (payload) => {
    const postId = payload.postId;
    const wrap = postsEl.querySelector(`[data-comments-wrap="${postId}"]`);
    if (wrap && wrap.style.display !== "none") {
      // append nhanh hoặc reload, ở đây reload cho chắc
      await loadComments(postId, wrap.parentElement);
      await loadPosts();
    } else {
      // nếu chưa mở comment UI, vẫn update count
      await loadPosts();
    }
  });
}

async function bootstrapUser() {
  // Gọi listPosts để backend tạo req.user => ta suy ra userId bằng cách gọi endpoint nhẹ (health không có user)
  // Trick: tạo endpoint riêng là chuẩn, nhưng để nhanh: call /api/posts?limit=1 và đọc lỗi/ok
  const r = await request("/api/posts?limit=1");
  // Nếu ok, backend chắc chắn đã có req.user, nhưng API không trả userId.
  // Vậy ta làm thêm 1 endpoint nhỏ /api/whoami (phần dưới mình sẽ thêm)
  setOut(r);
}

async function loadComments(postId, wrapEl) {
  const r = await request(`/api/posts/${postId}/comments?limit=50`);
  setOut(r);

  const listEl = wrapEl.querySelector(`[data-comments-list="${postId}"]`);
  if (!r.data?.ok) {
    listEl.innerHTML = `<div class="muted">Load comments lỗi.</div>`;
    return;
  }

  const items = r.data.data.items || [];
  if (items.length === 0) {
    listEl.innerHTML = `<div class="muted">Chưa có comment.</div>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (c) => `
      <div style="border-top:1px solid #eee; padding:8px 0;">
        <div class="muted"><b>@${escapeHtml(c.authorUsername)}</b> • ${new Date(c.createdAt).toLocaleString()}</div>
        <div style="white-space:pre-wrap;">${escapeHtml(c.content)}</div>
        <div class="row" style="margin-top:6px;">
          <button class="secondary" data-del-comment="${c._id}" data-post="${postId}">Xoá</button>
        </div>
      </div>
    `,
    )
    .join("");

  listEl.querySelectorAll("button[data-del-comment]").forEach((btn) => {
    btn.onclick = async () => {
      const commentId = btn.getAttribute("data-del-comment");
      const pid = btn.getAttribute("data-post");
      const rr = await request(`/api/posts/${pid}/comments/${commentId}`, {
        method: "DELETE",
      });
      setOut(rr);
      await loadComments(pid, wrapEl);
      await loadPosts();
    };
  });
}

function renderPosts(items) {
  postsEl.innerHTML = "";
  if (!items?.length) {
    postsEl.innerHTML = `<div class="muted">Chưa có bài viết nào.</div>`;
    return;
  }

  for (const p of items) {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <div class="muted">
        <b>@${escapeHtml(p.authorUsername)}</b> • ${new Date(p.createdAt).toLocaleString()} • <i>${escapeHtml(p.visibility)}</i>
      </div>

      <div style="margin:8px 0; white-space:pre-wrap;">${escapeHtml(p.content)}</div>

      <div class="row">
        <button data-like="${p._id}">
          ${p.likedByMe ? "💔 Bỏ tim" : "❤️ Thả tim"} (${p.likesCount || 0})
        </button>

        <button class="secondary" data-toggle-comments="${p._id}">
          💬 Comment (${p.commentsCount || 0})
        </button>

        <button class="secondary" data-edit="${p._id}">Sửa</button>
        <button data-del="${p._id}">Xoá</button>
      </div>

      <div data-comments-wrap="${p._id}" style="display:none; margin-top:10px;">
        <div class="row">
          <input data-comment-input="${p._id}" placeholder="Nhập comment..." style="min-width:260px; flex:1;" />
          <button class="secondary" data-comment-send="${p._id}">Gửi</button>
          <button class="secondary" data-comment-reload="${p._id}">Reload</button>
        </div>
        <div class="muted" style="margin-top:6px;">Danh sách comment:</div>
        <div data-comments-list="${p._id}"></div>
      </div>

      <div class="muted">id: ${p._id}</div>
    `;
    postsEl.appendChild(div);
  }

  postsEl.querySelectorAll("button[data-like]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-like");
      const r = await request(`/api/posts/${id}/like`, { method: "POST" });
      setOut(r);
      await loadPosts();
    };
  });

  postsEl.querySelectorAll("button[data-toggle-comments]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-toggle-comments");
      const wrap = postsEl.querySelector(`[data-comments-wrap="${id}"]`);
      const show = wrap.style.display === "none";
      wrap.style.display = show ? "block" : "none";

      if (show) {
        // join room realtime cho post này
        socket?.emit("joinPost", { postId: id });
        await loadComments(id, wrap.parentElement);
      } else {
        socket?.emit("leavePost", { postId: id });
      }
    };
  });

  postsEl.querySelectorAll("button[data-comment-send]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-comment-send");
      const input = postsEl.querySelector(`[data-comment-input="${id}"]`);
      const content = (input.value || "").trim();
      if (!content) return;

      const r = await request(`/api/posts/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });

      setOut(r);
      if (r.data?.ok) {
        input.value = "";
        const wrap = postsEl.querySelector(`[data-comments-wrap="${id}"]`);
        await loadComments(id, wrap.parentElement);
        await loadPosts();
      }
    };
  });

  postsEl.querySelectorAll("button[data-comment-reload]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-comment-reload");
      const wrap = postsEl.querySelector(`[data-comments-wrap="${id}"]`);
      await loadComments(id, wrap.parentElement);
    };
  });

  postsEl.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-del");
      const r = await request(`/api/posts/${id}`, { method: "DELETE" });
      setOut(r);
      await loadPosts();
    };
  });

  postsEl.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-edit");
      const newContent = prompt("Nội dung mới?");
      if (!newContent) return;
      const r = await request(`/api/posts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: newContent }),
      });
      setOut(r);
      await loadPosts();
    };
  });
}

async function loadPosts() {
  const r = await request("/api/posts?limit=20");
  setOut(r);
  if (r.data?.ok) renderPosts(r.data.data.items);
}

function showApp() {
  loginCard.classList.add("hide");
  appRoot.classList.remove("hide");
  whoEl.textContent = currentUsername;
}

function showLogin() {
  loginCard.classList.remove("hide");
  appRoot.classList.add("hide");
}

async function initAfterLogin() {
  showApp();

  // NEW: gọi whoami để lấy userId (mình sẽ thêm endpoint ở bước 7)
  const who = await request("/api/whoami");
  setOut(who);
  const userId = who.data?.ok ? who.data.data.userId : null;

  await connectSocket(userId);
  await loadPosts();
}

document.getElementById("btnEnter").onclick = async () => {
  const u = document.getElementById("username").value.trim();
  if (!u) return alert("Nhập username");
  currentUsername = u;
  localStorage.setItem("username", currentUsername);
  await initAfterLogin();
};

document.getElementById("btnLogout").onclick = () => {
  localStorage.removeItem("username");
  currentUsername = "";
  socket?.disconnect();
  socket = null;
  notisEl.innerHTML = "";
  postsEl.innerHTML = "";
  showLogin();
};

document.getElementById("btnHealth").onclick = async () => {
  const r = await request("/api/health");
  setOut(r);
};

document.getElementById("btnReload").onclick = loadPosts;

document.getElementById("btnCreate").onclick = async () => {
  const content = document.getElementById("content").value.trim();
  const visibility = document.getElementById("visibility").value;

  const r = await request("/api/posts", {
    method: "POST",
    body: JSON.stringify({ content, visibility }),
  });

  setOut(r);
  if (r.data?.ok) {
    document.getElementById("content").value = "";
    await loadPosts();
  }
};

// auto login if stored username exists
(async function () {
  if (currentUsername) {
    await initAfterLogin();
  } else {
    showLogin();
  }
})();
