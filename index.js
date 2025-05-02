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

// Register slash commands
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
      .setDescription('Select roles to be pinged for stock updates.')
      .addStringOption(option =>
        option.setName('roles')
          .setDescription('Comma-separated list of roles to ping.')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Lists all available commands.')
  ].map(cmd => cmd.toJSON());

  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );

  console.log('✅ Slash commands registered.');
}

// Load stored channel/role data
async function loadSettings() {
  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    const guild = await client.guilds.fetch(setting.guildId).catch(() => null);
    if (!guild) continue;
    const channel = await client.channels.fetch(setting.channelId).catch(() => null);
    if (!channel) continue;
  }
}

client.on('ready', async () => {
  console.log('🤖 Bot is ready!');
  await registerCommands(client.user.id);
  await loadSettings();
  updateBotStatus();
});

// Handle commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, member, guildId } = interaction;

  if (!guildId) return;

  if (commandName === 'setchannel') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const selectedChannel = interaction.options.getChannel('channel');

    await ChannelSetting.findOneAndUpdate(
      { guildId },
      { guildId, channelId: selectedChannel.id },
      { upsert: true }
    );

    await interaction.reply(`✅ Stock notifications will now be sent to ${selectedChannel}.`);
  }

  else if (commandName === 'setroles') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '❌ You must be an admin to use this.', ephemeral: true });
    }

    const rolesInput = interaction.options.getString('roles');
    const roles = rolesInput.split(',').map(r => r.trim());

    await ChannelSetting.findOneAndUpdate(
      { guildId },
      { $set: { roles } },
      { upsert: true }
    );

    await interaction.reply(`✅ Roles saved: ${roles.join(', ')}`);
  }

  else if (commandName === 'help') {
    await interaction.reply({
      content: `📘 Commands:
- /setchannel — Set stock notification channel (admin only)
- /setroles — Set roles to ping (admin only)
- /help — Show this help message`,
      ephemeral: true
    });
  }
});

// Handle incoming webhook POSTs
app.post('/send-stock', async (req, res) => {
  const stockData = req.body;
  if (!stockData || !stockData.content) return res.status(400).send('Invalid stock data.');

  const embed = new EmbedBuilder()
    .setTitle('🛍️ Shop Stock Update')
    .setDescription('Here are the current shop items available:')
    .setColor(0x58D68D);

  const items = stockData.content.split('\n');
  const seeds = [];
  const gears = [];

  for (const item of items) {
    const [name, quantity] = item.split(' : ').map(s => s.trim());
    if (!name || !quantity) continue;
    const isGear = gearOptions.some(gear => name.includes(gear));
    if (isGear) gears.push({ name, quantity });
    else seeds.push({ name, quantity });
  }

  if (seeds.length > 0) {
    embed.addFields({ name: '🌱 Seeds', value: seeds.map(s => `${s.name}: ${s.quantity}`).join('\n'), inline: true });
  }

  if (gears.length > 0) {
    embed.addFields({ name: '🛠️ Gears', value: gears.map(g => `${g.name}: ${g.quantity}`).join('\n'), inline: true });
  }

  const settings = await ChannelSetting.find();
  for (const setting of settings) {
    try {
      const channel = await client.channels.fetch(setting.channelId);
      if (!channel) continue;

      const roleMentions = channel.guild.roles.cache
        .filter(role => (setting.roles || []).includes(role.name))
        .map(role => `<@&${role.id}>`).join(' ');

      await channel.send({ content: roleMentions || null, embeds: [embed] });
      console.log(`✅ Sent stock update to ${channel.name}`);
    } catch (err) {
      console.error(`❌ Error sending to guild ${setting.guildId}:`, err.message);
    }
  }

  res.status(200).send('Stock sent.');
});

// Status rotation
function updateBotStatus() {
  const activities = [
    () => ({ type: 3, name: `/help` }), // Listening
    () => ({ type: 3, name: `Watching ${client.guilds.cache.size} servers...` }), // Watching
  ];

  let i = 0;
  setInterval(() => {
    const activity = activities[i % activities.length]();
    client.user.setActivity(activity.name, { type: activity.type });
    i++;
  }, 10000);
}

// Start server
app.get('/', (req, res) => {
  res.send('✅ Stock bot is running.');
});

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('🟢 Connected to MongoDB.');
    app.listen(port, () => console.log(`🚀 Express running at http://localhost:${port}`));
    client.login(token);
  })
  .catch(err => {
    console.error('🔴 MongoDB connection error:', err);
  });
