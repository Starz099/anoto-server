import fs from "fs";
import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import { App } from "@octokit/app";

dotenv.config();

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));

// Load private key
const privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, "utf8");

// Create GitHub App instance
const githubApp = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey,
});

// 🔐 Verify webhook signature
function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET);

  const digest =
    "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

app.get("/", (req, res) => {
  res.send("Hello from GitHub App!");
});

// 🚀 Webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) {
      return res.status(401).send("Invalid signature");
    }
    console.log("EVENT:", req.headers["x-github-event"]);

    const event = req.headers["x-github-event"];
    const payload = req.body;
    console.log("event:", event);
    console.log("PAYLOAD:", JSON.stringify(payload));
    fs.writeFileSync(`payload-${Date.now()}.json`, JSON.stringify(payload, null, 2));
    res.json(payload);
    // if (event === "pull_request") {
    //   const action = payload.action;

    //   if (["opened", "synchronize", "reopened"].includes(action)) {
    //     const prNumber = payload.pull_request.number;
    //     const owner = payload.repository.owner.login;
    //     const repo = payload.repository.name;
    //     const installationId = payload.installation.id;

    //     console.log(`📌 PR #${prNumber} ${action}`);

    //     // Authenticate as installation
    //     const octokit = await githubApp.getInstallationOctokit(installationId);

    //     // Fetch PR files
    //     const files = await octokit.pulls.listFiles({
    //       owner,
    //       repo,
    //       pull_number: prNumber,
    //     });

    //     console.log("📝 Changed files:");

    //     files.data.forEach((file) => {
    //       console.log("File:", file.filename);
    //       console.log("Patch:", file.patch?.slice(0, 200));
    //       console.log("-----");
    //     });
    //   }
    // }

    res.send("ok");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on port ${process.env.PORT}`);
});
