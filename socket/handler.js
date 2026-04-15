const Message = require('../models/Message');
const User = require('../models/User');

// Map of userId -> Set of socket IDs
const onlineUsers = new Map();

module.exports = (io, socket) => {
  const userId = socket.user._id.toString();

  // Track online users
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);

  // Update user status to online
  User.findByIdAndUpdate(userId, { status: 'online' }).exec();

  // Notify all users of online status
  io.emit('user:status', { userId, status: 'online' });

  console.log(`🟢 ${socket.user.username} connected (${socket.id})`);

  // Join personal room
  socket.join(userId);

  // Send message
  socket.on('message:send', async (data) => {
    try {
      const { recipientId, content } = data;

      if (!content || !content.trim()) return;
      if (!recipientId) return;

      const recipient = await User.findById(recipientId);
      if (!recipient) return;

      const message = new Message({
        sender: userId,
        recipient: recipientId,
        content: content.trim()
      });
      await message.save();

      await message.populate('sender', 'username avatar');
      await message.populate('recipient', 'username avatar');

      const messageObj = message.toObject();

      // Send to sender
      socket.emit('message:received', messageObj);

      // Send to recipient if online
      io.to(recipientId).emit('message:received', messageObj);

    } catch (err) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Typing indicators
  socket.on('typing:start', ({ recipientId }) => {
    io.to(recipientId).emit('typing:start', {
      userId,
      username: socket.user.username
    });
  });

  socket.on('typing:stop', ({ recipientId }) => {
    io.to(recipientId).emit('typing:stop', { userId });
  });

  // Mark messages as read
  socket.on('messages:read', async ({ senderId }) => {
    await Message.updateMany(
      { sender: senderId, recipient: userId, read: false },
      { read: true, readAt: new Date() }
    );
    io.to(senderId).emit('messages:read', { by: userId });
  });

  // Delete message
  socket.on('message:delete', async ({ messageId, recipientId }) => {
    const message = await Message.findById(messageId);
    if (!message || message.sender.toString() !== userId) return;

    message.deleted = true;
    message.content = 'This message was deleted';
    await message.save();

    socket.emit('message:deleted', { messageId });
    io.to(recipientId).emit('message:deleted', { messageId });
  });

  // Disconnect
  socket.on('disconnect', async () => {
    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        await User.findByIdAndUpdate(userId, {
          status: 'offline',
          lastSeen: new Date()
        });
        io.emit('user:status', { userId, status: 'offline' });
      }
    }
    console.log(`🔴 ${socket.user.username} disconnected`);
  });
};
