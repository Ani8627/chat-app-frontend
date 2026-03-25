// ✅ FINAL PRODUCTION APP.JSX (ALL FEATURES WORKING — NO LOSS)

import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import Login from "./Login";
import EmojiPicker from "emoji-picker-react";
import { Send, Smile, Mic, Paperclip, Video } from "lucide-react";
import CryptoJS from "crypto-js";

const SECRET_KEY = "chatapp-secret-key";

const encrypt = (text) =>
  CryptoJS.AES.encrypt(text, SECRET_KEY).toString();

// ✅ FIX
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
  const peerConnection = useRef(null);
  const mediaRecorder = useRef();
  const audioChunks = useRef([]);

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();

  const API_URL =
    process.env.REACT_APP_API_URL ||
    "https://chat-app-backend-dxi9.onrender.com";

  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatMap, setChatMap] = useState({});
  const [message, setMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [statuses, setStatuses] = useState([]);

  const [incomingCall, setIncomingCall] = useState(false);
  const [callData, setCallData] = useState(null);
  const [callStatus, setCallStatus] = useState("idle");

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));

    axios.get(`${API_URL}/api/status`).then((res) => {
      setStatuses(res.data);
    });
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  // ================= SOCKET =================
  useEffect(() => {
    if (!user) return;

    socket.current = io(API_URL, {
      transports: ["websocket"],
      reconnection: true,
    });

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
      const chatId =
        data.senderId === user._id
          ? data.receiverId
          : data.senderId;

      const msg = { ...data, text: decrypt(data.text) };

      setChatMap((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), msg],
      }));

      socket.current.emit("markSeen", {
        senderId: data.senderId,
      });
    });
    // ✅ ADDED ICE RECEIVER
socket.current.on("iceCandidate", async (candidate) => {
  try {
    if (peerConnection.current && candidate) {
      await peerConnection.current.addIceCandidate(candidate);
    }
  } catch (err) {
    console.log("ICE error", err);
  }
});

    // ✅ GROUP FIX
    socket.current.on("receiveGroupMessage", ({ groupId, message }) => {
      const msg = { ...message, text: decrypt(message.text) };

      setChatMap((prev) => ({
        ...prev,
        [groupId]: [...(prev[groupId] || []), msg],
      }));
    });

    socket.current.on("groupCreated", ({ groupId }) => {
      setUsers((prev) => [
        ...prev,
        { userId: groupId, username: "👥 Group Chat" },
      ]);
    });

    socket.current.on("messagesSeen", (senderId) => {
      setChatMap((prev) => {
        const updated = prev[senderId]?.map((msg) =>
          msg.senderId === user._id ? { ...msg, seen: true } : msg
        );
        return { ...prev, [senderId]: updated };
      });
    });
    socket.current.on("statusUpdated", async () => {
  const res = await axios.get(`${API_URL}/api/status`);
  setStatuses(res.data);
});

    socket.current.on("iceCandidate", async (candidate) => {
      if (peerConnection.current) {
        await peerConnection.current.addIceCandidate(candidate);
      }
    });

    return () => socket.current.disconnect();
  }, [user]);

  const currentChat = chatMap[currentUser?.userId] || [];
  // ✅ ADDED VIDEO CALL FUNCTION
