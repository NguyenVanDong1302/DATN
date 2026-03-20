import { useEffect, useMemo, useState } from "react";
import "./ReelComments.scss";

export type ReelComment = {
  id: string;
  user: string;
  avatarUrl: string;
  time: string;
  text: string;
  likes: string;
  imageUrl?: string;
  repliesLabel?: string;
  verified?: boolean;
};

type ReelCommentsProps = {
  isOpen: boolean;
  reelUsername: string;
  comments: ReelComment[];
  onClose: () => void;
};

export default function ReelComments({
  isOpen,
  reelUsername,
  comments,
  onClose,
}: ReelCommentsProps) {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const raf = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(raf);
    }

    setIsVisible(false);
    const timer = window.setTimeout(() => {
      setIsMounted(false);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const title = useMemo(() => `Comments · ${reelUsername}`, [reelUsername]);

  if (!isMounted) return null;

  return (
    <>
      <div
        className={`ig-reel-comments__backdrop ${isVisible ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden={!isVisible}
      />

      <aside
        className={`ig-reel-comments__panel ${isVisible ? "is-open" : ""}`}
        aria-hidden={!isVisible}
        aria-label={title}
      >
        <div className="ig-reel-comments__header">
          <button className="ig-reel-comments__close" type="button" onClick={onClose} aria-label="Đóng bình luận">
            ✕
          </button>
          <div className="ig-reel-comments__title">Comments</div>
          <div className="ig-reel-comments__spacer" />
        </div>

        <div className="ig-reel-comments__body">
          {comments.map((comment) => (
            <article className="ig-reel-comments__item" key={comment.id}>
              <img className="ig-reel-comments__avatar" src={comment.avatarUrl} alt={comment.user} />

              <div className="ig-reel-comments__main">
                <div className="ig-reel-comments__meta">
                  <span className="ig-reel-comments__user">{comment.user}</span>
                  {comment.verified ? <span className="ig-reel-comments__verified">●</span> : null}
                  <span className="ig-reel-comments__time">{comment.time}</span>
                </div>

                <div className="ig-reel-comments__text">{comment.text}</div>

                {comment.imageUrl ? (
                  <img className="ig-reel-comments__media" src={comment.imageUrl} alt="comment attachment" />
                ) : null}

                <div className="ig-reel-comments__foot">
                  <span>{comment.likes} likes</span>
                  <button type="button">Reply</button>
                  <button type="button">See translation</button>
                </div>

                {comment.repliesLabel ? (
                  <button className="ig-reel-comments__replies" type="button">
                    {comment.repliesLabel}
                  </button>
                ) : null}
              </div>

              <button className="ig-reel-comments__like" type="button" aria-label="Thích bình luận">
                ♡
              </button>
            </article>
          ))}
        </div>

        <div className="ig-reel-comments__composer">
          <img className="ig-reel-comments__composerAvatar" src={`https://i.pravatar.cc/80?u=${reelUsername}`} alt="Bạn" />
          <div className="ig-reel-comments__composerInput">Add a comment...</div>
          <button className="ig-reel-comments__emoji" type="button" aria-label="Emoji">
            ☺
          </button>
        </div>
      </aside>
    </>
  );
}
