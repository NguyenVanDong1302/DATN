import { useEffect, useMemo, useRef, useState } from "react";
import "./Reel.scss";

import ReelComments, { type ReelComment } from "./comments/ReelComments";
import video1 from "./DataVS/Video1.mp4";
import video2 from "./DataVS/Video2.mp4";
import video3 from "./DataVS/Video3.mp4";
import video4 from "./DataVS/Video4.mp4";

type Reel = {
  id: string;
  src: string;
  username: string;
  handle?: string;
  caption: string;
  likes: string;
  comments: string;
  avatarUrl: string;
  commentsList: ReelComment[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Reel() {
  const reels: Reel[] = useMemo(
    () => [
      {
        id: "1",
        src: video1,
        username: "camtu_205",
        handle: "camtu_205",
        caption: "Tác dụng của việc lướt Thread quá 180p là t đã học được cách buộc tóc siêu xinh nè 🙈",
        likes: "60,8K",
        comments: "161",
        avatarUrl: "https://i.pravatar.cc/120?img=12",
        commentsList: [
          {
            id: "1-1",
            user: "b.m_bmf",
            avatarUrl: "https://i.pravatar.cc/80?img=41",
            time: "9w",
            text: "Que bom que vc se amou!",
            likes: "3",
          },
          {
            id: "1-2",
            user: "yessivitutcci",
            avatarUrl: "https://i.pravatar.cc/80?img=32",
            time: "5w",
            text: "👏👏🔥🔥❤️😍",
            likes: "4",
          },
          {
            id: "1-3",
            user: "packy.33",
            avatarUrl: "https://i.pravatar.cc/80?img=18",
            time: "5w",
            text: "Se transformó en el capitán América",
            likes: "313",
            repliesLabel: "View all 1 replies",
            verified: true,
          },
          {
            id: "1-4",
            user: "s.way.s",
            avatarUrl: "https://i.pravatar.cc/80?img=57",
            time: "4w",
            text: "Động lực lên mood quá trời luôn 😮‍💨",
            likes: "217",
            imageUrl: "https://images.unsplash.com/photo-1516728778615-2d590ea1856f?auto=format&fit=crop&w=640&q=80",
          },
        ],
      },
      {
        id: "2",
        src: video2,
        username: "vandong010302",
        handle: "vandong010302",
        caption: "Reel số 2",
        likes: "12,3K",
        comments: "88",
        avatarUrl: "https://i.pravatar.cc/120?img=13",
        commentsList: [
          {
            id: "2-1",
            user: "gymboy.7",
            avatarUrl: "https://i.pravatar.cc/80?img=22",
            time: "2d",
            text: "Form ổn ghê, quay góc này đẹp đó.",
            likes: "18",
          },
          {
            id: "2-2",
            user: "ha.anh.fit",
            avatarUrl: "https://i.pravatar.cc/80?img=26",
            time: "1d",
            text: "Tập đều như này là tháng sau khác liền 😤",
            likes: "9",
          },
        ],
      },
      {
        id: "3",
        src: video3,
        username: "vandong010302",
        handle: "vandong010302",
        caption: "Reel số 3",
        likes: "9,1K",
        comments: "40",
        avatarUrl: "https://i.pravatar.cc/120?img=14",
        commentsList: [
          {
            id: "3-1",
            user: "minhthao.daily",
            avatarUrl: "https://i.pravatar.cc/80?img=35",
            time: "12h",
            text: "Nhạc khớp video quá nè.",
            likes: "12",
          },
          {
            id: "3-2",
            user: "quang.hoang",
            avatarUrl: "https://i.pravatar.cc/80?img=46",
            time: "10h",
            text: "Up part 2 đi bạn ơi.",
            likes: "5",
          },
        ],
      },
      {
        id: "4",
        src: video4,
        username: "vandong010302",
        handle: "vandong010302",
        caption: "Reel số 4",
        likes: "3,4K",
        comments: "21",
        avatarUrl: "https://i.pravatar.cc/120?img=15",
        commentsList: [
          {
            id: "4-1",
            user: "anhthu.me",
            avatarUrl: "https://i.pravatar.cc/80?img=48",
            time: "3h",
            text: "Đoạn cuối cuốn thật sự 😂",
            likes: "2",
          },
        ],
      },
    ],
    []
  );

  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [liked, setLiked] = useState<boolean[]>(() => new Array(reels.length).fill(false));

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
        try {
          v.load();
        } catch {}
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
      if (commentsOpen) return;
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
  }, [commentsOpen, index]);

  useEffect(() => {
    const pauseCurrent = () => {
      const cur = videosRef.current[index];
      if (!cur) return;
      try {
        cur.pause();
      } catch {}
    };

    const tryResume = () => {
      if (document.visibilityState !== "visible" || paused) return;
      const cur = videosRef.current[index];
      if (!cur) return;

      try {
        cur.muted = muted;
        const p = cur.play();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {});
        }
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
      try {
        v.pause();
      } catch {}
    });

    applyPreloadPolicy(index);

    if (curV) {
      try {
        curV.muted = muted;
        curV.currentTime = 0;
        const p = curV.play();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {});
        }
      } catch {}
    }

    prevIndexRef.current = index;
  }, [index]);

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
  }, [index]);

  const togglePlayPause = () => {
    const cur = videosRef.current[index];
    if (!cur) return;

    if (cur.paused) {
      cur.muted = muted;
      const p = cur.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => {});
      }
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

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || commentsOpen) return;
    dragRef.current.lastY = e.clientY;

    const delta = e.clientY - dragRef.current.startY;
    if (Math.abs(delta) > 8) {
      dragRef.current.moved = true;
    }

    if (!dragRef.current.triggered && Math.abs(delta) > 60) {
      dragRef.current.triggered = true;
      if (delta < 0) next();
      else prev();

      window.setTimeout(() => {
        dragRef.current.active = false;
      }, 180);
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
            <div className="ig-reels__slider" style={{ transform: `translateY(${-index * 90}vh)` }}>
              {reels.map((r, i) => (
                <div className="ig-reels__slide" key={r.id}>
                  <div className="ig-reels__progress">
                    <div
                      className="ig-reels__progressFill"
                      style={{ transform: `scaleX(${i === index ? progress : 0})` }}
                    />
                  </div>

                  <button
                    className="ig-reels__mute ig-reels__mute--top"
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMuted((prevMuted) => !prevMuted);
                    }}
                  >
                    {muted ? "🔇" : "🔊"}
                  </button>

                  <div className="ig-reels__videoShell">
                    <video
                      ref={(el) => {
                        videosRef.current[i] = el;
                      }}
                      className="ig-reels__video"
                      src={r.src}
                      playsInline
                      loop
                      preload="metadata"
                    />

                    {i === index && paused ? (
                      <div className="ig-reels__playOverlay" aria-hidden>
                        ▶
                      </div>
                    ) : null}
                  </div>

                  <div className="ig-reels__overlay">
                    <div className="ig-reels__userRow">
                      <img className="ig-reels__avatar" src={r.avatarUrl} alt={r.username} />
                      <div className="ig-reels__userText">
                        <div className="ig-reels__username">{r.username}</div>
                        {r.handle ? <div className="ig-reels__handle">@{r.handle}</div> : null}
                      </div>
                      <button className="ig-reels__follow" type="button">
                        Theo dõi
                      </button>
                    </div>

                    <div className="ig-reels__caption">{r.caption}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="ig-reels__actions">
            <button
              className={`ig-reels__actionBtn ${liked[index] ? "is-liked" : ""}`}
              type="button"
              onClick={() =>
                setLiked((arr) => {
                  const nextArr = [...arr];
                  nextArr[index] = !nextArr[index];
                  return nextArr;
                })
              }
              title="Thích"
            >
              ❤
              <div className="ig-reels__count">{active.likes}</div>
            </button>

            <button
              className={`ig-reels__actionBtn ${commentsOpen ? "is-active" : ""}`}
              type="button"
              title="Bình luận"
              onClick={() => setCommentsOpen((prevOpen) => !prevOpen)}
            >
              💬
              <div className="ig-reels__count">{active.comments}</div>
            </button>

            <button className="ig-reels__actionBtn" type="button" title="Chia sẻ">
              ✈
            </button>

            <button className="ig-reels__actionBtn" type="button" title="Lưu">
              🔖
            </button>

            <button className="ig-reels__actionBtn" type="button" title="Khác">
              ⋯
            </button>

            <div className="ig-reels__miniThumb" title="Reel đang xem">
              <video src={active.src} muted playsInline />
            </div>
          </div>
        </div>

        <ReelComments
          isOpen={commentsOpen}
          reelUsername={active.username}
          comments={active.commentsList}
          onClose={() => setCommentsOpen(false)}
        />
      </div>

      <div className="ig-reels__scrollBtns">
        <button className="ig-reels__scrollBtn" type="button" onClick={prev} disabled={index === 0} title="Reel trước">
          ^
        </button>
        <button
          className="ig-reels__scrollBtn"
          type="button"
          onClick={next}
          disabled={index === reels.length - 1}
          title="Reel tiếp"
        >
          v
        </button>
      </div>
    </div>
  );
}
