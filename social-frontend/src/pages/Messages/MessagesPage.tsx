import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../state/store'
import { useSocket } from '../../state/socket'
import { useMessagesApi } from '../../features/messages/messages.api'
import { joinConversation, leaveConversation, markConversationReadRealtime } from '../../features/messages/messages.socket'
import type { ChatMessage, ConversationItem, ConversationSettings, MessageUser, SearchUsersResponse } from '../../features/messages/messages.types'
import './Messages.scss'

const TIME_GROUP_MS = 3 * 60 * 1000
const TIME_SEPARATOR_MS = 10 * 60 * 1000

function formatTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatConversationTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function avatarOf(user?: Pick<MessageUser, 'avatarUrl' | 'username'> | null) {
  if (user?.avatarUrl) return user.avatarUrl
  const seed = encodeURIComponent(user?.username || 'instagram_user')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
}

function shouldShowInlineTime(messages: ChatMessage[], index: number) {
  const current = messages[index]
  const next = messages[index + 1]
  if (!current) return false
  if (!next) return true
  const currentTs = new Date(current.createdAt).getTime()
  const nextTs = new Date(next.createdAt).getTime()
  if (!Number.isFinite(currentTs) || !Number.isFinite(nextTs)) return true
  return nextTs - currentTs > TIME_GROUP_MS || next.senderUsername !== current.senderUsername
}

function shouldShowCenterTime(messages: ChatMessage[], index: number) {
  const current = messages[index]
  const previous = messages[index - 1]
  if (!current) return false
  if (!previous) return true
  const currentTs = new Date(current.createdAt).getTime()
  const previousTs = new Date(previous.createdAt).getTime()
  if (!Number.isFinite(currentTs) || !Number.isFinite(previousTs)) return false
  return currentTs - previousTs >= TIME_SEPARATOR_MS
}

function messagePreview(message: ChatMessage) {
  if (message.type === 'image') return 'Đã gửi một ảnh'
  if (message.type === 'video') return 'Đã gửi một video'
  return message.text
}

function MessageMedia({ message }: { message: ChatMessage }) {
  if (!message.mediaUrl) return null
  return message.type === 'video' ? (
    <video className="ig-msg__media" src={message.mediaUrl} controls playsInline />
  ) : (
    <img className="ig-msg__media" src={message.mediaUrl} alt={message.fileName || 'message media'} />
  )
}

