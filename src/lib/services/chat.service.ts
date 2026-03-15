/**
 * ARTMOOD — Chat Service Layer
 *
 * Centralizes all Supabase queries and business logic for the chat widget.
 * Extracted from the monolithic ChatWidget.tsx.
 */

import { createClient } from '@/lib/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ServiceResult<T = void> {
  data?: T;
  error?: string;
  success: boolean;
}

function ok<T>(data?: T): ServiceResult<T> {
  return { success: true, data };
}

function fail(error: string): ServiceResult<never> {
  console.error('[chat-service]', error);
  return { success: false, error };
}

export interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url?: string;
  is_active: boolean;
  last_seen_at?: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_at: string;
  updated_at: string;
  participants: { user_id: string; last_read_at: string; role?: string }[];
  last_message?: Message;
  unread_count: number;
  other_user?: Profile;
  is_archived?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  edited_at?: string;
  is_deleted?: boolean;
  reply_to_id?: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  is_voice?: boolean;
  voice_duration?: number;
  forwarded_from?: string;
  latitude?: number;
  longitude?: number;
  location_name?: string;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
}

const MSG_LIMIT = 50;

// ── Profile Operations ─────────────────────────────────────────────────────

export async function loadProfiles(): Promise<ServiceResult<{ profiles: Profile[]; profilesMap: Record<string, Profile> }>> {
  const supabase = createClient();
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, avatar_url, is_active, last_seen_at');
  if (error) return fail(error.message);
  const profiles = (data || []) as Profile[];
  const profilesMap: Record<string, Profile> = {};
  profiles.forEach(p => { profilesMap[p.id] = p; });
  return ok({ profiles: profiles.filter(p => p.is_active), profilesMap });
}

export async function updateHeartbeat(userId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
}

// ── Conversation Operations ────────────────────────────────────────────────

export async function loadConversations(
  userId: string,
  profilesMap: Record<string, Profile>
): Promise<ServiceResult<{ conversations: Conversation[]; totalUnread: number }>> {
  const supabase = createClient();

  const { data: myParts } = await supabase
    .from('chat_participants')
    .select('conversation_id, last_read_at, archived_at')
    .eq('user_id', userId);

  if (!myParts?.length) return ok({ conversations: [], totalUnread: 0 });

  const convIds = myParts.map(p => p.conversation_id);

  const { data: convs } = await supabase
    .from('chat_conversations')
    .select('id, type, name, created_at, updated_at')
    .in('id', convIds)
    .order('updated_at', { ascending: false });

  if (!convs) return ok({ conversations: [], totalUnread: 0 });

  const { data: allParts } = await supabase
    .from('chat_participants')
    .select('conversation_id, user_id, last_read_at, role')
    .in('conversation_id', convIds);

  let total = 0;
  const convList: Conversation[] = [];

  for (const conv of convs) {
    const participants = (allParts || []).filter(p => p.conversation_id === conv.id);
    const myP = myParts.find(p => p.conversation_id === conv.id);

    const { data: lastMsgs } = await supabase
      .from('chat_messages')
      .select('id, sender_id, content, created_at, is_deleted, file_name, is_voice, latitude')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const lastReadAt = myP?.last_read_at || conv.created_at;
    const { count: unread } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .neq('sender_id', userId)
      .gt('created_at', lastReadAt);

    let otherUser: Profile | undefined;
    if (conv.type === 'direct') {
      const oid = participants.find(p => p.user_id !== userId)?.user_id;
      if (oid) otherUser = profilesMap[oid];
    }

    const u = unread || 0;
    total += u;
    const isArchived = !!myP?.archived_at;
    convList.push({
      ...conv,
      participants,
      last_message: lastMsgs?.[0] as Message | undefined,
      unread_count: u,
      other_user: otherUser,
      is_archived: isArchived,
    });
  }

  return ok({ conversations: convList, totalUnread: total });
}

// ── Message Operations ─────────────────────────────────────────────────────

