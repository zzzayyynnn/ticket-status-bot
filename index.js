require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express"); // For UptimeRobot ping
const { Client, GatewayIntentBits, Events, PermissionsBitField } = require("discord.js");

// -----------------------------
// Lightweight web server for ping
// -----------------------------
const app = express();
app.get("/", (req, res) => res.send("ok"));

// On Render, you must listen on process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Ping endpoint running on port ${PORT}`));

// -----------------------------
// Discord client setup
// -----------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// -----------------------------
// Counter file setup
// -----------------------------
const COUNTER_PATH = path.join(__dirname, "counter.json");

// Safe load counter
let ticketCounter = 3480;
if (fs.existsSync(COUNTER_PATH)) {
  try {
    const raw = fs.readFileSync(COUNTER_PATH, "utf8");
    const parsed = JSON.parse(raw);
    ticketCounter = parsed.lastTicket || ticketCounter;
  } catch (err) {
    console.warn("Could not read counter.json, using default:", err.message);
  }
}

function saveCounter() {
  try {
    fs.writeFileSync(
      COUNTER_PATH,
      JSON.stringify({ lastTicket: ticketCounter }, null, 2)
    );
  } catch (err) {
    console.error("Failed to save counter.json:", err.message);
  }
}

// -----------------------------
// Configuration
// -----------------------------
const STAFF_ROLE_ID = "1421545043214340166";

const GUILD_APP_CATEGORY = "1398363565571969085";
const MASTER_TICKET_CATEGORY = "1399235813379670028";
const APPLICATION_TICKET_CATEGORY = "1403050594670743582";
const MASTER_APPLICATION_CATEGORY = "1407414268965552270";

// -----------------------------
// Discord events
// -----------------------------
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ChannelCreate: rename ticket-* → waiting-ticket-<n>
client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!channel?.guild) return;
    if (typeof channel.name !== "string") return;
    if (!channel.name.startsWith("ticket-")) return;

    const botMember = channel.guild.members.me;
    if (!botMember.permissionsIn(channel).has(PermissionsBitField.Flags.ManageChannels)) {
      console.warn("Missing ManageChannels permission to rename new ticket:", channel.id);
      return;
    }

    const newName = `waiting-ticket-${ticketCounter}`;
    await channel.setName(newName);
    console.log(`🆕 Ticket created → renamed to ${newName}`);
    ticketCounter++;
    saveCounter();
  } catch (err) {
    console.error("ChannelCreate handler error:", err);
  }
});

// Message handling
client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild) return;
    if (message.author.bot) return;

    let member;
    try {
      member = message.member ?? (await message.guild.members.fetch(message.author.id));
    } catch {
      return;
    }
    if (!member) return;
    if (!member.roles.cache.has(STAFF_ROLE_ID)) return;

    const channel = message.channel;
    if (!channel || typeof channel.name !== "string") return;

    const channelName = channel.name;
    const parentId = channel.parentId ?? null;

    if (channelName.startsWith("assisted-ticket-")) return;

    const rawContent = (message.content || "").trim();
    const contentLower = rawContent.toLowerCase();

    // 1) Guild App + Master Ticket categories → Roblox link triggers assisted
    if ([GUILD_APP_CATEGORY, MASTER_TICKET_CATEGORY].includes(parentId)) {
      if (contentLower.includes("https://www.roblox.com/games")) {
        if (!message.guild.members.me.permissionsIn(channel).has(PermissionsBitField.Flags.ManageChannels))
          return;

        const newName = channelName.replace(/^.*ticket-/, "assisted-ticket-");
        try {
          await channel.setName(newName);
          console.log(`🔗 Link detected in category ${parentId} → renamed to ${newName}`);
        } catch (err) {
          console.error("Failed to rename channel to assisted (link):", err);
        }
        return;
      }
    }

    // 2) Application Ticket + Master Application categories → "done" triggers assisted
    if ([APPLICATION_TICKET_CATEGORY, MASTER_APPLICATION_CATEGORY].includes(parentId)) {
      if (contentLower === "done") {
        if (!message.guild.members.me.permissionsIn(channel).has(PermissionsBitField.Flags.ManageChannels))
          return;

        const newName = channelName.replace(/^.*ticket-/, "assisted-ticket-");
        try {
          await channel.setName(newName);
          console.log(`✅ "done" detected in category ${parentId} → renamed to ${newName}`);
        } catch (err) {
          console.error("Failed to rename channel to assisted (done):", err);
        }
        return;
      }
    }
  } catch (err) {
    console.error("MessageCreate handler error:", err);
  }
});

// -----------------------------
// Startup
// -----------------------------
console.log("Token loaded:", process.env.TOKEN ? "✅ Yes" : "❌ No");

process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at: Promise", p, "reason:", reason);
});

// Use TOKEN environment variable from Render
if (!process.env.TOKEN) {
  console.error("❌ Discord bot token is missing. Set TOKEN in Render's environment variables.");
  process.exit(1);
}

client.login(process.env.TOKEN);
