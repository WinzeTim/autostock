require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, PermissionsBitField, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose');
const ChannelSetting = require('./ChannelSetting');

const token = process.env.TOKEN;
const mongoUri = process.env.MONGODB;
const port = 10000;

// Role keywords for pinging
const ROLE_KEYS = [
  'daffodil', 'watermelon', 'pumpkin', 'apple', 'bamboo', 'coconut',
  'cactus', 'dragonfruit', 'mango', 'grape', 'mushroom', 'pepper',
  'godlysprinkler', 'advancedsprinkler', 'mastersprinkler', 'lightningrod',
  'rain', 'thunderstorm', 'frost'
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const app = express();
app.use(express.json());

const rest = new REST({ version: '10' }).setToken(token);

// ----------------- Slash Command Setup ------------------
async function registerCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Set the default stock notification channel.')
      .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true)),

    new SlashCommandBuilder()
      .setName('setweatherchannel')
      .setDescription('Set the weather notification channel.')
      .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true)),

    new SlashCommandBuilder()
      .setName('setpetchannel')
      .setDescription('Set the pet egg drop channel.')
      .addChannelOption(opt => opt.setName('channel').setDescription('Target channel').setRequired(true)),

    new SlashCommandBuilder()
      .setName('setroles')
      .setDescription('Set role pings by item.')
      .addStringOptions(ROLE_KEYS.map(key =>
        new SlashCommandBuilder().addStringOption(opt =>
          opt.setName(key).setDescription(`Role to ping for ${key}`).setRequired(false)
        )
      ))[0], // Flattened due to API structure

    new SlashCommandBuilder()
      .setName('help')
      .setDescription('List available commands.')
  ].map(cmd => cmd.toJSON());

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('✅ Slash commands registered.');
}

// ---------------- Interaction Handler -------------------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  const { commandName, member, guildId } = interaction;
  const selectedChannel = interaction.options.getChannel('channel');

  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: '❌ Admins only.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    switch (commandName) {
      case 'setchannel':
      case 'setweatherchannel':
      case 'setpetchannel': {
        const updateField = {
          setchannel: 'channelId',
          setweatherchannel: 'weatherChannelId',
          setpetchannel: 'petChannelId',
        }[commandName];

        await ChannelSetting.findOneAndUpdate(
          { guildId },
          { guildId, [updateField]: selectedChannel.id },
          { upsert: true }
        );

        await interaction.editReply(`✅ Notifications for ${commandName.replace('set', '')} set to ${selectedChannel}.`);
        break;
      }

      case 'setroles': {
        const roles = {};
        ROLE_KEYS.forEach(key => {
          const role = interaction.options.getString(key);
          if (role) roles[key] = role;
        });

        await ChannelSetting.findOneAndUpdate({ guildId }, { $set: { roles } }, { upsert: true });
        await interaction.editReply(`✅ Roles saved: ${JSON.stringify(roles)}`);
        break;
      }

      case 'help':
        await interaction.editReply({
          content: `📘 Commands:\n- /setchannel\n- /setweatherchannel\n- /setpetchannel\n- /setroles\n- /help`,
        });
        break;
    }
  } catch (err) {
    console.error(`❌ Error in ${commandName}:`, err);
    await interaction.editReply('❌ Something went wrong.');
  }
});

// ----------------- Express Webhook Route ----------------
app.post('/send-stock', async (req, res) => {
  const data = req.body;
  const { type = 'stock', embeds } = data;

  if (!embeds?.length) return res.status(400).send('Missing embed.');

  const embed = embeds[0];
  const lines = extractLinesFromEmbed(embed);
  const settings = await ChannelSetting.find();

  for (const setting of settings) {
    const channelId = {
      stock: setting.channelId,
      weather: setting.weatherChannelId,
      pet: setting.petChannelId
    }[type] || setting.channelId;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) continue;

    const pings = [];
    for (const [key, roleId] of Object.entries(setting.roles || {})) {
      const normalizedKey = normalizeText(key);
      if (lines.some(line => line.includes(normalizedKey))) {
        pings.push(roleId);
      }
    }

    try {
      await channel.send({
        content: pings.length ? pings.map(r => `<@&${r}>`).join(' ') : null,
        embeds: [embed],
      });
    } catch (err) {
      console.error(`❌ Send failed for ${channelId}:`, err);
    }
  }

  res.sendStatus(200);
});

// ----------------- Helpers ------------------------------
function normalizeText(text) {
  return text.replace(/:.*$/, '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
}

function extractLinesFromEmbed(embed) {
  const lines = [];
  if (embed.description) lines.push(...embed.description.split('\n'));
  for (const field of embed.fields || []) {
    if (field.name) lines.push(...field.name.split('\n'));
    if (field.value) lines.push(...field.value.split('\n'));
  }
  return lines.map(normalizeText);
}

function updateBotStatus() {
  let index = 0;
  const activities = [
    () => ({ type: 3, name: `/help` }),
    () => ({ type: 3, name: `${client.guilds.cache.size} servers` }),
    () => ({ type: 3, name: `${client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0)} users` })
  ];
  setInterval(() => {
    const activity = activities[index++ % activities.length]();
    client.user.setActivity(activity.name, { type: activity.type });
  }, 10000);
}

// ----------------- Initialization -----------------------
mongoose.connect(mongoUri)
  .then(() => {
    console.log('🟢 MongoDB connected.');
    app.listen(port, () => console.log(`🚀 Express running on http://localhost:${port}`));
    return client.login(token);
  })
  .catch(err => console.error('🔴 MongoDB error:', err));

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await registerCommands(client.user.id);
  updateBotStatus();
});
