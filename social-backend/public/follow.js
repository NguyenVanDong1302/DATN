const out = document.getElementById("out");
const apiStatus = document.getElementById("apiStatus");

const viewerSelect = document.getElementById("viewerSelect");
const profileSelect = document.getElementById("profileSelect");

const btnHealth = document.getElementById("btnHealth");
const btnWhoami = document.getElementById("btnWhoami");
const btnLoadProfile = document.getElementById("btnLoadProfile");
const btnFollow = document.getElementById("btnFollow");
const btnUnfollow = document.getElementById("btnUnfollow");
const btnRefreshTable = document.getElementById("btnRefreshTable");

const relPill = document.getElementById("relPill");

const usersTbody = document.getElementById("usersTbody");

const followersList = document.getElementById("followersList");
const followingList = document.getElementById("followingList");
const btnLoadFollowers = document.getElementById("btnLoadFollowers");
const btnMoreFollowers = document.getElementById("btnMoreFollowers");
const btnLoadFollowing = document.getElementById("btnLoadFollowing");
const btnMoreFollowing = document.getElementById("btnMoreFollowing");

// Fake users to test
const USERS = [
  "vandong010302",
  "thu_phuong411",
  "camtu_205",
  "instagram_user",
  "user_demo_01",
  "user_demo_02",
];

let followersCursor = null;
let followingCursor = null;

function setOut(obj) {
  out.textContent = JSON.stringify(obj, null, 2);
}

function getViewer() {
  return localStorage.getItem("viewer") || USERS[0];
}

function setViewer(v) {
  localStorage.setItem("viewer", v);
}

function getProfileTarget() {
  return localStorage.getItem("profileTarget") || USERS[1];
}

function setProfileTarget(v) {
  localStorage.setItem("profileTarget", v);
}

async function apiFetch(path, opts = {}) {
  const viewer = getViewer();
  const headers = {
    "content-type": "application/json",
    "x-username": viewer, // IMPORTANT
    ...(opts.headers || {}),
  };

  const res = await fetch(path, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const data = await res
    .json()
    .catch(() => ({ ok: false, message: "Invalid JSON response" }));
  return { status: res.status, data };
}

function setApiPill(ok, text) {
  apiStatus.innerHTML = `<span class="${ok ? "dotOk" : "dotNo"}"></span> ${text}`;
}

function setRelPill(rel) {
  const { isMe, isFollowing, isFollowedBy } = rel || {};
  const ok = !!rel;

  if (!ok) {
    relPill.innerHTML = `<span class="dotNo"></span> Relationship: —`;
    return;
  }

  let txt = isMe
    ? "Bạn đang xem chính bạn"
    : `isFollowing=${isFollowing} · isFollowedBy=${isFollowedBy}`;

  relPill.innerHTML = `<span class="${isFollowing ? "dotOk" : "dotNo"}"></span> Relationship: ${txt}`;
}

function fillSelect(sel, value) {
  sel.innerHTML = "";
  USERS.forEach((u) => {
    const op = document.createElement("option");
    op.value = u;
    op.textContent = u;
    if (u === value) op.selected = true;
    sel.appendChild(op);
  });
}

async function checkHealth() {
  const r = await fetch("/api/health");
  const j = await r.json().catch(() => null);
  setOut(j);
  setApiPill(!!j?.ok, j?.ok ? "API: OK" : "API: lỗi");
}

async function whoami() {
  const r = await apiFetch("/api/whoami");
  setOut(r);
}

async function loadProfile() {
  const u = getProfileTarget();
  const r = await apiFetch(`/api/users/${encodeURIComponent(u)}/profile`);
  setOut(r);

  // Update relationship pill
  const rel = r?.data?.data?.relationship
    ? { ...r.data.data.relationship, isMe: r.data.data.isMe }
    : null;

  setRelPill(rel);
}

async function loadRelationship(username) {
  const r = await apiFetch(
    `/api/users/${encodeURIComponent(username)}/relationship`,
  );
  return r;
}

async function follow(username) {
  const r = await apiFetch(
    `/api/users/${encodeURIComponent(username)}/follow`,
    { method: "POST" },
  );
  setOut(r);
  await refreshTableStates();
  if (username === getProfileTarget()) await loadProfile();
}

async function unfollow(username) {
  const r = await apiFetch(
    `/api/users/${encodeURIComponent(username)}/follow`,
    { method: "DELETE" },
  );
  setOut(r);
  await refreshTableStates();
  if (username === getProfileTarget()) await loadProfile();
}

function renderMiniList(container, items) {
  container.innerHTML = "";
  if (!items || !items.length) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = "Trống";
    container.appendChild(div);
    return;
  }

  items.forEach((it) => {
    const row = document.createElement("div");
    row.className = "miniItem";

    const left = document.createElement("div");
    left.className = "miniLeft";

    const name = document.createElement("div");
    name.className = "miniName";
    name.textContent = it.username || it.userId || "unknown";

    const sub = document.createElement("div");
    sub.className = "miniSub";
    sub.textContent = `userId: ${it.userId || "-"}`;

    left.appendChild(name);
    left.appendChild(sub);

    const btn = document.createElement("button");
    btn.className = "btn btnSmall";
    btn.textContent = "Xem profile";
    btn.onclick = () => {
      setProfileTarget(it.username);
      profileSelect.value = it.username;
      loadProfile();
    };

    row.appendChild(left);
    row.appendChild(btn);

    container.appendChild(row);
  });
}

