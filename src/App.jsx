import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import Login from "./Login";
import EmojiPicker from "emoji-picker-react";
import {
  Send,
  Smile,
  Mic,
  Image,
  Paperclip,
  Search,
  Reply,
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

const API_URL = "https://your-backend.onrender.com";
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatMap, setChatMap] = useState({});
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [replyMsg, setReplyMsg] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [myId, setMyId] = useState("");
  const [statusList, setStatusList] = useState([]);

  // LOGIN
  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  // SOCKET
  useEffect(() => {
    if (!user) return;

    socket.current = io(API_URL);

    setMyId(user._id);

    socket.current.emit("addUser", {
      userId: user._id,
      username: user.username,
    });

    socket.current.on("getUsers", (data) => {
      setUsers([
        { userId: "AI", username: "🤖 Meta AI" },
        ...data.filter((u) => u.userId !== user._id),
      ]);
    });

    socket.current.on("receiveMessage", (data) => {
      if (data.senderId === user._id) return;

      const chatId = data.senderId;

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
  // 🔥 KEEP BACKEND AWAKE (Render fix)
useEffect(() => {
  fetch(API_URL);
}, [API_URL]);

  const currentChat = chatMap[currentUser?.userId] || [];

  // SEND MESSAGE
  const sendMessage = async () => {
    if (!message || !currentUser) return;

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

  // FILE UPLOAD
  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

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

  // STATUS
  const addStatus = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    const res = await axios.post(`${API_URL}/api/upload`, form);

    setStatusList((prev) => [
      ...prev,
      { user: user.username, url: res.data.url },
    ]);
  };

  if (!user) return <Login setUser={setUser} />;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#0f2027] text-white">

      {/* SIDEBAR */}
      <div className="md:w-[30%] bg-[#1f2c33] p-3 border-r">

        {/* SEARCH */}
        <div className="flex items-center bg-[#2a3942] p-2 rounded mb-2">
          <Search size={18} />
          <input
            placeholder="Search"
            className="bg-transparent ml-2 outline-none"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* STATUS */}
        <label className="block mb-2 cursor-pointer">
          📸 Add Status
          <input type="file" hidden onChange={addStatus} />
        </label>

        <div className="flex gap-2 overflow-x-auto mb-2">
          {statusList.map((s, i) => (
            <img key={i} src={s.url} className="w-12 h-12 rounded-full" />
          ))}
        </div>

        {/* USERS */}
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

        {/* HEADER */}
        <div className="p-3 bg-[#202c33] flex justify-between">
          {currentUser?.username || "Select user"}
          <button onClick={logout}>Logout</button>
        </div>

        {/* MESSAGES */}
        <div className="flex-1 overflow-y-auto p-4">
          {currentChat.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.senderId === myId ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className="bg-[#2a3942] p-2 m-1 rounded max-w-xs"
                onDoubleClick={() => setReplyMsg(msg.text)}
              >
                {msg.reply && (
                  <div className="text-xs text-gray-400">
                    Reply: {msg.reply}
                  </div>
                )}

                {msg.type === "audio" && <audio controls src={msg.text} />}
                {msg.type === "file" && (
                  <a href={msg.text} target="_blank">📎 File</a>
                )}
                {!msg.type && msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* REPLY BAR */}
        {replyMsg && (
          <div className="bg-gray-700 p-2 text-sm">
            Replying: {replyMsg}
          </div>
        )}

        {/* INPUT */}
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