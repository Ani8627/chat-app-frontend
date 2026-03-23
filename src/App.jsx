import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import axios from "axios";
import Login from "./Login";
import EmojiPicker from "emoji-picker-react";
import { motion, AnimatePresence } from "framer-motion";

import {
  Send,
  Smile,
  Mic,
  Video,
  Search
} from "lucide-react";

function App() {
  const socket = useRef();
  const bottomRef = useRef(null);

  const myVideo = useRef(null);
  const userVideo = useRef(null);
  const peerConnection = useRef(null);

  // ✅ FINAL ENV FIX (VITE)
  const API_URL =
    import.meta.env.VITE_API_URL ||
    "https://chat-app-backend-dxi9.onrender.com";

  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [chat, setChat] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [myId, setMyId] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [inCall, setInCall] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [aiTyping, setAiTyping] = useState(false);

  const [callIncoming, setCallIncoming] = useState(null);
  const [user, setUser] = useState(null);

  // SAFE USER LOAD
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("user");
      }
    }
  }, []);

  const logout = () => {
    localStorage.removeItem("user");
    setUser(null);
  };

  // SMART REPLY
  const generateReplies = (text) => {
    if (!text) return [];
    if (text.toLowerCase().includes("coming")) return ["Yes", "No", "On my way"];
    if (text.toLowerCase().includes("hello")) return ["Hi!", "Hey!", "Hello!"];
    return ["Okay", "Got it", "Nice"];
  };

  // SENTIMENT
  const getSentiment = (text) => {
    if (!text) return "";
    if (text.includes("sad")) return "😔";
    if (text.includes("happy")) return "😊";
    return "😐";
  };

  // TASK EXTRACTOR
  const extractTask = (text) => {
    if (text.toLowerCase().includes("tomorrow") || text.toLowerCase().includes("deadline")) {
      setTasks((prev) => [...prev, text]);
    }
  };

  // VOICE → TEXT
  const startSpeechToText = () => {
    const recognition = new window.webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      setMessage(event.results[0][0].transcript);
    };
    recognition.start();
  };

  // SOCKET
  useEffect(() => {
    if (!user) return;

    socket.current = io(API_URL, {
      transports: ["websocket"],
    });

    const id = user._id;
    setMyId(id);

    socket.current.emit("addUser", id);

    socket.current.on("getUsers", setUsers);

    socket.current.on("receiveMessage", (data) => {
      setChat((prev) => [...prev, data]);

      if (data.senderId !== myId && data.senderId !== "AI") {
        setSuggestions(generateReplies(data.text));
      }

      extractTask(data.text);
    });

    socket.current.on("incomingCall", ({ from, offer }) => {
      setCallIncoming({ from, offer });
    });

    socket.current.on("callAnswered", async ({ answer }) => {
      await peerConnection.current?.setRemoteDescription(answer);
    });

    return () => socket.current.disconnect();
  }, [user, API_URL]);

  // AUTO SCROLL
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, aiTyping]);

  // LOAD MESSAGES
  useEffect(() => {
    if (!currentUser) return;

    const getMessages = async () => {
      const res = await axios.get(
        `${API_URL}/api/messages/${myId}/${currentUser.userId}`
      );
      setChat(res.data);
    };

    getMessages();
  }, [currentUser, myId, API_URL]);

  // SEND MESSAGE
  const sendMessage = async () => {
    if (!currentUser || message.trim() === "") return;

    // 🤖 AI MODE
    if (message.startsWith("/ai")) {
      const aiQuery = message.replace("/ai", "").trim();

      setChat((prev) => [...prev, { senderId: myId, text: message }]);

      setAiTyping(true);

      try {
        const res = await axios.post(
          `${API_URL}/api/ai/chat`,
          { message: aiQuery }
        );

        setChat((prev) => [
          ...prev,
          { senderId: "AI", text: res.data.reply }
        ]);

      } catch (err) {
        console.log(err);
      }

      setAiTyping(false);
      setMessage("");
      return;
    }

    const msgData = {
      senderId: myId,
      receiverId: currentUser.userId,
      text: message,
      seen: false
    };

    socket.current.emit("sendMessage", msgData);
    await axios.post(`${API_URL}/api/messages`, msgData);

    setMessage("");
    setSuggestions([]);
  };

  // VIDEO CALL
  const startCall = async () => {
    if (!currentUser) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    setInCall(true);
    myVideo.current.srcObject = stream;

    const pc = new RTCPeerConnection();
    peerConnection.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (e) => {
      userVideo.current.srcObject = e.streams[0];
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.current.emit("callUser", {
      to: currentUser.userId,
      offer,
    });
  };

  const answerCall = async () => {
    if (!callIncoming) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    setInCall(true);
    myVideo.current.srcObject = stream;

    const pc = new RTCPeerConnection();
    peerConnection.current = pc;

    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (e) => {
      userVideo.current.srcObject = e.streams[0];
    };

    await pc.setRemoteDescription(callIncoming.offer);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.current.emit("answerCall", {
      to: callIncoming.from,
      answer,
    });
  };

  if (!user) return <Login setUser={setUser} />;

  return (
    <div className="flex h-screen bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364] text-white">

      {/* LEFT */}
      <div className="w-[30%] bg-white/10 backdrop-blur-lg p-4">

        {/* SEARCH */}
        <div className="flex items-center bg-white/20 px-3 py-2 rounded mb-3">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent ml-2 outline-none"
            placeholder="Search users"
          />
        </div>

        {users
          .filter(u => u.userId !== myId && u.userId.includes(search))
          .map((u, i) => (
            <div
              key={i}
              onClick={() => {
                setCurrentUser(u);
                setChat([]);
              }}
              className="p-3 mb-2 rounded-lg bg-white/10 cursor-pointer"
            >
              👤 {u.userId}
            </div>
          ))}

        {/* TASKS */}
        <div className="mt-4 bg-white/10 p-2 rounded">
          <h3 className="text-sm">Tasks</h3>
          {tasks.map((t, i) => (
            <div key={i} className="text-xs">{t}</div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className="w-[70%] flex flex-col">

        {/* HEADER */}
        <div className="p-3 bg-white/10 flex justify-between">
          {currentUser ? `Chat with ${currentUser.userId}` : "Select user"}

          <div className="flex gap-2">
            <button onClick={startCall}><Video /></button>
            <button onClick={logout} className="bg-red-500 px-2 rounded">Logout</button>
          </div>
        </div>

        {/* CHAT */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence>
            {chat.map((msg, i) => (
              <motion.div key={i} className={`flex ${msg.senderId === myId ? "justify-end" : "justify-start"}`}>
                <div className={`px-3 py-2 rounded m-1 ${
                  msg.senderId === "AI"
                    ? "bg-purple-500"
                    : msg.senderId === myId
                    ? "bg-green-500"
                    : "bg-white/20"
                }`}>
                  {msg.text} {getSentiment(msg.text)}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {aiTyping && (
            <div className="text-purple-300 text-sm">AI is typing...</div>
          )}

          <div ref={bottomRef}/>
        </div>

        {/* SMART REPLIES */}
        {suggestions.length > 0 && (
          <div className="flex gap-2 p-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => setMessage(s)}
                className="bg-white/20 px-2 py-1 rounded"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* INPUT */}
        <div className="flex p-3 bg-white/10">
          <button onClick={() => setShowEmoji(!showEmoji)}><Smile /></button>
          <button onClick={startSpeechToText}><Mic /></button>

          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 mx-2 p-2 rounded bg-white/20"
            placeholder="Type message or /ai ask something..."
          />

          <button onClick={sendMessage}><Send /></button>
        </div>

        {showEmoji && (
          <div className="absolute bottom-16 right-5">
            <EmojiPicker onEmojiClick={(e)=>setMessage(prev=>prev+e.emoji)} />
          </div>
        )}

      </div>
    </div>
  );
}

export default App;