import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, Paperclip, Send } from 'lucide-react';
import { apiRequest, formatDate } from '../lib/api';
import type { AuthUser, ChatMessage, ConversationThread, NotificationItem } from '../types';

interface MessagingCenterProps {
  user: AuthUser;
  onToast: (msg: string) => void;
  onNavigate?: (path: string) => void;
}

export const MessagingCenter: React.FC<MessagingCenterProps> = ({ user, onToast, onNavigate }) => {
  const [tab, setTab] = useState<'messages' | 'notifications'>('messages');
  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [draft, setDraft] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [sending, setSending] = useState(false);

  const loadConversations = async () => {
    try {
      const res = await apiRequest<{ conversations: ConversationThread[] }>('/conversations');
      setConversations(res.conversations);
      if (!activeConvId && res.conversations.length > 0) {
        setActiveConvId(res.conversations[0].id);
      }
    } catch {
      // ignore
    }
  };

  const loadNotifications = async () => {
    try {
      const res = await apiRequest<{ notifications: NotificationItem[] }>('/notifications');
      setNotifications(res.notifications);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadConversations();
    loadNotifications();
  }, []);

  useEffect(() => {
    if (!activeConvId) return;
    apiRequest<{ messages: ChatMessage[] }>(`/conversations/${activeConvId}/messages`)
      .then((res) => setMessages(res.messages))
      .catch(() => {});
  }, [activeConvId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConvId || !draft.trim()) return;
    setSending(true);
    try {
      await apiRequest(`/conversations/${activeConvId}/messages`, {
        method: 'POST',
        body: {
          body: draft.trim(),
          attachmentName: attachmentName.trim() || undefined,
        },
      });
      setDraft('');
      setAttachmentName('');
      const res = await apiRequest<{ messages: ChatMessage[] }>(
        `/conversations/${activeConvId}/messages`,
      );
      setMessages(res.messages);
      loadConversations();
    } catch (err: any) {
      onToast(err.message);
    } finally {
      setSending(false);
    }
  };

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      loadNotifications();
      onToast('All notifications marked as read.');
    } catch (err: any) {
      onToast(err.message);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-semibold text-[#3A2319]">
            Communications & Notifications
          </h2>
          <p className="text-xs text-[#7A5E4B] mt-0.5">
            RFQ clarifications, quotation negotiations, and order milestone alerts
          </p>
        </div>

        <div className="flex border border-[#E9DCC7] bg-[#FFFCF6] p-1">
          <button
            type="button"
            onClick={() => setTab('messages')}
            className={`px-4 py-1.5 text-xs font-medium cursor-pointer ${
              tab === 'messages' ? 'bg-[#3A2319] text-[#FFFCF6]' : 'text-[#3A2319]'
            }`}
          >
            Conversation Threads ({conversations.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('notifications')}
            className={`px-4 py-1.5 text-xs font-medium cursor-pointer ${
              tab === 'notifications' ? 'bg-[#3A2319] text-[#FFFCF6]' : 'text-[#3A2319]'
            }`}
          >
            Notifications ({unreadNotifCount} unread)
          </button>
        </div>
      </div>

      {tab === 'messages' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#E9DCC7] bg-[#FFFCF6] min-h-[520px]">
          {/* Thread List */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#E9DCC7] divide-y divide-[#E9DCC7]">
            {conversations.length === 0 ? (
              <div className="p-6 text-xs text-[#7A5E4B]">
                No conversation threads yet. Contact a supplier from any product, RFQ, or quotation
                comparison to start messaging.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveConvId(c.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    activeConvId === c.id ? 'bg-[#F8F3E8]' : 'hover:bg-[#F8F3E8]/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#7A5E4B]">
                    <span className="font-mono">{c.rfqCode || c.poNumber || 'Direct Enquiry'}</span>
                    <span>{formatDate(c.lastMessageAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-[#3A2319] mt-1 truncate">
                    {user.role === 'buyer' ? c.supplierName : c.buyerCompany || c.buyerName}
                  </p>
                  <p className="text-xs text-[#5C4334] truncate mt-0.5">{c.subject}</p>
                  {c.lastMessagePreview && (
                    <p className="text-xs text-[#7A5E4B] line-clamp-1 mt-1.5">
                      {c.lastMessagePreview}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Active Thread */}
          <div className="lg:col-span-8 flex flex-col justify-between">
            {activeConv ? (
              <>
                <div className="p-5 border-b border-[#E9DCC7] bg-[#F8F3E8]/60">
                  <p className="text-xs font-mono text-[#7A5E4B]">
                    {activeConv.rfqCode || activeConv.poNumber || 'Commercial Thread'}
                  </p>
                  <h3 className="font-sans text-base font-semibold text-[#3A2319] mt-0.5">
                    {activeConv.subject}
                  </h3>
                  <p className="text-xs text-[#5C4334] mt-0.5">
                    Buyer: {activeConv.buyerCompany || activeConv.buyerName} · Supplier:{' '}
                    {activeConv.supplierName}
                  </p>
                </div>

                <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[360px]">
                  {messages.map((m) => {
                    const isMine = m.senderId === user.id;
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        <div className="text-[11px] text-[#7A5E4B] mb-1">
                          {m.senderName} ({m.senderRole}) · {formatDate(m.createdAt)}
                        </div>
                        <div
                          className={`max-w-[82%] p-3.5 text-sm leading-relaxed border ${
                            isMine
                              ? 'bg-[#3A2319] text-[#FFFCF6] border-[#3A2319]'
                              : 'bg-[#F8F3E8] text-[#3A2319] border-[#E9DCC7]'
                          }`}
                        >
                          <p>{m.body}</p>
                          {m.attachmentName && (
                            <p className="text-xs mt-2 pt-2 border-t border-current/15 flex items-center gap-1.5 opacity-85">
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>Attachment: {m.attachmentName}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleSend} className="p-4 border-t border-[#E9DCC7] space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write commercial clarification, sample feedback, or dispatch update..."
                      className="flex-1 px-3.5 py-2.5 bg-[#F8F3E8] border border-[#E9DCC7] text-sm"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="px-5 py-2.5 bg-[#B05330] hover:bg-[#964425] text-[#FFFCF6] text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-3.5 h-3.5 text-[#7A5E4B]" />
                    <input
                      type="text"
                      value={attachmentName}
                      onChange={(e) => setAttachmentName(e.target.value)}
                      placeholder="Optional spec filename reference (e.g. lamp-glaze-swatch.pdf)"
                      className="flex-1 bg-transparent text-xs text-[#5C4334] placeholder:text-[#7A5E4B]/70 focus:outline-none"
                    />
                  </div>
                </form>
              </>
            ) : (
              <div className="p-10 text-center text-sm text-[#7A5E4B]">
                Select a conversation thread on the left to inspect messages.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#FFFCF6] border border-[#E9DCC7]">
          <div className="p-4 border-b border-[#E9DCC7] flex items-center justify-between">
            <span className="text-xs font-medium text-[#7A5E4B] flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-[#B05330]" />
              Live Event Notifications (In-App · Email Adapter Simulated)
            </span>
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs text-[#B05330] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark All Read</span>
            </button>
          </div>

          <div className="divide-y divide-[#E9DCC7]">
            {notifications.length === 0 ? (
              <p className="p-8 text-sm text-[#7A5E4B] text-center">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    n.isRead ? 'bg-[#FFFCF6]' : 'bg-[#F8F3E8]'
                  }`}
                >
                  <div>
                    <p className="text-xs font-mono text-[#7A5E4B]">
                      {n.type.replace(/_/g, ' ')} · {formatDate(n.createdAt)}
                      {!n.isRead && ' · Unread'}
                    </p>
                    <p className="text-sm font-semibold text-[#3A2319] mt-0.5">{n.title}</p>
                    <p className="text-xs text-[#5C4334] mt-0.5">{n.message}</p>
                  </div>
                  {n.linkPath && onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate(n.linkPath!)}
                      className="text-xs font-medium text-[#B05330] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
