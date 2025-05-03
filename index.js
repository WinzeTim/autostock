require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, Partials } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const mongoose = require('mongoose');
const ChannelSetting = require('./ChannelSetting');

const token = process.env.TOKEN;
const mongoUri = process.env.MONGODB;
const port = 10000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const app = express();
app.use(express.json());

const rest = new REST({ version: '10' }).setToken(token);

const seedOptions = [
  'Daffodil Seeds', 'Watermelon Seeds', 'Pumpkin Seeds', 'Apple Seeds', 'Bamboo Seeds',
  'Coconut Seeds', 'Cactus Seeds', 'Dragon Fruit Seeds', 'Mango Seeds', 'Grape Seeds', 'Mushroom Seeds'
];

const gearOptions = [
  'Godly Sprinkler', 'Advanced Sprinkler', 'Master Sprinkler', 'Lightning Rod'
];

// Slash command registration
async function registerCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName('setchannel')
      .setDescription('Select a channel to receive stock notifications.')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('The channel to receive stock notifications.')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('setroles')
      .setDescription('Set roles to be pinged for stock updates by item.')
      .addStringOption(option => option.setName('apple').setDescription('Role to ping for Apple Seeds.'))
      .addStringOption(option => option.setName('bamboo').setDescription('Role to ping for Bamboo Seeds.'))
      .addStringOption(option => option.setName('watermelon').setDescription('Role to ping for Watermelon Seeds.'))
      .addStringOption(option => option.setName('pumpkin').setDescription('Role to ping for Pumpkin Seeds.'))
      .addStringOption(option => option.setName('cactus').setDescription('Role to ping for Cactus Seeds.'))
      .addStringOption(option => option.setName('gear').setDescription('Role to ping for Gear items.')),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.')
  ].map(cmd => cmd.toJSON());

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('✅ Slash commands registered.');
}

// Load stored channel/role data (future-proofing)
async function loadSettings() {
  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    const guild = await client.guilds.fetch(setting.guildId).catch(() => null);
    if (!guild) continue;
    await client.channels.fetch(setting.channelId).catch(() => null);
  }
}

// Bot ready event
client.on('ready', async () => {
  console.log('🤖 Bot is ready!');
  await registerCommands(client.user.id);
  await loadSettings();
  updateBotStatus();
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, guildId } = interaction;
  if (!guildId) return;

  if (commandName === 'setchannel') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');

    try {
      await interaction.deferReply({ ephemeral: true });
      await ChannelSetting.findOneAndUpdate(
        { guildId },
        { guildId, channelId: selectedChannel.id },
        { upsert: true }
      );
      await interaction.editReply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
    } catch (err) {
      console.error('Error updating channel:', err);
      await interaction.editReply('❌ Failed to update the notification channel.');
    }
  }

  else if (commandName === 'setroles') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const roles = {};
    ['apple', 'bamboo', 'watermelon', 'pumpkin', 'cactus', 'gear'].forEach(item => {
      const role = interaction.options.getString(item);
      if (role) roles[item] = role;
    });

    await ChannelSetting.findOneAndUpdate(
      { guildId },
      { $set: { roles } },
      { upsert: true }
    );

    await interaction.reply({ content: `✅ Roles saved: ${JSON.stringify(roles)}`, ephemeral: true });
  }

  else if (commandName === 'help') {
    await interaction.reply({
      content: `📘 Commands:
- /setchannel — Set stock notification channel (admin only)
- /setroles — Set roles to ping by item (admin only)
- /help — Show this help message`,
      ephemeral: true
    });
  }
});

// Handle POST from webhook
app.post('/send-stock', async (req, res) => {
  const stockData = req.body;
  if (!stockData || !stockData.embeds || !Array.isArray(stockData.embeds)) {
    return res.status(400).send('Invalid stock data format.');
  }

  const embedData = stockData.embeds[0];
  if (!embedData.fields) return res.status(400).send('No stock fields found.');

  // Create the embed
  const embed = new EmbedBuilder()
    .setTitle(embedData.title || '🛍️ Shop Stock Update')
    .setDescription(embedData.description || 'Here are the current shop items available:')
    .setColor(embedData.color || 0x58D68D);

  // Track if we’ve added "Seeds" or "Gears" section titles already
  let addedSeeds = false;
  let addedGears = false;

  // Iterate through the fields to handle section titles and items
 let addedSeeds = false;
let addedGears = false;

for (const field of embedData.fields) {
  const name = field.name.trim();
  const value = field.value.trim().toLowerCase();

  // Skip duplicated section headers
  if (['seeds', '🌱 seeds', 'gears', '🛠️ gears'].includes(name.toLowerCase())) {
    continue;
  }

  // Add Seeds header once if value mentions seeds
  if (!addedSeeds && value.includes('seed')) {
    embed.addFields({ name: '🌱 Seeds', value: '\u200B', inline: false });
    addedSeeds = true;
  }

  // Add Gears header once if value mentions gears
  if (!addedGears && value.includes('gear')) {
    embed.addFields({ name: '🛠️ Gears', value: '\u200B', inline: false });
    addedGears = true;
  }

  // Clean up value and name (remove $ if present)
  const cleanedName = name.replace(/^\$/, '');
  const cleanedValue = field.value.replace(/\$/g, '');

  embed.addFields({
    name: cleanedName,
    value: cleanedValue,
    inline: field.inline ?? false
  });
}

  // Send to all registered channels
  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    const channel = await client.channels.fetch(setting.channelId).catch(() => null);
    if (channel && channel.isTextBased()) {
      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        console.error(`Failed to send to channel ${setting.channelId}:`, err);
      }
    }
  }

  res.sendStatus(200);
});

// Status update rotation
function updateBotStatus() {
  const activities = [
    () => ({ type: 3, name: `/help` }),
    () => ({ type: 3, name: `${client.guilds.cache.size} servers...` }),
  ];

  let i = 0;
  setInterval(() => {
    const activity = activities[i % activities.length]();
    client.user.setActivity(activity.name, { type: activity.type });
    i++;
  }, 10000);
}

// Root route for health check
app.get('/', (req, res) => {
  res.send('✅ Stock bot is running.');
});

// Start MongoDB connection and server
mongoose.connect(mongoUri)
  .then(() => {
    console.log('🟢 Connected to MongoDB.');
    app.listen(port, () => console.log(`🚀 Express server running on http://localhost:${port}`));
    client.login(token);
  })
  .catch(err => {
    console.error('🔴 MongoDB connection error:', err);
  });
