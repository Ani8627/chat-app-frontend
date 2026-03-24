import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import Login from "./Login";
import EmojiPicker from "emoji-picker-react";
import { Send, Smile, Mic, Paperclip, Search } from "lucide-react";
import CryptoJS from "crypto-js";

const SECRET_KEY = "chatapp-secret-key";

const encrypt = (text) =>
  CryptoJS.AES.encrypt(text, SECRET_KEY).toString();

const decrypt = (cipher) => {
  try {
    return CryptoJS.AES.decrypt(cipher, SECRET_KEY).toString(
      CryptoJS.enc.Utf8
    );
  } catch {
    return cipher;
  }
};

function App() {
  const socket = useRef();

  const API_URL =
    process.env.REACT_APP_API_URL ||
    "https://chat-app-backend-dxi9.onrender.com";

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatMap, setChatMap] = useState({});
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // LOGIN
  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  // SOCKET CONNECTION (🔥 FIXED)
  useEffect(() => {
    if (!user) return;

    socket.current = io(API_URL, {
      transports: ["websocket", "polling"], // ✅ IMPORTANT FIX
      reconnection: true,
    });

    socket.current.emit("addUser", {
      userId: user._id,
      username: user.username,
    });

    socket.current.on("getUsers", (data) => {
      const filtered = data.filter((u) => u.userId !== user._id);

      setUsers([
        { userId: "AI", username: "🤖 Meta AI" },
        ...filtered,
      ]);

      setOnlineUsers(filtered.map((u) => u.userId));
    });

    socket.current.on("typing", (senderId) => {
      setTypingUser(senderId);
      setTimeout(() => setTypingUser(null), 1500);
    });

    // ✅ RECEIVE MESSAGE FIX
    socket.current.on("receiveMessage", (data) => {
      const chatId =
        data.senderId === user._id
          ? data.receiverId
          : data.senderId;

      const msg = {
        ...data,
        text: decrypt(data.text),
      };

      setChatMap((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));
    });

    return () => socket.current.disconnect();
  }, [user]);

  const currentChat = chatMap[currentUser?.userId] || [];

  // SEND MESSAGE
  const sendMessage = async () => {
    if (!message || !currentUser) return;

    // AI CHAT
    if (currentUser.userId === "AI") {
      const res = await axios.post(`${API_URL}/api/ai/chat`, {
        message,
      });

      setChatMap((p) => ({
        ...p,
        AI: [
          ...(p.AI || []),
          { senderId: user._id, text: message },
          { senderId: "AI", text: res.data.reply },
        ],
      }));

      setMessage("");
      return;
    }

    const msg = {
      senderId: user._id,
      receiverId: currentUser.userId,
      text: encrypt(message),
    };

    // add locally
    setChatMap((p) => ({
      ...p,
      [currentUser.userId]: [
        ...(p[currentUser.userId] || []),
        { ...msg, text: message },
      ],
    }));

    socket.current.emit("sendMessage", msg);
    await axios.post(`${API_URL}/api/messages`, msg);

    setMessage("");

    // typing stop
    socket.current.emit("typing", {
      senderId: user._id,
      receiverId: currentUser.userId,
    });
  };

  if (!user) return <Login setUser={setUser} />;

  return (
    <div className="flex h-screen bg-[#0f2027] text-white">

      {/* SIDEBAR */}
      <div className="w-[30%] bg-[#1f2c33] p-3 border-r border-gray-700">

        <div className="flex items-center bg-[#2a3942] p-2 rounded mb-2">
          <Search size={18} />
          <input
            placeholder="Search"
            className="bg-transparent ml-2 outline-none w-full"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {users
          .filter((u) =>
            u.username.toLowerCase().includes(search.toLowerCase())
          )
          .map((u) => (
            <div
              key={u.userId}
              onClick={() => setCurrentUser(u)}
              className="p-3 hover:bg-[#2a3942] rounded cursor-pointer flex justify-between"
            >
              <span>🟢 {u.username}</span>
              {onlineUsers.includes(u.userId) && (
                <span className="text-green-400 text-xs">online</span>
              )}
            </div>
          ))}
      </div>

      {/* CHAT */}
      <div className="flex-1 flex flex-col">

        <div className="p-3 bg-[#202c33] flex justify-between border-b">
          {currentUser?.username || "Select user"}
          <button onClick={logout} className="bg-red-500 px-3 rounded">
            Logout
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {currentChat.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.senderId === user._id
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div className="bg-[#2a3942] p-2 m-1 rounded max-w-xs">
                {msg.text}
              </div>
            </div>
          ))}

          {typingUser === currentUser?.userId && (
            <div className="text-gray-400 text-sm">
              typing...
            </div>
          )}
        </div>

        <div className="flex gap-2 p-3 bg-[#202c33]">
          <button onClick={() => setShowEmoji(!showEmoji)}>
            <Smile />
          </button>

          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 p-2 bg-[#2a3942]"
          />

          <button onClick={sendMessage}>
            <Send />
          </button>
        </div>

        {showEmoji && (
          <EmojiPicker
            onEmojiClick={(e) =>
              setMessage((p) => p + e.emoji)
            }
          />
        )}
      </div>
    </div>
  );
}

export default App;