async function fetchFollowers(reset = false) {
  const target = getProfileTarget();
  if (reset) followersCursor = null;

  const qs = new URLSearchParams();
  qs.set("limit", "10");
  if (followersCursor) qs.set("cursor", followersCursor);

  const r = await apiFetch(
    `/api/users/${encodeURIComponent(target)}/followers?${qs.toString()}`,
  );
  setOut(r);

  const items = r?.data?.data?.items || [];
  const next = r?.data?.data?.nextCursor || null;

  followersCursor = next;

  // append style: if reset => replace, else append
  if (reset) {
    renderMiniList(followersList, items);
  } else {
    // append
    const existing = Array.from(
      followersList.querySelectorAll(".miniItem"),
    ).length;
    if (existing === 0) renderMiniList(followersList, items);
    else {
      items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "miniItem";

        const left = document.createElement("div");
        left.className = "miniLeft";

        const name = document.createElement("div");
        name.className = "miniName";
        name.textContent = it.username || it.userId || "unknown";

        const sub = document.createElement("div");
        sub.className = "miniSub";
        sub.textContent = `userId: ${it.userId || "-"}`;

        left.appendChild(name);
        left.appendChild(sub);

        const btn = document.createElement("button");
        btn.className = "btn btnSmall";
        btn.textContent = "Xem profile";
        btn.onclick = () => {
          setProfileTarget(it.username);
          profileSelect.value = it.username;
          loadProfile();
        };

        row.appendChild(left);
        row.appendChild(btn);

        followersList.appendChild(row);
      });
    }
  }
}

async function fetchFollowing(reset = false) {
  const target = getProfileTarget();
  if (reset) followingCursor = null;

  const qs = new URLSearchParams();
  qs.set("limit", "10");
  if (followingCursor) qs.set("cursor", followingCursor);

  const r = await apiFetch(
    `/api/users/${encodeURIComponent(target)}/following?${qs.toString()}`,
  );
  setOut(r);

  const items = r?.data?.data?.items || [];
  const next = r?.data?.data?.nextCursor || null;

  followingCursor = next;

  if (reset) {
    renderMiniList(followingList, items);
  } else {
    const existing = Array.from(
      followingList.querySelectorAll(".miniItem"),
    ).length;
    if (existing === 0) renderMiniList(followingList, items);
    else {
      items.forEach((it) => {
        const row = document.createElement("div");
        row.className = "miniItem";

        const left = document.createElement("div");
        left.className = "miniLeft";

        const name = document.createElement("div");
        name.className = "miniName";
        name.textContent = it.username || it.userId || "unknown";

        const sub = document.createElement("div");
        sub.className = "miniSub";
        sub.textContent = `userId: ${it.userId || "-"}`;

        left.appendChild(name);
        left.appendChild(sub);

        const btn = document.createElement("button");
        btn.className = "btn btnSmall";
        btn.textContent = "Xem profile";
        btn.onclick = () => {
          setProfileTarget(it.username);
          profileSelect.value = it.username;
          loadProfile();
        };

        row.appendChild(left);
        row.appendChild(btn);

        followingList.appendChild(row);
      });
    }
  }
}

