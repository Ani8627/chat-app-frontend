import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import Login from "./Login";
import EmojiPicker from "emoji-picker-react";
import {
  Send,
  Smile,
  Mic,
  Paperclip,
  Search,
} from "lucide-react";
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
  const mediaRecorder = useRef();
  const audioChunks = useRef([]);

  const API_URL =
    process.env.REACT_APP_API_URL ||
    "https://chat-app-backend-dxi9.onrender.com";

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatMap, setChatMap] = useState({});
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [replyMsg, setReplyMsg] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [myId, setMyId] = useState("");

  // LOGIN
  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  // SOCKET FIXED
  useEffect(() => {
    if (!user) return;

    socket.current = io(API_URL, {
      transports: ["websocket"],
    });

    setMyId(user._id);

    socket.current.emit("addUser", {
      userId: user._id,
      username: user.username,
    });

    // ✅ USERS FIX
    socket.current.on("getUsers", (data) => {
      const filtered = data.filter((u) => u.userId !== user._id);

      setUsers([
        { userId: "AI", username: "🤖 Meta AI" },
        ...filtered,
      ]);
    });

    // ✅ MESSAGE FIX (IMPORTANT)
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
          { senderId: myId, text: message },
          { senderId: "AI", text: res.data.reply },
        ],
      }));

      setMessage("");
      return;
    }

    const msg = {
      senderId: myId,
      receiverId: currentUser.userId,
      text: encrypt(message),
      reply: replyMsg,
    };

    // ✅ ADD ONLY ONCE (NO DUPLICATE)
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
    setReplyMsg(null);
  };

  // FILE
  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    const form = new FormData();
    form.append("file", file);

    const res = await axios.post(`${API_URL}/api/upload`, form);

    const msg = {
      senderId: myId,
      receiverId: currentUser.userId,
      text: encrypt(res.data.url),
      type: "file",
    };

    setChatMap((p) => ({
      ...p,
      [currentUser.userId]: [
        ...(p[currentUser.userId] || []),
        { ...msg, text: res.data.url },
      ],
    }));

    socket.current.emit("sendMessage", msg);
  };

  // VOICE
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder.current = new MediaRecorder(stream);

    mediaRecorder.current.ondataavailable = (e) => {
      audioChunks.current.push(e.data);
    };

    mediaRecorder.current.onstop = () => {
      const blob = new Blob(audioChunks.current);
      audioChunks.current = [];

      const url = URL.createObjectURL(blob);

      const msg = {
        senderId: myId,
        receiverId: currentUser.userId,
        text: encrypt(url),
        type: "audio",
      };

      setChatMap((p) => ({
        ...p,
        [currentUser.userId]: [
          ...(p[currentUser.userId] || []),
          { ...msg, text: url },
        ],
      }));

      socket.current.emit("sendMessage", msg);
    };

    mediaRecorder.current.start();
    setTimeout(() => mediaRecorder.current.stop(), 3000);
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
              className="p-3 hover:bg-[#2a3942] rounded cursor-pointer"
            >
              🟢 {u.username}
            </div>
          ))}
      </div>

      {/* CHAT */}
      <div className="flex-1 flex flex-col">

        <div className="p-3 bg-[#202c33] flex justify-between border-b border-gray-700">
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
                msg.senderId === myId ? "justify-end" : "justify-start"
              }`}
            >
              <div className="bg-[#2a3942] p-2 m-1 rounded max-w-xs">

                {msg.reply && (
                  <div className="text-xs text-gray-400">
                    Reply: {msg.reply}
                  </div>
                )}

                {msg.type === "audio" && (
                  <audio controls src={msg.text} />
                )}

                {msg.type === "file" && (
                  <a href={msg.text} target="_blank">📎 File</a>
                )}

                {!msg.type && msg.text}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 p-3 bg-[#202c33]">
          <button onClick={() => setShowEmoji(!showEmoji)}>
            <Smile />
          </button>

          <label>
            <Paperclip />
            <input type="file" hidden onChange={sendFile} />
          </label>

          <button onClick={startRecording}>
            <Mic />
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
            onEmojiClick={(e) => setMessage((p) => p + e.emoji)}
          />
        )}
      </div>
    </div>
  );
}

export default App;