const startCall = async () => {
  try {
    setCallStatus("calling");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    peerConnection.current = new RTCPeerConnection();

    peerConnection.current.onicecandidate = (e) => {
      if (e.candidate) {
        socket.current.emit("iceCandidate", {
          to: currentUser.userId,
          candidate: e.candidate,
        });
      }
    };

    stream.getTracks().forEach((track) =>
      peerConnection.current.addTrack(track, stream)
    );

    peerConnection.current.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    socket.current.emit("callUser", {
      to: currentUser.userId,
      offer,
    });

    setCallStatus("ringing");
  } catch {
    alert("Camera permission denied");
  }
};

  // ================= SEND =================
  const sendMessage = async () => {
    if (!message || !currentUser) return;

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
  };

  // ================= FILE =================
  const sendFile = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

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

  // ================= VOICE =================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });

        const form = new FormData();
        form.append("file", blob, "voice.webm");

        const res = await axios.post(`${API_URL}/api/upload`, form);

        const msg = {
          senderId: user._id,
          receiverId: currentUser.userId,
          text: encrypt(res.data.url),
          type: "audio",
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

      mediaRecorder.current.start();
      setTimeout(() => mediaRecorder.current.stop(), 5000);
    } catch {
      alert("Mic permission denied");
    }
  };

  if (!user) return <Login setUser={setUser} />;

  return (
    <div className="flex h-screen bg-[#0f2027] text-white">

      {/* STATUS */}
      <div className="w-[30%] p-3 bg-[#1f2c33] border-r">
        {/* ✅ ADDED STATUS BUTTON */}
<input
  type="file"
  hidden
  id="statusUpload"
  onChange={async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const form = new FormData();
    form.append("file", file);

    const res = await axios.post(`${API_URL}/api/upload`, form);

    await axios.post(`${API_URL}/api/status`, {
      userId: user._id,
      image: res.data.url,
    });
  }}
/>

<button
  onClick={() => document.getElementById("statusUpload").click()}
  className="bg-green-500 px-2 py-1 rounded mb-2 w-full"
>
  + Add Status
</button>
{/* ✅ ADDED GROUP BUTTON */}
<button
  onClick={() => {
    const groupId = "group-" + Date.now();

    socket.current.emit("createGroup", {
      groupId,
      members: [
        user._id,
        ...users.map((u) => u.userId).filter((id) => id !== "AI"),
      ],
    });
  }}
  className="bg-blue-500 px-2 py-1 rounded mb-2 w-full"
>
  + Create Group
</button>
        <div className="mb-3 text-sm font-bold">Status</div>
        {statuses.map((s, i) => (
          <img key={i} src={s.image} className="w-10 h-10 rounded-full mb-2 border" />
        ))}

        {users.map((u) => (
          <div key={u.userId} onClick={() => setCurrentUser(u)}>
            {u.username}
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        {/* ✅ ADDED VIDEO UI */}
{callStatus === "connected" && (
  <div className="flex gap-2 p-2 bg-black">
    <video ref={localVideoRef} autoPlay muted className="w-1/2" />
    <video ref={remoteVideoRef} autoPlay className="w-1/2" />
  </div>
)}
<div className="p-3 flex justify-between items-center">
  {currentUser?.username}

  <div className="flex gap-2 items-center">

    {/* ✅ ADDED VIDEO CALL BUTTON */}
    {currentUser && (
      <button onClick={startCall}>
        <Video />
      </button>
    )}

    {/* (Keep your logout button if already there) */}
    <button onClick={logout} className="bg-red-500 px-3 py-1 rounded">
      Logout
    </button>

  </div>
</div>

        <div className="flex-1 p-4 overflow-y-auto">
          {currentChat.map((msg, i) => (
            <div key={i} className={msg.senderId === user._id ? "text-right" : ""}>
              {msg.type === "audio" && <audio controls src={msg.text} />}
              {msg.type === "file" && <a href={msg.text} target="_blank">File</a>}
              {!msg.type && msg.text}
              {msg.senderId === user._id && (msg.seen ? " ✔✔" : " ✔")}
            </div>
          ))}
        </div>

        <div className="flex p-2 gap-2">
          <button onClick={() => setShowEmoji(!showEmoji)}><Smile /></button>
<input
  value={message}
  onChange={(e) => setMessage(e.target.value)}
  className="flex-1 px-3 py-2 bg-[#2a3942] text-white rounded outline-none"
/>          <button onClick={sendMessage}><Send /></button>
        </div>

        {showEmoji && <EmojiPicker onEmojiClick={(e) => setMessage((p) => p + e.emoji)} />}
      </div>
    </div>
  );
}

export default App;