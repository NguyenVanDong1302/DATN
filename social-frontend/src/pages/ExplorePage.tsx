export default function ExplorePage() {
  return (
    <div className="card">
      <div className="row">
        <strong>Explore</strong>
        <span className="muted">Sẽ làm: hashtag, search, trending</span>
      </div>
      <div className="muted" style={{ marginTop: 10 }}>
        UI & kiến trúc đã sẵn, bước sau chỉ cần thêm API /search?q=... và /tags/:tag là xong.
      </div>
    </div>
  )
}
