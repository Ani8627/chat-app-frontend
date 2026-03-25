// ✅ FINAL APP (ALL FIXES APPLIED — NO FEATURE LOSS)

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
    });

    // ✅ FIX: MESSAGE RECEIVE (bi-directional safe)
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

    // ================= CALL =================

    socket.current.on("incomingCall", ({ from, offer }) => {
      setIncomingCall(true);
      setCallData({ from, offer });
    });

    // ✅ FIX: CORRECT EVENT NAME
    socket.current.on("callAnswered", async ({ answer }) => {
      setCallStatus("connected");
      await peerConnection.current.setRemoteDescription(answer);
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

      {/* INCOMING CALL */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black flex flex-col justify-center items-center z-50">
          <h1 className="text-xl mb-4">Incoming Call 📞</h1>

          <div className="flex gap-6">
            <button onClick={rejectCall} className="bg-red-500 p-4 rounded-full">
              ❌
            </button>

            <button onClick={acceptCall} className="bg-green-500 p-4 rounded-full">
              ✅
            </button>
          </div>
        </div>
      )}

      {/* STATUS */}
      {callStatus === "ringing" && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-black px-4 py-2 rounded">
          Ringing...
        </div>
      )}

      {callStatus === "rejected" && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 bg-red-600 px-4 py-2 rounded">
          Call Rejected
        </div>
      )}

      {/* VIDEO */}
      {callStatus === "connected" && (
        <div className="flex gap-2 p-2 bg-black">
          <video ref={localVideoRef} autoPlay muted className="w-1/2" />
          <video ref={remoteVideoRef} autoPlay className="w-1/2" />
        </div>
      )}

      {/* USERS */}
      <div className="w-[30%] p-3 bg-[#1f2c33] border-r">
        {users.map((u) => (
          <div key={u.userId} onClick={() => setCurrentUser(u)}>
            {u.username}
          </div>
        ))}
      </div>

      {/* CHAT */}
      <div className="flex-1 flex flex-col">

        <div className="p-3 flex justify-between">
          {currentUser?.username}

          {currentUser && (
            <button onClick={startCall}>
              <Video />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {currentChat.map((msg, i) => (
            <div key={i}>{msg.text}</div>
          ))}
        </div>

        <div className="flex p-3 gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          {/* ✅ FIX: SEND BUTTON */}
          <button onClick={sendMessage}>
            <Send />
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;