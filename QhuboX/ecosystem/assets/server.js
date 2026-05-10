const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const OPENROUTER_KEY = process.env.OPENROUTER_KEY;

app.post("/QhuboX-chat", async (req, res) => {
  const userMessage = req.body.message;

  const payload = {
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "Eres QhuboX AI, un asistente holográfico." },
      { role: "user", content: userMessage }
    ]
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sin respuesta.";
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Error al conectar con OpenRouter." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`QhuboX AI backend activo en puerto ${PORT}`));
