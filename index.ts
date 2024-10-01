import { ChatSession, createCompletionStream, InferenceModel, loadModel } from "gpt4all";
import http from "http";
import { Server, Socket } from "socket.io";
import { initializeModel, startChatSession } from "./helper";
import express from "express";
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
const localModelPath = "Meta-Llama-3-8B-Instruct.Q4_0.gguf";

dotenv.config()

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: "/chat-io",
});

let model: InferenceModel;
let chat: ChatSession;

( async () => {
  try {
  model = await loadModel(localModelPath || "gpt4all", {verbose: false});
  console.log("GPT4All Model Loaded from Local Path");
} catch (err) {
  console.error("Error loading GPT4All model:", err);
}
})();

interface AuthenticatedSocket extends Socket {
  token?: string;
}

io.use(async (socket : AuthenticatedSocket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error'));
  }

  const response: any = await fetch('http://localhost:3001/auth/verify', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    }
  })

  if (response.status !== 200) {
    return next(new Error('Authentication error'));
  }

    // Save the decoded information to the socket for later use
    socket.token = token;
    next();
  });

io.on("connection", (socket: AuthenticatedSocket) => {
  console.log("New client connected");
  socket.on("init chat", async (chat_id) => {
    console.log("Init chat", chat_id);

    if (!model) {
      return socket.emit("chat stream", {
        role: "assistant",
        content: "Model not loaded.",
      });
    }

    // Get chat details
    let chatDetails = await fetch(`http://localhost:3001/chat/${chat_id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${socket.token}`,
      }
    }).then((res) => res.json());
    chatDetails = chatDetails.chat;
    console.log('chat details', chatDetails)
    if (!chatDetails) {
      return socket.emit("chat stream", {
        role: "assistant",
        content: "Chat not found.",
      });
    }

    // Load the chat session

    chat = await startChatSession(model, chatDetails.poi, chatDetails.messages );

    socket.emit("chat session loaded");

    // If no previous messages, start the conversation
    if (chatDetails.messages.length === 0) {
      console.log('no previous messages')

    const responseStream = createCompletionStream(chat, "Hello, can you greet me?");

    let fullMessage = "";

    console.log('responding')

    responseStream.tokens.on("data", (data) => {
      fullMessage += data.toString(); // Accumulate the tokens
      console.log('data',data.toString())
      socket.emit("chat stream", { role: "assistant", content: data.toString() });
    });

    await responseStream.result;
      socket.emit("chat message end", { role: "assistant", content: fullMessage });
      const result = await fetch(`http://localhost:3001/message`, 
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${socket.token}`,
      },
      body: JSON.stringify({role: 'assistant', content: fullMessage, chat_id: chatDetails.id})})
      console.log('result',result.status)
  }
  });

  socket.on("chat message", async (chat_id, msg) => {
    console.log("Chat message:", msg);

    // Check if the chat session is loaded
    if (!chat) {
      console.log('Chat session not loaded')
      return socket.emit("chat stream", {
        role: "assistant",
        content: "Chat session not loaded.",
      });
    }

    try {

      let fullMessage = '';

      console.log('chat session loaded and responding')
      // Create a streaming response
      const responseStream = createCompletionStream(chat, msg);
      responseStream.tokens.on("data", (data) => {
        console.log('data',data.toString()) 
      fullMessage += data.toString(); // Accumulate the tokens

        socket.emit("chat stream", {
          role: "assistant",
          content: data.toString(),
        });
      });

      await responseStream.result;
      // Handle the end of the stream
      socket.emit("chat message end", { role: "assistant", content: fullMessage });
      const result = await fetch(`http://localhost:3001/message`, 
        {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${socket.token}`,
        },
        body: JSON.stringify({role: 'assistant', content: fullMessage, chat_id: ObjectId.createFromHexString(chat_id)})})
        console.log('result',result.status)

    } catch (error) {

      // Handle errors
      console.error("Error generating response:", error);
      socket.emit("chat message part", {
        role: "assistant",
        content: "Sorry, I encountered an error while processing your request.",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT ?? 3002;
initializeModel().then(() => {
  server.listen(PORT, () => {
    console.log(`Socket model running on port ${PORT}`);
  });
});
