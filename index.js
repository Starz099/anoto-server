import fs from "fs";
import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import simpleGit from "simple-git";
import { App } from "@octokit/app";

dotenv.config();

const server = express();
server.use(bodyParser.json({ limit: "10mb" }));

const privateKey = fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, "utf8");

const githubApp = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey,
});

async function getInstallationOctokit(installationId) {
  return githubApp.getInstallationOctokit(installationId);
}

function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET);
  const digest =
    "sha256=" + hmac.update(JSON.stringify(req.body)).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

server.get("/", (req, res) => {
  res.send("Hello from Anoto Bot!");
});

server.post("/webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) return res.status(401).send("Invalid signature");

    const event = req.headers["x-github-event"];
    const payload = req.body;

    if (event !== "pull_request" || payload.action !== "opened") {
      return res.send("ignored");
    }

    const installationId = payload.installation.id;
    const octokit = await getInstallationOctokit(installationId);

    const auth = await octokit.auth({ type: "installation" });
    const token = auth.token;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const branch = payload.pull_request.head.ref;
    const cloneUrl = payload.pull_request.head.repo.clone_url;

    const authedUrl = cloneUrl.replace(
      "https://",
      `https://x-access-token:${token}@`,
    );

    const dir = `./repo-${payload.pull_request.number}`;

    const git = simpleGit();

    await git.clone(authedUrl, dir);

    const repoGit = simpleGit({ baseDir: dir });

    await repoGit.checkout(branch);
    await repoGit.pull("origin", branch);

    fs.appendFileSync(`${dir}/README.md`, "\n\nImproved by Anoto 🤖");

    await repoGit.add(".");
    await repoGit.commit("anoto: automated improvements", {
      "--author": "anoto-bot <bot@anoto.dev>",
    });

    await repoGit.push("origin", branch);

    res.send("success");
  } catch (err) {
    console.error(err);
    res.status(500).send("error");
  }
});

server.listen(process.env.PORT, () => {
  console.log(`🚀 Server running on port ${process.env.PORT}`);
});
