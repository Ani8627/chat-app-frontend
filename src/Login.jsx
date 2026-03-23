import { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";

function Login({ setUser }) {
  const [isLogin, setIsLogin] = useState(true);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const url = isLogin
        ? "https://chat-app-backend-dxi9.onrender.com/api/auth/login"
        : "https://chat-app-backend-dxi9.onrender.com/api/auth/register";

      const res = await axios.post(url, form);

      localStorage.setItem("user", JSON.stringify(res.data));
      setUser(res.data);
    } catch (err) {
      alert(err.response?.data || "Error");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364]">

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-xl w-[350px] text-white"
      >

        <h2 className="text-2xl font-bold text-center mb-6">
          {isLogin ? "Welcome Back 👋" : "Create Account"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {!isLogin && (
            <input
              type="text"
              placeholder="Username"
              className="p-3 rounded-lg bg-white/20 outline-none placeholder-gray-300"
              onChange={(e) =>
                setForm({ ...form, username: e.target.value })
              }
            />
          )}

          <input
            type="email"
            placeholder="Email"
            className="p-3 rounded-lg bg-white/20 outline-none placeholder-gray-300"
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
          />

          <input
            type="password"
            placeholder="Password"
            className="p-3 rounded-lg bg-white/20 outline-none placeholder-gray-300"
            onChange={(e) =>
              setForm({ ...form, password: e.target.value })
            }
          />

          <button
            type="submit"
            className="bg-green-500 hover:bg-green-600 transition p-3 rounded-lg font-semibold"
          >
            {isLogin ? "Login" : "Register"}
          </button>
        </form>

        <p
          onClick={() => setIsLogin(!isLogin)}
          className="text-center mt-4 cursor-pointer text-sm text-gray-300 hover:text-white"
        >
          {isLogin
            ? "Don't have an account? Register"
            : "Already have an account? Login"}
        </p>
      </motion.div>
    </div>
  );
}

export default Login;