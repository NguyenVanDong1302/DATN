import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../state/store'
import { useSocket } from '../../state/socket'
import { useMessagesApi } from '../../features/messages/messages.api'
import { joinConversation, leaveConversation, markConversationReadRealtime } from '../../features/messages/messages.socket'
import type { ChatMessage, ChatMessageMediaItem, ConversationItem, ConversationSettings, DeletedMessageEvent, MessageUser, SearchUsersResponse } from '../../features/messages/messages.types'
import './Messages.scss'

const TIME_SEPARATOR_MS = 10 * 60 * 1000
const MAX_MESSAGE_MEDIA_FILES = 10
const MAX_MESSAGE_VIDEO_BYTES = 15 * 1024 * 1024
const MESSAGE_REACTIONS = ['\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F621}', '\u{1F44D}'] as const

type PendingMediaItem = {
  id: string
  file: File
  previewUrl: string
  type: 'image' | 'video'
}

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

function sortConversationsByLastMessage(items: ConversationItem[]) {
  return [...items].sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())
}

function avatarOf(user?: Pick<MessageUser, 'avatarUrl' | 'username'> | null) {
  if (user?.avatarUrl) return user.avatarUrl
  const seed = encodeURIComponent(user?.username || 'instagram_user')
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${seed}`
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

function getMessageMediaItems(message: ChatMessage): ChatMessageMediaItem[] {
  if (Array.isArray(message.mediaItems) && message.mediaItems.length) {
    return message.mediaItems.filter((item) => Boolean(item?.mediaUrl))
  }
  if (!message.mediaUrl) return []
  return [{
    type: message.type === 'video' ? 'video' : 'image',
    mediaUrl: message.mediaUrl,
    thumbnailUrl: message.thumbnailUrl,
    fileName: message.fileName,
    mimeType: message.mimeType,
    durationSec: message.durationSec,
  }]
}

function getMessageReactionDisplay(message: ChatMessage) {
  const summary = message.reactionSummary || []
  if (!summary.length) return ''
  const emojis = summary.slice(0, 3).map((item) => item.emoji).join(' ')
  const count = Number(message.reactionCount || summary.reduce((total, item) => total + Number(item.count || 0), 0))
  return count > 1 ? `${emojis} ${count}` : emojis
}

function buildMessagePreview(message: ChatMessage) {
  const mediaItems = getMessageMediaItems(message)
  if (mediaItems.length === 1) return mediaItems[0].type === 'video' ? 'Da gui 1 video' : 'Da gui 1 anh'
  if (mediaItems.length > 1) {
    const videoCount = mediaItems.filter((item) => item.type === 'video').length
    const imageCount = mediaItems.length - videoCount
    if (videoCount === mediaItems.length) return `Da gui ${videoCount} video`
    if (imageCount === mediaItems.length) return `Da gui ${imageCount} anh`
    return `Da gui ${mediaItems.length} tep`
  }
  return message.text
}

function RichMessageMedia({ message }: { message: ChatMessage }) {
  const mediaItems = getMessageMediaItems(message)
  if (!mediaItems.length) return null

  if (mediaItems.length === 1) {
    const item = mediaItems[0]
    return item.type === 'video' ? (
      <video className="ig-msg__media" src={item.mediaUrl} controls playsInline />
    ) : (
      <img className="ig-msg__media" src={item.mediaUrl} alt={item.fileName || 'message media'} />
    )
  }

  return (
    <div className="ig-msg__mediaGrid">
      {mediaItems.map((item, index) => (
        item.type === 'video' ? (
          <video key={`${item.mediaUrl}-${index}`} className="ig-msg__mediaGridItem" src={item.mediaUrl} controls playsInline />
        ) : (
          <img key={`${item.mediaUrl}-${index}`} className="ig-msg__mediaGridItem" src={item.mediaUrl} alt={item.fileName || `message media ${index + 1}`} />
        )
      ))}
    </div>
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
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState('')
  const [actionMenuMessageId, setActionMenuMessageId] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [mediaFiles, setMediaFiles] = useState<PendingMediaItem[]>([])
  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingMediaRef = useRef<PendingMediaItem[]>([])

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || null, [conversations, activeId])
  const activeMessages = useMemo(() => messagesByConversation[activeId] || [], [messagesByConversation, activeId])
  const displayPeerName = activeConversation?.nickname?.trim() || activeConversation?.peer.username || ''
  const isBlocked = Boolean(settings?.isBlocked || activeConversation?.isBlocked)

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

  useEffect(() => {
    pendingMediaRef.current = mediaFiles
  }, [mediaFiles])

  useEffect(() => () => {
    for (const item of pendingMediaRef.current) URL.revokeObjectURL(item.previewUrl)
  }, [])

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
      const element = event.target as Element | null
      if (element?.closest('[data-msg-flyout="true"]')) return
      if (searchRef.current && target && !searchRef.current.contains(target)) setIsSearchOpen(false)
      setReactionPickerMessageId('')
      setActionMenuMessageId('')
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
    setReactionPickerMessageId('')
    setActionMenuMessageId('')
  }, [activeId])

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
            lastMessageText: buildMessagePreview(message),
            lastMessageAt: message.createdAt,
            unreadCount: shouldIncrease ? item.unreadCount + 1 : 0,
          }
        })
        return sortConversationsByLastMessage(next)
      })
    }

    const onMessageReaction = (message: ChatMessage) => {
      setMessagesByConversation((prev) => ({
        ...prev,
        [message.conversationId]: (prev[message.conversationId] || []).map((item) => (item.id === message.id ? { ...item, ...message } : item)),
      }))
    }

    const onMessageDeleted = (payload: DeletedMessageEvent) => {
      applyDeletedMessage(payload)
    }

    const onConversationUpdated = async ({ conversationId }: { conversationId?: string } = {}) => {
      if (!conversationId) return
      try {
        const [detail, detailSettings] = await Promise.all([api.getConversation(conversationId), api.getSettings(conversationId)])
        setConversations((prev) => sortConversationsByLastMessage(prev.map((item) => (item.id === conversationId ? { ...item, ...detail, nickname: detailSettings.nickname, isBlocked: detailSettings.isBlocked } : item))))
        if (conversationId === activeId) {
          setSettings(detailSettings)
          setNicknameDraft(detailSettings.nickname || '')
        }
      } catch {}
    }

    const onInboxRefresh = async () => {
      try {
        const items = await api.getConversations()
        setConversations(items)
        if (!activeId && items[0]?.id) setActiveId(items[0].id)
      } catch {}
    }

    const onHistoryCleared = ({ conversationId }: { conversationId?: string } = {}) => {
      if (!conversationId) return
      setMessagesByConversation((prev) => ({ ...prev, [conversationId]: [] }))
      setConversations((prev) => sortConversationsByLastMessage(prev.map((item) => (item.id === conversationId ? { ...item, lastMessageText: '', lastMessageAt: null, unreadCount: 0 } : item))))
    }

    socket.on('message:new', onMessageNew)
    socket.on('message:reaction', onMessageReaction)
    socket.on('message:deleted', onMessageDeleted)
    socket.on('inbox:refresh', onInboxRefresh)
    socket.on('conversation:updated', onConversationUpdated)
    socket.on('conversation:history-cleared', onHistoryCleared)

    return () => {
      socket.off('message:new', onMessageNew)
      socket.off('message:reaction', onMessageReaction)
      socket.off('message:deleted', onMessageDeleted)
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
        return sortConversationsByLastMessage(existed ? prev.map((item) => (item.id === conversation.id ? { ...item, ...conversation } : item)) : [conversation, ...prev])
      })
      setActiveId(conversation.id)
      setIsSearchOpen(false)
      setQuery('')
    } catch (err: any) {
      setError(err?.message || 'Không thể mở đoạn chat')
    }
  }

  const clearPendingMedia = () => {
    setMediaFiles((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.previewUrl)
      return []
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removePendingMedia = (id: string) => {
    setMediaFiles((prev) => prev.filter((item) => {
      if (item.id === id) {
        URL.revokeObjectURL(item.previewUrl)
        return false
      }
      return true
    }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const appendPendingFiles = (fileList?: FileList | null) => {
    const selected = Array.from(fileList || [])
    if (!selected.length) return

    let nextError = ''
    setMediaFiles((prev) => {
      const next = [...prev]
      for (const file of selected) {
        const isImage = file.type.startsWith('image/')
        const isVideo = file.type.startsWith('video/')

        if (!isImage && !isVideo) {
          nextError = 'Chỉ hỗ trợ ảnh hoặc video trong tin nhắn'
          continue
        }

        if (isVideo && file.size > MAX_MESSAGE_VIDEO_BYTES) {
          nextError = 'Mỗi video trong tin nhắn chỉ được tối đa 15MB'
          continue
        }

        if (next.length >= MAX_MESSAGE_MEDIA_FILES) {
          nextError = `Chỉ được chọn tối đa ${MAX_MESSAGE_MEDIA_FILES} ảnh/video mỗi lần`
          break
        }

        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          type: isVideo ? 'video' : 'image',
        })
      }
      return next
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
    setError(nextError)
  }

  const applyDeletedMessage = (payload: DeletedMessageEvent) => {
    if (!payload?.conversationId || !payload?.messageId) return
    setMessagesByConversation((prev) => ({
      ...prev,
      [payload.conversationId]: (prev[payload.conversationId] || []).filter((item) => item.id !== payload.messageId),
    }))
    setConversations((prev) => sortConversationsByLastMessage(prev.map((item) => (
      item.id === payload.conversationId
        ? {
            ...item,
            lastMessageText: payload.lastMessageText || '',
            lastMessageAt: payload.lastMessageAt || null,
          }
        : item
    ))))
    setReplyTo((prev) => (prev?.id === payload.messageId ? null : prev))
    setReactionPickerMessageId((prev) => (prev === payload.messageId ? '' : prev))
    setActionMenuMessageId((prev) => (prev === payload.messageId ? '' : prev))
  }

  const handleSend = async () => {
    if (!activeId || sending || isBlocked) return
    const value = text.trim()
    if (!value && !mediaFiles.length) return
    setSending(true)
    setError('')
    try {
      const message = await api.sendMessageHttp(activeId, { text: value, media: mediaFiles.map((item) => item.file), replyToMessageId: replyTo?.id || null })
      setMessagesByConversation((prev) => {
        const arr = prev[activeId] || []
        return arr.some((item) => item.id === message.id) ? prev : { ...prev, [activeId]: [...arr, message] }
      })
      setConversations((prev) => sortConversationsByLastMessage(prev.map((item) => (item.id === activeId ? { ...item, lastMessageText: buildMessagePreview(message), lastMessageAt: message.createdAt } : item))))
      setText('')
      setReplyTo(null)
      clearPendingMedia()
    } catch (err: any) {
      setError(err?.message || 'Gửi tin nhắn thất bại')
    } finally {
      setSending(false)
    }
  }

  const setMessageReaction = async (message: ChatMessage, emoji: string) => {
    if (!activeId) return
    try {
      const next = message.myReaction === emoji
        ? await api.removeMessageReaction(activeId, message.id)
        : await api.setMessageReaction(activeId, message.id, emoji)
      setMessagesByConversation((prev) => ({
        ...prev,
        [activeId]: (prev[activeId] || []).map((item) => (item.id === message.id ? { ...item, ...next } : item)),
      }))
      setReactionPickerMessageId('')
    } catch (err: any) {
      setError(err?.message || 'Không thể bày tỏ cảm xúc')
    }
  }

  const revokeMessage = async (message: ChatMessage) => {
    if (!activeId) return
    const ok = window.confirm('Thu hồi tin nhắn này?')
    if (!ok) return
    try {
      const payload = await api.deleteMessage(activeId, message.id)
      applyDeletedMessage(payload)
      setActionMenuMessageId('')
    } catch (err: any) {
      setError(err?.message || 'Không thể thu hồi tin nhắn')
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
      setConversations((prev) => sortConversationsByLastMessage(prev.map((item) => (item.id === activeId ? { ...item, lastMessageText: '', lastMessageAt: null, unreadCount: 0 } : item))))
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
                        const showCenterTime = shouldShowCenterTime(activeMessages, index)
                        const showActions = hoveredMessageId === message.id
                        const hasText = Boolean(message.text)
                        const hasMedia = getMessageMediaItems(message).length > 0
                        const reactionDisplay = getMessageReactionDisplay(message)
                        return (
                          <div key={message.id}>
                            {showCenterTime ? <div className="ig-msg__centerTime">{formatTime(message.createdAt)}</div> : null}
                            <div className={`ig-msg__row ${fromMe ? 'is-me' : 'is-them'}`} onMouseEnter={() => setHoveredMessageId(message.id)} onMouseLeave={() => setHoveredMessageId((prev) => (prev === message.id ? '' : prev))}>
                              {!fromMe ? <img className="ig-msg__bubbleAvatar" src={avatarOf(activeConversation.peer)} alt="" /> : null}
                              <div className="ig-msg__bubbleWrap">
                                <div className={`ig-msg__messageCard ${fromMe ? 'is-me' : 'is-them'}`}>
                                  {(showActions || reactionPickerMessageId === message.id || actionMenuMessageId === message.id) ? (
                                    <div className={`ig-msg__hoverTools ${fromMe ? 'is-me' : 'is-them'}`}>
                                      <button className="ig-msg__tinyIcon" type="button" onClick={() => setReplyTo(message)} title="Trả lời">↩</button>
                                      <button
                                        className="ig-msg__tinyIcon"
                                        type="button"
                                        title="Bày tỏ cảm xúc"
                                        data-msg-flyout="true"
                                        onClick={() => {
                                          setActionMenuMessageId('')
                                          setReactionPickerMessageId((prev) => (prev === message.id ? '' : message.id))
                                        }}
                                      >
                                        ☺
                                      </button>
                                      {fromMe ? (
                                        <button
                                          className="ig-msg__tinyIcon"
                                          type="button"
                                          title="Tùy chọn"
                                          data-msg-flyout="true"
                                          onClick={() => {
                                            setReactionPickerMessageId('')
                                            setActionMenuMessageId((prev) => (prev === message.id ? '' : message.id))
                                          }}
                                        >
                                          ⋯
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {reactionPickerMessageId === message.id ? (
                                    <div className={`ig-msg__reactionPicker ${fromMe ? 'is-me' : 'is-them'}`} data-msg-flyout="true">
                                      {MESSAGE_REACTIONS.map((emoji) => (
                                        <button key={emoji} className={`ig-msg__reactionOption ${message.myReaction === emoji ? 'is-active' : ''}`} type="button" onClick={() => void setMessageReaction(message, emoji)}>
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                  {actionMenuMessageId === message.id && fromMe ? (
                                    <div className={`ig-msg__messageMenu ${fromMe ? 'is-me' : 'is-them'}`} data-msg-flyout="true">
                                      <button className="ig-msg__messageMenuItem is-danger" type="button" onClick={() => void revokeMessage(message)}>Thu hồi</button>
                                    </div>
                                  ) : null}
                                  {message.replyToMessageId ? (
                                    <div className="ig-msg__replyBlock">
                                      <div className="ig-msg__replyAuthor">{message.replyToSenderUsername || 'Tin nhắn gốc'}</div>
                                      <div className="ig-msg__replyText">{message.replyToType === 'text' ? (message.replyToText || 'Tin nhắn') : message.replyToType === 'image' ? 'Ảnh' : 'Video'}</div>
                                    </div>
                                  ) : null}
                                  <div className={`ig-msg__messageStack ${fromMe ? 'is-me' : 'is-them'}`}>
                                    {hasText ? (
                                      <div className={`ig-msg__bubble ${fromMe ? 'is-me' : 'is-them'}`}>
                                        <div className="ig-msg__bubbleText">{message.text}</div>
                                      </div>
                                    ) : null}
                                    {hasMedia ? <RichMessageMedia message={message} /> : null}
                                  </div>
                                  {reactionDisplay ? <div className="ig-msg__messageReaction">{reactionDisplay}</div> : null}
                                </div>
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
                    {mediaFiles.length ? (
                      <div className="ig-msg__pendingMediaList">
                        {mediaFiles.map((item) => (
                          <div key={item.id} className="ig-msg__pendingMediaBox">
                            {item.type === 'video' ? <video className="ig-msg__pendingMedia" src={item.previewUrl} muted playsInline /> : <img className="ig-msg__pendingMedia" src={item.previewUrl} alt={item.file.name || 'pending media'} />}
                            <button className="ig-msg__tinyIcon ig-msg__pendingRemove" type="button" onClick={() => removePendingMedia(item.id)}>×</button>
                          </div>
                        ))}
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
                        onPaste={(e) => {
                          const files = e.clipboardData.files
                          if (!files?.length) return
                          e.preventDefault()
                          appendPendingFiles(files)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void handleSend()
                          }
                        }}
                      />
                      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => appendPendingFiles(e.target.files)} />
                      <div className="ig-msg__composerActions">
                        <button className="ig-msg__iconBtn" type="button">🎤</button>
                        <button className="ig-msg__iconBtn" type="button" onClick={() => fileInputRef.current?.click()}>🖼</button>
                        <button className="ig-msg__iconBtn" type="button" onClick={() => void handleSend()} disabled={sending || (!text.trim() && !mediaFiles.length) || isBlocked}>{sending ? '...' : '➤'}</button>
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
