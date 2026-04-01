import { useEffect, useMemo, useRef, useState } from "react";
import "./Reel.scss";
import ReelComments, { type ReelComment } from "./comments/ReelComments";
import { useApi, resolveMediaUrl } from "../../lib/api";
import type { Post, PostComment } from "../../types";
import { useAppStore } from "../../state/store";

type Reel = {
  id: string;
  postId: string;
  src: string;
  poster?: string;
  username: string;
  handle?: string;
  caption: string;
  likes: number;
  comments: number;
  avatarUrl: string;
  commentsList: ReelComment[];
  likedByMe: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function avatarOf(username: string) {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(username || "reel")}`;
}

function mapComment(item: PostComment): ReelComment {
  return {
    id: item._id,
    user: item.authorUsername || "user",
    avatarUrl: avatarOf(item.authorUsername || "user"),
    time: item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "",
    text: item.content || "",
    likes: String(item.likesCount || 0),
    imageUrl: item.mediaUrl || undefined,
  };
}

function toReel(post: Post): Reel | null {
  const media = Array.isArray(post.media) ? post.media : [];
  if (media.length !== 1) return null;
  const item = media[0];
  const isVideo = String(item?.type || "").toLowerCase() === "video" || String(item?.mimeType || "").toLowerCase().startsWith("video/");
  if (!isVideo) return null;
  return {
    id: post._id,
    postId: post._id,
    src: resolveMediaUrl(item?.url),
    poster: resolveMediaUrl(item?.thumbnailUrl),
    username: post.authorUsername || "user",
    handle: post.authorUsername || "user",
    caption: post.content || "",
    likes: Number(post.likesCount || 0),
    comments: Number(post.commentsCount || 0),
    avatarUrl: avatarOf(post.authorUsername || "user"),
    commentsList: [],
    likedByMe: Boolean(post.likedByMe),
  };
}

export default function Reel() {
  const api = useApi();
  const { state } = useAppStore();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const videosRef = useRef<(HTMLVideoElement | null)[]>([]);
  const prevIndexRef = useRef<number>(0);
  const lockRef = useRef(false);

  const dragRef = useRef({
    active: false,
    startY: 0,
    lastY: 0,
    triggered: false,
    moved: false,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get("/posts?page=1&limit=50").then((res) => {
      if (cancelled) return;
      const items = (res?.data?.items || []) as Post[];
      const mapped = items.map(toReel).filter(Boolean) as Reel[];
      setReels(mapped);
      setIndex((prev) => clamp(prev, 0, Math.max(mapped.length - 1, 0)));
    }).catch(() => {
      if (!cancelled) setReels([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api]);

  const goTo = (next: number) => {
    const nextIndex = clamp(next, 0, reels.length - 1);
    if (nextIndex === index) return;
    setIndex(nextIndex);
    setPaused(false);
    setCommentsOpen(false);
  };

  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);

  const applyPreloadPolicy = (activeIndex: number) => {
    const nextIndex = activeIndex + 1;

    videosRef.current.forEach((v, i) => {
      if (!v) return;

      if (i === activeIndex || i === nextIndex) {
        v.preload = "auto";
        try { v.load(); } catch {}
      } else {
        v.preload = "metadata";
      }
    });
  };

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = (document.body.style as CSSStyleDeclaration & { overscrollBehaviorY?: string }).overscrollBehaviorY;

    document.body.style.overflow = "hidden";
    (document.body.style as CSSStyleDeclaration & { overscrollBehaviorY?: string }).overscrollBehaviorY = "none";

    return () => {
      document.body.style.overflow = prevOverflow;
      (document.body.style as CSSStyleDeclaration & { overscrollBehaviorY?: string }).overscrollBehaviorY = prevOverscroll;
    };
  }, []);

  useEffect(() => {
    if (!commentsOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCommentsOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commentsOpen]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (commentsOpen || reels.length === 0) return;
      e.preventDefault();
      if (lockRef.current) return;

      const dy = e.deltaY;
      if (Math.abs(dy) < 12) return;

      lockRef.current = true;
      if (dy > 0) next();
      else prev();

      window.setTimeout(() => {
        lockRef.current = false;
      }, 520);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel as EventListener);
  }, [commentsOpen, index, reels.length]);

  useEffect(() => {
    const pauseCurrent = () => {
      const cur = videosRef.current[index];
      if (!cur) return;
      try { cur.pause(); } catch {}
    };

    const tryResume = () => {
      if (document.visibilityState !== "visible" || paused) return;
      const cur = videosRef.current[index];
      if (!cur) return;
      try {
        cur.muted = muted;
        const p = cur.play();
        if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
      } catch {}
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") pauseCurrent();
      else tryResume();
    };

    window.addEventListener("blur", pauseCurrent);
    window.addEventListener("focus", tryResume);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("blur", pauseCurrent);
      window.removeEventListener("focus", tryResume);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [index, muted, paused]);

  useEffect(() => {
    if (reels.length === 0) return;
    setProgress(0);

    const prevV = videosRef.current[prevIndexRef.current];
    const curV = videosRef.current[index];

    if (prevV && prevIndexRef.current !== index) {
      try {
        prevV.pause();
        prevV.currentTime = 0;
      } catch {}
    }

    videosRef.current.forEach((v, i) => {
      if (!v || i === index) return;
      try { v.pause(); } catch {}
    });

    applyPreloadPolicy(index);

    if (curV) {
      try {
        curV.muted = muted;
        curV.currentTime = 0;
        const p = curV.play();
        if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
      } catch {}
    }

    prevIndexRef.current = index;
  }, [index, reels.length, muted]);

  useEffect(() => {
    const curV = videosRef.current[index];
    if (curV) curV.muted = muted;
  }, [index, muted]);

  useEffect(() => {
    const v = videosRef.current[index];
    if (!v) return;

    const onTime = () => {
      const dur = v.duration || 0;
      if (!dur) {
        setProgress(0);
        return;
      }
      setProgress(v.currentTime / dur);
    };

    const onPause = () => setPaused(true);
    const onPlay = () => setPaused(false);

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onTime);
    v.addEventListener("loadedmetadata", onTime);
    v.addEventListener("pause", onPause);
    v.addEventListener("play", onPlay);

    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onTime);
      v.removeEventListener("loadedmetadata", onTime);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("play", onPlay);
    };
  }, [index, reels]);

  const togglePlayPause = () => {
    const cur = videosRef.current[index];
    if (!cur) return;

    if (cur.paused) {
      cur.muted = muted;
      const p = cur.play();
      if (p && typeof (p as Promise<void>).catch === "function") (p as Promise<void>).catch(() => {});
      setPaused(false);
    } else {
      cur.pause();
      setPaused(true);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (commentsOpen) return;
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest(".ig-reel-comments__panel")) return;
    dragRef.current.active = true;
    dragRef.current.startY = e.clientY;
    dragRef.current.lastY = e.clientY;
    dragRef.current.triggered = false;
    dragRef.current.moved = false;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || commentsOpen) return;
    dragRef.current.lastY = e.clientY;
    const delta = e.clientY - dragRef.current.startY;
    if (Math.abs(delta) > 8) dragRef.current.moved = true;
    if (!dragRef.current.triggered && Math.abs(delta) > 60) {
      dragRef.current.triggered = true;
      if (delta < 0) next(); else prev();
      window.setTimeout(() => { dragRef.current.active = false; }, 180);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const wasTriggered = dragRef.current.triggered;
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    dragRef.current.triggered = false;
    dragRef.current.moved = false;
    if (commentsOpen) return;
    if (target.closest("button")) return;
    if (wasTriggered || wasMoved) return;
    togglePlayPause();
  };

  const onPointerCancel = () => {
    dragRef.current.active = false;
    dragRef.current.triggered = false;
    dragRef.current.moved = false;
  };

  const active = reels[index];

  const toggleLike = async () => {
    if (!active) return;
    const liked = !active.likedByMe;
    setReels((prev) => prev.map((item, idx) => idx !== index ? item : ({ ...item, likedByMe: liked, likes: Math.max(0, item.likes + (liked ? 1 : -1)) })));
    try {
      if (liked) await api.post(`/posts/${active.postId}/like`, {});
      else await api.del(`/posts/${active.postId}/like`);
    } catch {
      setReels((prev) => prev.map((item, idx) => idx !== index ? item : ({ ...item, likedByMe: active.likedByMe, likes: active.likes })));
    }
  };

  const openComments = async () => {
    if (!active) return;
    setCommentsOpen(true);
    try {
      const res = await api.get(`/posts/${active.postId}`);
      const comments = ((res?.data?.comments || []) as PostComment[]).map(mapComment);
      setReels((prev) => prev.map((item, idx) => idx !== index ? item : ({ ...item, commentsList: comments, comments: comments.length })));
    } catch {
      // ignore
    }
  };

  const activeComments = useMemo(() => active?.commentsList || [], [active]);

  const submitComment = async (content: string) => {
    if (!active || !content.trim()) return;

    const optimistic: ReelComment = {
      id: `temp-${Date.now()}`,
      user: state.username || "you",
      avatarUrl: avatarOf(state.username || "you"),
      time: "Vừa xong",
      text: content.trim(),
      likes: "0",
    };

    setSubmittingComment(true);
    setReels((prev) => prev.map((item, idx) => idx !== index ? item : ({
      ...item,
      commentsList: [optimistic, ...(item.commentsList || [])],
      comments: Number(item.comments || 0) + 1,
    })));

    try {
      const res = await api.post(`/posts/${active.postId}/comments`, { content: content.trim() });
      const saved = res?.data ? mapComment(res.data as PostComment) : optimistic;
      setReels((prev) => prev.map((item, idx) => idx !== index ? item : ({
        ...item,
        commentsList: [saved, ...(item.commentsList || []).filter((comment) => comment.id !== optimistic.id)],
        comments: Math.max((item.commentsList || []).length, Number(item.comments || 0)),
      })));
    } catch {
      setReels((prev) => prev.map((item, idx) => idx !== index ? item : ({
        ...item,
        commentsList: (item.commentsList || []).filter((comment) => comment.id !== optimistic.id),
        comments: Math.max(0, Number(item.comments || 0) - 1),
      })));
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) return <div className="ig-reels"><div className="ig-reels__stage"><div className="ig-reels__card" style={{ color: "#fff", display: "grid", placeItems: "center" }}>Đang tải reels...</div></div></div>;
  if (!reels.length) return <div className="ig-reels"><div className="ig-reels__stage"><div className="ig-reels__card" style={{ color: "#fff", display: "grid", placeItems: "center" }}>Chưa có reel nào.</div></div></div>;

  return (
    <div className="ig-reels">
      <div className={`ig-reels__stage ${commentsOpen ? "is-comments-open" : ""}`}>
        <div className={`ig-reels__card ${commentsOpen ? "is-comments-open" : ""}`}>
          <div
            className={`ig-reels__viewport ${commentsOpen ? "is-comments-open" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <div className="ig-reels__slider" style={{ transform: `translateY(${-index * 86}vh)` }}>
              {reels.map((r, i) => (
                <div className="ig-reels__slide" key={r.id}>
                  <div className="ig-reels__progress">
                    <div className="ig-reels__progressFill" style={{ transform: `scaleX(${i === index ? progress : 0})` }} />
                  </div>

                  <button className="ig-reels__mute ig-reels__mute--top" type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setMuted((prevMuted) => !prevMuted); }}>
                    {muted ? "🔇" : "🔊"}
                  </button>

                  <div className="ig-reels__videoShell">
                    <video
                      ref={(el) => { videosRef.current[i] = el; }}
                      className="ig-reels__video"
                      src={r.src}
                      poster={r.poster}
                      playsInline
                      loop
                      preload="metadata"
                    />
                    {i === index && paused ? <div className="ig-reels__playOverlay" aria-hidden>▶</div> : null}
                  </div>

                  <div className="ig-reels__overlay">
                    <div className="ig-reels__userRow">
                      <img className="ig-reels__avatar" src={r.avatarUrl} alt={r.username} />
                      <div className="ig-reels__userText">
                        <div className="ig-reels__username">{r.username}</div>
                        {r.handle ? <div className="ig-reels__handle">@{r.handle}</div> : null}
                      </div>
                    </div>
                    <div className="ig-reels__caption">{r.caption || "Video reel"}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ig-reels__actions">
            <button className={`ig-reels__actionBtn ${active.likedByMe ? "is-liked" : ""}`} type="button" onClick={toggleLike} title="Thích">
              ❤
              <div className="ig-reels__count">{active.likes}</div>
            </button>

            <button className={`ig-reels__actionBtn ${commentsOpen ? "is-active" : ""}`} type="button" title="Bình luận" onClick={() => commentsOpen ? setCommentsOpen(false) : openComments()}>
              💬
              <div className="ig-reels__count">{active.comments}</div>
            </button>

            <button className="ig-reels__actionBtn" type="button" title="Chia sẻ">✈</button>
            <button className="ig-reels__actionBtn" type="button" title="Lưu">🔖</button>
            <button className="ig-reels__actionBtn" type="button" title="Khác">⋯</button>

            <div className="ig-reels__miniThumb" title="Reel đang xem">
              <video src={active.src} poster={active.poster} muted playsInline />
            </div>
          </div>
        </div>

        <ReelComments
          isOpen={commentsOpen}
          reelUsername={active.username}
          comments={activeComments}
          onClose={() => setCommentsOpen(false)}
          onSubmitComment={submitComment}
          submitting={submittingComment}
        />
      </div>

      <div className="ig-reels__scrollBtns">
        <button className="ig-reels__scrollBtn" type="button" onClick={prev} disabled={index === 0} title="Reel trước">^
        </button>
        <button className="ig-reels__scrollBtn" type="button" onClick={next} disabled={index === reels.length - 1} title="Reel tiếp">v
        </button>
      </div>
    </div>
  );
}
