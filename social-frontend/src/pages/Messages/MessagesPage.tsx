import { useEffect, useMemo, useRef, useState } from "react";
import "./Messages.scss";

type Thread = {
    id: string;
    name: string;
    username: string;
    avatar: string;
    last: string;
    time: string;
    unread?: boolean;
};

type Msg = {
    id: string;
    fromMe: boolean;
    type: "text" | "post";
    text?: string;
    post?: { img: string; caption: string };
    time?: string;
};

export default function MessagesPage() {
    const threads: Thread[] = useMemo(
        () => [
            {
                id: "t1",
                name: "thu_phuong411",
                username: "thu_phuong411",
                avatar: "https://i.pravatar.cc/100?img=32",
                last: "đã gửi một tệp đính kèm",
                time: "6 tuần",
                unread: true,
            },
            {
                id: "t2",
                name: "Người dùng",
                username: "instagram_user",
                avatar: "https://i.pravatar.cc/100?img=5",
                last: "Cuộc gọi thoại đã kết thúc",
                time: "28 tuần",
            },
        ],
        []
    );

    const initialMessages: Record<string, Msg[]> = useMemo(
        () => ({
            t1: [
                {
                    id: "m1",
                    fromMe: false,
                    type: "post",
                    post: {
                        img: "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=900&q=80",
                        caption:
                            "Tác dụng của việc lướt Thread quá 180p là t đã học được cách buộc tóc siêu xinh nè 😭 nhìn nó thơ mà sang chx 👀",
                    },
                    time: "12:18 19 Tháng 1, 2026",
                },
                { id: "m2", fromMe: true, type: "text", text: "Xịn thật 😆", time: "12:20" },
                { id: "m3", fromMe: true, type: "text", text: "Để tui thử làm theo", time: "12:21" },
            ],
            t2: [
                { id: "m4", fromMe: false, type: "text", text: "Hello", time: "10:10" },
                { id: "m5", fromMe: true, type: "text", text: "Chào bạn", time: "10:11" },
            ],
        }),
        []
    );

    const [activeId, setActiveId] = useState(threads[0]?.id ?? "");
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<"inbox" | "requests">("inbox");

    const [messagesByThread, setMessagesByThread] = useState<Record<string, Msg[]>>(initialMessages);
    const [text, setText] = useState("");

    const list = tab === "inbox" ? threads : []; // demo: chưa có requests
    const activeThread = threads.find((t) => t.id === activeId) ?? threads[0];
    const activeMessages = messagesByThread[activeThread.id] ?? [];

    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // auto scroll bottom
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [activeId, activeMessages.length]);

    const filtered = list.filter((t) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return t.name.toLowerCase().includes(q) || t.username.toLowerCase().includes(q);
    });

    const send = () => {
        const v = text.trim();
        if (!v) return;

        setMessagesByThread((prev) => {
            const next = { ...prev };
            const arr = next[activeThread.id] ? [...next[activeThread.id]] : [];
            arr.push({ id: `${Date.now()}`, fromMe: true, type: "text", text: v, time: "vừa xong" });
            next[activeThread.id] = arr;
            return next;
        });

        setText("");
    };

    return (
        <div className="ig-msg">
            <div className="ig-msg__wrap">
                {/* LEFT PANEL */}
                <aside className="ig-msg__left">
                    <div className="ig-msg__leftTop">
                        <button className="ig-msg__userBtn" type="button" onClick={() => console.log("open account menu")}>
                            <span className="ig-msg__userName">vandong010302</span>
                            <span className="ig-msg__chev">▾</span>
                        </button>

                        <button className="ig-msg__compose" type="button" title="Tin nhắn mới" onClick={() => console.log("compose")}>
                            ✎
                        </button>
                    </div>

                    <div className="ig-msg__search">
                        <span className="ig-msg__searchIcon">⌕</span>
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Tìm kiếm"
                            className="ig-msg__searchInput"
                        />
                    </div>

                    <div className="ig-msg__tabs">
                        <button
                            className={`ig-msg__tab ${tab === "inbox" ? "is-active" : ""}`}
                            type="button"
                            onClick={() => setTab("inbox")}
                        >
                            Tin nhắn
                        </button>
                        <button
                            className={`ig-msg__tab ${tab === "requests" ? "is-active" : ""}`}
                            type="button"
                            onClick={() => setTab("requests")}
                        >
                            Tin nhắn đang chờ
                        </button>
                    </div>

                    <div className="ig-msg__list">
                        {filtered.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                className={`ig-msg__item ${t.id === activeId ? "is-selected" : ""}`}
                                onClick={() => setActiveId(t.id)}
                            >
                                <img className="ig-msg__avatar" src={t.avatar} alt={t.name} />
                                <div className="ig-msg__itemMid">
                                    <div className="ig-msg__itemTitle">
                                        <span className="ig-msg__itemName">{t.name}</span>
                                        {t.unread ? <span className="ig-msg__dot" /> : null}
                                    </div>
                                    <div className="ig-msg__itemSub">
                                        <span className="ig-msg__itemLast">{t.last}</span>
                                        <span className="ig-msg__sep">·</span>
                                        <span className="ig-msg__itemTime">{t.time}</span>
                                    </div>
                                </div>
                            </button>
                        ))}

                        {tab === "requests" ? (
                            <div className="ig-msg__empty">
                                <div className="ig-msg__emptyTitle">Chưa có yêu cầu</div>
                                <div className="ig-msg__emptyText">Khi có tin nhắn đang chờ, chúng sẽ hiển thị ở đây.</div>
                            </div>
                        ) : null}
                    </div>
                </aside>

                {/* RIGHT PANEL */}
                <section className="ig-msg__right">
                    {/* Header */}
                    <div className="ig-msg__rightTop">
                        <div className="ig-msg__peer">
                            <img className="ig-msg__peerAvatar" src={activeThread.avatar} alt={activeThread.name} />
                            <div className="ig-msg__peerMeta">
                                <div className="ig-msg__peerName">{activeThread.name}</div>
                                <div className="ig-msg__peerUser">@{activeThread.username}</div>
                            </div>
                        </div>

                        <div className="ig-msg__actions">
                            <button className="ig-msg__iconBtn" type="button" title="Gọi thoại" onClick={() => console.log("call")}>
                                ☎
                            </button>
                            <button className="ig-msg__iconBtn" type="button" title="Gọi video" onClick={() => console.log("video")}>
                                ⌁
                            </button>
                            <button className="ig-msg__iconBtn" type="button" title="Thông tin" onClick={() => console.log("info")}>
                                ⓘ
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="ig-msg__body" ref={scrollRef}>
                        {activeMessages.map((m) => (
                            <div key={m.id} className={`ig-msg__row ${m.fromMe ? "is-me" : "is-them"}`}>
                                {!m.fromMe ? <img className="ig-msg__bubbleAvatar" src={activeThread.avatar} alt="" /> : null}

                                <div className="ig-msg__bubbleWrap">
                                    {m.type === "text" ? (
                                        <div className={`ig-msg__bubble ${m.fromMe ? "is-me" : "is-them"}`}>{m.text}</div>
                                    ) : (
                                        <div className={`ig-msg__post ${m.fromMe ? "is-me" : "is-them"}`}>
                                            <div className="ig-msg__postTop">
                                                <img className="ig-msg__postAvatar" src={activeThread.avatar} alt="" />
                                                <div className="ig-msg__postUser">{activeThread.name}</div>
                                                <button className="ig-msg__postMore" type="button" onClick={() => console.log("post more")}>
                                                    ⋯
                                                </button>
                                            </div>
                                            <div className="ig-msg__postMedia">
                                                <img src={m.post?.img} alt="" />
                                                <div className="ig-msg__postBadge">▢</div>
                                            </div>
                                            <div className="ig-msg__postCaption">{m.post?.caption}</div>
                                            <div className="ig-msg__postMeta">
                                                <span>2 phản hồi</span>
                                                <span className="ig-msg__sep">·</span>
                                                <span>1K lượt thích</span>
                                            </div>
                                        </div>
                                    )}

                                    {m.time ? <div className="ig-msg__time">{m.time}</div> : null}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Composer */}
                    <div className="ig-msg__composer">
                        <button className="ig-msg__emoji" type="button" title="Emoji" onClick={() => console.log("emoji")}>
                            ☺
                        </button>

                        <input
                            className="ig-msg__input"
                            placeholder="Nhắn tin..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") send();
                            }}
                        />

                        <div className="ig-msg__composerActions">
                            <button className="ig-msg__miniBtn" type="button" title="Ghi âm" onClick={() => console.log("mic")}>
                                🎙
                            </button>
                            <button className="ig-msg__miniBtn" type="button" title="Ảnh" onClick={() => console.log("image")}>
                                🖼
                            </button>
                            <button className="ig-msg__miniBtn" type="button" title="Sticker" onClick={() => console.log("sticker")}>
                                ⊙
                            </button>
                        </div>

                        <button className="ig-msg__send" type="button" onClick={send} disabled={!text.trim()}>
                            Gửi
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}