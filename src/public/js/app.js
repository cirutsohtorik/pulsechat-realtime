/**
 * Main Application Controller for PulseChat Client
 */
document.addEventListener('DOMContentLoaded', () => {
  const socket = window.pulseSocket;

  // DOM Elements
  const authModal = document.getElementById('auth-modal');
  const authForm = document.getElementById('auth-form');
  const usernameInput = document.getElementById('username-input');
  const connectionStatus = document.getElementById('connection-status');
  const roomsList = document.getElementById('rooms-list');
  const usersList = document.getElementById('users-list');
  const activeUserCount = document.getElementById('active-user-count');
  const currentUserName = document.getElementById('current-user-name');
  const currentUserAvatar = document.getElementById('current-user-avatar');
  const logoutBtn = document.getElementById('logout-btn');
  const activeRoomTitle = document.getElementById('active-room-title');
  const activeRoomDesc = document.getElementById('active-room-desc');
  const messagesContainer = document.getElementById('messages-container');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');
  const clearBtn = document.getElementById('clear-btn');

  // State
  let currentUser = null;
  let authToken = localStorage.getItem('pulsechat_token') || null;
  let activeRoom = 'general';
  let typingUsers = new Set();
  let typingTimer = null;
  let isCurrentlyTyping = false;

  const roomDescriptions = {
    general: 'Public discussion for everyone',
    engineering: 'Deep technical chats, architecture, and systems',
    random: 'Casual watercooler talk and links',
    showcase: 'Share what you have built today'
  };

  // 1. Connection Lifecycle Events
  socket.on('status', (status) => {
    connectionStatus.textContent = status.toUpperCase();
    if (status === 'connected') {
      connectionStatus.classList.add('connected');
    } else {
      connectionStatus.classList.remove('connected');
    }
  });

  socket.on('open', () => {
    // If we have saved credentials, auto-authenticate
    const savedUser = localStorage.getItem('pulsechat_username');
    if (savedUser) {
      authenticate(savedUser, authToken);
    }
  });

  // 2. Auth Flow
  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (username.length < 2) return;
    authenticate(username);
  });

  function authenticate(username, token) {
    socket.send({
      type: 'AUTH',
      username,
      token: token || undefined
    });
  }

  socket.on('AUTH_SUCCESS', (msg) => {
    currentUser = msg.user;
    authToken = msg.token;

    localStorage.setItem('pulsechat_username', currentUser.username);
    localStorage.setItem('pulsechat_token', authToken);

    currentUserName.textContent = currentUser.username;
    currentUserAvatar.textContent = currentUser.username.substring(0, 2).toUpperCase();
    currentUserAvatar.style.backgroundColor = getColorForName(currentUser.username);

    authModal.classList.add('hidden');
    messageInput.focus();
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('pulsechat_username');
    localStorage.removeItem('pulsechat_token');
    window.location.reload();
  });

  // 3. Room Switching
  roomsList.addEventListener('click', (e) => {
    const item = e.target.closest('.room-item');
    if (!item) return;

    const roomId = item.getAttribute('data-room');
    if (roomId === activeRoom) return;

    switchRoom(roomId);
  });

  function switchRoom(roomId) {
    activeRoom = roomId;

    // Update active highlight
    document.querySelectorAll('.room-item').forEach((el) => {
      el.classList.toggle('active', el.getAttribute('data-room') === roomId);
    });

    activeRoomTitle.textContent = roomId;
    activeRoomDesc.textContent = roomDescriptions[roomId] || 'Channel discussion';
    messageInput.placeholder = `Message #${roomId}...`;
    messagesContainer.innerHTML = '';
    typingUsers.clear();
    updateTypingDisplay();

    socket.send({
      type: 'JOIN_ROOM',
      room: roomId
    });
  }

  // 4. Inbound Messages & History
  socket.on('ROOM_HISTORY', (msg) => {
    if (msg.room !== activeRoom) return;
    messagesContainer.innerHTML = '';

    if (msg.messages.length === 0) {
      appendSystemNotice(`This is the start of the #${activeRoom} channel.`);
    } else {
      msg.messages.forEach(renderMessage);
    }
    scrollToBottom();
  });

  socket.on('CHAT_MESSAGE', (msg) => {
    if (msg.room === activeRoom) {
      renderMessage(msg);
      scrollToBottom();
    }
  });

  socket.on('USER_JOINED', (msg) => {
    if (msg.room === activeRoom) {
      appendSystemNotice(`${msg.username} entered #${msg.room}`);
      addUserToList(msg.username);
    }
  });

  socket.on('USER_LEFT', (msg) => {
    if (msg.room === activeRoom) {
      appendSystemNotice(`${msg.username} left #${msg.room}`);
      removeUserFromList(msg.username);
    }
  });

  socket.on('ROOM_USERS', (msg) => {
    if (msg.room === activeRoom) {
      renderActiveUsers(msg.users);
    }
  });

  socket.on('TYPING_STATUS', (msg) => {
    if (msg.room !== activeRoom) return;

    if (msg.isTyping) {
      typingUsers.add(msg.username);
    } else {
      typingUsers.delete(msg.username);
    }
    updateTypingDisplay();
  });

  // 5. Outbound Chat & Typing
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const content = messageInput.value.trim();
    if (!content) return;

    socket.send({
      type: 'CHAT_MESSAGE',
      room: activeRoom,
      content
    });

    // Reset typing status immediately
    stopTyping();
    messageInput.value = '';
    messageInput.focus();
  });

  messageInput.addEventListener('input', () => {
    if (!isCurrentlyTyping) {
      isCurrentlyTyping = true;
      socket.send({
        type: 'TYPING',
        room: activeRoom,
        isTyping: true
      });
    }

    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 2000);
  });

  function stopTyping() {
    if (isCurrentlyTyping) {
      isCurrentlyTyping = false;
      socket.send({
        type: 'TYPING',
        room: activeRoom,
        isTyping: false
      });
    }
  }

  // 6. UI Helpers
  function renderMessage(msg) {
    const card = document.createElement('div');
    card.className = 'message-card';

    const isSelf = currentUser && msg.username === currentUser.username;
    const authorClass = isSelf ? 'msg-author you' : 'msg-author';
    const initials = msg.username.substring(0, 2).toUpperCase();
    const timeStr = formatTime(msg.createdAt);
    const avatarColor = getColorForName(msg.username);

    card.innerHTML = `
      <div class="msg-avatar" style="background-color: ${avatarColor}">${initials}</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="${authorClass}">${escapeHtml(msg.username)}</span>
          <span class="msg-time">${timeStr}</span>
        </div>
        <div class="msg-text">${escapeHtml(msg.content)}</div>
      </div>
    `;

    messagesContainer.appendChild(card);
  }

  function appendSystemNotice(text) {
    const notice = document.createElement('div');
    notice.className = 'system-notice';
    notice.textContent = text;
    messagesContainer.appendChild(notice);
  }

  function renderActiveUsers(users) {
    usersList.innerHTML = '';
    activeUserCount.textContent = users.length;

    users.forEach((username) => {
      addUserToList(username);
    });
  }

  function addUserToList(username) {
    // Avoid duplicates in the DOM
    if (document.querySelector(`[data-username="${username}"]`)) return;

    const li = document.createElement('li');
    li.className = 'user-item';
    li.setAttribute('data-username', username);
    li.innerHTML = `
      <span class="user-badge-dot"></span>
      <span>${escapeHtml(username)}</span>
    `;
    usersList.appendChild(li);
    activeUserCount.textContent = usersList.children.length;
  }

  function removeUserFromList(username) {
    const el = document.querySelector(`[data-username="${username}"]`);
    if (el) el.remove();
    activeUserCount.textContent = usersList.children.length;
  }

  function updateTypingDisplay() {
    if (typingUsers.size === 0) {
      typingIndicator.style.visibility = 'hidden';
      typingText.textContent = '';
    } else {
      typingIndicator.style.visibility = 'visible';
      const names = Array.from(typingUsers);
      if (names.length === 1) {
        typingText.textContent = `${names[0]} is typing...`;
      } else if (names.length === 2) {
        typingText.textContent = `${names[0]} and ${names[1]} are typing...`;
      } else {
        typingText.textContent = `${names[0]} and ${names.length - 1} others are typing...`;
      }
    }
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function formatTime(isoString) {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getColorForName(str) {
    const palette = ['#6366f1', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#14b8a6'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palette.length;
    return palette[index];
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  clearBtn.addEventListener('click', () => {
    messagesContainer.innerHTML = '';
    appendSystemNotice('View cleared locally.');
  });

  // Start connection
  socket.connect();
});
