import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../state/store'
import { useSocket } from '../../state/socket'
import { useMessagesApi } from '../../features/messages/messages.api'
import { joinConversation, leaveConversation, markConversationReadRealtime, sendRealtimeMessage } from '../../features/messages/messages.socket'
import type { ChatMessage, ConversationItem, MessageUser, SearchUsersResponse } from '../../features/messages/messages.types'
import './Messages.scss'

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

export default function MessagesPage() {
  const api = useMessagesApi()
  const { state } = useAppStore()
  const { socket } = useSocket()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({})
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUsersResponse>({ following: [], suggested: [] })
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) || null,
    [conversations, activeId],
  )

  const activeMessages = useMemo(
    () => messagesByConversation[activeId] || [],
    [messagesByConversation, activeId],
  )

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
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!query.trim()) {
      setSearchResults({ following: [], suggested: [] })
      return
    }

    const timer = window.setTimeout(async () => {
      try {
        const data = await api.searchUsers(query)
        if (!cancelled) setSearchResults(data)
      } catch {
        if (!cancelled) setSearchResults({ following: [], suggested: [] })
      }
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    if (!activeId) return
    let mounted = true

    ;(async () => {
      try {
        const items = await api.getMessages(activeId)
        if (!mounted) return
        setMessagesByConversation((prev) => ({ ...prev, [activeId]: items }))
        setConversations((prev) => prev.map((item) => (item.id === activeId ? { ...item, unreadCount: 0 } : item)))
        await api.markRead(activeId)
        markConversationReadRealtime(socket, activeId)
      } catch (err: any) {
        if (mounted) setError(err?.message || 'Không tải được tin nhắn')
      }
    })()

    return () => {
      mounted = false
    }
  }, [activeId, socket])

  useEffect(() => {
    socket?.emit('presence:update', { screen: 'messages', activeConversationId: activeId || '' })
    if (!socket || !activeId) return
    joinConversation(socket, activeId)
    return () => {
      leaveConversation(socket, activeId)
    }
  }, [socket, activeId])

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [activeMessages.length, activeId])

  useEffect(() => {
    if (!socket) return

    const onMessageNew = (message: ChatMessage) => {
      setMessagesByConversation((prev) => {
        const arr = prev[message.conversationId] ? [...prev[message.conversationId]] : []
        if (!arr.some((item) => item.id === message.id)) arr.push(message)
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
            lastMessageText: message.text,
            lastMessageAt: message.createdAt,
            unreadCount: shouldIncrease ? item.unreadCount + 1 : 0,
          }
        })
        return [...next].sort((a, b) => (new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()))
      })
    }

    const onInboxRefresh = async () => {
      const items = await api.getConversations()
      setConversations(items)
      if (!activeId && items[0]?.id) setActiveId(items[0].id)
    }

    socket.on('message:new', onMessageNew)
    socket.on('inbox:refresh', onInboxRefresh)
    socket.on('conversation:updated', onInboxRefresh)

    return () => {
      socket.off('message:new', onMessageNew)
      socket.off('inbox:refresh', onInboxRefresh)
      socket.off('conversation:updated', onInboxRefresh)
    }
  }, [socket, activeId, state.username])

  const handlePickUser = async (user: MessageUser) => {
    try {
      const conversation = await api.createDirectConversation(user.id)
      setConversations((prev) => {
        const existed = prev.some((item) => item.id === conversation.id)
        const next = existed ? prev.map((item) => (item.id === conversation.id ? { ...item, ...conversation } : item)) : [conversation, ...prev]
        return next
      })
      setActiveId(conversation.id)
      setIsSearchOpen(false)
      setQuery('')
      const items = await api.getMessages(conversation.id)
      setMessagesByConversation((prev) => ({ ...prev, [conversation.id]: items }))
    } catch (err: any) {
      setError(err?.message || 'Không thể mở đoạn chat')
    }
  }

  const handleSend = async () => {
    const value = text.trim()
    if (!value || !activeId || sending) return
    setSending(true)
    setError('')

    try {
      const ack: any = await sendRealtimeMessage(socket, activeId, value)
      if (!ack?.ok) {
        const fallback = await api.sendMessageHttp(activeId, value)
        setMessagesByConversation((prev) => ({ ...prev, [activeId]: [...(prev[activeId] || []), fallback] }))
      }
      setText('')
    } catch (err: any) {
      setError(err?.message || 'Gửi tin nhắn thất bại')
    } finally {
      setSending(false)
    }
  }

  const renderSearchGroup = (label: string, items: MessageUser[]) => {
    if (!items.length) return null
    return (
      <div className="ig-msg__searchGroup">
        <div className="ig-msg__searchHeading">{label}</div>
        {items.map((user) => (
          <button key={user.id} type="button" className="ig-msg__searchItem" onClick={() => handlePickUser(user)}>
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
      <div className="ig-msg__wrap">
        <aside className="ig-msg__left">
          <div className="ig-msg__leftTop">
            <button className="ig-msg__userBtn" type="button">
              <span className="ig-msg__userName">{state.username || 'instagram_user'}</span>
              <span className="ig-msg__chev">▾</span>
            </button>
            <button className="ig-msg__compose" type="button">✎</button>
          </div>

          <div className="ig-msg__searchWrap">
            <div className="ig-msg__search">
              <span className="ig-msg__searchIcon">⌕</span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setIsSearchOpen(true)
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Tìm kiếm"
                className="ig-msg__searchInput"
              />
            </div>

            {isSearchOpen && query.trim() ? (
              <div className="ig-msg__searchDropdown">
                {renderSearchGroup('Đang follow', searchResults.following)}
                {renderSearchGroup('Đề xuất', searchResults.suggested)}
                {!searchResults.following.length && !searchResults.suggested.length ? <div className="ig-msg__searchEmpty">Không tìm thấy người dùng phù hợp.</div> : null}
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
                  <div className="ig-msg__itemTitle">
                    <span className="ig-msg__itemName">{item.peer.username}</span>
                  </div>
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
                    <div className="ig-msg__peerName">{activeConversation.peer.username}</div>
                    <div className="ig-msg__peerUser">{activeConversation.peer.bio || 'Instagram User'}</div>
                  </div>
                </div>
                <div className="ig-msg__actions">
                  <button className="ig-msg__iconBtn" type="button">📞</button>
                  <button className="ig-msg__iconBtn" type="button">📹</button>
                  <button className="ig-msg__iconBtn" type="button">ⓘ</button>
                </div>
              </div>

              <div className="ig-msg__hero">
                <img className="ig-msg__heroAvatar" src={avatarOf(activeConversation.peer)} alt={activeConversation.peer.username} />
                <div className="ig-msg__heroName">{activeConversation.peer.username}</div>
                <div className="ig-msg__heroUser">{activeConversation.peer.bio || 'Instagram'}</div>
                <button className="ig-msg__profileBtn" type="button">View profile</button>
              </div>

              <div className="ig-msg__body" ref={bodyRef}>
                {activeMessages.map((message) => {
                  const fromMe = message.senderUsername === state.username
                  return (
                    <div key={message.id} className={`ig-msg__row ${fromMe ? 'is-me' : 'is-them'}`}>
                      {!fromMe ? <img className="ig-msg__bubbleAvatar" src={avatarOf(activeConversation.peer)} alt="" /> : null}
                      <div className="ig-msg__bubbleWrap">
                        <div className={`ig-msg__bubble ${fromMe ? 'is-me' : 'is-them'}`}>{message.text}</div>
                        <div className="ig-msg__time">{formatTime(message.createdAt)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="ig-msg__composer">
                <button className="ig-msg__emoji" type="button">☺</button>
                <input
                  className="ig-msg__input"
                  placeholder="Message..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                />
                <div className="ig-msg__composerActions">
                  <button className="ig-msg__iconBtn" type="button">🎤</button>
                  <button className="ig-msg__iconBtn" type="button">🖼</button>
                  <button className="ig-msg__iconBtn" type="button" onClick={() => void handleSend()} disabled={sending || !text.trim()}>
                    {sending ? '...' : '➤'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="ig-msg__blank">Chọn một cuộc trò chuyện để bắt đầu nhắn tin.</div>
          )}
          {error ? <div className="ig-msg__error">{error}</div> : null}
        </section>
      </div>
    </div>
  )
}
