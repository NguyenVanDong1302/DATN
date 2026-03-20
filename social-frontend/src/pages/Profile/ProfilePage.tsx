import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./ProfilePage.module.css";

type Profile = {
  username: string;
  fullName: string;
  avatar?: string;
  postsCount: number;
  followersCount: number;
  followingCount: number;
};

const footerLinks = [
  "Meta",
  "Giới thiệu",
  "Blog",
  "Việc làm",
  "Trợ giúp",
  "API",
  "Quyền riêng tư",
  "Điều khoản",
  "Vị trí",
  "Meta AI",
  "Threads",
  "Tải thông tin người liên hệ lên & người không phải người dùng",
  "Meta đã xác minh",
];

function IconGrid({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function IconBookmark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 3h12a1 1 0 0 1 1 1v18l-7-4-7 4V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function IconTag({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 10.5V4a1 1 0 0 0-1-1h-6.5a2 2 0 0 0-1.4.6L3.6 12.1a2 2 0 0 0 0 2.8l5.5 5.5a2 2 0 0 0 2.8 0l8.5-8.5a2 2 0 0 0 .6-1.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M16.5 7.5h.01" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function IconGear({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15.1c.03-.2.05-.41.05-.62s-.02-.42-.05-.62l2-1.55a.7.7 0 0 0 .17-.9l-1.9-3.29a.7.7 0 0 0-.85-.31l-2.35.95c-.33-.26-.7-.48-1.1-.66l-.35-2.5A.7.7 0 0 0 14.33 3h-3.8a.7.7 0 0 0-.69.59l-.35 2.5c-.4.18-.77.4-1.1.66l-2.35-.95a.7.7 0 0 0-.85.31L3.29 9.4a.7.7 0 0 0 .17.9l2 1.55c-.03.2-.05.41-.05.62s.02.42.05.62l-2 1.55a.7.7 0 0 0-.17.9l1.9 3.29c.18.3.54.42.85.31l2.35-.95c.33.26.7.48 1.1.66l.35 2.5c.05.34.34.59.69.59h3.8c.35 0 .64-.25.69-.59l.35-2.5c.4-.18.77-.4 1.1-.66l2.35.95c.31.12.67-.01.85-.31l1.9-3.29a.7.7 0 0 0-.17-.9l-2-1.55Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconCamera({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7l1.2-2h5.6L16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3Z"
        stroke="white"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="white" strokeWidth="1.7" />
    </svg>
  );
}

export default function ProfilePage() {
  const { username = "vandong010302" } = useParams();
  const nav = useNavigate();

  const profile: Profile = useMemo(
    () => ({
      username,
      fullName: "Nguyễn Văn Đông",
      avatar: "https://i.pinimg.com/736x/90/b6/2a/90b62a4576503b2e5187d0c086edea72.jpg",
      postsCount: 2,
      followersCount: 3,
      followingCount: 42,
    }),
    [username]
  );

  const posts = useMemo(
    () => [
      "https://i.pinimg.com/1200x/00/ab/08/00ab08071c7a8191a96c0368f30fa2b8.jpg",
      "https://i.pinimg.com/1200x/12/56/b7/1256b764fec701280143f031379daded.jpg",
      "https://i.pinimg.com/1200x/55/f0/41/55f04186274997259bf4788f9cf4bfb6.jpg",
    ],
    []
  );

  const [activeTab, setActiveTab] = useState<"posts" | "saved" | "tagged">("posts");

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.header}>
          <div className={styles.avatarWrap}>
            <div className={styles.avatar}>
              {profile.avatar ? <img className={styles.avatarImg} src={profile.avatar} alt={profile.username} /> : null}

              <button
                className={styles.cameraBtn}
                type="button"
                title="Đổi ảnh đại diện"
                onClick={() => {
                  // UI only for now
                }}
              >
                <span className={styles.cameraPill}>Ghi chú...</span>
                <IconCamera />
              </button>
            </div>
          </div>

          <div className={styles.meta}>
            <div className={styles.topRow}>
              <div className={styles.username}>{profile.username}</div>
              <button className={styles.gear} type="button" title="Cài đặt" onClick={() => nav("/settings")}>
                <IconGear size={16} />
              </button>
            </div>

            <div className={styles.name}>{profile.fullName}</div>

            <div className={styles.stats}>
              <div className={styles.stat}>
                <b>{profile.postsCount}</b> bài viết
              </div>
              <div className={styles.stat}>
                <b>{profile.followersCount}</b> người theo dõi
              </div>
              <div className={styles.stat}>
                Đang theo dõi <b>{profile.followingCount}</b> người dùng
              </div>
            </div>

            <div className={styles.handle}>
              <span aria-hidden>©</span>
              <span>{profile.username}</span>
            </div>

            <div className={styles.buttons}>
              <button className={styles.btn} type="button">
                Chỉnh sửa trang cá nhân
              </button>
              <button className={styles.btn} type="button">
                Xem kho lưu trữ
              </button>
            </div>
          </div>
        </section>

        <section className={styles.highlights}>
          <div className={styles.highlightItem}>
            <div className={styles.highlightCircle}>
              <div className={styles.plus}>+</div>
            </div>
            <div className={styles.highlightLabel}>Mới</div>
          </div>
        </section>

        <section className={styles.tabs}>
          <div
            className={`${styles.tab} ${activeTab === "posts" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("posts")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setActiveTab("posts")}
          >
            <IconGrid />
          </div>

          <div
            className={`${styles.tab} ${activeTab === "saved" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("saved")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setActiveTab("saved")}
          >
            <IconBookmark />
          </div>

          <div
            className={`${styles.tab} ${activeTab === "tagged" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("tagged")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setActiveTab("tagged")}
          >
            <IconTag />
          </div>
        </section>

        <section className={styles.grid}>
          {(activeTab === "posts" ? posts : posts.slice(0, 6)).map((src, idx) => (
            <div key={`${activeTab}-${idx}`} className={styles.tile}>
              <img src={src} alt={`post-${idx + 1}`} loading="lazy" />
            </div>
          ))}
        </section>

        <footer className={styles.footer}>
          <div className={styles.footerLinks}>
            {footerLinks.map((t) => (
              <a key={t} href="#" onClick={(e) => e.preventDefault()}>
                {t}
              </a>
            ))}
          </div>
          <div>
            {/* Tiếng Việt <span aria-hidden>▼</span> &nbsp; © 2026 Instagram from Meta */}
          </div>
        </footer>
      </div>
    </div>
  );
}