export async function loadMessages(
  conversationId: string,
  userId: string,
  offset: number = 0
): Promise<ServiceResult<{
  messages: Message[];
  reactions: Record<string, Reaction[]>;
  pinnedMsgIds: Set<string>;
  hasMore: boolean;
}>> {
  const supabase = createClient();

  const { data } = await supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, content, created_at, edited_at, is_deleted, reply_to_id, file_url, file_name, file_type, file_size, is_voice, voice_duration, forwarded_from, latitude, longitude, location_name')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .range(offset, offset + MSG_LIMIT - 1);

  const msgs = ((data as Message[]) || []).reverse();
  const hasMore = msgs.length === MSG_LIMIT;

  // Load reactions
  const reactionsMap: Record<string, Reaction[]> = {};
  if (msgs.length) {
    const mids = msgs.map(m => m.id);
    const { data: reacts } = await supabase
      .from('chat_reactions')
      .select('id, message_id, user_id, emoji')
      .in('message_id', mids);
    if (reacts) {
      reacts.forEach(r => {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = [];
        reactionsMap[r.message_id].push(r as Reaction);
      });
    }
  }

  // Load pinned messages
  const { data: pinned } = await supabase
    .from('chat_pinned_messages')
    .select('message_id')
    .eq('conversation_id', conversationId);

  const pinnedMsgIds = new Set((pinned || []).map(p => p.message_id));

  return ok({ messages: msgs, reactions: reactionsMap, pinnedMsgIds, hasMore });
}

export async function sendMessage(data: {
  conversationId: string;
  senderId: string;
  content: string;
  replyToId?: string;
}): Promise<ServiceResult<void>> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {
    conversation_id: data.conversationId,
    sender_id: data.senderId,
    content: data.content,
  };
  if (data.replyToId) payload.reply_to_id = data.replyToId;

  const { error } = await supabase.from('chat_messages').insert(payload);
  if (error) return fail(error.message);

  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', data.conversationId);

  return ok();
}

export async function editMessage(id: string, content: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  const { error } = await supabase
    .from('chat_messages')
    .update({ content, edited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return fail(error.message);
  return ok();
}

export async function deleteMessage(id: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  const { error } = await supabase
    .from('chat_messages')
    .update({ is_deleted: true, content: '' })
    .eq('id', id);
  if (error) return fail(error.message);
  return ok();
}

export async function handleFileUpload(
  file: File,
  conversationId: string,
  userId: string,
  replyToId?: string,
  contentType?: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  const path = `${userId}/${Date.now()}_${file.name}`;
  const uploadOpts = contentType ? { contentType } : undefined;
  const { error: upErr } = await supabase.storage.from('chat-files').upload(path, file, uploadOpts);
  if (upErr) return fail(upErr.message);

  const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);

  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: userId,
    content: file.name,
    file_url: publicUrl,
    file_name: file.name,
    file_type: file.type || contentType,
    file_size: file.size,
    reply_to_id: replyToId || null,
  });

  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return ok();
}

export async function uploadVoiceMessage(
  blob: Blob,
  conversationId: string,
  userId: string,
  duration: number
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  const path = `${userId}/${Date.now()}_voice.webm`;
  const { error: upErr } = await supabase.storage.from('chat-files').upload(path, blob);
  if (upErr) return fail(upErr.message);

  const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);

  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: userId,
    content: 'Voice message',
    file_url: publicUrl,
    file_name: 'voice.webm',
    file_type: 'audio/webm',
    file_size: blob.size,
    is_voice: true,
    voice_duration: duration,
  });

  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return ok();
}

export async function uploadCapturedPhoto(
  blob: Blob,
  conversationId: string,
  userId: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  const fname = `photo_${Date.now()}.jpg`;
  const path = `${userId}/${fname}`;
  const { error: upErr } = await supabase.storage.from('chat-files').upload(path, blob, { contentType: 'image/jpeg' });
  if (upErr) return fail(upErr.message);

  const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);

  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: userId,
    content: fname,
    file_url: publicUrl,
    file_name: fname,
    file_type: 'image/jpeg',
    file_size: blob.size,
  });

  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return ok();
}

export async function sendLocationMessage(
  conversationId: string,
  userId: string,
  latitude: number,
  longitude: number,
  locationName: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();

  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: userId,
    content: `Location: ${locationName}`,
    latitude,
    longitude,
    location_name: locationName,
  });

  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return ok();
}

// ── Reaction Operations ────────────────────────────────────────────────────

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string,
  existingReactions: Reaction[]
): Promise<ServiceResult<{ added: boolean; reaction?: Reaction; removedId?: string }>> {
  const supabase = createClient();
  const existing = existingReactions.find(r => r.user_id === userId && r.emoji === emoji);

  if (existing) {
    await supabase.from('chat_reactions').delete().eq('id', existing.id);
    return ok({ added: false, removedId: existing.id });
  } else {
    const { data, error } = await supabase
      .from('chat_reactions')
      .insert({ message_id: messageId, user_id: userId, emoji })
      .select()
      .single();
    if (error) return fail(error.message);
    return ok({ added: true, reaction: data as Reaction });
  }
}

// ── Pin Operations ─────────────────────────────────────────────────────────

