import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

function buildUserMatchScore(user: MessageUser, rawQuery: string) {
  const query = normalizeText(rawQuery)
  if (!query) return 0

  const username = normalizeText(user.username)
  const email = normalizeText(user.email)
  const bio = normalizeText(user.bio)

  let score = 0
  if (username === query) score += 1200
  if (email === query) score += 1000
  if (username.startsWith(query)) score += 800
  if (email.startsWith(query)) score += 520
  if (bio.startsWith(query)) score += 280
  if (username.includes(query)) score += 360
  if (email.includes(query)) score += 220
  if (bio.includes(query)) score += 120

  return score
}

function sortUsersForSearch(items: MessageUser[], query: string) {
  const normalizedQuery = normalizeText(query)
  return [...items].sort((a, b) => {
    const scoreDiff = buildUserMatchScore(b, normalizedQuery) - buildUserMatchScore(a, normalizedQuery)
    if (scoreDiff !== 0) return scoreDiff

    const aTime = new Date(a.createdAt || 0).getTime()
    const bTime = new Date(b.createdAt || 0).getTime()
    if (aTime !== bTime) return bTime - aTime

    return a.username.localeCompare(b.username, 'vi')
  })
}

export default function MessagesPage() {
  const api = useMessagesApi()
  const { state } = useAppStore()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { socket } = useSocket()
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({})
  const [query, setQuery] = useState('')
  const [allUsers, setAllUsers] = useState<MessageUser[]>([])
  const [followingUsers, setFollowingUsers] = useState<MessageUser[]>([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) || null,
    [conversations, activeId],
  )

  const activeMessages = useMemo(
    () => messagesByConversation[activeId] || [],
    [messagesByConversation, activeId],
  )

  const navigateToProfile = (user?: MessageUser | null) => {
    if (!user?.username) return
    navigate(`/profile/${encodeURIComponent(user.username)}`)
  }

  const searchResults = useMemo<SearchUsersResponse>(() => {
    const followingIdSet = new Set(followingUsers.map((user) => user.id))
    const normalizedQuery = normalizeText(query)

    const matchedUsers = allUsers
      .filter((user) => user.username !== state.username)
      .filter((user) => {
        if (!normalizedQuery) return true
        return buildUserMatchScore(user, normalizedQuery) > 0
      })

    const following = sortUsersForSearch(
      matchedUsers.filter((user) => followingIdSet.has(user.id)),
      normalizedQuery,
    )

    const suggested = sortUsersForSearch(
      matchedUsers.filter((user) => !followingIdSet.has(user.id)),
      normalizedQuery,
    )

    return {
      recent: [],
      following: following.slice(0, 50),
      suggested: suggested.slice(0, 50),
    }
  }, [allUsers, followingUsers, query, state.username])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setDirectoryLoading(true)
        const [items, users, following] = await Promise.all([
          api.getConversations(),
          api.getAllUsers(),
          api.getFollowingUsers(),
        ])
        if (!mounted) return
        setConversations(items)
        setAllUsers(users)
        setFollowingUsers(following)
        const wantedConversationId = searchParams.get('conversation')
        if (wantedConversationId && items.some((item) => item.id === wantedConversationId)) {
          setActiveId(wantedConversationId)
        } else if (items[0]?.id) {
          setActiveId((prev) => prev || items[0].id)
        }
      } catch (err: any) {
        if (!mounted) return
        setError(err?.message || 'Không tải được dữ liệu tin nhắn')
      } finally {
        if (mounted) {
          setLoading(false)
          setDirectoryLoading(false)
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [searchParams])

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (searchRef.current && target && !searchRef.current.contains(target)) {
        setIsSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [])

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
        const optimisticIndex = arr.findIndex((item) => item.id.startsWith('temp-') && item.senderUsername === message.senderUsername && item.text === message.text)
        if (optimisticIndex >= 0) arr.splice(optimisticIndex, 1, message)
        else if (!arr.some((item) => item.id === message.id)) arr.push(message)
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
        return [...next].sort((a, b) => (new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()))
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
    if (!value || !activeId || sending || !activeConversation) return
    setSending(true)
    setError('')

    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversationId: activeId,
      senderId: 'me',
      senderUsername: state.username,
      receiverId: activeConversation.peer.id,
      receiverUsername: activeConversation.peer.username,
      type: 'text',
      text: value,
      status: 'sent',
      seenAt: null,
      createdAt: new Date().toISOString(),
    }

    setMessagesByConversation((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] || []), optimisticMessage],
    }))
    setConversations((prev) =>
      [...prev.map((item) => (item.id === activeId ? { ...item, lastMessageText: value, lastMessageAt: optimisticMessage.createdAt } : item))].sort(
        (a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime(),
      ),
    )
    setText('')

    try {
      const ack: any = await sendRealtimeMessage(socket, activeId, value)
      if (ack?.ok && ack?.data?.message) {
        const delivered = ack.data.message as ChatMessage
        setMessagesByConversation((prev) => ({
          ...prev,
          [activeId]: (prev[activeId] || []).map((item) => (item.id === optimisticMessage.id ? delivered : item)),
        }))
      } else {
        const fallback = await api.sendMessageHttp(activeId, value)
        setMessagesByConversation((prev) => ({
          ...prev,
          [activeId]: (prev[activeId] || []).map((item) => (item.id === optimisticMessage.id ? fallback : item)),
        }))
      }
    } catch (err: any) {
      setMessagesByConversation((prev) => ({
        ...prev,
        [activeId]: (prev[activeId] || []).filter((item) => item.id !== optimisticMessage.id),
      }))
      setText(value)
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
            <button
              className="ig-msg__compose"
              type="button"
              onClick={() => {
                setIsSearchOpen(true)
                window.setTimeout(() => searchInputRef.current?.focus(), 0)
              }}
            >✎</button>
          </div>

          <div className="ig-msg__searchWrap" ref={searchRef}>
            <div className="ig-msg__search">
              <span className="ig-msg__searchIcon">⌕</span>
              <input
                ref={searchInputRef}
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
                {directoryLoading ? <div className="ig-msg__searchEmpty">Đang tải danh sách người dùng...</div> : null}
                {!directoryLoading ? (
                  <>
                    {renderSearchGroup('Đang follow', searchResults.following)}
                    {renderSearchGroup('Đề xuất', searchResults.suggested)}
                    {!searchResults.following.length && !searchResults.suggested.length ? (
                      <div className="ig-msg__searchEmpty">
                        {query.trim() ? 'Không tìm thấy người dùng phù hợp.' : 'Chưa có người dùng để gợi ý.'}
                      </div>
                    ) : null}
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
                <button className="ig-msg__peer" type="button" onClick={() => navigateToProfile(activeConversation.peer)} style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}>
                  <img className="ig-msg__peerAvatar" src={avatarOf(activeConversation.peer)} alt={activeConversation.peer.username} />
                  <div className="ig-msg__peerMeta">
                    <div className="ig-msg__peerName">{activeConversation.peer.username}</div>
                    <div className="ig-msg__peerUser">{activeConversation.peer.bio || 'Instagram User'}</div>
                  </div>
                </button>
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
                <button className="ig-msg__profileBtn" type="button" onClick={() => navigateToProfile(activeConversation.peer)}>View profile</button>
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
