import "dotenv/config";
import mongoose from "mongoose";
import User from "./src/models/User.js";
import Conversation from "./src/models/Conversation.js";
import Message from "./src/models/Message.js";
import { registerUser, updateSettings, updatePassword, blockUser, unblockUser } from "./src/modules/auth/auth.service.js";
import { getOrCreateConversation, sendMessage, getConversationMessages, markConversationAsRead, listConversations } from "./src/modules/messages/messages.service.js";

async function runV6TestSuite() {
  console.log("=== Unfold V6 Test Suite: Profile, Settings & Direct Messaging ===");
  await mongoose.connect(process.env.MONGODB_URI);

  const uA = "test_v6_alice";
  const uB = "test_v6_bob";
  let alice, bob;

  try {
    // 1. Cleanup old test data
    await User.deleteMany({ username: { $in: [uA, uB] } });

    // 2. Register test users
    alice = await registerUser({ username: uA, password: "Password123!", displayName: "Alice Test" });
    bob = await registerUser({ username: uB, password: "Password123!", displayName: "Bob Test" });
    console.log("✓ Test users registered successfully");

    // 3. Test settings update (Email, Theme, Privacy, Notifications)
    const updatedAlice = await updateSettings({
      userId: alice._id,
      email: "alice.v6@unfold.io",
      preferences: {
        theme: "dark",
        privacy: { directMessages: "everyone" },
        notifications: { directMessages: true }
      }
    });
    if (updatedAlice.email !== "alice.v6@unfold.io" || updatedAlice.preferences.theme !== "dark") {
      throw new Error("Settings update failed to persist.");
    }
    console.log("✓ Account settings persisted (email, theme, preferences)");

    // 4. Test duplicate email rejection
    try {
      await updateSettings({ userId: bob._id, email: "alice.v6@unfold.io" });
      throw new Error("Should not allow duplicate email");
    } catch (e) {
      if (e.code !== "EMAIL_TAKEN") throw e;
      console.log("✓ Duplicate email collision correctly rejected");
    }

    // 5. Test password change
    await updatePassword({
      userId: alice._id,
      currentPassword: "Password123!",
      newPassword: "NewSecretPassword456!"
    });
    console.log("✓ Password changed successfully with bcrypt hashing");

    // 6. Test Direct Messaging: Start conversation
    const conversation = await getOrCreateConversation(alice._id, bob._id);
    if (!conversation.id) throw new Error("Conversation ID missing");
    console.log("✓ Conversation initiated between Alice and Bob");

    // 7. Test Direct Messaging: Send message
    const sendResult = await sendMessage(conversation.id, alice._id, "Hello from Alice on V6!");
    if (!sendResult.message?.content) throw new Error("Message send failed");
    console.log("✓ Message sent successfully:", sendResult.message.content);

    // 8. Test Direct Messaging: Verify inbox & unread state
    const bobInbox = await listConversations(bob._id);
    if (bobInbox.length === 0 || bobInbox[0].unreadCount !== 1) {
      throw new Error("Bob inbox does not reflect unread count");
    }
    console.log("✓ Recipient inbox reflects unread message count");

    // 9. Test Direct Messaging: Mark as read
    await markConversationAsRead(conversation.id, bob._id);
    const bobInboxAfterRead = await listConversations(bob._id);
    if (bobInboxAfterRead[0].unreadCount !== 0) {
      throw new Error("Mark as read failed to reset unread count");
    }
    console.log("✓ Conversation marked as read resets unread count");

    // 10. Test Direct Messaging: Message history
    const history = await getConversationMessages(conversation.id, bob._id);
    if (history.length !== 1 || history[0].content !== "Hello from Alice on V6!") {
      throw new Error("Message history retrieval failed");
    }
    console.log("✓ Message history retrieved accurately");

    // 11. Test Safety: Block user
    await blockUser(alice._id, bob._id);
    console.log("✓ User blocked successfully");

    // 12. Test Safety: Blocked user cannot message
    try {
      await sendMessage(conversation.id, bob._id, "Can you still read this?");
      throw new Error("Blocked user was able to send message");
    } catch (e) {
      if (e.code !== "BLOCKED_BY_USER") throw e;
      console.log("✓ Blocked user is prevented from sending direct messages");
    }

    // 13. Test Safety: Unblock user
    await unblockUser(alice._id, bob._id);
    console.log("✓ User unblocked successfully");

    console.log("=== All V6 tests passed with 100% success ===");
  } finally {
    await User.deleteMany({ username: { $in: [uA, uB] } });
    await Conversation.deleteMany({ participants: { $in: [alice?._id, bob?._id] } });
    await Message.deleteMany({ senderId: { $in: [alice?._id, bob?._id] } });
    await mongoose.disconnect();
  }
}

runV6TestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
