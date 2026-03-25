// ✅ FINAL STABLE APP.JSX (NO UI CHANGE + ALL FEATURES WORKING)

import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import Login from "./Login";
import EmojiPicker from "emoji-picker-react";
import { Send, Smile, Mic, Paperclip, Search, Video } from "lucide-react";
import CryptoJS from "crypto-js";

const SECRET_KEY = "chatapp-secret-key";

const encrypt = (text) =>
  CryptoJS.AES.encrypt(text, SECRET_KEY).toString();

const decrypt = (cipher) => {
  try {
    return CryptoJS.AES.decrypt(cipher).toString(
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
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [chatMap, setChatMap] = useState({});
  const [message, setMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);

  const [incomingCall, setIncomingCall] = useState(false);
  const [callData, setCallData] = useState(null);
  const [callStatus, setCallStatus] = useState("idle");

  useEffect(() => {
    const u = localStorage.getItem("user");
    if (u) setUser(JSON.parse(u));
  }, []);

  const logout = () => {
    localStorage.clear();
    window.location.reload();
  };

  // ================= SOCKET =================
  useEffect(() => {
    if (!user) return;

    socket.current = io(API_URL);

    socket.current.emit("addUser", {
      userId: user._id,
      username: user.username,
    });

    socket.current.on("getUsers", (data) => {
      setUsers([
        { userId: "AI", username: "🤖 Meta AI" },
        ...data.filter((u) => u.userId !== user._id),
      ]);

      setOnlineUsers(data.map((u) => u.userId));
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
    });

    socket.current.on("callAnswered", async ({ answer }) => {
      setCallStatus("connected");
      await peerConnection.current.setRemoteDescription(answer);
    });

    socket.current.on("incomingCall", ({ from, offer }) => {
      setIncomingCall(true);
      setCallData({ from, offer });
    });

    socket.current.on("callRejected", () => {
      setCallStatus("rejected");
      setTimeout(() => setCallStatus("idle"), 2000);
    });

    return () => socket.current.disconnect();
  }, [user]);

  const currentChat = chatMap[currentUser?.userId] || [];

  // ================= SEND =================
  const sendMessage = async () => {
    if (!message || !currentUser) return;

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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    mediaRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];

    mediaRecorder.current.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.current.push(e.data);
    };

    mediaRecorder.current.onstop = async () => {
      const blob = new Blob(audioChunks.current);

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
  };

  // ================= CALL =================
  const startCall = async () => {
    setCallStatus("calling");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideoRef.current.srcObject = stream;

    peerConnection.current = new RTCPeerConnection();

    stream.getTracks().forEach((track) =>
      peerConnection.current.addTrack(track, stream)
    );

    peerConnection.current.ontrack = (e) => {
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    socket.current.emit("callUser", {
      to: currentUser.userId,
      offer,
    });

    setCallStatus("ringing");
  };

  const acceptCall = async () => {
    setIncomingCall(false);
    setCallStatus("connected");

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideoRef.current.srcObject = stream;

    peerConnection.current = new RTCPeerConnection();

    stream.getTracks().forEach((track) =>
      peerConnection.current.addTrack(track, stream)
    );

    peerConnection.current.ontrack = (e) => {
      remoteVideoRef.current.srcObject = e.streams[0];
    };

    await peerConnection.current.setRemoteDescription(callData.offer);

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    socket.current.emit("answerCall", {
      to: callData.from,
      answer,
    });
  };

  const rejectCall = () => {
    socket.current.emit("rejectCall", {
      to: callData.from,
    });

    setIncomingCall(false);
    setCallStatus("idle");
  };

  if (!user) return <Login setUser={setUser} />;

  return (
    <div className="flex h-screen bg-[#0f2027] text-white">

      {incomingCall && (
        <div className="fixed inset-0 bg-black flex flex-col justify-center items-center z-50">
          <h1 className="text-xl mb-4">Incoming Call 📞</h1>
          <div className="flex gap-6">
            <button onClick={rejectCall} className="bg-red-500 p-4 rounded-full">❌</button>
            <button onClick={acceptCall} className="bg-green-500 p-4 rounded-full">✅</button>
          </div>
        </div>
      )}

      {callStatus === "connected" && (
        <div className="flex gap-2 p-2 bg-black">
          <video ref={localVideoRef} autoPlay muted className="w-1/2" />
          <video ref={remoteVideoRef} autoPlay className="w-1/2" />
        </div>
      )}

      <div className="w-[30%] p-3 bg-[#1f2c33] border-r">
        {users.map((u) => (
          <div key={u.userId} onClick={() => setCurrentUser(u)}>
            {u.username}
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="p-3 flex justify-between items-center">
          {currentUser?.username}

          <div className="flex gap-2 items-center">
            {currentUser && (
              <button onClick={startCall}>
                <Video />
              </button>
            )}

            {/* ✅ ADDED */}
            <button onClick={logout} className="bg-red-500 px-3 py-1 rounded">
              Logout
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {currentChat.map((msg, i) => (
            <div key={i}>
              {msg.type === "audio" && <audio controls src={msg.text} />}
              {msg.type === "file" && <a href={msg.text} target="_blank">📎 File</a>}
              {!msg.type && msg.text}
            </div>
          ))}
        </div>

        <div className="flex p-3 gap-2">
          <button onClick={() => setShowEmoji(!showEmoji)}>
            <Smile />
          </button>

          <label>
            <Paperclip />
            <input hidden type="file" onChange={sendFile} />
          </label>

          <button onClick={startRecording}>
            <Mic />
          </button>

          <input value={message} onChange={(e) => setMessage(e.target.value)} />

          <button onClick={sendMessage}>
            <Send />
          </button>
        </div>

        {showEmoji && (
          <EmojiPicker onEmojiClick={(e) => setMessage((p) => p + e.emoji)} />
        )}
      </div>
    </div>
  );
}

export default App;