export default function MessagesPage() {
  const api = useMessagesApi()
  const navigate = useNavigate()
  const { state } = useAppStore()
  const { socket } = useSocket()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [savingDetail, setSavingDetail] = useState(false)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({})
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUsersResponse>({ following: [], suggested: [] })
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [settings, setSettings] = useState<ConversationSettings | null>(null)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [hoveredMessageId, setHoveredMessageId] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || null, [conversations, activeId])
  const activeMessages = useMemo(() => messagesByConversation[activeId] || [], [messagesByConversation, activeId])
  const displayPeerName = activeConversation?.nickname?.trim() || activeConversation?.peer.username || ''
  const isBlocked = Boolean(settings?.isBlocked || activeConversation?.isBlocked)
  const mediaPreviewUrl = useMemo(() => (mediaFile ? URL.createObjectURL(mediaFile) : ''), [mediaFile])

  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    const prevRootOverflow = root.style.overflow
    const prevBodyOverflow = body.style.overflow
    const prevBodyHeight = body.style.height
    root.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.height = '100dvh'
    return () => {
      root.style.overflow = prevRootOverflow
      body.style.overflow = prevBodyOverflow
      body.style.height = prevBodyHeight
    }
  }, [])

  useEffect(() => () => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl)
  }, [mediaPreviewUrl])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        const items = await api.getConversations()
        if (!mounted) return
        setConversations(items)
        if (items[0]?.id) setActiveId((prev) => prev || items[0].id)
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Không tải được danh sách chat')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [api])

  useEffect(() => {
    if (!isSearchOpen) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true)
        const data = await api.searchUsers(query)
        if (!cancelled) setSearchResults(data)
      } catch {
        if (!cancelled) setSearchResults({ following: [], suggested: [] })
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, query.trim() ? 250 : 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [api, query, isSearchOpen])

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (searchRef.current && target && !searchRef.current.contains(target)) setIsSearchOpen(false)
    }
    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [])

  useEffect(() => {
    if (!activeId) return
    let mounted = true
    ;(async () => {
      try {
        setDetailLoading(true)
        const [items, detail, detailSettings] = await Promise.all([
          api.getMessages(activeId),
          api.getConversation(activeId),
          api.getSettings(activeId),
        ])
        if (!mounted) return
        setMessagesByConversation((prev) => ({ ...prev, [activeId]: items }))
        setConversations((prev) => prev.map((item) => (item.id === activeId ? { ...item, ...detail, unreadCount: 0, nickname: detailSettings.nickname, isBlocked: detailSettings.isBlocked } : item)))
        setSettings(detailSettings)
        setNicknameDraft(detailSettings.nickname || '')
        await api.markRead(activeId)
        markConversationReadRealtime(socket, activeId)
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Không tải được tin nhắn')
      } finally {
        if (mounted) setDetailLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [activeId, api, socket])

  useEffect(() => {
    socket?.emit('presence:update', { screen: 'messages', activeConversationId: activeId || '' })
    if (!socket || !activeId) return
    joinConversation(socket, activeId)
    return () => leaveConversation(socket, activeId)
  }, [socket, activeId])

  useEffect(() => {
    if (!contentScrollRef.current) return
    contentScrollRef.current.scrollTop = contentScrollRef.current.scrollHeight
  }, [activeMessages.length, activeId])

  useEffect(() => {
    if (!socket) return

    const onMessageNew = (message: ChatMessage) => {
      setMessagesByConversation((prev) => {
        const arr = prev[message.conversationId] ? [...prev[message.conversationId]] : []
        const existedIndex = arr.findIndex((item) => item.id === message.id)
        if (existedIndex >= 0) arr.splice(existedIndex, 1, message)
        else arr.push(message)
        return { ...prev, [message.conversationId]: arr }
      })

      setConversations((prev) => {
        const found = prev.find((item) => item.id === message.conversationId)
        if (!found) return prev
        const next = prev.map((item) => {
          if (item.id !== message.conversationId) return item
          const shouldIncrease = message.conversationId !== activeId && message.senderUsername !== state.username
          return {
            ...item,
            lastMessageText: messagePreview(message),
            lastMessageAt: message.createdAt,
            unreadCount: shouldIncrease ? item.unreadCount + 1 : 0,
          }
        })
        return [...next].sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())
      })
    }

    const onMessageReaction = (message: ChatMessage) => {
      setMessagesByConversation((prev) => ({
        ...prev,
        [message.conversationId]: (prev[message.conversationId] || []).map((item) => (item.id === message.id ? { ...item, ...message } : item)),
      }))
    }

    const onConversationUpdated = async ({ conversationId }: { conversationId?: string } = {}) => {
      if (!conversationId) return
      try {
        const [detail, detailSettings] = await Promise.all([api.getConversation(conversationId), api.getSettings(conversationId)])
        setConversations((prev) => prev.map((item) => (item.id === conversationId ? { ...item, ...detail, nickname: detailSettings.nickname, isBlocked: detailSettings.isBlocked } : item)))
        if (conversationId === activeId) {
          setSettings(detailSettings)
          setNicknameDraft(detailSettings.nickname || '')
        }
      } catch {}
    }

    const onInboxRefresh = async () => {
      const items = await api.getConversations()
      setConversations(items)
      if (!activeId && items[0]?.id) setActiveId(items[0].id)
    }

    const onHistoryCleared = ({ conversationId }: { conversationId?: string } = {}) => {
      if (!conversationId) return
      setMessagesByConversation((prev) => ({ ...prev, [conversationId]: [] }))
      setConversations((prev) => prev.map((item) => (item.id === conversationId ? { ...item, lastMessageText: '', lastMessageAt: null, unreadCount: 0 } : item)))
    }

    socket.on('message:new', onMessageNew)
    socket.on('message:reaction', onMessageReaction)
    socket.on('inbox:refresh', onInboxRefresh)
    socket.on('conversation:updated', onConversationUpdated)
    socket.on('conversation:history-cleared', onHistoryCleared)

    return () => {
      socket.off('message:new', onMessageNew)
      socket.off('message:reaction', onMessageReaction)
      socket.off('inbox:refresh', onInboxRefresh)
      socket.off('conversation:updated', onConversationUpdated)
      socket.off('conversation:history-cleared', onHistoryCleared)
    }
  }, [socket, activeId, state.username, api])

  const handlePickUser = async (user: MessageUser) => {
    try {
      const conversation = await api.createDirectConversation({ targetUserId: user.id, username: user.username })
      setConversations((prev) => {
        const existed = prev.some((item) => item.id === conversation.id)
        return existed ? prev.map((item) => (item.id === conversation.id ? { ...item, ...conversation } : item)) : [conversation, ...prev]
      })
      setActiveId(conversation.id)
      setIsSearchOpen(false)
      setQuery('')
    } catch (err: any) {
      setError(err?.message || 'Không thể mở đoạn chat')
    }
  }

  const handleSend = async () => {
    if (!activeId || sending || isBlocked) return
    const value = text.trim()
    if (!value && !mediaFile) return
    setSending(true)
    setError('')
    try {
      const message = await api.sendMessageHttp(activeId, { text: value, media: mediaFile, replyToMessageId: replyTo?.id || null })
      setMessagesByConversation((prev) => {
        const arr = prev[activeId] || []
        return arr.some((item) => item.id === message.id) ? prev : { ...prev, [activeId]: [...arr, message] }
      })
      setConversations((prev) => prev.map((item) => (item.id === activeId ? { ...item, lastMessageText: messagePreview(message), lastMessageAt: message.createdAt } : item)))
      setText('')
      setReplyTo(null)
      setMediaFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err: any) {
      setError(err?.message || 'Gửi tin nhắn thất bại')
    } finally {
      setSending(false)
    }
  }

  const toggleMessageHeart = async (message: ChatMessage) => {
    if (!activeId) return
    try {
      const next = await api.toggleMessageHeart(activeId, message.id, !message.heartedByMe)
      setMessagesByConversation((prev) => ({
        ...prev,
        [activeId]: (prev[activeId] || []).map((item) => (item.id === message.id ? { ...item, ...next } : item)),
      }))
    } catch (err: any) {
      setError(err?.message || 'Không thể thả tim tin nhắn')
    }
  }

  const saveNickname = async () => {
    if (!activeId || savingDetail) return
    try {
      setSavingDetail(true)
      const next = await api.updateSettings(activeId, { nickname: nicknameDraft })
      setSettings(next)
      setConversations((prev) => prev.map((item) => (item.id === activeId ? { ...item, nickname: next.nickname } : item)))
    } catch (err: any) {
      setError(err?.message || 'Không thể cập nhật biệt danh')
    } finally {
      setSavingDetail(false)
    }
  }

  const toggleBlock = async () => {
    if (!activeId || savingDetail) return
    try {
      setSavingDetail(true)
      const next = await api.updateSettings(activeId, { isBlocked: !isBlocked })
      setSettings(next)
      setConversations((prev) => prev.map((item) => (item.id === activeId ? { ...item, isBlocked: next.isBlocked } : item)))
    } catch (err: any) {
      setError(err?.message || 'Không thể cập nhật trạng thái chặn')
    } finally {
      setSavingDetail(false)
    }
  }

  const clearHistory = async () => {
    if (!activeId || savingDetail) return
    const ok = window.confirm('Xóa toàn bộ lịch sử đoạn chat này? Các file ảnh/video gắn với tin nhắn cũng sẽ bị xóa.')
    if (!ok) return
    try {
      setSavingDetail(true)
      await api.clearHistory(activeId)
      setMessagesByConversation((prev) => ({ ...prev, [activeId]: [] }))
      setConversations((prev) => prev.map((item) => (item.id === activeId ? { ...item, lastMessageText: '', lastMessageAt: null, unreadCount: 0 } : item)))
    } catch (err: any) {
      setError(err?.message || 'Không thể xóa lịch sử đoạn chat')
    } finally {
      setSavingDetail(false)
    }
  }

  const renderSearchGroup = (label: string, items: MessageUser[]) => {
    if (!items.length) return null
    return (
      <div className="ig-msg__searchGroup">
        <div className="ig-msg__searchHeading">{label}</div>
        {items.map((user) => (
          <button key={user.id} type="button" className="ig-msg__searchItem" onClick={() => void handlePickUser(user)}>
            <img className="ig-msg__avatar" src={avatarOf(user)} alt={user.username} />
            <div className="ig-msg__searchMeta">
              <div className="ig-msg__itemName">{user.username}</div>
              <div className="ig-msg__itemLast">{user.bio || user.email || 'Instagram User'}</div>
            </div>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="ig-msg">
      <div className={`ig-msg__wrap ${isDetailOpen ? 'is-detail-open' : ''}`}>
        <aside className="ig-msg__left">
          <div className="ig-msg__leftTop">
            <button className="ig-msg__userBtn" type="button">
              <span className="ig-msg__userName">{state.username || 'instagram_user'}</span>
              <span className="ig-msg__chev">▾</span>
            </button>
            <button className="ig-msg__compose" type="button">✎</button>
          </div>

          <div className="ig-msg__searchWrap" ref={searchRef}>
            <div className="ig-msg__search">
              <span className="ig-msg__searchIcon">⌕</span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setIsSearchOpen(true)
                }}
                onFocus={() => setIsSearchOpen(true)}
                onClick={() => setIsSearchOpen(true)}
                placeholder="Tìm kiếm"
                className="ig-msg__searchInput"
              />
            </div>

            {isSearchOpen ? (
              <div className="ig-msg__searchDropdown">
                {searchLoading ? <div className="ig-msg__searchEmpty">Đang tải danh sách người dùng...</div> : null}
                {!searchLoading ? (
                  <>
                    {renderSearchGroup('Đang follow', searchResults.following)}
                    {renderSearchGroup('Đề xuất', searchResults.suggested)}
                    {!searchResults.following.length && !searchResults.suggested.length ? <div className="ig-msg__searchEmpty">{query.trim() ? 'Không tìm thấy người dùng phù hợp.' : 'Chưa có người dùng để gợi ý.'}</div> : null}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="ig-msg__sectionHead">
            <div className="ig-msg__sectionTitle">Messages</div>
          </div>

          <div className="ig-msg__list">
            {loading ? <div className="ig-msg__empty">Đang tải cuộc trò chuyện...</div> : null}
            {!loading && !conversations.length ? <div className="ig-msg__empty">Chưa có đoạn chat nào. Hãy tìm người dùng để bắt đầu.</div> : null}
            {conversations.map((item) => (
              <button key={item.id} type="button" className={`ig-msg__item ${item.id === activeId ? 'is-selected' : ''}`} onClick={() => setActiveId(item.id)}>
                <img className="ig-msg__avatar" src={avatarOf(item.peer)} alt={item.peer.username} />
                <div className="ig-msg__itemMid">
                  <div className="ig-msg__itemTitle"><span className="ig-msg__itemName">{item.nickname?.trim() || item.peer.username}</span></div>
                  <div className="ig-msg__itemSub">
                    <span className="ig-msg__itemLast">{item.lastMessageText || 'Hãy bắt đầu cuộc trò chuyện'}</span>
                    {item.lastMessageAt ? <><span className="ig-msg__sep">·</span><span className="ig-msg__itemTime">{formatConversationTime(item.lastMessageAt)}</span></> : null}
                  </div>
                </div>
                {item.unreadCount > 0 ? <span className="ig-msg__count">{item.unreadCount}</span> : null}
              </button>
            ))}
          </div>
        </aside>

        <section className="ig-msg__right">
          {activeConversation ? (
            <>
              <div className="ig-msg__rightTop">
                <div className="ig-msg__peer">
                  <img className="ig-msg__peerAvatar" src={avatarOf(activeConversation.peer)} alt={activeConversation.peer.username} />
                  <div className="ig-msg__peerMeta">
                    <div className="ig-msg__peerName">{displayPeerName}</div>
                    <div className="ig-msg__peerUser">{activeConversation.peer.bio || 'Instagram User'}</div>
                  </div>
                </div>
                <div className="ig-msg__actions">
                  <button className="ig-msg__iconBtn" type="button">📞</button>
                  <button className="ig-msg__iconBtn" type="button">📹</button>
                  <button className="ig-msg__iconBtn" type="button" onClick={() => setIsDetailOpen((prev) => !prev)} aria-pressed={isDetailOpen}>ⓘ</button>
                </div>
              </div>

              <div className="ig-msg__mainShell">
                <div className="ig-msg__mainCol">
                  <div className="ig-msg__contentScroll" ref={contentScrollRef}>
                    <div className="ig-msg__hero">
                      <img className="ig-msg__heroAvatar" src={avatarOf(activeConversation.peer)} alt={activeConversation.peer.username} />
                      <div className="ig-msg__heroName">{displayPeerName}</div>
                      <div className="ig-msg__heroUser">{activeConversation.peer.bio || 'Instagram'}</div>
                      <button className="ig-msg__profileBtn" type="button" onClick={() => navigate(`/profile/${activeConversation.peer.username}`)}>View profile</button>
                    </div>

                    <div className="ig-msg__body">
                      {detailLoading ? <div className="ig-msg__empty">Đang tải tin nhắn...</div> : null}
                      {!detailLoading && !activeMessages.length ? <div className="ig-msg__empty">Chưa có tin nhắn nào.</div> : null}
                      {activeMessages.map((message, index) => {
                        const fromMe = message.senderUsername === state.username
                        const showInlineTime = shouldShowInlineTime(activeMessages, index)
                        const showCenterTime = shouldShowCenterTime(activeMessages, index)
                        const showActions = hoveredMessageId === message.id
                        return (
                          <div key={message.id}>
                            {showCenterTime ? <div className="ig-msg__centerTime">{formatTime(message.createdAt)}</div> : null}
                            <div className={`ig-msg__row ${fromMe ? 'is-me' : 'is-them'}`} onMouseEnter={() => setHoveredMessageId(message.id)} onMouseLeave={() => setHoveredMessageId((prev) => (prev === message.id ? '' : prev))}>
                              {!fromMe ? <img className="ig-msg__bubbleAvatar" src={avatarOf(activeConversation.peer)} alt="" /> : null}
                              <div className="ig-msg__bubbleWrap">
                                <div className={`ig-msg__messageCard ${fromMe ? 'is-me' : 'is-them'}`}>
                                  {showActions ? (
                                    <div className={`ig-msg__hoverTools ${fromMe ? 'is-me' : 'is-them'}`}>
                                      <button className="ig-msg__tinyIcon" type="button" onClick={() => setReplyTo(message)} title="Trả lời">↩</button>
                                      <button className="ig-msg__tinyIcon" type="button" onClick={() => void toggleMessageHeart(message)} title="Thả tim">☺</button>
                                    </div>
                                  ) : null}
                                  {message.replyToMessageId ? (
                                    <div className="ig-msg__replyBlock">
                                      <div className="ig-msg__replyAuthor">{message.replyToSenderUsername || 'Tin nhắn gốc'}</div>
                                      <div className="ig-msg__replyText">{message.replyToType === 'text' ? (message.replyToText || 'Tin nhắn') : message.replyToType === 'image' ? 'Ảnh' : 'Video'}</div>
                                    </div>
                                  ) : null}
                                  <div className={`ig-msg__bubble ${fromMe ? 'is-me' : 'is-them'}`}>
                                    {message.text ? <div className="ig-msg__bubbleText">{message.text}</div> : null}
                                    <MessageMedia message={message} />
                                  </div>
                                  {message.heartCount ? <div className="ig-msg__messageHeart">❤️</div> : null}
                                </div>
                                {showInlineTime && !showCenterTime ? <div className="ig-msg__time">{formatTime(message.createdAt)}</div> : null}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="ig-msg__composerWrap">
                    {replyTo ? (
                      <div className="ig-msg__replyComposer">
                        <div>
                          <div className="ig-msg__replyComposerLabel">Đang trả lời {replyTo.senderUsername === state.username ? 'chính bạn' : replyTo.senderUsername}</div>
                          <div className="ig-msg__replyComposerText">{replyTo.type === 'text' ? (replyTo.text || 'Tin nhắn') : replyTo.type === 'image' ? 'Ảnh' : 'Video'}</div>
                        </div>
                        <button className="ig-msg__tinyIcon" type="button" onClick={() => setReplyTo(null)}>×</button>
                      </div>
                    ) : null}
                    {mediaFile && mediaPreviewUrl ? (
                      <div className="ig-msg__pendingMediaBox">
                        {mediaFile.type.startsWith('video/') ? <video className="ig-msg__pendingMedia" src={mediaPreviewUrl} controls playsInline /> : <img className="ig-msg__pendingMedia" src={mediaPreviewUrl} alt="pending media" />}
                        <button className="ig-msg__tinyIcon ig-msg__pendingRemove" type="button" onClick={() => { setMediaFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}>×</button>
                      </div>
                    ) : null}
                    {isBlocked ? <div className="ig-msg__blockedHint">Bạn đã chặn người dùng này. Hãy bỏ chặn để tiếp tục nhắn tin.</div> : null}
                    <div className="ig-msg__composer">
                      <button className="ig-msg__emoji" type="button">☺</button>
                      <input
                        className="ig-msg__input"
                        placeholder={isBlocked ? 'Đã chặn người dùng' : 'Message...'}
                        value={text}
                        disabled={isBlocked}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void handleSend()
                          }
                        }}
                      />
                      <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={(e) => setMediaFile(e.target.files?.[0] || null)} />
                      <div className="ig-msg__composerActions">
                        <button className="ig-msg__iconBtn" type="button">🎤</button>
                        <button className="ig-msg__iconBtn" type="button" onClick={() => fileInputRef.current?.click()}>🖼</button>
                        <button className="ig-msg__iconBtn" type="button" onClick={() => void handleSend()} disabled={sending || (!text.trim() && !mediaFile) || isBlocked}>{sending ? '...' : '➤'}</button>
                      </div>
                    </div>
                  </div>
                </div>

                {isDetailOpen ? (
                  <aside className="ig-msg__detail">
                    <div className="ig-msg__detailTitle">Chi tiết</div>
                    <div className="ig-msg__detailCard">
                      <img className="ig-msg__detailAvatar" src={avatarOf(activeConversation.peer)} alt={activeConversation.peer.username} />
                      <div>
                        <div className="ig-msg__detailName">{activeConversation.peer.username}</div>
                        <div className="ig-msg__detailSub">{activeConversation.peer.bio || 'Instagram User'}</div>
                      </div>
                    </div>

                    <label className="ig-msg__field">
                      <span className="ig-msg__fieldLabel">Biệt danh</span>
                      <div className="ig-msg__fieldRow">
                        <input className="ig-msg__fieldInput" value={nicknameDraft} onChange={(e) => setNicknameDraft(e.target.value)} placeholder="Nhập biệt danh" />
                        <button type="button" className="ig-msg__fieldBtn" onClick={() => void saveNickname()} disabled={savingDetail}>Lưu</button>
                      </div>
                    </label>

                    <button type="button" className="ig-msg__detailAction" onClick={() => void toggleBlock()} disabled={savingDetail}>{isBlocked ? 'Bỏ chặn người dùng' : 'Chặn người dùng'}</button>
                    <button type="button" className="ig-msg__detailDanger" onClick={() => void clearHistory()} disabled={savingDetail}>Xóa lịch sử đoạn chat</button>
                  </aside>
                ) : null}
              </div>
            </>
          ) : <div className="ig-msg__blank">Chọn một cuộc trò chuyện để bắt đầu nhắn tin.</div>}
          {error ? <div className="ig-msg__error">{error}</div> : null}
        </section>
      </div>
    </div>
  )
}
