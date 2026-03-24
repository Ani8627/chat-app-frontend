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
  const [showEmoji, setShowEmoji] = useState(false);
  const [typingUser, setTypingUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [seenMap, setSeenMap] = useState({});

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
    Notification.requestPermission();
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  // SOCKET
  useEffect(() => {
    if (!user) return;

    socket.current = io(API_URL, {
      transports: ["websocket", "polling"],
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

    socket.current.on("messageSeen", (receiverId) => {
      setSeenMap((prev) => ({ ...prev, [receiverId]: true }));
    });

    socket.current.on("receiveMessage", (data) => {
      const chatId =
        data.senderId === user._id
          ? data.receiverId
          : data.senderId;

      const msg = { ...data, text: decrypt(data.text) };

      setChatMap((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));

      if (Notification.permission === "granted") {
        new Notification("New Message", { body: msg.text });
      }

      socket.current.emit("markSeen", {
        senderId: data.senderId,
        receiverId: user._id,
      });
    });

    // ✅ GROUP RECEIVE
    socket.current.on("receiveGroupMessage", ({ groupId, message }) => {
      const msg = { ...message, text: decrypt(message.text) };

      setChatMap((prev) => ({
        ...prev,
        [groupId]: [...(prev[groupId] || []), msg],
      }));
    });

    // ✅ VIDEO CALL
    socket.current.on("incomingCall", ({ from }) => {
      alert("Incoming call 📞");
      socket.current.emit("answerCall", {
        to: from,
        answer: "accepted",
      });
    });

    return () => socket.current.disconnect();
  }, [user]);

  const currentChat = chatMap[currentUser?.userId] || [];

  // SEND MESSAGE
  const sendMessage = async () => {
    if (!message || !currentUser) return;

    // AI
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

    // GROUP
    if (currentUser.userId.startsWith("group")) {
      const msg = {
        senderId: user._id,
        text: encrypt(message),
      };

      socket.current.emit("sendGroupMessage", {
        groupId: currentUser.userId,
        message: msg,
      });

      setChatMap((p) => ({
        ...p,
        [currentUser.userId]: [
          ...(p[currentUser.userId] || []),
          { ...msg, text: message },
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

    socket.current.emit("typing", {
      senderId: user._id,
      receiverId: currentUser.userId,
    });
  };

  // FILE
  const sendFile = async (e) => {
    if (!currentUser) return;

    const file = e.target.files[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    const res = await axios.post(`${API_URL}/api/upload`, form);

    const msg = {
      senderId: user._id,
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
    if (!currentUser) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];

    mediaRecorder.current.ondataavailable = (e) => {
      audioChunks.current.push(e.data);
    };

    mediaRecorder.current.onstop = () => {
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);

      const msg = {
        senderId: user._id,
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

  // CREATE GROUP
  const createGroup = () => {
    const groupId = "group-" + Date.now();

    socket.current.emit("createGroup", {
      groupId,
      members: users.map((u) => u.userId),
    });

    setCurrentUser({ userId: groupId, username: "👥 Group Chat" });
  };

  if (!user) return <Login setUser={setUser} />;

  return (
    <div className="flex h-screen bg-[#0f2027] text-white">

      {/* USERS */}
      <div className="w-[30%] bg-[#1f2c33] p-3 border-r">

        <div className="flex bg-[#2a3942] p-2 rounded mb-2">
          <Search />
          <input onChange={(e) => setSearch(e.target.value)} className="ml-2 bg-transparent outline-none" />
        </div>

        <button onClick={createGroup} className="mb-2 bg-green-600 p-2 rounded">
          ➕ Group
        </button>

        {users.map((u) => (
          <div key={u.userId} onClick={() => setCurrentUser(u)} className="p-2 hover:bg-[#2a3942] cursor-pointer flex justify-between">
            {u.username}
            {onlineUsers.includes(u.userId) && "🟢"}
          </div>
        ))}
      </div>

      {/* CHAT */}
      <div className="flex-1 flex flex-col">

        <div className="p-3 bg-[#202c33] flex justify-between">
          {currentUser?.username || "Select user"}

          <button
            onClick={() =>
              socket.current.emit("callUser", {
                to: currentUser.userId,
                offer: "video",
              })
            }
          >
            📹
          </button>

          <button onClick={logout}>Logout</button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {currentChat.map((msg, i) => (
            <div key={i} className={`flex ${msg.senderId === user._id ? "justify-end" : "justify-start"}`}>
              <div className="bg-[#2a3942] p-2 m-1 rounded">

                {msg.type === "audio" && <audio controls src={msg.text} />}
                {msg.type === "file" && <a href={msg.text}>📎 File</a>}
                {!msg.type && msg.text}

                {msg.senderId === user._id && (
                  <div className="text-xs">
                    {seenMap[currentUser?.userId] ? "✔✔" : "✔"}
                  </div>
                )}
              </div>
            </div>
          ))}

          {typingUser === currentUser?.userId && <div>typing...</div>}
        </div>

        <div className="flex p-2 gap-2 bg-[#202c33]">
          <button onClick={() => setShowEmoji(!showEmoji)}><Smile /></button>
          <input value={message} onChange={(e) => setMessage(e.target.value)} className="flex-1 bg-[#2a3942]" />
          <button onClick={sendMessage}><Send /></button>

          <label>
            <Paperclip />
            <input hidden type="file" onChange={sendFile} />
          </label>

          <button onClick={startRecording}><Mic /></button>
        </div>

        {showEmoji && <EmojiPicker onEmojiClick={(e) => setMessage((p) => p + e.emoji)} />}
      </div>
    </div>
  );
}

export default App;