export async function pinMessage(
  conversationId: string,
  messageId: string,
  userId: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase.from('chat_pinned_messages').insert({
    conversation_id: conversationId,
    message_id: messageId,
    pinned_by: userId,
  });
  return ok();
}

export async function unpinMessage(
  conversationId: string,
  messageId: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase.from('chat_pinned_messages').delete()
    .eq('message_id', messageId)
    .eq('conversation_id', conversationId);
  return ok();
}

// ── Forward ────────────────────────────────────────────────────────────────

export async function forwardMessage(
  msg: Message,
  targetConvId: string,
  userId: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase.from('chat_messages').insert({
    conversation_id: targetConvId,
    sender_id: userId,
    content: msg.content,
    forwarded_from: msg.id,
    file_url: msg.file_url,
    file_name: msg.file_name,
    file_type: msg.file_type,
    file_size: msg.file_size,
  });
  await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', targetConvId);
  return ok();
}

// ── Read receipts ──────────────────────────────────────────────────────────

export async function markAsRead(conversationId: string, userId: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  return ok();
}

// ── Conversation management ────────────────────────────────────────────────

export async function startDirectChat(
  userId: string,
  otherUserId: string
): Promise<ServiceResult<string>> {
  const supabase = createClient();

  // Check if a direct conversation already exists
  const { data: myConvs } = await supabase
    .from('chat_participants')
    .select('conversation_id')
    .eq('user_id', userId);

  if (myConvs) {
    for (const mc of myConvs) {
      const { data: otherP } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('conversation_id', mc.conversation_id)
        .eq('user_id', otherUserId);
      if (otherP?.length) {
        const { data: conv } = await supabase
          .from('chat_conversations')
          .select('id, type')
          .eq('id', mc.conversation_id)
          .eq('type', 'direct')
          .single();
        if (conv) return ok(conv.id);
      }
    }
  }

  // Create new direct conversation using raw fetch (RLS workaround)
  const convId = crypto.randomUUID();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const r1 = await fetch('/supabase-proxy/rest/v1/chat_conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ id: convId, type: 'direct' }),
  });

  if (!r1.ok) return fail(`Create conv error: ${r1.status}`);

  await fetch('/supabase-proxy/rest/v1/chat_participants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([
      { conversation_id: convId, user_id: userId, role: 'admin' },
      { conversation_id: convId, user_id: otherUserId, role: 'member' },
    ]),
  });

  return ok(convId);
}

export async function createGroupChat(
  userId: string,
  name: string,
  memberIds: string[]
): Promise<ServiceResult<string>> {
  const supabase = createClient();
  const gid = crypto.randomUUID();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const r1 = await fetch('/supabase-proxy/rest/v1/chat_conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ id: gid, type: 'group', name }),
  });

  if (!r1.ok) return fail(`Create group error: ${r1.status}`);

  const parts = [userId, ...memberIds].map((uid, i) => ({
    conversation_id: gid,
    user_id: uid,
    role: i === 0 ? 'admin' : 'member',
  }));

  await fetch('/supabase-proxy/rest/v1/chat_participants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(parts),
  });

  return ok(gid);
}

// ── Group management ───────────────────────────────────────────────────────

export async function addGroupMember(convId: string, memberId: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  await fetch('/supabase-proxy/rest/v1/chat_participants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      Authorization: `Bearer ${session?.access_token}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ conversation_id: convId, user_id: memberId, role: 'member' }),
  });
  return ok();
}

export async function removeGroupMember(convId: string, memberId: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase.from('chat_participants').delete().eq('conversation_id', convId).eq('user_id', memberId);
  return ok();
}

export async function renameGroup(convId: string, name: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase.from('chat_conversations').update({ name }).eq('id', convId);
  return ok();
}

// ── Archive / Delete ───────────────────────────────────────────────────────

export async function archiveConversation(conversationId: string, userId: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase
    .from('chat_participants')
    .update({ archived_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  return ok();
}

export async function unarchiveConversation(conversationId: string, userId: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase
    .from('chat_participants')
    .update({ archived_at: null })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  return ok();
}

export async function deleteConversation(conversationId: string, userId: string): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase
    .from('chat_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  return ok();
}

// ── Call records ───────────────────────────────────────────────────────────

export async function insertCallRecord(
  conversationId: string,
  callerId: string,
  calleeId: string,
  type: 'voice' | 'video',
  status: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase.from('call_records').insert({
    conversation_id: conversationId,
    caller_id: callerId,
    callee_id: calleeId,
    type,
    status,
  });
  return ok();
}

export async function insertCallMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<ServiceResult<void>> {
  const supabase = createClient();
  await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
  });
  return ok();
}