async function renderUsersTable() {
  usersTbody.innerHTML = "";

  const viewer = getViewer();
  const rows = USERS.filter((u) => u !== viewer);

  for (const u of rows) {
    const tr = document.createElement("tr");

    const tdUser = document.createElement("td");
    tdUser.innerHTML = `<b>${u}</b><div class="muted" style="font-size:12px;">/users/${u}</div>`;

    const tdRel = document.createElement("td");
    tdRel.innerHTML = `<span class="muted">Loading...</span>`;

    const tdAct = document.createElement("td");
    const btnRel = document.createElement("button");
    btnRel.className = "btn btnSmall";
    btnRel.textContent = "Check";

    const btnF = document.createElement("button");
    btnF.className = "btn btnSmall btnPrimary";
    btnF.textContent = "Follow";

    const btnU = document.createElement("button");
    btnU.className = "btn btnSmall btnDanger";
    btnU.textContent = "Unfollow";

    btnRel.onclick = async () => {
      const r = await loadRelationship(u);
      setOut(r);
      const rel = r?.data?.data;
      tdRel.innerHTML = rel
        ? `<span class="pill"><span class="${rel.isFollowing ? "dotOk" : "dotNo"}"></span> ${rel.isFollowing ? "Following" : "Not following"} ${rel.isFollowedBy ? "· Follows you" : ""}</span>`
        : `<span class="muted">Error</span>`;
    };

    btnF.onclick = () => follow(u);
    btnU.onclick = () => unfollow(u);

    tdAct.appendChild(btnRel);
    tdAct.appendChild(document.createTextNode(" "));
    tdAct.appendChild(btnF);
    tdAct.appendChild(document.createTextNode(" "));
    tdAct.appendChild(btnU);

    tr.appendChild(tdUser);
    tr.appendChild(tdRel);
    tr.appendChild(tdAct);
    usersTbody.appendChild(tr);
  }

  await refreshTableStates();
}

async function refreshTableStates() {
  const viewer = getViewer();
  const rows = USERS.filter((u) => u !== viewer);

  // For each row, call relationship and update second column
  const trs = Array.from(usersTbody.querySelectorAll("tr"));
  for (let i = 0; i < trs.length; i++) {
    const u = rows[i];
    const tr = trs[i];
    const tdRel = tr.children[1];

    const r = await loadRelationship(u);
    const rel = r?.data?.data;
    tdRel.innerHTML = rel
      ? `<span class="pill"><span class="${rel.isFollowing ? "dotOk" : "dotNo"}"></span> ${rel.isFollowing ? "Following" : "Not following"} ${rel.isFollowedBy ? "· Follows you" : ""}</span>`
      : `<span class="muted">Error</span>`;
  }
}

// ===== Wire up =====
btnHealth.onclick = checkHealth;
btnWhoami.onclick = whoami;

btnLoadProfile.onclick = async () => {
  followersCursor = null;
  followingCursor = null;
  followersList.innerHTML = "";
  followingList.innerHTML = "";
  await loadProfile();
};

btnFollow.onclick = () => follow(getProfileTarget());
btnUnfollow.onclick = () => unfollow(getProfileTarget());
btnRefreshTable.onclick = renderUsersTable;

btnLoadFollowers.onclick = () => fetchFollowers(true);
btnMoreFollowers.onclick = () => fetchFollowers(false);
btnLoadFollowing.onclick = () => fetchFollowing(true);
btnMoreFollowing.onclick = () => fetchFollowing(false);

viewerSelect.onchange = async (e) => {
  setViewer(e.target.value);
  await whoami();
  await renderUsersTable();
  await loadProfile();
};

profileSelect.onchange = async (e) => {
  setProfileTarget(e.target.value);
  followersCursor = null;
  followingCursor = null;
  followersList.innerHTML = "";
  followingList.innerHTML = "";
  await loadProfile();
};

async function init() {
  // init selects
  const v = getViewer();
  const p = getProfileTarget();

  fillSelect(viewerSelect, v);
  fillSelect(profileSelect, p);

  await checkHealth();
  await whoami();
  await renderUsersTable();
  await loadProfile();
}

init();
